/**
 * Cart store (Zustand). Client-only: server components never read it. Rules from checkout-and-order-flow 1.1:
 * qty 1..10, at most 20 lines, identical lines merge, no duplicate Stimpies inside a pack, localStorage
 * persistence (debounced 100 ms) with corrupt-data tolerance, multi-tab sync through the `storage` event.
 *
 * Usage: `const lines = useCart((s) => s.lines)`, `cartStore.getState().add(item, ui)`.
 * Call `cartStore.getState().hydrate()` once on the client (the layout's <CartHydrator /> does it); until then the
 * store is empty so server HTML and the first client render agree.
 */
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { forgetMemoryStored, storageAvailable } from '@/lib/storage';
import { uuid } from '@/lib/uuid';
import { clampQty, dedupeIds, itemKey } from './helpers';
import { CART_STORAGE_KEY, loadCart, saveCart } from './persistence';
import { CART_MAX_LINES, type CartItem, type CartLine, type CartLineCheck, type CartLineUi, type CartValidationSummary } from './types';

export type AddResult =
  | { ok: true; lineId: string; merged: boolean; qty: number }
  | { ok: false; reason: 'FULL' | 'INVALID' };

export type CartNotice = 'OLD_CART_CLEARED' | 'NOT_PERSISTENT';

export interface CartState {
  lines: CartLine[];
  hydrated: boolean;
  /** False when localStorage is unavailable: the cart lives in memory only (one-time notice in the UI). */
  persistent: boolean;
  drawerOpen: boolean;
  /** Text for the polite live region ("Added Hoodie + 2 Stimpies. Cart has 1 item."). */
  announcement: string;
  /** Latest server totals from POST /cart/validate; null until the first successful check. */
  validation: CartValidationSummary | null;
  /** One-time notices to show as toasts; cleared with `dismissNotice`. */
  notices: CartNotice[];

  hydrate: () => void;
  add: (item: CartItem, ui: Omit<CartLineUi, 'addedAt'> & { addedAt?: string }, options?: { openDrawer?: boolean }) => AddResult;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  /** "Edit": replace a line in place (merging with an identical other line when one exists). */
  replaceLine: (lineId: string, item: CartItem, ui: Omit<CartLineUi, 'addedAt'> & { addedAt?: string }) => AddResult;
  /** Used by cart validation: replace lines and/or the latest summary. */
  applyChecks: (lines: CartLine[], validation: CartValidationSummary | null) => void;
  setLineCheck: (lineId: string, check: CartLineCheck) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  dismissNotice: (notice: CartNotice) => void;
}

export type CartStore = StoreApi<CartState>;

const OK_CHECK: CartLineCheck = { state: 'OK', reasons: [], checkedAt: null };

function normalizeItem(item: CartItem): CartItem | null {
  const qty = clampQty(item.qty);
  if (item.kind === 'pack') {
    const stimpieIds = dedupeIds(item.stimpieIds);
    if (stimpieIds.length !== item.stimpieIds.length || stimpieIds.length === 0) return null;
    return { ...item, stimpieIds, qty };
  }
  return { ...item, qty };
}

function describeCount(n: number): string {
  return n === 1 ? '1 item' : `${n} items`;
}

export interface CartStoreOptions {
  now?: () => Date;
  debounceMs?: number;
}

