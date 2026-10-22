import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCartStore } from '@/features/cart/store';
import { CART_STORAGE_KEY } from '@/features/cart/persistence';
import { resetMemoryStorage } from '@/lib/storage';
import { pack, ui } from './fixtures';

beforeEach(() => {
  window.localStorage.clear();
  resetMemoryStorage();
});

describe('cart store', () => {
  it('adds a line with the exact contract item and merges identical lines', () => {
    const s = createCartStore();
    const r1 = s.getState().add(pack(), ui());
    expect(r1).toMatchObject({ ok: true, merged: false });
    // same set of stimpieIds in another order merges
    const r2 = s.getState().add(pack({ stimpieIds: [7, 4] }), ui());
    expect(r2).toMatchObject({ ok: true, merged: true, qty: 2 });
    expect(s.getState().lines).toHaveLength(1);
    expect(s.getState().lines[0]?.item).toEqual({ ...pack(), qty: 2 });
  });

  it('caps quantity at 10 and clamps setQty to 1..10', () => {
    const s = createCartStore();
    s.getState().add(pack({ qty: 9 }), ui());
    s.getState().add(pack({ qty: 5 }), ui());
    const id = s.getState().lines[0]!.lineId;
    expect(s.getState().lines[0]?.item.qty).toBe(10);
    s.getState().setQty(id, 0);
    expect(s.getState().lines[0]?.item.qty).toBe(1);
    s.getState().setQty(id, 99);
    expect(s.getState().lines[0]?.item.qty).toBe(10);
  });

  it('refuses duplicate Stimpies inside one pack and a 21st line', () => {
    const s = createCartStore();
    expect(s.getState().add(pack({ stimpieIds: [4, 4] }), ui())).toEqual({ ok: false, reason: 'INVALID' });
    for (let i = 1; i <= 20; i++) s.getState().add({ kind: 'stimpie', stimpieId: i, qty: 1 }, ui());
    expect(s.getState().add({ kind: 'stimpie', stimpieId: 99, qty: 1 }, ui())).toEqual({ ok: false, reason: 'FULL' });
  });

  it('persists debounced to localStorage and hydrates in a new store', () => {
    vi.useFakeTimers();
    const a = createCartStore();
    a.getState().hydrate();
    a.getState().add(pack(), ui());
    vi.advanceTimersByTime(150);
    const raw = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? 'null');
    expect(raw.v).toBe(1);
    expect(raw.lines).toHaveLength(1);
    vi.useRealTimers();
    const b = createCartStore();
    b.getState().hydrate();
    expect(b.getState().lines).toHaveLength(1);
    expect(b.getState().hydrated).toBe(true);
  });

  it('resets on corrupt JSON, unknown version and malformed lines without throwing', () => {
    window.localStorage.setItem(CART_STORAGE_KEY, '{not json');
    const a = createCartStore();
    expect(() => a.getState().hydrate()).not.toThrow();
    expect(a.getState().lines).toEqual([]);

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 99, updatedAt: new Date().toISOString(), lines: [{}] }));
    const b = createCartStore();
    b.getState().hydrate();
    expect(b.getState().lines).toEqual([]);

    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), lines: [{ lineId: 'x', item: { kind: 'pack' } }] }),
    );
    const c = createCartStore();
    c.getState().hydrate();
    expect(c.getState().lines).toEqual([]);
  });

  it('discards carts older than 30 days with a notice', () => {
    const old = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const s0 = createCartStore();
    s0.getState().hydrate();
    s0.getState().add(pack(), ui());
    const line = s0.getState().lines[0];
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, updatedAt: old, lines: [line] }));
    const s = createCartStore();
    s.getState().hydrate();
    expect(s.getState().lines).toEqual([]);
    expect(s.getState().notices).toContain('OLD_CART_CLEARED');
  });

  it('keeps working in memory when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.useFakeTimers();
    const s = createCartStore();
    s.getState().hydrate();
    s.getState().add(pack(), ui());
    vi.advanceTimersByTime(150);
    expect(s.getState().lines).toHaveLength(1);
    expect(s.getState().persistent).toBe(false);
    expect(s.getState().notices).toContain('NOT_PERSISTENT');
    vi.useRealTimers();
    spy.mockRestore();
  });

  it('keeps the newest cart in memory when reads work but storage writes are blocked', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('read-only storage');
    });
    const first = createCartStore();
    first.getState().hydrate();
    first.getState().add(pack(), ui());
    vi.advanceTimersByTime(150);
    expect(first.getState().notices).toContain('NOT_PERSISTENT');

    // A second store in the same page lifetime sees the in-memory fallback even though localStorage.getItem works.
    const second = createCartStore();
    second.getState().hydrate();
    expect(second.getState().lines).toHaveLength(1);
    expect(second.getState().lines[0]?.item).toEqual(pack());
    vi.useRealTimers();
    spy.mockRestore();
  });
  it('keeps only contract keys of stored items and at most 20 lines (the API schemas are strict)', () => {
    const line = (i: number, extra: object = {}) => ({
      lineId: `l${i}`,
      item: { kind: 'stimpie', stimpieId: i, qty: 1, ...extra },
      ui: { title: `S${i}`, unitPriceCents: 1000 },
      check: { state: 'OK', reasons: [], checkedAt: null },
    });
    const lines = [line(1, { legacyPrice: 1000 }), ...Array.from({ length: 21 }, (_, i) => line(i + 2))];
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), lines }));
    const s = createCartStore();
    s.getState().hydrate();
    expect(s.getState().lines).toHaveLength(20);
    expect(s.getState().lines[0]?.item).toEqual({ kind: 'stimpie', stimpieId: 1, qty: 1 });
  });

  it('drops a stored pack with more than 5 Stimpies', () => {
    const bad = { lineId: 'p', item: pack({ stimpieIds: [1, 2, 3, 4, 5, 6] }), ui: { title: 'P', unitPriceCents: 1 }, check: { state: 'OK', reasons: [], checkedAt: null } };
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), lines: [bad] }));
    const s = createCartStore();
    s.getState().hydrate();
    expect(s.getState().lines).toHaveLength(0);
  });
});
