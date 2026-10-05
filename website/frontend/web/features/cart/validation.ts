/**
 * Maps a `POST /cart/validate` response onto cart lines (checkout-and-order-flow 1.6, table "Response mapping").
 * Pure: no store, no fetch. `lines[].itemIndex` is the position in the submitted `items`, i.e. the cart line at
 * that index, so the caller must send every cart line in cart order (UNAVAILABLE lines included).
 */
import type { StockProblem, PurchaseProblem, ValidateCartResponse } from '@stimpy/api-client';
import { formatCents } from '@stimpy/ui';
import { clampQty } from './helpers';
import type { CartItem, CartLine, CartLineCheck, CartValidationSummary } from './types';

export interface ValidationOutcome {
  lines: CartLine[];
  summary: CartValidationSummary;
  /** Toasts to show (one per adjusted line). */
  toasts: string[];
  /** Another line may still need the same stock after an adjustment: run validate once more. */
  rerun: boolean;
}

type Problem = StockProblem | PurchaseProblem;

function isPurchaseProblem(p: Problem): p is PurchaseProblem {
  return 'reason' in p;
}

function purchaseReasonText(p: PurchaseProblem): string {
  switch (p.reason) {
    case 'INACTIVE':
      return `${p.name} isn't available any more.`;
    case 'DROP_NOT_STARTED':
      return `${p.name} isn't on sale yet. The drop hasn't started.`;
    case 'DROP_ENDED':
      return `${p.name}: this drop has ended.`;
  }
}

function withQty(item: CartItem, qty: number): CartItem {
  return { ...item, qty } as CartItem;
}

export function applyValidation(
  lines: readonly CartLine[],
  response: ValidateCartResponse,
  options: { areaId?: number | null; now?: Date } = {},
): ValidationOutcome {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const next: CartLine[] = lines.map((l) => ({ ...l, ui: { ...l.ui }, item: { ...l.item } as CartItem }));
  const checks = new Map<number, CartLineCheck>();
  const toasts: string[] = [];
  let rerun = false;

  // First pass: per-line results.
  for (const result of response.lines) {
    const line = next[result.itemIndex];
    if (!line) continue;
    if (result.ok) {
      if (result.unitPriceCents !== line.ui.unitPriceCents) {
        checks.set(result.itemIndex, {
          state: 'PRICE_CHANGED',
          reasons: [`The price of ${line.ui.title} changed to ${formatCents(result.unitPriceCents)}.`],
          checkedAt,
        });
        line.ui.unitPriceCents = result.unitPriceCents;
      } else if (!checks.has(result.itemIndex)) {
        checks.set(result.itemIndex, { state: 'OK', reasons: [], checkedAt });
      }
      continue;
    }

    const reasons: string[] = [];
    let unavailable = false;
    if (result.problems.length === 0) {
      unavailable = true;
      reasons.push("This item isn't available right now.");
    }
    for (const problem of result.problems as Problem[]) {
      if (isPurchaseProblem(problem)) {
        unavailable = true;
        reasons.push(purchaseReasonText(problem));
        continue;
      }
      // Stock problem.
      if (problem.available <= 0) {
        unavailable = true;
        if (problem.kind === 'HOODIE_VARIANT') {
          const label = [line.ui.colorName, line.ui.sizeLabel].filter(Boolean).join(', ');
          reasons.push(`${label || problem.name} just sold out.`);
        } else {
          reasons.push(`${problem.name} just sold out.`);
        }
        continue;
      }
      // 0 < available < requested: lower the quantity of the line the server pointed at.
      const target = next[problem.itemIndex];
      if (target) {
        const reduceBy = problem.requested - problem.available;
        const newQty = target.item.qty - reduceBy;
        if (newQty < 1) {
          checks.set(problem.itemIndex, {
            state: 'UNAVAILABLE',
            reasons: [`Only ${problem.available} left of ${problem.name}.`],
            checkedAt,
          });
        } else {
          target.item = withQty(target.item, clampQty(newQty));
          if (!checks.has(problem.itemIndex) || checks.get(problem.itemIndex)?.state !== 'UNAVAILABLE') {
            checks.set(problem.itemIndex, {
              state: 'ADJUSTED',
              reasons: [`Only ${problem.available} left of ${problem.name}, we updated your cart.`],
              checkedAt,
            });
          }
          toasts.push(`Only ${problem.available} left, we updated your cart.`);
          rerun = true;
        }
      }
    }
    if (unavailable) {
      checks.set(result.itemIndex, { state: 'UNAVAILABLE', reasons, checkedAt });
    }
  }

  const merged = next.map((line, i) => {
    const check = checks.get(i);
    return check ? { ...line, check } : line;
  });

  return {
    lines: merged,
    summary: {
      ok: response.ok && !merged.some((l) => l.check.state === 'UNAVAILABLE'),
      subtotalCents: response.subtotalCents,
      deliveryFeeCents: response.deliveryFeeCents,
      totalCents: response.totalCents,
      estimateText: response.estimateText,
      checkedAt,
      areaId: options.areaId ?? null,
    },
    toasts,
    rerun,
  };
}

/** Lines that failed an `items.N...` VALIDATION_ERROR: unknown or removed product (checkout-and-order-flow 1.6). */
export function markInvalidLines(lines: readonly CartLine[], indices: readonly number[], now: Date = new Date()): CartLine[] {
  const set = new Set(indices);
  return lines.map((l, i) =>
    set.has(i)
      ? { ...l, check: { state: 'UNAVAILABLE', reasons: ["This item isn't sold any more."], checkedAt: now.toISOString() } }
      : l,
  );
}

/** Extract line indices from `fields` keys such as `items.2.stimpieIds.0`. */
export function invalidItemIndices(fields: Record<string, string> | null): number[] {
  if (!fields) return [];
  const out = new Set<number>();
  for (const key of Object.keys(fields)) {
    const m = /^items\.(\d+)(?:\.|$)/.exec(key);
    if (m) out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}
