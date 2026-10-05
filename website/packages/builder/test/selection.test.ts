import { describe, expect, it } from 'vitest';
import {
  buildCartItem,
  buildCartSummary,
  canPick,
  colorSoldOut,
  defaultPackId,
  evaluateAdd,
  initialSelection,
  joinColors,
  liveAnnouncement,
  parseShareParams,
  runningPriceCents,
  selectionReducer,
  type Selection,
} from '../src';
import { PACKS, data } from './fixtures';

const d = data();
const colors = joinColors(d.colors, d.config);
const ctx = { colors, stimpies: d.stimpies, packs: d.packs, view: '2d' as const, hasModel: false };

describe('default pack (builder.md 10.1)', () => {
  it('"Most popular" first, else the highest stimpieCount, else hoodie only', () => {
    expect(defaultPackId(PACKS)).toBe(2);
    expect(defaultPackId(PACKS.map((p) => ({ ...p, badge: null })))).toBe(2);
    expect(defaultPackId([PACKS[0]!])).toBe(1);
    expect(defaultPackId([])).toBeNull();
  });
});

describe('initial selection and share link', () => {
  it('defaults: first usable colour, first purchasable Stimpie in slot 1, popular pack, slot 2 focused', () => {
    const s = initialSelection(ctx);
    expect(s).toEqual({ colorId: 1, packId: 2, slots: [1, null], focus: 1, previewId: 1 });
  });
  it('applies a valid share link and ignores invalid values silently', () => {
    const s = initialSelection({ ...ctx, share: parseShareParams({ color: '2', stimpie: 'stimpie-2', pack: 'hoodie-1' }) });
    expect(s).toMatchObject({ colorId: 2, packId: 1, slots: [2], previewId: 2 });
    const bad = initialSelection({ ...ctx, share: parseShareParams({ color: '99', stimpie: 'nope', pack: 'nope' }) });
    expect(bad).toEqual(initialSelection(ctx));
  });
  it('a colour usable only in the other view is replaced by the first usable one', () => {
    const s = initialSelection({ ...ctx, share: parseShareParams({ color: '3' }) });
    expect(s.colorId).toBe(1); // colour 3 has no 2D assets
    expect(initialSelection({ ...ctx, view: '3d', hasModel: true, share: parseShareParams({ color: '3' }) }).colorId).toBe(3);
  });
  it('restores slot 2 and "hoodie only"', () => {
    const s = initialSelection({ ...ctx, share: parseShareParams({ stimpie: 'stimpie-1', stimpie2: 'stimpie-4', pack: 'hoodie-2' }) });
    expect(s.slots).toEqual([1, 4]);
    expect(initialSelection({ ...ctx, share: parseShareParams({ pack: 'hoodie-only' }) }).packId).toBeNull();
    // the same Stimpie in both slots is not allowed
    expect(initialSelection({ ...ctx, share: parseShareParams({ stimpie: 'stimpie-1', stimpie2: 'stimpie-1' }) }).slots).toEqual([1, null]);
  });
});

describe('slot flow (builder.md 10.2)', () => {
  const start = initialSelection(ctx); // slots [1, null], focus 1
  it('the second distinct tap while slot 2 is empty fills slot 2', () => {
    const s = selectionReducer(start, { type: 'pick', stimpieId: 2 });
    expect(s.slots).toEqual([1, 2]);
    expect(s.previewId).toBe(2);
  });
  it('once all slots are full a tap replaces the focused slot', () => {
    const full = selectionReducer(start, { type: 'pick', stimpieId: 2 });
    const replaced = selectionReducer(full, { type: 'pick', stimpieId: 4 });
    expect(replaced.slots).toEqual([1, 4]);
    const focused1 = selectionReducer(replaced, { type: 'focus', slot: 0 });
    expect(focused1.previewId).toBe(1);
    expect(selectionReducer(focused1, { type: 'pick', stimpieId: 3 }).slots).toEqual([3, 4]);
  });
  it('the same Stimpie can never sit in both slots (the card is disabled for the other slot)', () => {
    expect(canPick(start, 1)).toBe(false); // slot 1 holds it, focus is slot 2
    expect(selectionReducer(start, { type: 'pick', stimpieId: 1 })).toBe(start);
    expect(canPick(start, 2)).toBe(true);
  });
  it('changing pack size keeps the first slots, adds empty ones and drops the last', () => {
    const full = selectionReducer(start, { type: 'pick', stimpieId: 2 });
    const one = selectionReducer(full, { type: 'pack', packId: 1, packs: PACKS });
    expect(one.slots).toEqual([1]);
    const two = selectionReducer(one, { type: 'pack', packId: 2, packs: PACKS });
    expect(two.slots).toEqual([1, null]);
    expect(two.focus).toBe(1);
    const hoodie = selectionReducer(two, { type: 'pack', packId: null, packs: PACKS });
    expect(hoodie.slots).toEqual([]);
    const back = selectionReducer({ ...hoodie, previewId: 4 }, { type: 'pack', packId: 1, packs: PACKS });
    expect(back.slots).toEqual([4]); // the Stimpie on the hoodie becomes slot 1
  });
  it('hoodie only: a tap just previews', () => {
    const hoodie = selectionReducer(start, { type: 'pack', packId: null, packs: PACKS });
    expect(selectionReducer(hoodie, { type: 'pick', stimpieId: 3 }).previewId).toBe(3);
  });
});

