import type { BuilderHoodie, BuilderPack, BuilderStimpie, BuilderView, JoinedColor } from '../types';
import { colorsForView } from './join';
import type { ShareParams } from './share';

/** Preferred default pack badge (builder.md 10.1). */
export const POPULAR_BADGE = 'Most popular';
/** `?pack=hoodie-only` in a share link restores the "Hoodie only" choice. */
export const HOODIE_ONLY_SLUG = 'hoodie-only';
export type PurchaseMode = 'HOODIE_ONLY' | 'HOODIE_SET' | 'STIMPIE_ONLY';

export interface Selection {
  colorId: number | null;
  /** Explicit intent remains selected even if that category currently has no active offer. */
  purchaseMode: PurchaseMode;
  /** Offer id, or null for hoodie only / a category with no active offer. */
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
  const hoodiePacks = packs.filter((p) => p.type !== 'STIMPIE_ONLY');
  if (hoodiePacks.length === 0) return null;
  const popular = hoodiePacks.find((p) => p.badge === POPULAR_BADGE);
  if (popular) return popular.id;
  return [...hoodiePacks].sort((a, b) => b.stimpieCount - a.stimpieCount)[0]?.id ?? null;
}

export function defaultStimpiePackId(packs: readonly BuilderPack[]): number | null {
  return [...packs].filter((p) => p.type === 'STIMPIE_ONLY').sort((a, b) => a.stimpieCount - b.stimpieCount)[0]?.id ?? null;
}

export function packAllowsStimpie(pack: BuilderPack | null, stimpieId: number): boolean {
  return !pack || pack.eligibleStimpieIds == null || pack.eligibleStimpieIds.includes(stimpieId);
}

export function packById(packs: readonly BuilderPack[], id: number | null): BuilderPack | null {
  return id === null ? null : (packs.find((p) => p.id === id) ?? null);
}

export function slotCount(packs: readonly BuilderPack[], packId: number | null): number {
  const pack = packById(packs, packId);
  // The quantity-aware Stimpies-only composer tracks unique designs and counts; it must not create a million UI slots.
  return pack?.type === 'STIMPIE_ONLY' ? 0 : pack?.stimpieCount ?? 0;
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
  const sharedPack = share?.pack ? a.packs.find((p) => p.slug === share.pack) : undefined;
  const sharedMode = share?.mode ?? null;
  const stimpieEntry = !!shared && !sharedMode && !sharedPack && share?.pack !== HOODIE_ONLY_SLUG;
  const mode: PurchaseMode = sharedPack
    ? sharedPack.type === 'STIMPIE_ONLY' ? 'STIMPIE_ONLY' : 'HOODIE_SET'
    : sharedMode === 'stimpie-only' || stimpieEntry
      ? 'STIMPIE_ONLY'
      : sharedMode === 'hoodie-only' || share?.pack === HOODIE_ONLY_SLUG
        ? 'HOODIE_ONLY'
        : sharedMode === 'hoodie-set'
          ? 'HOODIE_SET'
          : defaultPackId(a.packs) !== null ? 'HOODIE_SET' : 'HOODIE_ONLY';
  const packId = sharedPack?.id ?? (mode === 'STIMPIE_ONLY' ? defaultStimpiePackId(a.packs) : mode === 'HOODIE_SET' ? defaultPackId(a.packs) : null);
  const selectedOffer = packById(a.packs, packId);
  const first = shared && packAllowsStimpie(selectedOffer, shared.id)
    ? shared
    : a.stimpies.find((s) => s.purchasable && packAllowsStimpie(selectedOffer, s.id)) ?? a.stimpies.find((s) => packAllowsStimpie(selectedOffer, s.id)) ?? a.stimpies[0];
  const previewId = first?.id ?? null;
  const n = slotCount(a.packs, packId);
  const slots: (number | null)[] = Array.from({ length: n }, () => null);
  const selectedPack = packById(a.packs, packId);
  const sharedStimpies = share?.stimpies?.length
    ? share.stimpies.map((slug) => bySlug(slug)).filter((s): s is BuilderStimpie => !!s)
    : [bySlug(share?.stimpie ?? null), bySlug(share?.stimpie2 ?? null)].filter((s): s is BuilderStimpie => !!s);
  const picks = sharedStimpies.length > 0 ? sharedStimpies : previewId === null ? [] : [bySlug(a.stimpies.find((s) => s.id === previewId)?.slug ?? null)].filter((s): s is BuilderStimpie => !!s);
  let slot = 0;
  for (const picked of picks) {
    if (slot >= n) break;
    if (!packAllowsStimpie(selectedPack, picked.id)) continue;
    if (selectedPack?.type !== 'STIMPIE_ONLY' && slots.includes(picked.id)) continue;
    slots[slot++] = picked.id;
  }
  const empty = firstEmpty(slots);
  return { colorId, purchaseMode: mode, packId, slots, focus: empty >= 0 ? empty : 0, previewId };
}

