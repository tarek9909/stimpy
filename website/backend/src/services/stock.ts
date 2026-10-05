import type { StockLineState } from '@prisma/client';
import type { AppContext } from '../context';
import type { Db, Tx } from '../lib/db';
import { now } from '../lib/clock';
import { AppError, ERROR_STATUS } from '../lib/errors';
import { logger } from '../lib/log';
import { enqueueLowStockAlert } from './email-queue';

/**
 * STOCK SERVICE (work package B). Atomic reserve / release / sell / restock plus movement logging
 * (business-rules section 5). Raw SQL is allowed here and ONLY here (conditional UPDATEs with bound parameters):
 *   UPDATE ... SET reserved = reserved + :qty WHERE id = :id AND quantity - reserved >= :qty
 * Every order-driven function takes the transaction client so callers compose them inside one `$transaction`.
 *
 * Invariants:
 *  - A stocked thing is EITHER a hoodie variant OR a Stimpie. MySQL cannot CHECK "exactly one of variant_id /
 *    stimpie_id" on foreign-key columns, so every row written here is built from a `StockRef` (a discriminated union),
 *    which makes both-or-neither impossible, and `assertRef` guards values arriving from untyped callers.
 *  - Row locks are always taken in the same order (variants by id, then Stimpies by id) so transactions queue up
 *    instead of deadlocking.
 */

export type StockRef = { itemType: 'HOODIE_VARIANT'; variantId: number } | { itemType: 'STIMPIE'; stimpieId: number };
export type StockNeed = StockRef & { qty: number; itemIndex: number };
export type StockSnapshot = { quantity: number; reserved: number; available: number };

export type ProblemRef =
  | { kind: 'HOODIE_VARIANT'; hoodieId: number; colorId: number; sizeId: number }
  | { kind: 'STIMPIE'; stimpieId: number };
export type StockProblem = ProblemRef & { itemIndex: number; name: string; requested: number; available: number };

export type StockMovementReason =
  | 'INITIAL'
  | 'RESTOCK'
  | 'CORRECTION'
  | 'DAMAGED'
  | 'ORDER_RESERVED'
  | 'ORDER_RELEASED'
  | 'ORDER_SOLD'
  | 'ORDER_RETURNED'
  | 'ORDER_WRITTEN_OFF';
export const MANUAL_REASONS = ['RESTOCK', 'CORRECTION', 'DAMAGED'] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

/** An item whose available count fell to (or below) the low-stock threshold because of this operation. */
export type LowStockCrossing = { ref: StockRef; name: string; available: number };

const log = logger('stock');

// ---------------------------------------------------------------- refs

/** Throws unless exactly one of variantId / stimpieId is meaningful for the declared item type. */
export function assertRef(ref: { itemType: string; variantId?: number | null; stimpieId?: number | null }): StockRef {
  const hasV = ref.variantId != null;
  const hasS = ref.stimpieId != null;
  if (hasV === hasS) throw new TypeError('A stock reference needs exactly one of variantId / stimpieId.');
  if (ref.itemType === 'HOODIE_VARIANT' && hasV) return { itemType: 'HOODIE_VARIANT', variantId: ref.variantId as number };
  if (ref.itemType === 'STIMPIE' && hasS) return { itemType: 'STIMPIE', stimpieId: ref.stimpieId as number };
  throw new TypeError('The stock reference does not match its item type.');
}

export const refId = (r: StockRef): number => (r.itemType === 'HOODIE_VARIANT' ? r.variantId : r.stimpieId);
export const refKey = (r: StockRef): string => `${r.itemType === 'HOODIE_VARIANT' ? 'V' : 'S'}${refId(r)}`;
/** Column values for rows that carry the (itemType, variantId, stimpieId) triple. */
export function refColumns(r: StockRef): { itemType: StockRef['itemType']; variantId: number | null; stimpieId: number | null } {
  return r.itemType === 'HOODIE_VARIANT'
    ? { itemType: 'HOODIE_VARIANT', variantId: r.variantId, stimpieId: null }
    : { itemType: 'STIMPIE', variantId: null, stimpieId: r.stimpieId };
}
/** Fixed lock order: variants first, then Stimpies, each by id. */
export function sortRefs<T extends StockRef>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.itemType === b.itemType ? refId(a) - refId(b) : a.itemType === 'HOODIE_VARIANT' ? -1 : 1));
}

