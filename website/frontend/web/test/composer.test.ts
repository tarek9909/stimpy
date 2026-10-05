import { describe, expect, it } from 'vitest';
import {
  buildCartLine,
  composerReducer,
  initialState,
  parsePreset,
  requiredStimpies,
  stimpieMaxQty,
  stimpieSelectable,
  validateComposer,
  type ComposerState,
} from '@/features/shop/composer';
import type { CartLine } from '@/features/cart/types';
import { hoodie, packs, stimpie, ui } from './fixtures';

const stimpies = [
  stimpie({ id: 4 }),
  stimpie({ id: 7, slug: 'b', name: 'B' }),
  stimpie({ id: 9, slug: 'c', purchasable: false, status: 'SOLD_OUT' }),
];
const data = { hoodie: hoodie(), packs, stimpies };

describe('PackComposer rules', () => {
  it('starts on the first colour with stock and no size', () => {
    expect(initialState(data)).toEqual({ pack: 'hoodie', colorId: 1, sizeId: null, stimpieIds: [] });
  });

  it('emits a hoodie line for "hoodie only"', () => {
    const state: ComposerState = { pack: 'hoodie', colorId: 1, sizeId: 3, stimpieIds: [] };
    const line = buildCartLine(data, state)!;
    expect(line.item).toEqual({ kind: 'hoodie', hoodieId: 1, colorId: 1, sizeId: 3, qty: 1 });
    expect(line.ui.unitPriceCents).toBe(2500);
  });

  it('requires exactly N distinct purchasable Stimpies for a pack and emits the pack item', () => {
    let s: ComposerState = { pack: 2, colorId: 1, sizeId: 3, stimpieIds: [] };
    expect(validateComposer(data, s)).toMatchObject({ valid: false, issue: 'NEED_STIMPIES', progressLabel: 'Pick 2 Stimpies (0/2)' });
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 4, need: 2 });
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 4, need: 2 }); // toggles off, never duplicates
    expect(s.stimpieIds).toEqual([]);
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 4, need: 2 });
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 7, need: 2 });
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 9, need: 2 }); // full: ignored
    expect(s.stimpieIds).toEqual([4, 7]);
    expect(buildCartLine(data, s)!.item).toEqual({
      kind: 'pack',
      packId: 2,
      hoodieId: 1,
      colorId: 1,
      sizeId: 3,
      stimpieIds: [4, 7],
      qty: 1,
    });
  });

  it('a one-Stimpie pack swaps the pick; changing pack trims picks', () => {
    let s: ComposerState = { pack: 1, colorId: 1, sizeId: 3, stimpieIds: [4] };
    s = composerReducer(s, { type: 'toggleStimpie', stimpieId: 7, need: 1 });
    expect(s.stimpieIds).toEqual([7]);
    s = composerReducer({ ...s, pack: 2, stimpieIds: [4, 7] }, { type: 'pack', pack: 1, packs });
    expect(s.stimpieIds).toEqual([4]);
    expect(requiredStimpies(packs, 'hoodie')).toBe(0);
  });

  it('blocks out-of-stock size, and drops the size when the colour changes to one without it', () => {
    expect(validateComposer(data, { pack: 'hoodie', colorId: 1, sizeId: 4, stimpieIds: [] }).issue).toBe('SIZE_SOLD_OUT');
    const s = composerReducer({ pack: 'hoodie', colorId: 1, sizeId: 3, stimpieIds: [] }, { type: 'color', colorId: 2, hoodie: data.hoodie });
    expect(s.sizeId).toBeNull();
  });

  it('rejects an unpurchasable Stimpie and a LOW Stimpie beyond remaining', () => {
    expect(validateComposer(data, { pack: 1, colorId: 1, sizeId: 3, stimpieIds: [9] }).issue).toBe('STIMPIE_UNAVAILABLE');
    const low = stimpie({ id: 4, status: 'LOW', remaining: 1 });
    const inCart = [
      { item: { kind: 'stimpie', stimpieId: 4, qty: 1 }, lineId: 'a', ui: { ...ui(), addedAt: '' }, check: { state: 'OK', reasons: [], checkedAt: null } },
    ] as CartLine[];
    expect(stimpieSelectable(low, [])).toBe(true);
    expect(stimpieSelectable(low, inCart)).toBe(false);
    expect(stimpieMaxQty(low, inCart)).toBe(0);
    expect(stimpieMaxQty(stimpie({ remaining: 5 }), [])).toBe(5);
  });

  it('applies valid preselection params and ignores invalid ones', () => {
    const preset = parsePreset({ color: '2', size: '4', pack: 'two', stimpie: 'the-void,b' });
    expect(initialState(data, preset)).toEqual({ pack: 2, colorId: 2, sizeId: 4, stimpieIds: [4, 7] });
    expect(initialState(data, parsePreset({ color: 'x', size: '999', pack: 'nope', stimpie: 'zzz' }))).toEqual({
      pack: 'hoodie',
      colorId: 1,
      sizeId: null,
      stimpieIds: [],
    });
  });
});
