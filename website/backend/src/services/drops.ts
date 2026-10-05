import { AppError, ERROR_STATUS } from '../lib/errors';
import type { Db } from '../lib/db';

/**
 * DROPS SERVICE (work package A). Derives UPCOMING / LIVE / SOLD_OUT / ENDED from time and stock (business-rules 6)
 * and answers "is this Stimpie purchasable right now". `placeOrder` and `/cart/validate` (WP B) call it.
 *
 * Everything here is a pure function of (rows, clock) except `dropsStartingWithin`. Callers pass the instant (`now()`
 * from lib/clock) so tests can freeze time.
 */
export type DropState = 'UPCOMING' | 'LIVE' | 'SOLD_OUT' | 'ENDED';
export type PurchaseReason = 'INACTIVE' | 'DROP_NOT_STARTED' | 'DROP_ENDED';
export type StimpieStatus = 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';
export type AccentColor = 'BUTTER' | 'SKY' | 'LILAC';

/** Fixed brand values (data-model section 2): `accentHex` is always exactly one of these. */
export const ACCENT_HEX: Record<AccentColor, string> = { BUTTER: '#FFE45C', SKY: '#5CC8FF', LILAC: '#C9B6FF' };
export const ACCENT_COLORS = ['BUTTER', 'SKY', 'LILAC'] as const;

export type DropTimes = { startsAt: Date; endsAt: Date | null; endedAt: Date | null };
export type StockLike = { active: boolean; quantity: number; reserved: number };

/** Units that can still be ordered (never negative). */
export const availableUnits = (s: { quantity: number; reserved: number }): number => Math.max(0, s.quantity - s.reserved);

/** True when the drop was ended early or its planned end has passed. */
export function isDropEnded(drop: Pick<DropTimes, 'endsAt' | 'endedAt'>, at: Date): boolean {
  if (drop.endedAt) return true;
  return drop.endsAt !== null && drop.endsAt.getTime() <= at.getTime();
}

export function isDropStarted(drop: Pick<DropTimes, 'startsAt'>, at: Date): boolean {
  return drop.startsAt.getTime() <= at.getTime();
}

/**
 * UPCOMING  now < startsAt
 * ENDED     endedAt set, or endsAt passed (wins over everything else once it applies)
 * SOLD_OUT  started, not ended, and no active Stimpie has available stock
 * LIVE      started, not ended, at least one active Stimpie has available stock
 */
export function deriveDropState(drop: DropTimes, stimpies: StockLike[], at: Date): DropState {
  if (isDropEnded(drop, at)) return 'ENDED';
  if (!isDropStarted(drop, at)) return 'UPCOMING';
  return stimpies.some((s) => s.active && availableUnits(s) > 0) ? 'LIVE' : 'SOLD_OUT';
}

/** Sum of available units across the active Stimpies of a drop (public `unitsRemaining` while LIVE). */
export function dropUnitsRemaining(stimpies: StockLike[]): number {
  return stimpies.filter((s) => s.active).reduce((sum, s) => sum + availableUnits(s), 0);
}

/** null when purchasable (ignoring stock), otherwise the reason. */
export function purchaseBlockReason(
  stimpie: { active: boolean; drop: DropTimes | null },
  at: Date,
): PurchaseReason | null {
  if (!stimpie.active) return 'INACTIVE';
  const drop = stimpie.drop;
  if (!drop) return null;
  if (isDropEnded(drop, at)) return 'DROP_ENDED';
  if (!isDropStarted(drop, at)) return 'DROP_NOT_STARTED';
  return null;
}

/**
 * Public Stimpie status (business-rules 6): UPCOMING (drop not started), ENDED (drop ended), SOLD_OUT (available 0),
 * LOW (available <= threshold), otherwise AVAILABLE. CORE Stimpies ignore their drop (never UPCOMING / ENDED).
 */