// ---------------------------------------------------------------- raw counters (the ONLY raw SQL for stock)

async function reserveRow(tx: Tx, ref: StockRef, qty: number): Promise<boolean> {
  const n =
    ref.itemType === 'HOODIE_VARIANT'
      ? await tx.$executeRaw`UPDATE hoodie_variants SET reserved = reserved + ${qty}, updated_at = NOW(3) WHERE id = ${ref.variantId} AND quantity - reserved >= ${qty}`
      : await tx.$executeRaw`UPDATE stimpies SET reserved = reserved + ${qty}, updated_at = NOW(3) WHERE id = ${ref.stimpieId} AND quantity - reserved >= ${qty}`;
  return n === 1;
}

async function releaseRow(tx: Tx, ref: StockRef, qty: number): Promise<void> {
  const n =
    ref.itemType === 'HOODIE_VARIANT'
      ? await tx.$executeRaw`UPDATE hoodie_variants SET reserved = reserved - ${qty}, updated_at = NOW(3) WHERE id = ${ref.variantId} AND reserved >= ${qty}`
      : await tx.$executeRaw`UPDATE stimpies SET reserved = reserved - ${qty}, updated_at = NOW(3) WHERE id = ${ref.stimpieId} AND reserved >= ${qty}`;
  if (n !== 1) throw new Error(`Stock inconsistency: cannot release ${qty} from ${refKey(ref)} (reserved is lower).`);
}

async function sellRow(tx: Tx, ref: StockRef, qty: number): Promise<void> {
  const n =
    ref.itemType === 'HOODIE_VARIANT'
      ? await tx.$executeRaw`UPDATE hoodie_variants SET quantity = quantity - ${qty}, reserved = reserved - ${qty}, updated_at = NOW(3) WHERE id = ${ref.variantId} AND reserved >= ${qty} AND quantity >= ${qty}`
      : await tx.$executeRaw`UPDATE stimpies SET quantity = quantity - ${qty}, reserved = reserved - ${qty}, updated_at = NOW(3) WHERE id = ${ref.stimpieId} AND reserved >= ${qty} AND quantity >= ${qty}`;
  if (n !== 1) throw new Error(`Stock inconsistency: cannot sell ${qty} of ${refKey(ref)}.`);
}

async function addQuantityRow(tx: Tx, ref: StockRef, qty: number): Promise<void> {
  const n =
    ref.itemType === 'HOODIE_VARIANT'
      ? await tx.$executeRaw`UPDATE hoodie_variants SET quantity = quantity + ${qty}, updated_at = NOW(3) WHERE id = ${ref.variantId}`
      : await tx.$executeRaw`UPDATE stimpies SET quantity = quantity + ${qty}, updated_at = NOW(3) WHERE id = ${ref.stimpieId}`;
  if (n !== 1) throw new Error(`Stock inconsistency: ${refKey(ref)} does not exist.`);
}

/** Row-locking read (`FOR UPDATE`) used by the manual adjustment paths. null when the thing does not exist. */
async function lockRow(tx: Tx, ref: StockRef): Promise<{ quantity: number; reserved: number } | null> {
  const rows =
    ref.itemType === 'HOODIE_VARIANT'
      ? await tx.$queryRaw<{ quantity: number; reserved: number }[]>`SELECT quantity, reserved FROM hoodie_variants WHERE id = ${ref.variantId} FOR UPDATE`
      : await tx.$queryRaw<{ quantity: number; reserved: number }[]>`SELECT quantity, reserved FROM stimpies WHERE id = ${ref.stimpieId} FOR UPDATE`;
  const r = rows[0];
  return r ? { quantity: Number(r.quantity), reserved: Number(r.reserved) } : null;
}

async function setQuantityRow(tx: Tx, ref: StockRef, quantity: number): Promise<void> {
  if (ref.itemType === 'HOODIE_VARIANT') await tx.$executeRaw`UPDATE hoodie_variants SET quantity = ${quantity}, updated_at = NOW(3) WHERE id = ${ref.variantId}`;
  else await tx.$executeRaw`UPDATE stimpies SET quantity = ${quantity}, updated_at = NOW(3) WHERE id = ${ref.stimpieId}`;
}

