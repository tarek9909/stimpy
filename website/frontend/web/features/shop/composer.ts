/**
 * Pure rules of the pack composer (checkout-and-order-flow 1.3, website-pages 4.3). No React, no fetching.
 * `PackComposer` (the UI) drives this reducer; tests exercise it directly.
 *
 * Emits the exact `CartItem` shapes the API expects:
 *   pack:   { kind: 'pack', packId, hoodieId, colorId, sizeId, stimpieIds, qty: 1 }
 *   hoodie: { kind: 'hoodie', hoodieId, colorId, sizeId, qty: 1 }
 * Prices here are display estimates from the catalog; the server prices the order.
 */
import type { HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import type { CartItem, CartLine, CartLineUi } from '@/features/cart/types';
import { stimpieUnitsInCart } from '@/features/cart/helpers';

export const HOODIE_ONLY = 'hoodie' as const;
export type PackChoice = typeof HOODIE_ONLY | number;

export interface ComposerState {
  /** `'hoodie'` (hoodie only) or a pack id. */
  pack: PackChoice;
  colorId: number | null;
  sizeId: number | null;
  stimpieIds: number[];
}

export interface ComposerPreset {
  /** `?color=<id>&size=<id>&pack=<slug>&stimpie=<slug>[,<slug>]` */
  colorId?: number | null;
  sizeId?: number | null;
  packSlug?: string | null;
  stimpieSlugs?: string[];
}

/** Parse the documented preselection params. Invalid values are ignored (defaults apply), never an error. */
export function parsePreset(params: Record<string, string | string[] | undefined>): ComposerPreset {
  const one = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const int = (v: string | undefined): number | null => {
    if (!v || !/^\d{1,9}$/.test(v)) return null;
    const n = Number(v);
    return n > 0 ? n : null;
  };
  const stimpie = one('stimpie');
  return {
    colorId: int(one('color')),
    sizeId: int(one('size')),
    packSlug: one('pack') ?? null,
    stimpieSlugs: stimpie ? stimpie.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5) : [],
  };
}

export interface ComposerData {
  hoodie: HoodieDetail;
  packs: readonly Pack[];
  stimpies: readonly Stimpie[];
}

export function packById(packs: readonly Pack[], choice: PackChoice): Pack | null {
  return choice === HOODIE_ONLY ? null : (packs.find((p) => p.id === choice) ?? null);
}

/** Number of Stimpies the choice needs (0 for hoodie only). */
export function requiredStimpies(packs: readonly Pack[], choice: PackChoice): number {
  return packById(packs, choice)?.stimpieCount ?? 0;
}

export function variantFor(hoodie: HoodieDetail, colorId: number | null, sizeId: number | null) {
  if (colorId === null || sizeId === null) return null;
  return hoodie.variants.find((v) => v.colorId === colorId && v.sizeId === sizeId) ?? null;
}

/** A colour with no in-stock size is shown crossed out (but stays selectable for photos). */
export function colorSoldOutIds(hoodie: HoodieDetail): number[] {
  return hoodie.colors
    .filter((c) => !hoodie.variants.some((v) => v.colorId === c.id && v.inStock))
    .map((c) => c.id);
}

export function stimpieSelectable(s: Stimpie, cartLines: readonly CartLine[]): boolean {
  if (!s.purchasable) return false;
  // A LOW Stimpie: pack picks plus extras across the whole cart must not exceed `remaining`.
  if (s.remaining !== null && stimpieUnitsInCart(cartLines, s.id) + 1 > s.remaining) return false;
  return true;
}