export function deriveStimpieStatus(
  stimpie: { type: 'CORE' | 'LIMITED'; quantity: number; reserved: number; drop: DropTimes | null },
  lowStockThreshold: number,
  at: Date,
): StimpieStatus {
  if (stimpie.type === 'LIMITED' && stimpie.drop) {
    if (isDropEnded(stimpie.drop, at)) return 'ENDED';
    if (!isDropStarted(stimpie.drop, at)) return 'UPCOMING';
  }
  const available = availableUnits(stimpie);
  if (available <= 0) return 'SOLD_OUT';
  if (available <= lowStockThreshold) return 'LOW';
  return 'AVAILABLE';
}

/** Public stock view of a Stimpie: `status`, `remaining` (ONLY when LOW; exact stock is hidden above the threshold) and `purchasable`. */
export function stimpieAvailability(
  stimpie: { active: boolean; type: 'CORE' | 'LIMITED'; quantity: number; reserved: number; drop: DropTimes | null },
  lowStockThreshold: number,
  at: Date,
): { status: StimpieStatus; remaining: number | null; purchasable: boolean } {
  const status = deriveStimpieStatus(stimpie, lowStockThreshold, at);
  // A CORE Stimpie ignores any drop (admin validation prevents the combination; this keeps status and purchasable consistent).
  const drop = stimpie.type === 'CORE' ? null : stimpie.drop;
  const purchasable = stimpie.active && (status === 'AVAILABLE' || status === 'LOW') && purchaseBlockReason({ active: stimpie.active, drop }, at) === null;
  return { status, remaining: status === 'LOW' ? availableUnits(stimpie) : null, purchasable };
}

/** Public variant stock: `remaining` only for 0 < available <= threshold (no "0 left": use inStock). */
export function variantAvailability(
  variant: { quantity: number; reserved: number },
  lowStockThreshold: number,
): { inStock: boolean; remaining: number | null } {
  const available = availableUnits(variant);
  return { inStock: available > 0, remaining: available > 0 && available <= lowStockThreshold ? available : null };
}

// ---------------------------------------------------------------- NOT_PURCHASABLE helpers (used by placeOrder / cart validation)

export type PurchaseProblem = (
  | { kind: 'HOODIE_VARIANT'; hoodieId: number; colorId: number; sizeId: number }
  | { kind: 'STIMPIE'; stimpieId: number }
) & { itemIndex: number; name: string; reason: PurchaseReason };

/** Builds the `StimpieRef` problem for a Stimpie that cannot be bought, or null when it can. */
export function stimpiePurchaseProblem(
  stimpie: { id: number; name: string; active: boolean; drop: DropTimes | null },
  itemIndex: number,
  at: Date,
): PurchaseProblem | null {
  const reason = purchaseBlockReason(stimpie, at);
  return reason ? { kind: 'STIMPIE', stimpieId: stimpie.id, itemIndex, name: stimpie.name, reason } : null;
}

/** Throws NOT_PURCHASABLE (409, `details.items`) when the list is not empty. All problems are reported together. */
export function assertNoPurchaseProblems(problems: PurchaseProblem[]): void {
  if (problems.length === 0) return;
  throw new AppError('NOT_PURCHASABLE', ERROR_STATUS.NOT_PURCHASABLE, "Some items can't be ordered right now.", { items: problems });
}

/**
 * Convenience for callers that have loaded Stimpies together with their drop: throws NOT_PURCHASABLE listing every
 * Stimpie that is inactive, in a drop that has not started, or in a drop that ended.
 */
export function assertStimpiesPurchasable(
  lines: { itemIndex: number; stimpie: { id: number; name: string; active: boolean; drop: DropTimes | null } }[],
  at: Date,
): void {
  const problems: PurchaseProblem[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    const p = stimpiePurchaseProblem(l.stimpie, l.itemIndex, at);
    const key = `${l.stimpie.id}:${l.itemIndex}`;
    if (p && !seen.has(key)) {
      seen.add(key);
      problems.push(p);
    }
  }
  assertNoPurchaseProblems(problems);
}

// ---------------------------------------------------------------- cache rule

/** `GET /drops` is `no-store` while any not-ended drop starts within the next `windowMs` (default 60 s). */
export async function dropStartsWithin(db: Db, at: Date, windowMs = 60_000): Promise<boolean> {
  const n = await db.drop.count({
    where: { startsAt: { gt: at, lte: new Date(at.getTime() + windowMs) }, endedAt: null },
  });
  return n > 0;
}
