import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors';
import {
  ACCENT_HEX,
  assertNoPurchaseProblems,
  assertStimpiesPurchasable,
  availableUnits,
  deriveDropState,
  deriveStimpieStatus,
  dropUnitsRemaining,
  purchaseBlockReason,
  stimpieAvailability,
  stimpiePurchaseProblem,
  variantAvailability,
  type DropTimes,
} from '../src/services/drops';

const NOW = new Date('2026-10-14T10:00:00Z');
const min = (n: number): Date => new Date(NOW.getTime() + n * 60_000);
const stock = (quantity: number, reserved = 0, active = true) => ({ active, quantity, reserved });

type Timing = 'FUTURE' | 'STARTED_OPEN' | 'STARTED_END_FUTURE' | 'END_PASSED' | 'ENDED_EARLY' | 'START_NOW';
const timings: Record<Timing, DropTimes> = {
  FUTURE: { startsAt: min(10), endsAt: null, endedAt: null },
  START_NOW: { startsAt: NOW, endsAt: null, endedAt: null },
  STARTED_OPEN: { startsAt: min(-10), endsAt: null, endedAt: null },
  STARTED_END_FUTURE: { startsAt: min(-10), endsAt: min(10), endedAt: null },
  END_PASSED: { startsAt: min(-100), endsAt: min(-1), endedAt: null },
  ENDED_EARLY: { startsAt: min(-100), endsAt: null, endedAt: min(-5) },
};

describe('deriveDropState (all timings x stock levels)', () => {
  const stocks = {
    withStock: [stock(5, 2), stock(0)],
    allSoldOut: [stock(5, 5), stock(0)],
    onlyInactiveHasStock: [stock(5, 0, false), stock(3, 3)],
    noStimpies: [],
  };
  const expected: Record<Timing, Record<keyof typeof stocks, string>> = {
    FUTURE: { withStock: 'UPCOMING', allSoldOut: 'UPCOMING', onlyInactiveHasStock: 'UPCOMING', noStimpies: 'UPCOMING' },
    START_NOW: { withStock: 'LIVE', allSoldOut: 'SOLD_OUT', onlyInactiveHasStock: 'SOLD_OUT', noStimpies: 'SOLD_OUT' },
    STARTED_OPEN: { withStock: 'LIVE', allSoldOut: 'SOLD_OUT', onlyInactiveHasStock: 'SOLD_OUT', noStimpies: 'SOLD_OUT' },
    STARTED_END_FUTURE: { withStock: 'LIVE', allSoldOut: 'SOLD_OUT', onlyInactiveHasStock: 'SOLD_OUT', noStimpies: 'SOLD_OUT' },
    END_PASSED: { withStock: 'ENDED', allSoldOut: 'ENDED', onlyInactiveHasStock: 'ENDED', noStimpies: 'ENDED' },
    ENDED_EARLY: { withStock: 'ENDED', allSoldOut: 'ENDED', onlyInactiveHasStock: 'ENDED', noStimpies: 'ENDED' },
  };
  for (const timing of Object.keys(timings) as Timing[]) {
    for (const s of Object.keys(stocks) as (keyof typeof stocks)[]) {
      it(`${timing} / ${s} -> ${expected[timing][s]}`, () => {
        expect(deriveDropState(timings[timing], stocks[s], NOW)).toBe(expected[timing][s]);
      });
    }
  }

  it('moves from UPCOMING to LIVE exactly at startsAt and to ENDED exactly at endsAt', () => {
    const d: DropTimes = { startsAt: min(5), endsAt: min(15), endedAt: null };
    const s = [stock(3)];
    expect(deriveDropState(d, s, new Date(d.startsAt.getTime() - 1))).toBe('UPCOMING');
    expect(deriveDropState(d, s, d.startsAt)).toBe('LIVE');
    expect(deriveDropState(d, s, new Date(d.endsAt!.getTime() - 1))).toBe('LIVE');
    expect(deriveDropState(d, s, d.endsAt!)).toBe('ENDED');
  });

  it('a reserved-only difference counts: quantity 5 reserved 5 is sold out, 5/4 is live', () => {
    expect(deriveDropState(timings.STARTED_OPEN, [stock(5, 5)], NOW)).toBe('SOLD_OUT');
    expect(deriveDropState(timings.STARTED_OPEN, [stock(5, 4)], NOW)).toBe('LIVE');
  });

  it('unitsRemaining sums available units of active Stimpies only', () => {
    expect(dropUnitsRemaining([stock(10, 3), stock(4, 4), stock(9, 0, false)])).toBe(7);
    expect(availableUnits({ quantity: 1, reserved: 3 })).toBe(0);
  });
});

