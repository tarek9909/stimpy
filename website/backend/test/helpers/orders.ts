import type { PrismaClient } from '@prisma/client';
import { expect } from 'vitest';
import type { PlaceOrderInput } from '../../src/services/orders';
import type { CartItemInput } from '../../src/services/pricing';
import type { World } from './fixtures';

/** Helpers shared by the order / stock / delivery tests. */

/** A distinct valid Lebanese mobile number per `i` (8 digits after 961). */
export const phoneN = (i: number): string => `71${String(100000 + i).slice(-6)}`;

export type Cart = CartItemInput[];

export async function variantOf(prisma: PrismaClient, w: World, color: 'black' | 'cream' = 'black', size: 's' | 'm' | 'l' = 'm') {
  return prisma.hoodieVariant.findUniqueOrThrow({
    where: { hoodieId_colorId_sizeId: { hoodieId: w.hoodie.id, colorId: w.colors[color].id, sizeId: w.sizes[size].id } },
  });
}

export const hoodieItem = (w: World, qty = 1, color: 'black' | 'cream' = 'black', size: 's' | 'm' | 'l' = 'm'): CartItemInput => ({
  kind: 'hoodie',
  hoodieId: w.hoodie.id,
  colorId: w.colors[color].id,
  sizeId: w.sizes[size].id,
  qty,
});

export const stimpieItem = (stimpieId: number, qty = 1): CartItemInput => ({ kind: 'stimpie', stimpieId, qty });

export const packItem = (w: World, stimpieIds: number[], qty = 1, color: 'black' | 'cream' = 'black', size: 's' | 'm' | 'l' = 'm'): CartItemInput => ({
  kind: 'pack',
  packId: stimpieIds.length === 1 ? w.packs.one.id : w.packs.two.id,
  hoodieId: w.hoodie.id,
  colorId: w.colors[color].id,
  sizeId: w.sizes[size].id,
  stimpieIds,
  qty,
});

/** A valid service input; every field can be overridden. `i` makes phone/e-mail unique. */
export function placeInput(w: World, items: Cart, o: Partial<PlaceOrderInput> & { i?: number } = {}): PlaceOrderInput {
  const { i = 0, ...rest } = o;
  return {
    customer: { name: `Customer ${i}`, email: `customer${i}@example.com`, phone: phoneN(i), whatsapp: null, whatsappSameAsPhone: true },
    delivery: { areaId: null, areaName: 'Beirut', address: 'Hamra Street, building 5', notes: null },
    items,
    ...rest,
  };
}

/** The JSON body of the public `POST /orders` for the same cart. */
export function orderBody(w: World, items: Cart, o: { i?: number; areaId?: number | null; expectedTotalCents?: number; hp?: string; email?: string } = {}) {
  const i = o.i ?? 0;
  return {
    customer: { name: `Customer ${i}`, email: o.email ?? `customer${i}@example.com`, phone: phoneN(i), whatsapp: null, whatsappSameAsPhone: true },
    delivery: { areaId: o.areaId ?? null, areaName: 'Beirut', address: 'Hamra Street, building 5', notes: null },
    items,
    ...(o.expectedTotalCents !== undefined ? { expectedTotalCents: o.expectedTotalCents } : {}),
    hp: o.hp ?? '',
  };
}

export const stimpieRow = (prisma: PrismaClient, id: number) => prisma.stimpie.findUniqueOrThrow({ where: { id } });

/**
 * Cross-checks the whole database after any scenario:
 *  - quantity >= 0 and 0 <= reserved <= quantity for every variant / Stimpie;
 *  - `reserved` equals the quantity of the order stock lines still RESERVED (nothing leaks or double counts);
 *  - every order's stock line states match its status;
 *  - every stock line has exactly one of variant / stimpie.
 */
export async function assertStockInvariants(prisma: PrismaClient): Promise<void> {
  const variants = await prisma.hoodieVariant.findMany();
  const stimpies = await prisma.stimpie.findMany();
  const lines = await prisma.orderStockLine.findMany({ include: { order: { select: { status: true } } } });
  const reservedByVariant = new Map<number, number>();
  const reservedByStimpie = new Map<number, number>();
  for (const l of lines) {
    expect((l.variantId === null) !== (l.stimpieId === null)).toBe(true);
    expect(l.itemType).toBe(l.variantId !== null ? 'HOODIE_VARIANT' : 'STIMPIE');
    const status = l.order.status;
    if (['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(status)) expect(l.state).toBe('RESERVED');
    if (status === 'DELIVERED') expect(l.state).toBe('SOLD');
    if (status === 'CANCELLED') expect(l.state).toBe('RELEASED');
    if (status === 'RETURNED') expect(['RELEASED', 'RESTOCKED', 'WRITTEN_OFF']).toContain(l.state);
    if (l.state === 'RESERVED') {
      if (l.variantId !== null) reservedByVariant.set(l.variantId, (reservedByVariant.get(l.variantId) ?? 0) + l.qty);
      else reservedByStimpie.set(l.stimpieId!, (reservedByStimpie.get(l.stimpieId!) ?? 0) + l.qty);
    }
  }
  for (const v of variants) {
    expect(v.quantity).toBeGreaterThanOrEqual(0);
    expect(v.reserved).toBeGreaterThanOrEqual(0);
    expect(v.reserved).toBeLessThanOrEqual(v.quantity);
    expect(v.reserved).toBe(reservedByVariant.get(v.id) ?? 0);
  }
  for (const s of stimpies) {
    expect(s.quantity).toBeGreaterThanOrEqual(0);
    expect(s.reserved).toBeGreaterThanOrEqual(0);
    expect(s.reserved).toBeLessThanOrEqual(s.quantity);
    expect(s.reserved).toBe(reservedByStimpie.get(s.id) ?? 0);
  }
  const movements = await prisma.stockMovement.findMany();
  for (const m of movements) expect((m.variantId === null) !== (m.stimpieId === null)).toBe(true);
}

/** Collects the keys of every object in a JSON value (for "no internal field leaks" scans). */
export function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}