/** Initial state, applying the preset when it is valid for this hoodie, pack list and Stimpie list. */
export function initialState(data: ComposerData, preset: ComposerPreset = {}, cartLines: readonly CartLine[] = []): ComposerState {
  const { hoodie, packs, stimpies } = data;
  const colorId =
    preset.colorId && hoodie.colors.some((c) => c.id === preset.colorId)
      ? preset.colorId
      : (hoodie.colors.find((c) => hoodie.variants.some((v) => v.colorId === c.id && v.inStock))?.id ?? hoodie.colors[0]?.id ?? null);
  const sizeId =
    preset.sizeId && hoodie.sizes.some((s) => s.id === preset.sizeId) && variantFor(hoodie, colorId, preset.sizeId)?.inStock
      ? preset.sizeId
      : null;
  const presetPack = preset.packSlug ? packs.find((p) => p.slug === preset.packSlug) : undefined;
  const wantedStimpies = (preset.stimpieSlugs ?? [])
    .map((slug) => stimpies.find((s) => s.slug === slug))
    .filter((s): s is Stimpie => !!s && stimpieSelectable(s, cartLines));
  // A preselected Stimpie with no explicit pack implies the entry pack that fits; fall back to the first pack.
  let pack: PackChoice = HOODIE_ONLY;
  if (presetPack) pack = presetPack.id;
  else if (wantedStimpies.length > 0) {
    const fit = [...packs].sort((a, b) => a.stimpieCount - b.stimpieCount).find((p) => p.stimpieCount >= wantedStimpies.length);
    if (fit) pack = fit.id;
  }
  const need = requiredStimpies(packs, pack);
  const stimpieIds = Array.from(new Set(wantedStimpies.map((s) => s.id))).slice(0, need);
  return { pack, colorId, sizeId, stimpieIds };
}

export type ComposerAction =
  | { type: 'pack'; pack: PackChoice; packs: readonly Pack[] }
  | { type: 'color'; colorId: number; hoodie: HoodieDetail }
  | { type: 'size'; sizeId: number }
  | { type: 'toggleStimpie'; stimpieId: number; need: number }
  | { type: 'dropStimpies'; ids: number[] }
  | { type: 'reset'; state: ComposerState };

export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case 'pack': {
      const need = requiredStimpies(action.packs, action.pack);
      return { ...state, pack: action.pack, stimpieIds: state.stimpieIds.slice(0, need) };
    }
    case 'color': {
      // Keep the size only when it is still in stock for the new colour.
      const keep = state.sizeId !== null && variantFor(action.hoodie, action.colorId, state.sizeId)?.inStock;
      return { ...state, colorId: action.colorId, sizeId: keep ? state.sizeId : null };
    }
    case 'size':
      return { ...state, sizeId: action.sizeId };
    case 'toggleStimpie': {
      if (action.need <= 0) return state;
      if (state.stimpieIds.includes(action.stimpieId)) {
        return { ...state, stimpieIds: state.stimpieIds.filter((id) => id !== action.stimpieId) };
      }
      // One-Stimpie pack: choosing another design replaces the pick. Larger packs: full means full.
      if (action.need === 1) return { ...state, stimpieIds: [action.stimpieId] };
      if (state.stimpieIds.length >= action.need) return state;
      return { ...state, stimpieIds: [...state.stimpieIds, action.stimpieId] };
    }
    case 'dropStimpies':
      return { ...state, stimpieIds: state.stimpieIds.filter((id) => !action.ids.includes(id)) };
    case 'reset':
      return action.state;
  }
}

export type ComposerIssue =
  | 'NO_COLOR'
  | 'NO_SIZE'
  | 'SIZE_SOLD_OUT'
  | 'HOODIE_SOLD_OUT'
  | 'NEED_STIMPIES'
  | 'STIMPIE_UNAVAILABLE';

export interface ComposerValidation {
  valid: boolean;
  issue: ComposerIssue | null;
  /** "Pick 2 Stimpies (1/2)" while a pack is incomplete. */
  progressLabel: string | null;
}

export function validateComposer(data: ComposerData, state: ComposerState): ComposerValidation {
  const { hoodie, packs, stimpies } = data;
  const need = requiredStimpies(packs, state.pack);
  const progressLabel = need > 0 ? `Pick ${need} Stimpie${need === 1 ? '' : 's'} (${state.stimpieIds.length}/${need})` : null;
  const fail = (issue: ComposerIssue): ComposerValidation => ({ valid: false, issue, progressLabel });
  if (!hoodie.inStock) return fail('HOODIE_SOLD_OUT');
  if (state.colorId === null) return fail('NO_COLOR');
  if (state.sizeId === null) return fail('NO_SIZE');
  if (!variantFor(hoodie, state.colorId, state.sizeId)?.inStock) return fail('SIZE_SOLD_OUT');
  if (need > 0) {
    if (state.stimpieIds.length !== need) return fail('NEED_STIMPIES');
    const ok = state.stimpieIds.every((id) => stimpies.find((s) => s.id === id)?.purchasable);
    if (!ok) return fail('STIMPIE_UNAVAILABLE');
  }
  return { valid: true, issue: null, progressLabel };
}

