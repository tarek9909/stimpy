import type { BuilderHoodie, BuilderPack, BuilderStimpie, BuilderView, JoinedColor } from '../types';
import { colorsForView } from './join';
import type { ShareParams } from './share';

/** Preferred default pack badge (builder.md 10.1). */
export const POPULAR_BADGE = 'Most popular';
/** `?pack=hoodie-only` in a share link restores the "Hoodie only" choice. */
export const HOODIE_ONLY_SLUG = 'hoodie-only';

export interface Selection {
  colorId: number | null;
  /** Pack id, or null for "Hoodie only". */
  packId: number | null;
  /** One entry per Stimpie of the pack (empty for hoodie only); null = not chosen yet. */
  slots: (number | null)[];
  /** Slot the next carousel pick fills. */
  focus: number;
  /** The Stimpie shown on the hoodie. */
  previewId: number | null;
}

/** Default pack: the one badged "Most popular", else the highest `stimpieCount`, else hoodie only. */
export function defaultPackId(packs: readonly BuilderPack[]): number | null {
  if (packs.length === 0) return null;
  const popular = packs.find((p) => p.badge === POPULAR_BADGE);
  if (popular) return popular.id;
  return [...packs].sort((a, b) => b.stimpieCount - a.stimpieCount)[0]?.id ?? null;
}

export function packById(packs: readonly BuilderPack[], id: number | null): BuilderPack | null {
  return id === null ? null : (packs.find((p) => p.id === id) ?? null);
}

export function slotCount(packs: readonly BuilderPack[], packId: number | null): number {
  return packById(packs, packId)?.stimpieCount ?? 0;
}

function firstEmpty(slots: readonly (number | null)[], from = 0): number {
  for (let i = 0; i < slots.length; i++) {
    const idx = (from + i) % slots.length;
    if (slots[idx] === null) return idx;
  }
  return -1;
}

export interface InitialArgs {
  colors: readonly JoinedColor[];
  stimpies: readonly BuilderStimpie[];
  packs: readonly BuilderPack[];
  view: BuilderView;
  hasModel: boolean;
  share?: ShareParams | null;
}

/**
 * Initial selection: the share link when its values are valid, else defaults. Invalid or unavailable values are
 * ignored silently (builder.md section 11). Deterministic, so server and client render the same first view.
 */
export function initialSelection(a: InitialArgs): Selection {
  const share = a.share ?? null;
  const usable = colorsForView(a.colors, a.view, a.hasModel);
  const colorId = share?.colorId != null && usable.some((c) => c.id === share.colorId) ? share.colorId : (usable[0]?.id ?? null);

  const bySlug = (slug: string | null | undefined) => (slug ? a.stimpies.find((s) => s.slug === slug) : undefined);
  const shared = bySlug(share?.stimpie ?? null);
  const first = shared ?? a.stimpies.find((s) => s.purchasable) ?? a.stimpies[0];
  const previewId = first?.id ?? null;

  const sharedPack = share?.pack ? a.packs.find((p) => p.slug === share.pack) : undefined;
  const packId = sharedPack ? sharedPack.id : share?.pack === HOODIE_ONLY_SLUG && a.packs.length > 0 ? null : defaultPackId(a.packs);
  const n = slotCount(a.packs, packId);
  const slots: (number | null)[] = Array.from({ length: n }, () => null);
  if (n > 0) slots[0] = previewId;
  const second = bySlug(share?.stimpie2 ?? null);
  if (n > 1 && second && second.id !== slots[0]) slots[1] = second.id;
  const empty = firstEmpty(slots);
  return { colorId, packId, slots, focus: empty >= 0 ? empty : 0, previewId };
}

export type SelectionAction =
  | { type: 'color'; colorId: number }
  | { type: 'pack'; packId: number | null; packs: readonly BuilderPack[] }
  | { type: 'pick'; stimpieId: number }
  | { type: 'focus'; slot: number };

/** A card is disabled for the focused slot when another slot already holds it (no duplicates in a pack). */
export function canPick(sel: Selection, stimpieId: number): boolean {
  const at = sel.slots.indexOf(stimpieId);
  return at === -1 || at === sel.focus;
}