describe('stock, price and the add-to-cart matrix (builder.md 10.5)', () => {
  const sel: Selection = { colorId: 1, packId: 2, slots: [1, 2], focus: 0, previewId: 1 };
  const args = { packs: d.packs, stimpies: d.stimpies, hoodie: d.hoodie };
  it('a colour with no in-stock size is sold out', () => {
    expect(colorSoldOut(d.hoodie, 2)).toBe(true);
    expect(colorSoldOut(d.hoodie, 1)).toBe(false);
    expect(colorSoldOut(null, 1)).toBe(false);
  });
  it('running price is the pack priceCents, hoodie only uses the hoodie priceCents', () => {
    expect(runningPriceCents(sel, d.packs, d.hoodie)).toBe(4500);
    expect(runningPriceCents({ ...sel, packId: 1, slots: [1] }, d.packs, d.hoodie)).toBe(3500);
    expect(runningPriceCents({ ...sel, packId: null, slots: [] }, d.packs, d.hoodie)).toBe(2500);
    expect(runningPriceCents({ ...sel, packId: null, slots: [] }, d.packs, null)).toBeNull();
  });
  it('ok when everything is filled and purchasable', () => {
    expect(evaluateAdd({ selection: sel, ...args })).toMatchObject({ ok: true, issue: null });
  });
  it('slots not all filled: disabled with "Pick N more Stimpie(s)"', () => {
    expect(evaluateAdd({ selection: { ...sel, slots: [1, null] }, ...args })).toMatchObject({ ok: false, issue: 'NEED_STIMPIES', hint: 'Pick 1 more Stimpie' });
    expect(evaluateAdd({ selection: { ...sel, slots: [null, null] }, ...args }).hint).toBe('Pick 2 more Stimpies');
  });
  it('a sold-out Stimpie is previewable but not addable', () => {
    expect(evaluateAdd({ selection: { ...sel, slots: [1, 3] }, ...args })).toMatchObject({ ok: false, issue: 'STIMPIE_UNAVAILABLE', hint: 'Choose an available Stimpie' });
  });
  it('a sold-out colour disables Add to cart with the colour message', () => {
    expect(evaluateAdd({ selection: { ...sel, colorId: 2 }, ...args })).toMatchObject({
      ok: false,
      issue: 'COLOR_SOLD_OUT',
      hint: 'This colour is sold out. Try another colour.',
    });
  });
  it('hoodie only needs no Stimpies, even with a sold-out one on the stage', () => {
    expect(evaluateAdd({ selection: { ...sel, packId: null, slots: [], previewId: 3 }, ...args }).ok).toBe(true);
  });
  it('no hoodie data: the purchase is not possible', () => {
    expect(evaluateAdd({ selection: sel, packs: d.packs, stimpies: d.stimpies, hoodie: null }).issue).toBe('NO_HOODIE');
  });
});

describe('cart item shape (checkout-and-order-flow 1.1)', () => {
  it('pack: { kind, packId, hoodieId, colorId, sizeId, stimpieIds, qty: 1 }', () => {
    const item = buildCartItem({ selection: { colorId: 1, packId: 2, slots: [1, 2], focus: 0, previewId: 1 }, packs: d.packs, hoodieId: 7, sizeId: 11 });
    expect(item).toEqual({ kind: 'pack', packId: 2, hoodieId: 7, colorId: 1, sizeId: 11, stimpieIds: [1, 2], qty: 1 });
  });
  it('hoodie: { kind, hoodieId, colorId, sizeId, qty: 1 } with no other keys', () => {
    const item = buildCartItem({ selection: { colorId: 1, packId: null, slots: [], focus: 0, previewId: 1 }, packs: d.packs, hoodieId: 7, sizeId: 11 });
    expect(item).toEqual({ kind: 'hoodie', hoodieId: 7, colorId: 1, sizeId: 11, qty: 1 });
    expect(Object.keys(item ?? {}).sort()).toEqual(['colorId', 'hoodieId', 'kind', 'qty', 'sizeId']);
  });
  it('refuses an incomplete or duplicated pack', () => {
    expect(buildCartItem({ selection: { colorId: 1, packId: 2, slots: [1, null], focus: 1, previewId: 1 }, packs: d.packs, hoodieId: 7, sizeId: 11 })).toBeNull();
    expect(buildCartItem({ selection: { colorId: 1, packId: 2, slots: [1, 1], focus: 1, previewId: 1 }, packs: d.packs, hoodieId: 7, sizeId: 11 })).toBeNull();
  });
  it('summary carries display data for the drawer', () => {
    const s = buildCartSummary({
      selection: { colorId: 1, packId: 2, slots: [1, 2], focus: 0, previewId: 1 },
      packs: d.packs,
      stimpies: d.stimpies,
      hoodie: d.hoodie!,
      color: colors[0]!,
      sizeLabel: 'M',
    });
    expect(s).toMatchObject({ title: 'Hoodie + 2 Stimpies', packSlug: 'hoodie-2', colorName: 'Black', sizeLabel: 'M', unitPriceCents: 4500, hoodieSlug: 'stimpy-hoodie' });
    expect(s.stimpies.map((x) => x.id)).toEqual([1, 2]);
  });
});

describe('live announcement', () => {
  it('"Black selected. Hoodie plus 2 Stimpies, $45."', () => {
    const text = liveAnnouncement({
      color: colors[0]!,
      selection: { colorId: 1, packId: 2, slots: [1, 2], focus: 0, previewId: 1 },
      packs: d.packs,
      hoodie: d.hoodie,
      stimpie: d.stimpies[0]!,
    });
    expect(text).toBe('Black selected. Stimpie 1 on the back. Hoodie plus 2 Stimpies, $45.');
  });
});