// ---------------------------------------------------------------- names and snapshots

/** Display names and problem refs for a set of stock refs (one query per table). */
async function describeRefs(db: Db, refs: StockRef[]): Promise<Map<string, { name: string; problem: ProblemRef; quantity: number; reserved: number }>> {
  const out = new Map<string, { name: string; problem: ProblemRef; quantity: number; reserved: number }>();
  const variantIds = refs.filter((r): r is Extract<StockRef, { itemType: 'HOODIE_VARIANT' }> => r.itemType === 'HOODIE_VARIANT').map((r) => r.variantId);
  const stimpieIds = refs.filter((r): r is Extract<StockRef, { itemType: 'STIMPIE' }> => r.itemType === 'STIMPIE').map((r) => r.stimpieId);
  if (variantIds.length) {
    const rows = await db.hoodieVariant.findMany({ where: { id: { in: variantIds } }, include: { hoodie: true, color: true, size: true } });
    for (const v of rows) {
      out.set(`V${v.id}`, {
        name: `${v.hoodie.name}, ${v.color.name}, ${v.size.label}`,
        problem: { kind: 'HOODIE_VARIANT', hoodieId: v.hoodieId, colorId: v.colorId, sizeId: v.sizeId },
        quantity: v.quantity,
        reserved: v.reserved,
      });
    }
  }
  if (stimpieIds.length) {
    const rows = await db.stimpie.findMany({ where: { id: { in: stimpieIds } } });
    for (const s of rows) out.set(`S${s.id}`, { name: s.name, problem: { kind: 'STIMPIE', stimpieId: s.id }, quantity: s.quantity, reserved: s.reserved });
  }
  return out;
}

export async function getStockSnapshot(db: Db, ref: StockRef): Promise<StockSnapshot | null> {
  const row =
    ref.itemType === 'HOODIE_VARIANT'
      ? await db.hoodieVariant.findUnique({ where: { id: ref.variantId }, select: { quantity: true, reserved: true } })
      : await db.stimpie.findUnique({ where: { id: ref.stimpieId }, select: { quantity: true, reserved: true } });
  return row ? { quantity: row.quantity, reserved: row.reserved, available: row.quantity - row.reserved } : null;
}

function soldOut(items: StockProblem[]): AppError {
  const names = items.map((i) => i.name);
  const message = items.length === 1 ? `Sorry, ${names[0]} just sold out.` : 'A few items are no longer available in the quantity you asked for.';
  return new AppError('SOLD_OUT', ERROR_STATUS.SOLD_OUT, message, { items });
}

// ---------------------------------------------------------------- movements

async function logMovement(
  tx: Tx,
  ref: StockRef,
  m: { field: 'QUANTITY' | 'RESERVED'; delta: number; reason: StockMovementReason; orderId?: number | null; userId?: number | null; note?: string | null; at?: Date },
): Promise<void> {
  await tx.stockMovement.create({
    data: {
      createdAt: m.at ?? now(), // the app clock, so tests and demo data agree with the order timeline
      ...refColumns(ref),
      field: m.field,
      delta: m.delta,
      reason: m.reason,
      orderId: m.orderId ?? null,
      userId: m.userId ?? null,
      note: m.note ?? null,
    },
  });
}

/** Writes an INITIAL movement (used by catalog creation flows that set a starting quantity). */
export async function logInitialStock(tx: Tx, ref: StockRef, quantity: number, userId: number | null = null): Promise<void> {
  if (quantity > 0) await logMovement(tx, ref, { field: 'QUANTITY', delta: quantity, reason: 'INITIAL', userId });
}

// ---------------------------------------------------------------- availability (advisory, no writes)

/**
 * Compares the needs with the current available units. Reports every shortfall (the thing, the first line that needs it,
 * the TOTAL requested and what is still available). Used by POST /cart/validate; `reserveStock` is the authority.
 */
export async function checkAvailability(db: Db, needs: StockNeed[]): Promise<StockProblem[]> {
  const merged = mergeNeeds(needs);
  const info = await describeRefs(db, merged);
  const problems: StockProblem[] = [];
  for (const n of merged) {
    const d = info.get(refKey(n));
    if (!d) continue; // pricing already rejected unknown ids
    const available = Math.max(0, d.quantity - d.reserved);
    if (available < n.qty) problems.push({ ...d.problem, itemIndex: n.itemIndex, name: d.name, requested: n.qty, available });
  }
  return problems;
}

