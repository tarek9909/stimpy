import type { Drop, Prisma, Stimpie } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { now } from '../../lib/clock';
import { isUniqueViolation, type Db } from '../../lib/db';
import { iso, isoOrNull, ymdInTz } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { parseSort, toPage, toSkipTake, type Page } from '../../lib/http';
import { normalizePhone } from '../../lib/phone';
import { uniqueSlug } from '../../lib/slug';
import { escapeLike } from '../../lib/sql-like';
import {
  ACCENT_HEX,
  availableUnits,
  deriveDropState,
  dropStartsWithin,
  dropUnitsRemaining,
  isDropEnded,
  isDropStarted,
  type DropState,
} from '../../services/drops';
import { accentHexOf, toPublicStimpie } from '../catalog/mappers';
import type { DropListQuery, SubscriberListQuery, dropCreateBody, dropUpdateBody } from './schemas';
import { subscribersCsv } from './csv';

type DropRow = Drop & { stimpies: Stimpie[] };
const stimpieOrder: Prisma.StimpieOrderByWithRelationInput[] = [{ position: 'asc' }, { id: 'asc' }];

const slugTaken = (): AppError => AppError.conflict('That slug is taken.', 'slug');

async function loadDrops(db: Db, where: Prisma.DropWhereInput = {}): Promise<DropRow[]> {
  return db.drop.findMany({ where, include: { stimpies: { orderBy: stimpieOrder } }, orderBy: [{ startsAt: 'desc' }, { id: 'desc' }] });
}

// ================================================================ public

export function toPublicDrop(row: DropRow, lowStockThreshold: number, at: Date) {
  const state = deriveDropState(row, row.stimpies, at);
  const visible = row.stimpies.filter((s) => s.active);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    story: row.story,
    accentColor: row.accentColor,
    accentHex: accentHexOf(row),
    startsAt: iso(row.startsAt),
    endsAt: isoOrNull(row.endsAt),
    state,
    teaserImage: row.teaserImage,
    teaserVideo: row.teaserVideo,
    unitsRemaining: state === 'LIVE' ? dropUnitsRemaining(row.stimpies) : null,
    stimpies: visible.map((s) => toPublicStimpie({ ...s, drop: row }, lowStockThreshold, at)),
  };
}

/** `Cache-Control` for `GET /drops` and `GET /drops/:slug`: `no-store` within 60 s of any drop start, else `max-age=10`. */
export async function dropCacheControl(ctx: AppContext): Promise<string> {
  return (await dropStartsWithin(ctx.prisma, now())) ? 'no-store' : 'public, max-age=10';
}

export async function listPublicDrops(ctx: AppContext) {
  const at = now();
  const threshold = (await ctx.settings.get('orders')).lowStockThreshold;
  const rows = await loadDrops(ctx.prisma);
  const drops = rows.map((r) => toPublicDrop(r, threshold, at));
  const byStart = (a: { startsAt: string }, b: { startsAt: string }): number => Date.parse(a.startsAt) - Date.parse(b.startsAt);
  const live = drops.filter((d) => d.state === 'LIVE').sort((a, b) => byStart(b, a))[0] ?? null; // most recently started
  return {
    live,
    upcoming: drops.filter((d) => d.state === 'UPCOMING').sort(byStart),
    archive: drops.filter((d) => d.state === 'SOLD_OUT' || d.state === 'ENDED').sort((a, b) => byStart(b, a)),
  };
}

export async function getPublicDrop(ctx: AppContext, slug: string) {
  const row = await ctx.prisma.drop.findUnique({ where: { slug }, include: { stimpies: { orderBy: stimpieOrder } } });
  if (!row) throw AppError.notFound('Drop not found.');
  return toPublicDrop(row, (await ctx.settings.get('orders')).lowStockThreshold, now());
}

// ---------------------------------------------------------------- subscribe

const emailSchema = z.string().email().max(190);

/** Serialises concurrent subscriptions of the same contact to the same drop (single process, v1) so none is stored twice. */
const subscribeLocks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = subscribeLocks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  subscribeLocks.set(key, run);
  try {
    return await run;
  } finally {
    if (subscribeLocks.get(key) === run) subscribeLocks.delete(key);
  }
}