export type SelectionAction =
  | { type: 'color'; colorId: number }
  | { type: 'pack'; packId: number | null; packs: readonly BuilderPack[] }
  | { type: 'mode'; mode: PurchaseMode; packs: readonly BuilderPack[] }
  | { type: 'pick'; stimpieId: number; allowDuplicates?: boolean }
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
      const pack = packById(action.packs, action.packId);
      return { ...state, purchaseMode: pack?.type === 'STIMPIE_ONLY' ? 'STIMPIE_ONLY' : pack ? 'HOODIE_SET' : 'HOODIE_ONLY', packId: action.packId, slots, focus };
    }
    case 'mode': {
      const packId = action.mode === 'HOODIE_ONLY' ? null : action.mode === 'STIMPIE_ONLY' ? defaultStimpiePackId(action.packs) : defaultPackId(action.packs);
      const n = slotCount(action.packs, packId);
      const slots: (number | null)[] = Array.from({ length: n }, (_, i) => state.slots[i] ?? null);
      if (n > 0 && slots[0] === null && state.previewId !== null && !slots.includes(state.previewId)) slots[0] = state.previewId;
      const empty = firstEmpty(slots);
      return { ...state, purchaseMode: action.mode, packId, slots, focus: empty >= 0 ? empty : Math.min(state.focus, Math.max(0, n - 1)) };
    }
    case 'pick': {
      if (state.slots.length === 0) return { ...state, previewId: action.stimpieId };
      if (!action.allowDuplicates && !canPick(state, action.stimpieId)) return state;
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
  if (sel.purchaseMode === 'STIMPIE_ONLY') return null;
  return hoodie?.priceCents ?? null;
}

export type AddIssue = 'NO_HOODIE' | 'NO_OFFER' | 'COLOR_SOLD_OUT' | 'NEED_STIMPIES' | 'STIMPIE_UNAVAILABLE';

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
  const pack = packById(packs, selection.packId);
  const stimpieOnly = selection.purchaseMode === 'STIMPIE_ONLY';
  if (stimpieOnly && !pack) return { ok: false, issue: 'NO_OFFER', hint: 'Stimpies-only offers are not available right now.', missing };
  if (!stimpieOnly && (!hoodie || selection.colorId === null)) return { ok: false, issue: 'NO_HOODIE', hint: null, missing };
  if (!stimpieOnly && hoodie && selection.colorId !== null && (colorSoldOut(hoodie, selection.colorId) || !hoodie.inStock)) {
    return { ok: false, issue: 'COLOR_SOLD_OUT', hint: 'This colour is sold out. Try another colour.', missing };
  }
  if (pack) {
    if (missing > 0) {
      return { ok: false, issue: 'NEED_STIMPIES', hint: `Pick ${missing} more Stimpie${missing === 1 ? '' : 's'}`, missing };
    }
    const chosen = selection.slots.flatMap((id) => stimpies.find((s) => s.id === id) ?? []);
    if (chosen.some((s) => !s.purchasable || !packAllowsStimpie(pack, s.id))) {
      return { ok: false, issue: 'STIMPIE_UNAVAILABLE', hint: 'Choose an available Stimpie', missing };
    }
  }
  return { ok: true, issue: null, hint: null, missing };
}

/** The exact cart item shape (checkout-and-order-flow 1.1). Null while the selection is incomplete. */
export function buildCartItem(args: {
  selection: Selection;
  packs: readonly BuilderPack[];
  hoodieId?: number;
  colorId?: number | null;
  sizeId?: number | null;
}): import('../types').BuilderCartItem | null {
  const { selection, packs, hoodieId, colorId = selection.colorId, sizeId } = args;
  const pack = packById(packs, selection.packId);
  if (pack?.type === 'STIMPIE_ONLY') {
    const ids = selection.slots.filter((s): s is number => s !== null);
    if (ids.length !== pack.stimpieCount || ids.some((id) => !packAllowsStimpie(pack, id))) return null;
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { kind: 'stimpie_pack', packId: pack.id, stimpies: [...counts].map(([stimpieId, qty]) => ({ stimpieId, qty })), qty: 1 };
  }
  if (!pack) {
    if (hoodieId === undefined || colorId === null || sizeId === undefined || sizeId === null) return null;
    return { kind: 'hoodie', hoodieId, colorId, sizeId, qty: 1 };
  }
  if (hoodieId === undefined || colorId === null || sizeId === undefined || sizeId === null) return null;
  const ids = selection.slots.filter((s): s is number => s !== null);
  if (ids.length !== pack.stimpieCount || new Set(ids).size !== ids.length || ids.some((id) => !packAllowsStimpie(pack, id))) return null;
  return { kind: 'pack', packId: pack.id, hoodieId, colorId, sizeId, stimpieIds: ids, qty: 1 };
}