/** Sums the quantities of identical refs; the itemIndex is the first (lowest) line that needs the thing. Fixed lock order. */
export function mergeNeeds(needs: StockNeed[]): StockNeed[] {
  const map = new Map<string, StockNeed>();
  for (const n of needs) {
    const k = refKey(n);
    const cur = map.get(k);
    if (cur) {
      cur.qty += n.qty;
      cur.itemIndex = Math.min(cur.itemIndex, n.itemIndex);
    } else map.set(k, { ...n });
  }
  return sortRefs([...map.values()]);
}

// ---------------------------------------------------------------- order-driven operations (inside the caller's transaction)

/**
 * Reserves every need in a fixed order (variants by id, then Stimpies by id). Throws SOLD_OUT listing ALL failing items;
 * the caller's transaction then rolls back, so a failed multi-line order reserves nothing. Writes one ORDER_RESERVED
 * movement per need. Returns the items that crossed the low-stock threshold (when given).
 */
export async function reserveStock(tx: Tx, needs: StockNeed[], orderId: number, opts: { lowStockThreshold?: number; at?: Date } = {}): Promise<LowStockCrossing[]> {
  const merged = mergeNeeds(needs);
  const failed: StockNeed[] = [];
  const reserved: StockNeed[] = [];
  for (const n of merged) {
    if (n.qty <= 0 || !Number.isInteger(n.qty)) throw new TypeError('Stock quantities must be positive integers.');
    assertRef(refColumns(n));
    if (await reserveRow(tx, n, n.qty)) reserved.push(n);
    else failed.push(n);
  }
  if (failed.length) {
    const info = await describeRefs(tx, failed);
    const items: StockProblem[] = [];
    for (const n of failed) {
      const d = info.get(refKey(n));
      if (!d) throw new AppError('INTERNAL', 500, 'A stocked item disappeared.');
      items.push({ ...d.problem, itemIndex: n.itemIndex, name: d.name, requested: n.qty, available: Math.max(0, d.quantity - d.reserved) });
    }
    throw soldOut(items);
  }
  for (const n of reserved) await logMovement(tx, n, { field: 'RESERVED', delta: n.qty, reason: 'ORDER_RESERVED', orderId, at: opts.at });

  const crossings: LowStockCrossing[] = [];
  const threshold = opts.lowStockThreshold;
  if (threshold !== undefined) {
    const info = await describeRefs(tx, reserved);
    for (const n of reserved) {
      const d = info.get(refKey(n));
      if (!d) continue;
      const after = d.quantity - d.reserved;
      if (after + n.qty > threshold && after <= threshold) crossings.push({ ref: n, name: d.name, available: after });
    }
  }
  return crossings;
}

type LineRow = { id: number; orderItemId: number; qty: number; state: StockLineState; itemType: 'HOODIE_VARIANT' | 'STIMPIE'; variantId: number | null; stimpieId: number | null };

function lineRef(l: LineRow): StockRef {
  return assertRef({ itemType: l.itemType, variantId: l.variantId, stimpieId: l.stimpieId });
}

async function loadLines(tx: Tx, orderId: number, states: StockLineState[]): Promise<{ ref: StockRef; qty: number; ids: number[]; state: StockLineState }[]> {
  const rows = (await tx.orderStockLine.findMany({ where: { orderId, state: { in: states } }, orderBy: { id: 'asc' } })) as LineRow[];
  // group by (ref, state): one counter update and one movement per thing
  const groups = new Map<string, { ref: StockRef; qty: number; ids: number[]; state: StockLineState }>();
  for (const l of rows) {
    const ref = lineRef(l);
    const k = `${refKey(ref)}|${l.state}`;
    const g = groups.get(k);
    if (g) {
      g.qty += l.qty;
      g.ids.push(l.id);
    } else groups.set(k, { ref, qty: l.qty, ids: [l.id], state: l.state });
  }
  return sortRefs([...groups.values()].map((g) => ({ ...g, ...g.ref }))).map(({ ref, qty, ids, state }) => ({ ref, qty, ids, state }));
}