export function selectionReducer(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case 'color':
      return state.colorId === action.colorId ? state : { ...state, colorId: action.colorId };
    case 'focus': {
      if (action.slot < 0 || action.slot >= state.slots.length) return state;
      const id = state.slots[action.slot] ?? null;
      return { ...state, focus: action.slot, previewId: id ?? state.previewId };
    }
    case 'pack': {
      const n = slotCount(action.packs, action.packId);
      const slots: (number | null)[] = Array.from({ length: n }, (_, i) => state.slots[i] ?? null);
      if (n > 0 && slots[0] === null && state.previewId !== null && !slots.includes(state.previewId)) slots[0] = state.previewId;
      const empty = firstEmpty(slots);
      const focus = empty >= 0 ? empty : Math.min(state.focus, Math.max(0, n - 1));
      return { ...state, packId: action.packId, slots, focus };
    }
    case 'pick': {
      if (state.slots.length === 0) return { ...state, previewId: action.stimpieId };
      if (!canPick(state, action.stimpieId)) return state;
      if (state.slots[state.focus] === action.stimpieId) return { ...state, previewId: action.stimpieId };
      const wasEmpty = state.slots[state.focus] === null;
      const slots = [...state.slots];
      slots[state.focus] = action.stimpieId;
      let focus = state.focus;
      if (wasEmpty) {
        const next = firstEmpty(slots, state.focus + 1);
        if (next >= 0) focus = next;
      }
      return { ...state, slots, focus, previewId: action.stimpieId };
    }
  }
}

// ----- price, stock and add-to-cart -----

/** A colour is sold out when none of its sizes is in stock. Unknown hoodie data means "not known": false. */
export function colorSoldOut(hoodie: BuilderHoodie | null | undefined, colorId: number): boolean {
  if (!hoodie) return false;
  return !hoodie.variants.some((v) => v.colorId === colorId && v.inStock);
}

/** Running price (cents): the pack's `priceCents`, or the hoodie's own price for hoodie only. Null when unknown. */
export function runningPriceCents(sel: Selection, packs: readonly BuilderPack[], hoodie: BuilderHoodie | null | undefined): number | null {
  const pack = packById(packs, sel.packId);
  if (pack) return pack.priceCents;
  return hoodie?.priceCents ?? null;
}

export type AddIssue = 'NO_HOODIE' | 'COLOR_SOLD_OUT' | 'NEED_STIMPIES' | 'STIMPIE_UNAVAILABLE';

export interface AddState {
  ok: boolean;
  issue: AddIssue | null;
  /** Text under the button (builder.md 10.5). */
  hint: string | null;
  /** Slots still empty. */
  missing: number;
}

export function evaluateAdd(args: {
  selection: Selection;
  packs: readonly BuilderPack[];
  stimpies: readonly BuilderStimpie[];
  hoodie: BuilderHoodie | null | undefined;
}): AddState {
  const { selection, packs, stimpies, hoodie } = args;
  const missing = selection.slots.filter((s) => s === null).length;
  if (!hoodie || selection.colorId === null) return { ok: false, issue: 'NO_HOODIE', hint: null, missing };
  if (colorSoldOut(hoodie, selection.colorId) || !hoodie.inStock) {
    return { ok: false, issue: 'COLOR_SOLD_OUT', hint: 'This colour is sold out. Try another colour.', missing };
  }
  const pack = packById(packs, selection.packId);
  if (pack) {
    if (missing > 0) {
      return { ok: false, issue: 'NEED_STIMPIES', hint: `Pick ${missing} more Stimpie${missing === 1 ? '' : 's'}`, missing };
    }
    const chosen = selection.slots.flatMap((id) => stimpies.find((s) => s.id === id) ?? []);
    if (chosen.some((s) => !s.purchasable)) {
      return { ok: false, issue: 'STIMPIE_UNAVAILABLE', hint: 'Choose an available Stimpie', missing };
    }
  }
  return { ok: true, issue: null, hint: null, missing };
}

/** The exact cart item shape (checkout-and-order-flow 1.1). Null while the selection is incomplete. */
export function buildCartItem(args: {
  selection: Selection;
  packs: readonly BuilderPack[];
  hoodieId: number;
  sizeId: number;
}): import('../types').BuilderCartItem | null {
  const { selection, packs, hoodieId, sizeId } = args;
  if (selection.colorId === null) return null;
  const pack = packById(packs, selection.packId);
  if (!pack) return { kind: 'hoodie', hoodieId, colorId: selection.colorId, sizeId, qty: 1 };
  const ids = selection.slots.filter((s): s is number => s !== null);
  if (ids.length !== pack.stimpieCount || new Set(ids).size !== ids.length) return null;
  return { kind: 'pack', packId: pack.id, hoodieId, colorId: selection.colorId, sizeId, stimpieIds: ids, qty: 1 };
}