export async function subscribe(ctx: AppContext, dropId: number, input: { contact: string; type: 'EMAIL' | 'WHATSAPP' }): Promise<void> {
  let contact: string;
  if (input.type === 'EMAIL') {
    if (!emailSchema.safeParse(input.contact).success) throw AppError.validation({ contact: 'Enter a valid email address.' });
    contact = input.contact.trim();
  } else {
    const phone = normalizePhone(input.contact);
    if (!phone) throw AppError.validation({ contact: 'Enter a Lebanese WhatsApp number, e.g. 03 123 456.' });
    contact = phone;
  }
  await withLock(`${dropId}|${input.type}|${contact.toLowerCase()}`, async () => {
    await ctx.prisma.$transaction(async (tx) => {
      if (!(await tx.drop.findUnique({ where: { id: dropId }, select: { id: true } }))) throw AppError.notFound('Drop not found.');
      const customer = input.type === 'EMAIL'
        ? await tx.customer.findFirst({ where: { email: contact }, select: { id: true } })
        : await tx.customer.findUnique({ where: { phone: contact }, select: { id: true } });
      // Idempotent: same contact/type/drop is stored once and linked to its CRM profile when known.
      const exists = await tx.subscriber.findFirst({ where: { dropId, contact, type: input.type }, select: { id: true } });
      if (!exists) await tx.subscriber.create({ data: { dropId, contact, type: input.type, customerId: customer?.id ?? null } });
      else if (customer) await tx.subscriber.updateMany({ where: { id: exists.id, customerId: null }, data: { customerId: customer.id } });
      if (customer) {
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ...(input.type === 'EMAIL' ? { emailConsent: true, unsubscribedAt: null } : { whatsappConsent: true }),
            consentUpdatedAt: now(),
          },
        });
      }
    });
  });
}

// ================================================================ admin

type Stats = {
  perStimpie: Map<number, { quantity: number; sold: number; remaining: number }>;
  revenueCents: number;
  sellOutAt: Date | null;
};

/**
 * Drop statistics (documented in DECISIONS.md):
 *  - `remaining` = available units now (quantity - reserved);
 *  - `sold` = units held by open orders (reserved) + units already delivered (order lines in state SOLD);
 *  - `quantity` = sold + remaining, i.e. everything the drop has had in stock;
 *  - revenue = direct Stimpie order lines (state RESERVED or SOLD); Stimpies inside a pack are not priced separately.
 */
async function dropStats(db: Db, rows: DropRow[]): Promise<Map<number, Stats>> {
  const out = new Map<number, Stats>();
  const ids = rows.flatMap((r) => r.stimpies.map((s) => s.id));
  const delivered = new Map<number, number>();
  const revenue = new Map<number, number>();
  const lastDecrease = new Map<number, Date>();
  if (ids.length) {
    const sold = await db.orderStockLine.groupBy({ by: ['stimpieId'], where: { stimpieId: { in: ids }, state: 'SOLD' }, _sum: { qty: true } });
    for (const r of sold) if (r.stimpieId !== null) delivered.set(r.stimpieId, r._sum.qty ?? 0);
    const lines = await db.orderStockLine.findMany({
      where: { stimpieId: { in: ids }, state: { in: ['RESERVED', 'SOLD'] }, orderItem: { kind: 'STIMPIE' } },
      select: { stimpieId: true, qty: true, orderItem: { select: { unitPriceCents: true } } },
    });
    for (const l of lines) if (l.stimpieId !== null) revenue.set(l.stimpieId, (revenue.get(l.stimpieId) ?? 0) + l.qty * l.orderItem.unitPriceCents);
    const moves = await db.stockMovement.groupBy({
      by: ['stimpieId'],
      where: { stimpieId: { in: ids }, reason: { in: ['ORDER_RESERVED', 'CORRECTION', 'DAMAGED', 'RESTOCK', 'INITIAL'] } },
      _max: { createdAt: true },
    });
    for (const m of moves) if (m.stimpieId !== null && m._max.createdAt) lastDecrease.set(m.stimpieId, m._max.createdAt);
  }
  for (const r of rows) {
    const perStimpie = new Map<number, { quantity: number; sold: number; remaining: number }>();
    for (const s of r.stimpies) {
      const remaining = availableUnits(s);
      const sold = s.reserved + (delivered.get(s.id) ?? 0);
      perStimpie.set(s.id, { quantity: sold + remaining, sold, remaining });
    }
    const active = r.stimpies.filter((s) => s.active);
    const soldOut = active.length > 0 && active.every((s) => availableUnits(s) === 0);
    const times = active.map((s) => lastDecrease.get(s.id)).filter((d): d is Date => !!d);
    out.set(r.id, {
      perStimpie,
      revenueCents: r.stimpies.reduce((sum, s) => sum + (revenue.get(s.id) ?? 0), 0),
      sellOutAt: soldOut && times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null,
    });
  }
  return out;
}