export const ISSUE_TEXT: Record<ComposerIssue, string> = {
  NO_COLOR: 'Choose a colour.',
  NO_SIZE: 'Choose a size.',
  SIZE_SOLD_OUT: 'That size is sold out in this colour.',
  HOODIE_SOLD_OUT: 'Sold out',
  NEED_STIMPIES: 'Pick your Stimpies to continue.',
  STIMPIE_UNAVAILABLE: 'One of your Stimpies is no longer available.',
};

/** The display total for the current selection (cents): pack price or the hoodie's own price. */
export function selectionTotalCents(data: ComposerData, state: ComposerState): number {
  return packById(data.packs, state.pack)?.priceCents ?? data.hoodie.priceCents;
}

/** Build the cart item and its UI snapshot. Returns null while the selection is not valid. */
export function buildCartLine(
  data: ComposerData,
  state: ComposerState,
  now: Date = new Date(),
): { item: CartItem; ui: CartLineUi } | null {
  if (!validateComposer(data, state).valid || state.colorId === null || state.sizeId === null) return null;
  const { hoodie, packs, stimpies } = data;
  const color = hoodie.colors.find((c) => c.id === state.colorId);
  const size = hoodie.sizes.find((s) => s.id === state.sizeId);
  if (!color || !size) return null;
  const pack = packById(packs, state.pack);
  const chosen = state.stimpieIds.flatMap((id) => {
    const s = stimpies.find((x) => x.id === id);
    return s ? [s] : [];
  });
  const image = color.images[0] ?? hoodie.images[0] ?? null;
  const ui: CartLineUi = {
    title: pack ? pack.name : hoodie.name,
    imageUrl: image,
    hoodieSlug: hoodie.slug,
    packSlug: pack?.slug ?? null,
    colorName: color.name,
    colorHex: color.hex,
    sizeLabel: size.label,
    stimpies: chosen.map((s) => ({ id: s.id, slug: s.slug, name: s.name, artworkUrl: s.artworkUrl, type: s.type })),
    unitPriceCents: pack ? pack.priceCents : hoodie.priceCents,
    addedAt: now.toISOString(),
  };
  if (pack) {
    return {
      item: {
        kind: 'pack',
        packId: pack.id,
        hoodieId: hoodie.id,
        colorId: state.colorId,
        sizeId: state.sizeId,
        stimpieIds: [...state.stimpieIds],
        qty: 1,
      },
      ui,
    };
  }
  return { item: { kind: 'hoodie', hoodieId: hoodie.id, colorId: state.colorId, sizeId: state.sizeId, qty: 1 }, ui };
}

/** Cart item and UI snapshot for an extra Stimpie ("Add to cart" on cards and the detail page). */
export function buildStimpieLine(stimpie: Stimpie, qty = 1, now: Date = new Date()): { item: CartItem; ui: CartLineUi } {
  return {
    item: { kind: 'stimpie', stimpieId: stimpie.id, qty },
    ui: {
      title: `Stimpie: ${stimpie.name}`,
      imageUrl: stimpie.images[0] ?? stimpie.artworkUrl,
      hoodieSlug: null,
      packSlug: null,
      colorName: null,
      colorHex: null,
      sizeLabel: null,
      stimpies: [{ id: stimpie.id, slug: stimpie.slug, name: stimpie.name, artworkUrl: stimpie.artworkUrl, type: stimpie.type }],
      unitPriceCents: stimpie.priceCents,
      addedAt: now.toISOString(),
    },
  };
}

/** Max units the quantity stepper may offer for a Stimpie: `min(10, remaining - what the cart already holds)`. */
export function stimpieMaxQty(stimpie: Stimpie, cartLines: readonly CartLine[]): number {
  if (stimpie.remaining === null) return 10;
  return Math.max(0, Math.min(10, stimpie.remaining - stimpieUnitsInCart(cartLines, stimpie.id)));
}
