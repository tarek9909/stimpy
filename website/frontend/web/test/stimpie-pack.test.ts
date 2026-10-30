import { describe, expect, it } from 'vitest';
import type { CartLine } from '@/features/cart/types';
import {
  availablePerOffer,
  buildStimpiePackItem,
  eligibleForOffer,
  fitOfferQuantities,
  parseStimpieQuantitySlugs,
  selectedStimpieCount,
  serializeStimpieQuantities,
  type StimpieOffer,
} from '@/features/shop/stimpie-pack';
import { ui } from './fixtures';

const offer = (count: number, eligibleStimpieIds: readonly number[] | null = null): StimpieOffer => ({
  id: count,
  slug: `stimpies-${count}`,
  name: `${count} Stimpies`,
  type: 'STIMPIE_ONLY',
  stimpieCount: count,
  eligibleStimpieIds,
  priceCents: count * 1000,
});

function line(item: CartLine['item'], lineId = 'cart-line'): CartLine {
  return {
    lineId,
    item,
    ui: { ...ui({ hoodieSlug: null, packSlug: 'stimpies-7', colorName: null, colorHex: null, sizeLabel: null }), addedAt: '2026-10-30T00:00:00.000Z' },
    check: { state: 'OK', reasons: [], checkedAt: null },
  };
}

describe('Stimpie-only offer rules', () => {
  it('keeps counts 1–5 and configured 7/10 compact, including repeated designs', () => {
    for (const count of [1, 2, 3, 4, 5, 7, 10]) {
      const item = buildStimpiePackItem(offer(count), { 41: count });
      expect(item).toEqual({ kind: 'stimpie_pack', packId: count, stimpies: [{ stimpieId: 41, qty: count }], qty: 1 });
      expect(item && 'hoodieId' in item).toBe(false);
    }
  });

  it('requires the exact total and rejects designs outside an offer eligibility list', () => {
    const limited = offer(2, [4, 7]);
    expect(eligibleForOffer(limited, 4)).toBe(true);
    expect(eligibleForOffer(limited, 9)).toBe(false);
    expect(buildStimpiePackItem(limited, { 4: 1, 9: 1 })).toBeNull();
    expect(buildStimpiePackItem(limited, { 4: 1 })).toBeNull();
    expect(buildStimpiePackItem(limited, { 4: 2 })).toMatchObject({ stimpies: [{ stimpieId: 4, qty: 2 }] });
  });

  it('fits an existing selection when changing offer size without expanding repeated designs', () => {
    const selected = { 4: 5, 7: 2 };
    const available = new Map([[4, 10], [7, 10]]);
    expect(fitOfferQuantities(offer(5), selected, available)).toEqual({ 4: 5 });
    expect(fitOfferQuantities(offer(10), selected, available)).toEqual(selected);
    expect(selectedStimpieCount(fitOfferQuantities(offer(10), selected, available))).toBe(7);
  });

  it('limits repeated designs by stock already held in other bundles and edit bundle quantity', () => {
    const other = line({ kind: 'stimpie_pack', packId: 7, stimpies: [{ stimpieId: 4, qty: 3 }], qty: 2 });
    expect(availablePerOffer({ id: 4, purchasable: true, remaining: 20 }, [other], 4)).toBe(3);
    expect(availablePerOffer({ id: 4, purchasable: true, remaining: 4 }, [other], 1)).toBe(0);
    expect(availablePerOffer({ id: 4, purchasable: false, remaining: null }, [], 1)).toBe(0);
  });

  it('shares and restores compact slug counts without expanding unit arrays', () => {
    const catalog = [{ id: 4, slug: 'the-void' }, { id: 7, slug: 'night-signal' }];
    const compact = serializeStimpieQuantities({ 4: 6, 7: 4 }, catalog);
    expect(compact).toBe('the-void:6,night-signal:4');
    expect(parseStimpieQuantitySlugs(compact.split(','), catalog)).toEqual({ 4: 6, 7: 4 });
    expect(parseStimpieQuantitySlugs(['the-void:1000000'], catalog)).toEqual({ 4: 1_000_000 });
  });
});