async function toAdminDrop(ctx: AppContext, row: DropRow, stats: Stats, at: Date) {
  const threshold = (await ctx.settings.get('orders')).lowStockThreshold;
  const state = deriveDropState(row, row.stimpies, at);
  const active = row.stimpies.filter((s) => s.active);
  const sum = (pick: (s: Stimpie) => number): number => active.reduce((n, s) => n + pick(s), 0);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    story: row.story,
    accentColor: row.accentColor,
    accentHex: ACCENT_HEX[row.accentColor],
    startsAt: iso(row.startsAt),
    endsAt: isoOrNull(row.endsAt),
    endedAt: isoOrNull(row.endedAt),
    state,
    teaserImage: row.teaserImage,
    teaserVideo: row.teaserVideo,
    unitsTotal: sum((s) => stats.perStimpie.get(s.id)!.quantity),
    unitsSold: sum((s) => stats.perStimpie.get(s.id)!.sold),
    unitsRemaining: sum((s) => stats.perStimpie.get(s.id)!.remaining),
    revenueCents: stats.revenueCents,
    sellOutAt: isoOrNull(stats.sellOutAt),
    stimpies: row.stimpies.map((s) => {
      const { remaining: _r, ...pub } = toPublicStimpie({ ...s, drop: row }, threshold, at);
      void _r;
      const st = stats.perStimpie.get(s.id)!;
      return { ...pub, active: s.active, quantity: st.quantity, sold: st.sold, remaining: st.remaining };
    }),
  };
}

type AdminDropDto = Awaited<ReturnType<typeof toAdminDrop>>;

async function adminDropById(ctx: AppContext, id: number): Promise<AdminDropDto> {
  const row = await ctx.prisma.drop.findUnique({ where: { id }, include: { stimpies: { orderBy: stimpieOrder } } });
  if (!row) throw AppError.notFound('Drop not found.');
  const stats = await dropStats(ctx.prisma, [row]);
  return toAdminDrop(ctx, row, stats.get(id)!, now());
}

export const getDrop = adminDropById;

const DROP_SORT = ['startsAt', 'name', 'id'] as const;

export async function listDrops(ctx: AppContext, q: DropListQuery): Promise<Page<AdminDropDto>> {
  const at = now();
  const rows = await loadDrops(ctx.prisma, q.q ? { OR: [{ name: { contains: escapeLike(q.q) } }, { slug: { contains: escapeLike(q.q) } }] } : {});
  const stateOf = (r: DropRow): DropState => deriveDropState(r, r.stimpies, at);
  const wanted = (r: DropRow): boolean => {
    const s = stateOf(r);
    if (q.state === 'UPCOMING') return s === 'UPCOMING';
    if (q.state === 'LIVE') return s === 'LIVE';
    if (q.state === 'ARCHIVE') return s === 'SOLD_OUT' || s === 'ENDED';
    return true;
  };
  const defaultDir = q.state === 'UPCOMING' ? 'asc' : 'desc'; // soonest first for upcoming, newest first otherwise
  const sort = parseSort(q.sort, DROP_SORT, { field: 'startsAt', dir: defaultDir });
  const cmp = (a: DropRow, b: DropRow): number => {
    const d = sort.field === 'name' ? a.name.localeCompare(b.name) : sort.field === 'id' ? a.id - b.id : a.startsAt.getTime() - b.startsAt.getTime();
    return (sort.dir === 'asc' ? d : -d) || a.id - b.id;
  };
  const filtered = rows.filter(wanted).sort(cmp);
  const { skip, take } = toSkipTake(q);
  const pageRows = filtered.slice(skip, skip + take);
  const stats = await dropStats(ctx.prisma, pageRows);
  const items = await Promise.all(pageRows.map((r) => toAdminDrop(ctx, r, stats.get(r.id)!, at)));
  return toPage(items, filtered.length, q);
}