describe('purchaseBlockReason', () => {
  it('inactive wins over everything', () => {
    expect(purchaseBlockReason({ active: false, drop: timings.FUTURE }, NOW)).toBe('INACTIVE');
    expect(purchaseBlockReason({ active: false, drop: null }, NOW)).toBe('INACTIVE');
  });
  it('no drop means purchasable (core)', () => {
    expect(purchaseBlockReason({ active: true, drop: null }, NOW)).toBeNull();
  });
  it('drop not started -> DROP_NOT_STARTED; running -> null; ended (early or by date) -> DROP_ENDED', () => {
    expect(purchaseBlockReason({ active: true, drop: timings.FUTURE }, NOW)).toBe('DROP_NOT_STARTED');
    expect(purchaseBlockReason({ active: true, drop: timings.START_NOW }, NOW)).toBeNull();
    expect(purchaseBlockReason({ active: true, drop: timings.STARTED_OPEN }, NOW)).toBeNull();
    expect(purchaseBlockReason({ active: true, drop: timings.STARTED_END_FUTURE }, NOW)).toBeNull();
    expect(purchaseBlockReason({ active: true, drop: timings.END_PASSED }, NOW)).toBe('DROP_ENDED');
    expect(purchaseBlockReason({ active: true, drop: timings.ENDED_EARLY }, NOW)).toBe('DROP_ENDED');
  });
  it('a sold-out drop that has not ended is not a purchase block (stock decides that)', () => {
    expect(purchaseBlockReason({ active: true, drop: timings.STARTED_OPEN }, NOW)).toBeNull();
  });
});

describe('stimpie status / remaining / purchasable matrix (threshold 10)', () => {
  const T = 10;
  type Case = { name: string; type: 'CORE' | 'LIMITED'; q: number; r: number; drop: Timing | null; active?: boolean; status: string; remaining: number | null; purchasable: boolean };
  const cases: Case[] = [
    { name: 'core plenty', type: 'CORE', q: 50, r: 0, drop: null, status: 'AVAILABLE', remaining: null, purchasable: true },
    { name: 'core exactly above threshold (11)', type: 'CORE', q: 11, r: 0, drop: null, status: 'AVAILABLE', remaining: null, purchasable: true },
    { name: 'core exactly at threshold (10)', type: 'CORE', q: 10, r: 0, drop: null, status: 'LOW', remaining: 10, purchasable: true },
    { name: 'core low via reservations (20-15=5)', type: 'CORE', q: 20, r: 15, drop: null, status: 'LOW', remaining: 5, purchasable: true },
    { name: 'core last unit', type: 'CORE', q: 3, r: 2, drop: null, status: 'LOW', remaining: 1, purchasable: true },
    { name: 'core sold out', type: 'CORE', q: 3, r: 3, drop: null, status: 'SOLD_OUT', remaining: null, purchasable: false },
    { name: 'core never UPCOMING even with a future drop id', type: 'CORE', q: 30, r: 0, drop: 'FUTURE', status: 'AVAILABLE', remaining: null, purchasable: true },
    { name: 'core never ENDED even with an ended drop id', type: 'CORE', q: 30, r: 0, drop: 'ENDED_EARLY', status: 'AVAILABLE', remaining: null, purchasable: true },
    { name: 'limited in future drop', type: 'LIMITED', q: 30, r: 0, drop: 'FUTURE', status: 'UPCOMING', remaining: null, purchasable: false },
    { name: 'limited in future drop, sold out stock still UPCOMING', type: 'LIMITED', q: 0, r: 0, drop: 'FUTURE', status: 'UPCOMING', remaining: null, purchasable: false },
    { name: 'limited live plenty', type: 'LIMITED', q: 30, r: 5, drop: 'STARTED_OPEN', status: 'AVAILABLE', remaining: null, purchasable: true },
    { name: 'limited live low', type: 'LIMITED', q: 30, r: 24, drop: 'STARTED_OPEN', status: 'LOW', remaining: 6, purchasable: true },
    { name: 'limited live sold out', type: 'LIMITED', q: 30, r: 30, drop: 'STARTED_OPEN', status: 'SOLD_OUT', remaining: null, purchasable: false },
    { name: 'limited, drop ended by date', type: 'LIMITED', q: 30, r: 0, drop: 'END_PASSED', status: 'ENDED', remaining: null, purchasable: false },
    { name: 'limited, drop ended early, sold out', type: 'LIMITED', q: 5, r: 5, drop: 'ENDED_EARLY', status: 'ENDED', remaining: null, purchasable: false },
    { name: 'limited without drop behaves like core', type: 'LIMITED', q: 5, r: 0, drop: null, status: 'LOW', remaining: 5, purchasable: true },
    { name: 'inactive keeps its stock status but is not purchasable', type: 'CORE', q: 30, r: 0, drop: null, active: false, status: 'AVAILABLE', remaining: null, purchasable: false },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const row = { active: c.active ?? true, type: c.type, quantity: c.q, reserved: c.r, drop: c.drop ? timings[c.drop] : null };
      expect(deriveStimpieStatus(row, T, NOW)).toBe(c.status);
      expect(stimpieAvailability(row, T, NOW)).toEqual({ status: c.status, remaining: c.remaining, purchasable: c.purchasable });
    });
  }
  it('threshold 0 never reports LOW', () => {
    expect(deriveStimpieStatus({ type: 'CORE', quantity: 1, reserved: 0, drop: null }, 0, NOW)).toBe('AVAILABLE');
  });
});