/** Factory (tests create isolated stores). The app uses the `cartStore` singleton below. */
export function createCartStore(options: CartStoreOptions = {}): CartStore {
  const now = options.now ?? (() => new Date());
  const debounceMs = options.debounceMs ?? 100;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppressSave = false;
  let wired = false;

  const store = createStore<CartState>()((set, get) => {
    function totalItems(lines: CartLine[]): number {
      return lines.reduce((n, l) => n + l.item.qty, 0);
    }

    function build(item: CartItem, ui: Omit<CartLineUi, 'addedAt'> & { addedAt?: string }): CartLine {
      return {
        lineId: uuid(),
        item,
        ui: { ...ui, addedAt: ui.addedAt ?? now().toISOString() },
        check: { ...OK_CHECK },
      };
    }

    return {
      lines: [],
      hydrated: false,
      persistent: true,
      drawerOpen: false,
      announcement: '',
      validation: null,
      notices: [],

      hydrate: () => {
        if (get().hydrated) return;
        const loaded = loadCart(now());
        const persistent = storageAvailable('local');
        const notices: CartNotice[] = [];
        if (loaded.purgedOld) notices.push('OLD_CART_CLEARED');
        suppressSave = true;
        set({ lines: loaded.lines, hydrated: true, persistent, notices });
        suppressSave = false;
        wire();
      },

      add: (rawItem, ui, opts) => {
        const item = normalizeItem(rawItem);
        if (!item) return { ok: false, reason: 'INVALID' };
        const { lines } = get();
        const key = itemKey(item);
        const existing = lines.find((l) => itemKey(l.item) === key);
        let nextLines: CartLine[];
        let result: AddResult;
        if (existing) {
          const qty = clampQty(existing.item.qty + item.qty);
          nextLines = lines.map((l) =>
            l.lineId === existing.lineId
              ? { ...l, item: { ...l.item, qty } as CartItem, ui: { ...l.ui, unitPriceCents: ui.unitPriceCents } }
              : l,
          );
          result = { ok: true, lineId: existing.lineId, merged: true, qty };
        } else {
          if (lines.length >= CART_MAX_LINES) return { ok: false, reason: 'FULL' };
          const line = build(item, ui);
          nextLines = [...lines, line];
          result = { ok: true, lineId: line.lineId, merged: false, qty: item.qty };
        }
        set({
          lines: nextLines,
          validation: null,
          drawerOpen: opts?.openDrawer ?? get().drawerOpen,
          announcement: `Added ${ui.title}. Cart has ${describeCount(totalItems(nextLines))}.`,
        });
        return result;
      },

      setQty: (lineId, qty) => {
        const q = clampQty(qty);
        set({
          lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, item: { ...l.item, qty: q } as CartItem } : l)),
          validation: null,
        });
      },

      remove: (lineId) => {
        const next = get().lines.filter((l) => l.lineId !== lineId);
        set({ lines: next, validation: null, announcement: `Removed from cart. Cart has ${describeCount(totalItems(next))}.` });
      },

      clear: () => set({ lines: [], validation: null, announcement: '' }),

      replaceLine: (lineId, rawItem, ui) => {
        const item = normalizeItem(rawItem);
        if (!item) return { ok: false, reason: 'INVALID' };
        const { lines } = get();
        const index = lines.findIndex((l) => l.lineId === lineId);
        if (index === -1) return get().add(item, ui);
        const key = itemKey(item);
        const other = lines.find((l, i) => i !== index && itemKey(l.item) === key);
        let nextLines: CartLine[];
        let result: AddResult;
        if (other) {
          const qty = clampQty(other.item.qty + item.qty);
          nextLines = lines
            .filter((l) => l.lineId !== lineId)
            .map((l) => (l.lineId === other.lineId ? { ...l, item: { ...l.item, qty } as CartItem } : l));
          result = { ok: true, lineId: other.lineId, merged: true, qty };
        } else {
          const rebuilt: CartLine = { ...build(item, ui), lineId };
          nextLines = lines.map((l) => (l.lineId === lineId ? rebuilt : l));
          result = { ok: true, lineId, merged: false, qty: item.qty };
        }
        set({ lines: nextLines, validation: null });
        return result;
      },

      applyChecks: (lines, validation) => set({ lines, validation }),

      setLineCheck: (lineId, check) =>
        set({ lines: get().lines.map((l) => (l.lineId === lineId ? { ...l, check } : l)) }),

      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
      dismissNotice: (notice) => set({ notices: get().notices.filter((n) => n !== notice) }),
    };
  });

  function flush(): void {
    timer = null;
    const persistent = saveCart(store.getState().lines, now());
    const { notices, lines } = store.getState();
    // Tell the visitor once (and only when there is something to lose) that the cart lives in memory.
    const addNotice = !persistent && lines.length > 0 && !notices.includes('NOT_PERSISTENT');
    if (persistent !== store.getState().persistent || addNotice) {
      store.setState({ persistent, notices: addNotice ? [...notices, 'NOT_PERSISTENT'] : notices });
    }
  }

  function wire(): void {
    if (wired) return;
    wired = true;
    store.subscribe((state, prev) => {
      if (suppressSave || !state.hydrated) return;
      // Any line change (qty, checks, adds) is persisted; validation summaries are not.
      if (state.lines === prev.lines) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    });
    if (typeof window !== 'undefined') {
      // A full page load right after a change must not lose the debounced write (links that reload, the in-app
      // browser being suspended): flush when the page is hidden or unloaded.
      const flushNow = () => {
        if (!timer) return;
        clearTimeout(timer);
        flush();
      };
      window.addEventListener('pagehide', flushNow);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushNow();
      });
      window.addEventListener('storage', (e: StorageEvent) => {
        // `key === null` means the storage was cleared; reload either way. Last write wins.
        if (e.key !== null && e.key !== CART_STORAGE_KEY) return;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        forgetMemoryStored('local', CART_STORAGE_KEY);
        const loaded = loadCart(now());
        suppressSave = true;
        store.setState({ lines: loaded.lines, validation: null });
        suppressSave = false;
      });
    }
  }

  return store;
}

/** The app-wide cart. */
export const cartStore: CartStore = createCartStore();

export function useCart<T>(selector: (state: CartState) => T): T {
  return useStore(cartStore, selector);
}