/** Every id must be an existing LIMITED Stimpie that is free or already in this drop. */
async function assertAssignable(db: Db, ids: number[], dropId: number | null): Promise<void> {
  const fields: Record<string, string> = {};
  const seen = new Set<number>();
  const rows = await db.stimpie.findMany({ where: { id: { in: ids } } });
  const byId = new Map(rows.map((s) => [s.id, s]));
  ids.forEach((id, i) => {
    const s = byId.get(id);
    if (seen.has(id)) fields[`stimpieIds.${i}`] = 'Each Stimpie may appear only once.';
    else if (!s) fields[`stimpieIds.${i}`] = 'That Stimpie does not exist.';
    else if (s.type === 'CORE') fields[`stimpieIds.${i}`] = `${s.name} is a Core Stimpie and can't belong to a drop.`;
    else if (s.dropId !== null && s.dropId !== dropId) fields[`stimpieIds.${i}`] = `${s.name} already belongs to another drop.`;
    seen.add(id);
  });
  if (Object.keys(fields).length) throw AppError.validation(fields);
}

function assertWindow(startsAt: Date, endsAt: Date | null): void {
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw AppError.validation({ endsAt: 'The end must be after the launch time.' });
}

export async function createDrop(ctx: AppContext, input: z.infer<typeof dropCreateBody>): Promise<AdminDropDto> {
  const endsAt = input.endsAt ?? null;
  assertWindow(input.startsAt, endsAt);
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const stimpieIds = input.stimpieIds ?? [];
      if (stimpieIds.length) await assertAssignable(tx, stimpieIds, null);
      const slug = input.slug ?? (await uniqueSlug(input.name, async (s) => (await tx.drop.count({ where: { slug: s } })) > 0));
      const row = await tx.drop.create({
        data: {
          name: input.name,
          slug,
          story: input.story ?? '',
          accentColor: input.accentColor,
          startsAt: input.startsAt,
          endsAt,
          teaserImage: input.teaserImage ?? null,
          teaserVideo: input.teaserVideo ?? null,
        },
      });
      if (stimpieIds.length) await tx.stimpie.updateMany({ where: { id: { in: stimpieIds } }, data: { dropId: row.id } });
      return row.id;
    });
    return await adminDropById(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

/**
 * Rules on top of plain field updates:
 *  - `endsAt` must stay after `startsAt`;
 *  - a drop that has already started cannot be moved to a later start (orders may exist);
 *  - relaunch: when a drop that was ended early (`endedAt`) gets a new `startsAt` / `endsAt` whose window is not over
 *    (no end, or an end in the future), `endedAt` is cleared and the drop is live (or upcoming) again;
 *  - `stimpieIds` is the full list: listed Stimpies join, Stimpies no longer listed leave (dropId = null).
 */
export async function updateDrop(ctx: AppContext, id: number, input: z.infer<typeof dropUpdateBody>): Promise<AdminDropDto> {
  const at = now();
  try {
    await ctx.prisma.$transaction(async (tx) => {
      const existing = await tx.drop.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('Drop not found.');
      const startsAt = input.startsAt ?? existing.startsAt;
      const endsAt = input.endsAt !== undefined ? input.endsAt : existing.endsAt;
      assertWindow(startsAt, endsAt);
      if (input.startsAt && isDropStarted(existing, at) && input.startsAt.getTime() > at.getTime()) {
        throw AppError.validation({ startsAt: "A drop that has started can't be moved to a later launch time." });
      }
      let endedAt = existing.endedAt;
      const touchedWindow = input.startsAt !== undefined || input.endsAt !== undefined;
      if (endedAt && touchedWindow && !isDropEnded({ endsAt, endedAt: null }, at)) endedAt = null; // relaunch

      if (input.stimpieIds) {
        await assertAssignable(tx, input.stimpieIds, id);
        await tx.stimpie.updateMany({ where: { dropId: id, id: { notIn: input.stimpieIds } }, data: { dropId: null } });
        if (input.stimpieIds.length) await tx.stimpie.updateMany({ where: { id: { in: input.stimpieIds } }, data: { dropId: id } });
      }
      await tx.drop.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.story !== undefined ? { story: input.story } : {}),
          ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
          ...(input.teaserImage !== undefined ? { teaserImage: input.teaserImage } : {}),
          ...(input.teaserVideo !== undefined ? { teaserVideo: input.teaserVideo } : {}),
          endedAt,
        },
      });
    });
    return await adminDropById(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw slugTaken();
    throw e;
  }
}