describe('variantAvailability', () => {
  it('hides exact numbers above the threshold and "0 left"', () => {
    expect(variantAvailability({ quantity: 50, reserved: 0 }, 10)).toEqual({ inStock: true, remaining: null });
    expect(variantAvailability({ quantity: 11, reserved: 0 }, 10)).toEqual({ inStock: true, remaining: null });
    expect(variantAvailability({ quantity: 10, reserved: 0 }, 10)).toEqual({ inStock: true, remaining: 10 });
    expect(variantAvailability({ quantity: 4, reserved: 3 }, 10)).toEqual({ inStock: true, remaining: 1 });
    expect(variantAvailability({ quantity: 4, reserved: 4 }, 10)).toEqual({ inStock: false, remaining: null });
    expect(variantAvailability({ quantity: 0, reserved: 0 }, 10)).toEqual({ inStock: false, remaining: null });
  });
});

describe('NOT_PURCHASABLE helpers', () => {
  const ended = { id: 7, name: 'THE FLAME', active: true, drop: timings.ENDED_EARLY };
  const upcoming = { id: 8, name: 'THE MOTH', active: true, drop: timings.FUTURE };
  const core = { id: 9, name: 'THE VOID', active: true, drop: null };

  it('builds a problem per blocked Stimpie and none for a purchasable one', () => {
    expect(stimpiePurchaseProblem(core, 0, NOW)).toBeNull();
    expect(stimpiePurchaseProblem(ended, 2, NOW)).toEqual({ kind: 'STIMPIE', stimpieId: 7, itemIndex: 2, name: 'THE FLAME', reason: 'DROP_ENDED' });
    expect(stimpiePurchaseProblem({ ...core, active: false }, 1, NOW)?.reason).toBe('INACTIVE');
  });

  it('assertStimpiesPurchasable reports all problems together as a 409 NOT_PURCHASABLE', () => {
    let err: unknown;
    try {
      assertStimpiesPurchasable(
        [
          { itemIndex: 0, stimpie: core },
          { itemIndex: 1, stimpie: upcoming },
          { itemIndex: 2, stimpie: ended },
        ],
        NOW,
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    const e = err as AppError;
    expect(e.code).toBe('NOT_PURCHASABLE');
    expect(e.httpStatus).toBe(409);
    expect(e.details).toEqual({
      items: [
        { kind: 'STIMPIE', stimpieId: 8, itemIndex: 1, name: 'THE MOTH', reason: 'DROP_NOT_STARTED' },
        { kind: 'STIMPIE', stimpieId: 7, itemIndex: 2, name: 'THE FLAME', reason: 'DROP_ENDED' },
      ],
    });
  });

  it('does not throw when everything is purchasable', () => {
    expect(() => assertStimpiesPurchasable([{ itemIndex: 0, stimpie: core }], NOW)).not.toThrow();
    expect(() => assertNoPurchaseProblems([])).not.toThrow();
  });
});

describe('accent colours', () => {
  it('are exactly the brand hex values', () => {
    expect(ACCENT_HEX).toEqual({ BUTTER: '#FFE45C', SKY: '#5CC8FF', LILAC: '#C9B6FF' });
  });
});
