import { describe, expect, it } from 'vitest';
import { ApiError, type ApiClient } from '@stimpy/api-client';
import { validateCart } from '@/features/cart/validate-cart';
import { createCartStore } from '@/features/cart/store';
import { pack, ui } from './fixtures';

describe('cart validation snapshots', () => {
  it('does not apply a response after the same line was replaced without changing lineId or quantity', async () => {
    const store = createCartStore();
    store.getState().add(pack(), ui());
    const line = store.getState().lines[0]!;
    let release!: (value: { data: unknown }) => void;
    const client = {
      POST: () => new Promise<{ data: unknown }>((resolve) => { release = resolve; }),
    } as unknown as ApiClient;

    const result = validateCart({ client, store, force: true });
    store.getState().replaceLine(
      line.lineId,
      { kind: 'hoodie', hoodieId: 1, colorId: 2, sizeId: 4, qty: 1 },
      ui({ title: 'Hoodie only' }),
    );
    release({
      data: {
        ok: false,
        lines: [{ itemIndex: 0, ok: false, unitPriceCents: 4500, lineTotalCents: 4500, problems: [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 1, available: 0 }] }],
        subtotalCents: 0,
        deliveryFeeCents: 300,
        totalCents: 300,
        estimateText: '2-3 working days',
      },
    });

    await expect(result).resolves.toBe('kept');
    expect(store.getState().lines[0]?.lineId).toBe(line.lineId);
    expect(store.getState().lines[0]?.item).toEqual({ kind: 'hoodie', hoodieId: 1, colorId: 2, sizeId: 4, qty: 1 });
    expect(store.getState().lines[0]?.check.state).toBe('OK');
    expect(store.getState().validation).toBeNull();
  });

  it('does not apply indexed validation errors to a replacement cart line', async () => {
    const store = createCartStore();
    store.getState().add(pack(), ui());
    const line = store.getState().lines[0]!;
    let reject!: (error: unknown) => void;
    const client = {
      POST: () => new Promise<{ data: unknown }>((_resolve, onReject) => { reject = onReject; }),
    } as unknown as ApiClient;

    const result = validateCart({ client, store, force: true });
    store.getState().replaceLine(
      line.lineId,
      { kind: 'hoodie', hoodieId: 1, colorId: 2, sizeId: 4, qty: 1 },
      ui({ title: 'Hoodie only' }),
    );
    reject(new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid item', fields: { 'items.0.stimpieIds': 'No longer sold.' } }));

    await expect(result).resolves.toBe('kept');
    expect(store.getState().lines[0]?.lineId).toBe(line.lineId);
    expect(store.getState().lines[0]?.item.kind).toBe('hoodie');
    expect(store.getState().lines[0]?.check.state).toBe('OK');
    expect(store.getState().validation).toBeNull();
  });
});