/** `POST /admin/drops/:id/end`: ends it now. Open orders are untouched. Not allowed before the launch or twice. */
export async function endDrop(ctx: AppContext, id: number): Promise<AdminDropDto> {
  const at = now();
  await ctx.prisma.$transaction(async (tx) => {
    const d = await tx.drop.findUnique({ where: { id } });
    if (!d) throw AppError.notFound('Drop not found.');
    if (isDropEnded(d, at)) throw AppError.conflict('This drop has already ended.');
    if (!isDropStarted(d, at)) throw AppError.conflict("This drop hasn't started yet. Change its launch time or delete it instead.");
    await tx.drop.update({ where: { id }, data: { endedAt: at } });
  });
  return adminDropById(ctx, id);
}

/**
 * Refused when any order references one of its Stimpies. Otherwise the Stimpies leave the drop and are hidden (so a
 * deleted upcoming drop cannot suddenly make its limited Stimpies buyable) and its subscribers stay as "any drop".
 */
export async function deleteDrop(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    if (!(await tx.drop.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Drop not found.');
    if ((await tx.orderStockLine.count({ where: { stimpie: { dropId: id } } })) > 0) throw AppError.conflict("This drop has orders. You can't delete it.");
    await tx.stimpie.updateMany({ where: { dropId: id }, data: { dropId: null, active: false } });
    await tx.subscriber.updateMany({ where: { dropId: id }, data: { dropId: null } });
    await tx.drop.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------- subscribers (admin)

function subscriberWhere(q: SubscriberListQuery): Prisma.SubscriberWhereInput {
  return {
    ...(q.type ? { type: q.type } : {}),
    ...(q.dropId ? { dropId: q.dropId } : {}),
    ...(q.customerId ? { customerId: q.customerId } : {}),
    ...(q.q ? { contact: { contains: escapeLike(q.q) } } : {}),
  };
}

export async function listSubscribers(ctx: AppContext, q: SubscriberListQuery) {
  const where = subscriberWhere(q);
  const [total, rows] = await Promise.all([
    ctx.prisma.subscriber.count({ where }),
    ctx.prisma.subscriber.findMany({ where, include: { drop: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map((r) => ({ id: r.id, contact: r.contact, type: r.type, customerId: r.customerId, dropName: r.drop?.name ?? null, createdAt: iso(r.createdAt) })), total, q);
}

export const CSV_MAX_ROWS = 50_000;

/** CSV of every subscriber matching the filters (no paging), plus the file name `subscribers-YYYY-MM-DD.csv`. */
export async function exportSubscribersCsv(ctx: AppContext, q: SubscriberListQuery): Promise<{ filename: string; csv: string }> {
  const rows = await ctx.prisma.subscriber.findMany({
    where: subscriberWhere(q),
    include: { drop: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: CSV_MAX_ROWS,
  });
  const tz = (await ctx.settings.get('business')).timezone;
  return {
    filename: `subscribers-${ymdInTz(now(), tz)}.csv`,
    csv: subscribersCsv(rows.map((r) => ({ contact: r.contact, type: r.type, drop: r.drop?.name ?? '', createdAt: iso(r.createdAt) }))),
  };
}