async function setLineState(tx: Tx, ids: number[], state: StockLineState): Promise<void> {
  await tx.orderStockLine.updateMany({ where: { id: { in: ids } }, data: { state } });
}

/** reserved -qty, line state RELEASED, ORDER_RELEASED movements. Only lines still RESERVED are touched. */
export async function releaseStockForOrder(tx: Tx, orderId: number, userId: number | null, at?: Date): Promise<void> {
  for (const g of await loadLines(tx, orderId, ['RESERVED'])) {
    await releaseRow(tx, g.ref, g.qty);
    await setLineState(tx, g.ids, 'RELEASED');
    await logMovement(tx, g.ref, { field: 'RESERVED', delta: -g.qty, reason: 'ORDER_RELEASED', orderId, userId, at });
  }
}

/** quantity -qty and reserved -qty (two ORDER_SOLD movements), line state SOLD. */
export async function sellStockForOrder(tx: Tx, orderId: number, userId: number | null, at?: Date): Promise<void> {
  for (const g of await loadLines(tx, orderId, ['RESERVED'])) {
    await sellRow(tx, g.ref, g.qty);
    await setLineState(tx, g.ids, 'SOLD');
    await logMovement(tx, g.ref, { field: 'QUANTITY', delta: -g.qty, reason: 'ORDER_SOLD', orderId, userId, at });
    await logMovement(tx, g.ref, { field: 'RESERVED', delta: -g.qty, reason: 'ORDER_SOLD', orderId, userId, at });
  }
}

/**
 * An order is returned. Lines still RESERVED (failed delivery) are released. Lines already SOLD (accepted return after
 * delivery) are restocked (+quantity, RESTOCKED, ORDER_RETURNED) or written off (WRITTEN_OFF, zero-delta ORDER_WRITTEN_OFF marker).
 */
export async function returnStockForOrder(tx: Tx, orderId: number, opts: { restock: boolean; userId: number | null; at?: Date }): Promise<void> {
  for (const g of await loadLines(tx, orderId, ['RESERVED', 'SOLD'])) {
    if (g.state === 'RESERVED') {
      await releaseRow(tx, g.ref, g.qty);
      await setLineState(tx, g.ids, 'RELEASED');
      await logMovement(tx, g.ref, { field: 'RESERVED', delta: -g.qty, reason: 'ORDER_RELEASED', orderId, userId: opts.userId, at: opts.at });
    } else if (opts.restock) {
      await addQuantityRow(tx, g.ref, g.qty);
      await setLineState(tx, g.ids, 'RESTOCKED');
      await logMovement(tx, g.ref, { field: 'QUANTITY', delta: g.qty, reason: 'ORDER_RETURNED', orderId, userId: opts.userId, at: opts.at });
    } else {
      await setLineState(tx, g.ids, 'WRITTEN_OFF');
      await logMovement(tx, g.ref, { field: 'QUANTITY', delta: 0, reason: 'ORDER_WRITTEN_OFF', orderId, userId: opts.userId, at: opts.at });
    }
  }
}

/** Creates the `order_stock_lines` rows (state RESERVED) for an order's items. Both-or-neither refs are impossible by construction. */
export async function createStockLines(tx: Tx, orderId: number, lines: { orderItemId: number; ref: StockRef; qty: number }[]): Promise<void> {
  if (!lines.length) return;
  await tx.orderStockLine.createMany({
    data: lines.map((l) => ({ orderId, orderItemId: l.orderItemId, ...refColumns(l.ref), qty: l.qty, state: 'RESERVED' as const })),
  });
}

// ---------------------------------------------------------------- manual adjustments (dashboard)

/** Founder alert "low stock" (WP-C decides whether it is enabled). Never throws: an alert must not break the operation. */
export async function queueLowStockAlert(ctx: AppContext, db: Db, items: LowStockCrossing[], threshold: number): Promise<void> {
  for (const i of items) {
    try {
      await enqueueLowStockAlert(ctx, db, { itemType: i.ref.itemType, itemId: refId(i.ref), name: i.name, available: i.available, threshold });
    } catch (err) {
      log.warn({ err: String((err as Error).message).slice(0, 200) }, 'low-stock alert could not be queued');
    }
  }
}

async function crossingAfterManual(ctx: AppContext, ref: StockRef, before: StockSnapshot, after: StockSnapshot, db: Db): Promise<LowStockCrossing[]> {
  const { lowStockThreshold } = await ctx.settings.get('orders');
  if (before.available > lowStockThreshold && after.available <= lowStockThreshold) {
    const info = await describeRefs(db, [ref]);
    return [{ ref, name: info.get(refKey(ref))?.name ?? 'Item', available: after.available }];
  }
  return [];
}

function cleanNote(note: string): string {
  const n = note.trim();
  if (!n) throw AppError.validation({ note: 'Add a note so we know why the stock changed.' });
  if (n.length > 255) throw AppError.validation({ note: 'Must be at most 255 characters.' });
  return n;
}

function belowReserved(reserved: number): AppError {
  return AppError.conflict(
    reserved > 0
      ? `You can't go below what's reserved for open orders (reserved: ${reserved}).`
      : "That would make the stock negative.",
    'quantity',
  );
}

/** Manual adjustment changes on-hand quantity only; reserved units are owned by live order stock lines. */
export async function adjustStock(
  ctx: AppContext,
  input: { ref: StockRef; delta: number; reason?: ManualReason; note: string; userId: number },
): Promise<StockSnapshot> {
  const { ref, delta, userId } = input;
  assertRef(refColumns(ref));
  if (!Number.isInteger(delta) || delta === 0) throw AppError.validation({ delta: 'Enter a whole number other than 0.' });
  const reason = input.reason ?? 'CORRECTION';
  if (!MANUAL_REASONS.includes(reason)) throw AppError.validation({ reason: 'Choose Restock, Correction or Damaged.' });
  if (reason === 'RESTOCK' && delta < 0) throw AppError.validation({ delta: 'A restock adds units: enter a positive number (use Correction to remove).' });
  if (reason === 'DAMAGED' && delta > 0) throw AppError.validation({ delta: 'Damaged units are removed: enter a negative number.' });
  const note = cleanNote(input.note);

  const { before, after } = await ctx.prisma.$transaction(
    async (tx) => {
      const cur = await lockRow(tx, ref);
      if (!cur) throw AppError.notFound('That stock item does not exist.');

      const next = cur.quantity + delta;
      if (next < cur.reserved) throw belowReserved(cur.reserved);
      await setQuantityRow(tx, ref, next);
      await logMovement(tx, ref, { field: 'QUANTITY', delta, reason, userId, note });
      return {
        before: { quantity: cur.quantity, reserved: cur.reserved, available: cur.quantity - cur.reserved },
        after: { quantity: next, reserved: cur.reserved, available: next - cur.reserved },
      };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
  const crossings = await crossingAfterManual(ctx, ref, before, after, ctx.prisma);
  await queueLowStockAlert(ctx, ctx.prisma, crossings, (await ctx.settings.get('orders')).lowStockThreshold);
  return after;
}

/** Sets on-hand quantity (CORRECTION movement for the difference; a no-change set writes nothing). */
export async function setStock(
  ctx: AppContext,
  input: { ref: StockRef; quantity?: number; note: string; userId: number },
): Promise<StockSnapshot> {
  const { ref, userId } = input;
  assertRef(refColumns(ref));
  const note = cleanNote(input.note);
  const quantity = input.quantity;
  if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) {
    throw AppError.validation({ quantity: 'Enter a whole number, 0 or more.' });
  }

  const { before, after } = await ctx.prisma.$transaction(
    async (tx) => {
      const cur = await lockRow(tx, ref);
      if (!cur) throw AppError.notFound('That stock item does not exist.');
      if (quantity < cur.reserved) throw belowReserved(cur.reserved);
      const delta = quantity - cur.quantity;
      if (delta !== 0) {
        await setQuantityRow(tx, ref, quantity);
        await logMovement(tx, ref, { field: 'QUANTITY', delta, reason: 'CORRECTION', userId, note });
      }
      return {
        before: { quantity: cur.quantity, reserved: cur.reserved, available: cur.quantity - cur.reserved },
        after: { quantity, reserved: cur.reserved, available: quantity - cur.reserved },
      };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
  const crossings = await crossingAfterManual(ctx, ref, before, after, ctx.prisma);
  await queueLowStockAlert(ctx, ctx.prisma, crossings, (await ctx.settings.get('orders')).lowStockThreshold);
  return after;
}
