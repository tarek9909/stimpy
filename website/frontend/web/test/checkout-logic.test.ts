import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, type ApiClient, type DeliveryFees, type PlacedOrder, type StockProblem } from '@stimpy/api-client';
import { createCartStore, type CartStore } from '@/features/cart/store';
import { stimpieLine } from './fixtures-checkout';
import {
  EMPTY_VALUES,
  OTHER_AREA,
  areaIdFor,
  feeLine,
  isLebanesePhone,
  mapServerFields,
  validateCheckout,
  validateField,
  type CheckoutValues,
} from '@/features/checkout/form';
import { displayTotals } from '@/features/checkout/totals';
import {
  applyPurchaseProblems,
  applyStockProblems,
  cartFieldIndices,
  classifyOrderError,
  duplicateStimpieLines,
  soldOutHeading,
} from '@/features/checkout/outcome';
import { ATTEMPT_STORAGE_KEY, buildOrderPayload, clearAttempt, hashPayload, keyForPayload, peekAttempt, readPendingAttempt } from '@/features/checkout/payload';
import { submitOrder } from '@/features/checkout/submit';
import { stimpieAlternatives, swapStimpieInLine, variantAlternatives } from '@/features/checkout/alternatives';
import { loadDraft, saveDraft, DRAFT_STORAGE_KEY } from '@/features/checkout/draft';
import { resetMemoryStorage } from '@/lib/storage';
import { captureUtm } from '@/lib/utm';
import { hoodie, pack, stimpie, ui } from './fixtures';

const fees: DeliveryFees = {
  defaultFeeCents: 300,
  estimateText: '2-3 working days',
  areas: [
    { id: 1, name: 'Beirut', feeCents: null, estDays: null },
    { id: 2, name: 'North', feeCents: 500, estDays: 4 },
    { id: 3, name: 'Metn', feeCents: 0, estDays: 1 },
  ],
};

const good: CheckoutValues = {
  ...EMPTY_VALUES,
  name: 'Rami Haddad',
  email: 'rami@example.com',
  phone: '03 123 456',
  areaChoice: '1',
  address: 'Main street, building 5',
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetMemoryStorage();
});

describe('checkout form validation matrix (2.2)', () => {
  it('accepts a complete form and rejects an empty one with the documented copy', () => {
    expect(validateCheckout(good, { areasAvailable: true })).toEqual({});
    expect(validateCheckout(EMPTY_VALUES, { areasAvailable: true })).toEqual({
      'customer.name': 'Enter your full name.',
      'customer.email': 'Enter a valid email address.',
      'customer.phone': 'Enter a Lebanese phone number, like 03 123 456.',
      'delivery.areaId': 'Choose your area.',
      'delivery.address': 'Enter your delivery address: street, building, floor.',
    });
  });

  it('name: trimmed, 2 to 80 characters', () => {
    const name = (v: string) => validateField('customer.name', { ...good, name: v }, { areasAvailable: true });
    expect(name(' a ')).not.toBeNull();
    expect(name('Al')).toBeNull();
    expect(name('x'.repeat(80))).toBeNull();
    expect(name('x'.repeat(81))).not.toBeNull();
  });

  it('email: basic shape, at most 190 characters', () => {
    const email = (v: string) => validateField('customer.email', { ...good, email: v }, { areasAvailable: true });
    for (const bad of ['', 'a', 'a@b', 'a b@c.co', '@c.co']) expect(email(bad), bad).not.toBeNull();
    expect(email('a@b.co')).toBeNull();
    expect(email(`${'a'.repeat(186)}@b.co`)).not.toBeNull();
  });

  it('phone: 03 123 456, 03123456, +961 3 123 456 and 00961 3 123 456 pass; 123 fails (QA 15)', () => {
    for (const ok of ['03 123 456', '03123456', '+961 3 123 456', '00961 3 123 456', '70 123 456', '+961 70 123 456']) expect(isLebanesePhone(ok), ok).toBe(true);
    for (const bad of ['123', '', 'abcdefg', '0312345', '031234567890']) expect(isLebanesePhone(bad), bad).toBe(false);
  });

  it('WhatsApp number is required only when "same as phone" is unticked', () => {
    expect(validateField('customer.whatsapp', { ...good, whatsappSame: true, whatsapp: '' }, { areasAvailable: true })).toBeNull();
    expect(validateField('customer.whatsapp', { ...good, whatsappSame: false, whatsapp: '' }, { areasAvailable: true })).toBe('Enter your WhatsApp number.');
    expect(validateField('customer.whatsapp', { ...good, whatsappSame: false, whatsapp: '70 123 456' }, { areasAvailable: true })).toBeNull();
  });

  it('area: required select, "Other" needs a typed name up to 120, fallback (no fees) is always free text', () => {
    expect(validateField('delivery.areaId', { ...good, areaChoice: '' }, { areasAvailable: true })).toBe('Choose your area.');
    expect(validateField('delivery.areaName', { ...good, areaChoice: OTHER_AREA, areaOther: '' }, { areasAvailable: true })).toBe('Type your area or town.');
    expect(validateField('delivery.areaName', { ...good, areaChoice: OTHER_AREA, areaOther: 'Jounieh' }, { areasAvailable: true })).toBeNull();
    expect(validateField('delivery.areaName', { ...good, areaChoice: OTHER_AREA, areaOther: 'x'.repeat(121) }, { areasAvailable: true })).not.toBeNull();
    expect(validateField('delivery.areaId', { ...good, areaChoice: '' }, { areasAvailable: false })).toBeNull();
    expect(validateField('delivery.areaName', { ...good, areaChoice: '', areaOther: '' }, { areasAvailable: false })).toBe('Type your area or town.');
  });

  it('address 5..300 trimmed, notes up to 300', () => {
    const addr = (v: string) => validateField('delivery.address', { ...good, address: v }, { areasAvailable: true });
    expect(addr('abcd')).not.toBeNull();
    expect(addr('  abcd ')).not.toBeNull();
    expect(addr('abcde')).toBeNull();
    expect(addr('x'.repeat(301))).not.toBeNull();
    expect(validateField('delivery.notes', { ...good, notes: 'n'.repeat(300) }, { areasAvailable: true })).toBeNull();
    expect(validateField('delivery.notes', { ...good, notes: 'n'.repeat(301) }, { areasAvailable: true })).not.toBeNull();
  });
});

describe('area and fee logic (2.4)', () => {
  it('shows "from default" before an area is chosen, area fee or default after, default for Other', () => {
    expect(feeLine({ areaChoice: '' }, fees)).toEqual({ kind: 'from', cents: 300 });
    expect(feeLine({ areaChoice: '1' }, fees)).toMatchObject({ kind: 'area', areaName: 'Beirut', cents: 300, estimate: '2-3 working days' });
    expect(feeLine({ areaChoice: '2' }, fees)).toMatchObject({ kind: 'area', cents: 500, estimate: 'about 4 days' });
    expect(feeLine({ areaChoice: '3' }, fees)).toMatchObject({ cents: 0, estimate: 'about 1 day' });
    expect(feeLine({ areaChoice: OTHER_AREA }, fees)).toEqual({ kind: 'other', cents: 300 });
    expect(feeLine({ areaChoice: '1' }, null)).toEqual({ kind: 'unknown' });
  });

  it('areaId is sent only for a real area (never for Other or the fallback)', () => {
    expect(areaIdFor({ areaChoice: '2' }, fees)).toBe(2);
    expect(areaIdFor({ areaChoice: OTHER_AREA }, fees)).toBeNull();
    expect(areaIdFor({ areaChoice: '2' }, null)).toBeNull();
    expect(areaIdFor({ areaChoice: '99' }, fees)).toBeNull();
  });

  it('totals use integer cents: estimate before validation, server numbers after, "estimated" until an area is chosen', () => {
    const store = createCartStore();
    store.getState().add(pack(), ui({ unitPriceCents: 4500 }));
    store.getState().add({ kind: 'stimpie', stimpieId: 9, qty: 2 }, ui({ unitPriceCents: 1000, title: 'Stimpie: X', hoodieSlug: null }));
    const lines = store.getState().lines;
    const pre = displayTotals({ lines, validation: null, values: { areaChoice: '2' }, fees });
    expect(pre).toMatchObject({ subtotalCents: 6500, feeCents: 500, totalCents: 7000, estimated: true });
    const server = { ok: true, subtotalCents: 6600, deliveryFeeCents: 500, totalCents: 7100, estimateText: '4 working days', checkedAt: '2026-10-14T10:00:00Z', areaId: 2 };
    const post = displayTotals({ lines, validation: server, values: { areaChoice: '2' }, fees });
    expect(post).toMatchObject({ subtotalCents: 6600, feeCents: 500, totalCents: 7100, estimated: false });
    // a validation for another area is ignored
    expect(displayTotals({ lines, validation: { ...server, areaId: 1 }, values: { areaChoice: '2' }, fees }).subtotalCents).toBe(6500);
    // not chosen yet: still labelled an estimate
    expect(displayTotals({ lines, validation: { ...server, areaId: null }, values: { areaChoice: '' }, fees }).estimated).toBe(true);
    // fees down: fee from the validation, still an estimate
    const down = displayTotals({ lines, validation: { ...server, areaId: null, deliveryFeeCents: 300, totalCents: 6900 }, values: { areaChoice: '' }, fees: null });
    expect(down).toMatchObject({ feeCents: 300, estimated: true });
  });
});

describe('server field mapping (4.3)', () => {
  it('maps contract paths to form fields, cart paths to the cart, the rest to "other"', () => {
    const m = mapServerFields({
      'customer.email': 'Enter a valid email address.',
      'customer.whatsappSameAsPhone': 'bad',
      'delivery.areaName': 'Type your area.',
      'items.1.sizeId': 'Choose a size',
      items: 'Too many',
      hp: 'x',
      expectedTotalCents: 'x',
    });
    expect(m.form['customer.email']).toBe('Enter a valid email address.');
    expect(m.form['customer.whatsapp']).toBe('bad');
    expect(m.form['delivery.areaName']).toBe('Type your area.');
    expect(Object.keys(m.cart)).toEqual(['items.1.sizeId', 'items']);
    expect(m.other).toEqual(['hp', 'expectedTotalCents']);
    expect(cartFieldIndices(m.cart)).toEqual([1]);
    expect(duplicateStimpieLines({ 'items.0.stimpieIds.1': 'dup', 'items.2.sizeId': 'x' })).toEqual([0]);
  });
});

describe('error mapping per API code (4.1)', () => {
  const api = (code: ApiError['code'], status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
    new ApiError({ status, code, message: 'm', requestId: 'req-1', ...extra });

  it('VALIDATION_ERROR with fields -> field errors; without fields -> generic (honeypot)', () => {
    expect(classifyOrderError(api('VALIDATION_ERROR', 400, { fields: { 'customer.email': 'bad' } }))).toMatchObject({ type: 'validation', fields: { 'customer.email': 'bad' }, attributionRejected: false });
    expect(classifyOrderError(api('VALIDATION_ERROR', 400, { fields: { 'attribution.utmSource': 'bad' } }))).toMatchObject({ type: 'validation', attributionRejected: true });
    expect(classifyOrderError(api('VALIDATION_ERROR', 400))).toEqual({ type: 'generic', message: 'Something went wrong. Please try again.', requestId: 'req-1' });
    expect(classifyOrderError(api('VALIDATION_ERROR', 400, { fields: {} })).type).toBe('generic');
  });

  it('SOLD_OUT and NOT_PURCHASABLE carry their problems; empty details degrade to generic', () => {
    const items = [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 2, available: 1 }];
    expect(classifyOrderError(api('SOLD_OUT', 409, { details: { items } }))).toEqual({ type: 'sold_out', problems: items });
    const np = [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', reason: 'DROP_ENDED' }];
    expect(classifyOrderError(api('NOT_PURCHASABLE', 409, { details: { items: np } }))).toEqual({ type: 'not_purchasable', problems: np });
    expect(classifyOrderError(api('SOLD_OUT', 409, { details: null })).type).toBe('generic');
  });

  it('CONFLICT: Idempotency-Key -> key conflict; any other field -> generic', () => {
    expect(classifyOrderError(api('CONFLICT', 409, { details: { field: 'Idempotency-Key' } })).type).toBe('key_conflict');
    expect(classifyOrderError(api('CONFLICT', 409, { details: { field: 'slug' } })).type).toBe('generic');
  });

  it('PRICE_CHANGED carries the new grand total; RATE_LIMITED the wait (body, header, default)', () => {
    expect(classifyOrderError(api('PRICE_CHANGED', 422, { details: { totalCents: 5900 } }))).toEqual({ type: 'price_changed', newTotalCents: 5900 });
    expect(classifyOrderError(api('RATE_LIMITED', 429, { retryAfterSeconds: 42 }))).toEqual({ type: 'rate_limited', retryAfterSeconds: 42 });
    expect(classifyOrderError(api('RATE_LIMITED', 429)).type).toBe('rate_limited');
  });

  it('5xx, INTERNAL, BAD_RESPONSE, NETWORK, TIMEOUT: outcome unknown (retry with the same key); network has no request id', () => {
    expect(classifyOrderError(api('INTERNAL', 500))).toMatchObject({ type: 'unknown_outcome', network: false, requestId: 'req-1' });
    expect(classifyOrderError(api('BAD_RESPONSE', 502))).toMatchObject({ type: 'unknown_outcome', network: false });
    expect(classifyOrderError(api('NETWORK', 0))).toEqual({ type: 'unknown_outcome', network: true, message: null, requestId: null });
    expect(classifyOrderError(api('TIMEOUT', 0)).type).toBe('unknown_outcome');
    expect(classifyOrderError(new TypeError('boom')).type).toBe('unknown_outcome');
  });

  it('401 / 403 / unexpected 4xx: generic with the support code', () => {
    expect(classifyOrderError(api('UNAUTHENTICATED', 401))).toMatchObject({ type: 'generic', requestId: 'req-1' });
    expect(classifyOrderError(api('FORBIDDEN', 403)).type).toBe('generic');
  });
});

describe('cart updates from SOLD_OUT / NOT_PURCHASABLE (4.4)', () => {
  function cart(): CartStore {
    const s = createCartStore();
    s.getState().add(pack({ qty: 2 }), ui({ colorName: 'Black', sizeLabel: 'M', stimpies: [{ id: 4, slug: 'the-void', name: 'THE VOID', artworkUrl: 'x', type: 'CORE' }, { id: 7, slug: 'a', name: 'A', artworkUrl: 'x', type: 'CORE' }] }));
    s.getState().add({ kind: 'stimpie', stimpieId: 9, qty: 2 }, ui({ title: 'Stimpie: X', hoodieSlug: null }));
    return s;
  }
  const stock = (over: Partial<StockProblem>): StockProblem => ({ kind: 'STIMPIE', stimpieId: 9, itemIndex: 1, name: 'X', requested: 2, available: 0, ...over }) as StockProblem;

  it('available 0 marks the line at itemIndex UNAVAILABLE (stimpie and hoodie variant)', () => {
    const lines = cart().getState().lines;
    const next = applyStockProblems(lines, [stock({}), { kind: 'HOODIE_VARIANT', hoodieId: 1, colorId: 1, sizeId: 3, itemIndex: 0, name: 'Stimpy Hoodie, Black, M', requested: 2, available: 0 }]);
    expect(next[1]?.check).toMatchObject({ state: 'UNAVAILABLE', reasons: ['X just sold out.'] });
    expect(next[0]?.check).toMatchObject({ state: 'UNAVAILABLE', reasons: ['Black, M just sold out.'] });
  });

  it('0 < available < requested lowers the quantity by the shortfall; below 1 it becomes UNAVAILABLE', () => {
    const lines = cart().getState().lines;
    const lowered = applyStockProblems(lines, [stock({ available: 1 })]);
    expect(lowered[1]?.item.qty).toBe(1);
    expect(lowered[1]?.check.state).toBe('ADJUSTED');
    const gone = applyStockProblems(lines, [stock({ requested: 5, available: 1 })]);
    expect(gone[1]?.check.state).toBe('UNAVAILABLE');
    expect(gone[1]?.item.qty).toBe(2);
  });

  it('NOT_PURCHASABLE reasons use the documented copy', () => {
    const lines = cart().getState().lines;
    const text = (reason: 'INACTIVE' | 'DROP_NOT_STARTED' | 'DROP_ENDED') =>
      applyPurchaseProblems(lines, [{ kind: 'STIMPIE', stimpieId: 9, itemIndex: 1, name: 'X', reason }])[1]?.check.reasons[0];
    expect(text('INACTIVE')).toBe("X isn't available any more.");
    expect(text('DROP_NOT_STARTED')).toBe("X isn't on sale yet. The drop hasn't started.");
    expect(text('DROP_ENDED')).toBe('X: this drop has ended.');
  });

  it('dialog headings: one item vs several, and "Only n left"', () => {
    expect(soldOutHeading([stock({ name: 'THE VOID' })])).toBe('Sorry, THE VOID just sold out.');
    expect(soldOutHeading([stock({ name: 'THE VOID', available: 1 })])).toBe('Only 1 left of THE VOID.');
    expect(soldOutHeading([stock({}), stock({ itemIndex: 0 })])).toBe('A few items just sold out.');
  });

  it('alternatives: purchasable only, same type first, max 4, never the sold-out one or one already in the pack', () => {
    const all = [
      stimpie({ id: 1, type: 'LIMITED' }),
      stimpie({ id: 2, type: 'CORE' }),
      stimpie({ id: 3, type: 'CORE', purchasable: false }),
      stimpie({ id: 4, type: 'CORE' }),
      stimpie({ id: 5, type: 'CORE' }),
      stimpie({ id: 6, type: 'CORE' }),
      stimpie({ id: 7, type: 'CORE' }),
    ];
    const alts = stimpieAlternatives(all, 4, 'CORE', [7]);
    expect(alts.map((s) => s.id)).toEqual([2, 5, 6, 1]);
    const line = cart().getState().lines[0]!;
    const swapped = swapStimpieInLine(line, 4, stimpie({ id: 8, slug: 'new', name: 'NEW' }));
    expect(swapped?.item).toMatchObject({ kind: 'pack', stimpieIds: [8, 7] });
    expect(swapStimpieInLine(line, 4, stimpie({ id: 7 }))).toBeNull();
    const h = hoodie();
    expect(variantAlternatives(h, { colorId: 1, sizeId: 3 }).map((v) => `${v.colorName} ${v.sizeLabel}`)).toEqual(['Cream L']);
  });
});

describe('idempotency key lifecycle (2.6)', () => {
  const body = { a: 1 };
  it('generates once and reuses the key for the identical payload (retry, refresh)', () => {
    const first = keyForPayload(body);
    expect(first.reused).toBe(false);
    expect(first.key).toMatch(/^[0-9a-f-]{36}$/);
    const again = keyForPayload({ a: 1 });
    expect(again).toEqual({ key: first.key, reused: true });
    expect(JSON.parse(window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY)!)).toEqual({ v: 1, key: first.key, payloadHash: hashPayload(body), body, signature: '' });
    expect(readPendingAttempt()).toEqual({ key: first.key, body, signature: '' });
  });

  it('generates a new key when the payload changes, and after clearAttempt (success / definitive 4xx)', () => {
    const first = keyForPayload(body);
    const changed = keyForPayload({ a: 2 });
    expect(changed.reused).toBe(false);
    expect(changed.key).not.toBe(first.key);
    clearAttempt();
    expect(peekAttempt()).toBeNull();
    expect(keyForPayload({ a: 2 }).key).not.toBe(changed.key);
  });

  it('survives corrupt stored data', () => {
    window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, '{nope');
    expect(keyForPayload(body).reused).toBe(false);
  });

  it('drops a stored request body when its integrity hash does not match', () => {
    const first = keyForPayload(body);
    window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify({ v: 1, key: first.key, payloadHash: 'wrong', body, signature: 'x' }));
    expect(readPendingAttempt()).toBeNull();
    expect(window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY)).toBeNull();
  });
});

describe('request body (2.3, 2.5, 8)', () => {
  const store = createCartStore();
  store.getState().add(pack(), ui());
  const lines = store.getState().lines;

  it('whatsapp same as phone sends null + true; hp is always present; no attribution key when none', () => {
    const b = buildOrderPayload({ values: good, lines, fees, expectedTotalCents: 4800, attribution: undefined, firstTouch: undefined, hp: '' });
    expect(b.customer).toEqual({ name: 'Rami Haddad', email: 'rami@example.com', phone: '03 123 456', whatsapp: null, whatsappSameAsPhone: true });
    expect(b.delivery).toEqual({ areaId: 1, areaName: 'Beirut', address: 'Main street, building 5', notes: null });
    expect(b.items).toEqual([pack()]);
    expect(b.expectedTotalCents).toBe(4800);
    expect(b.hp).toBe('');
    expect(b).not.toHaveProperty('attribution');
  });

  it('unticked sends the typed number; Other sends no areaId; attribution and notes pass through', () => {
    const b = buildOrderPayload({
      values: { ...good, whatsappSame: false, whatsapp: ' 70 123 456 ', areaChoice: OTHER_AREA, areaOther: ' Jounieh ', notes: ' ring twice ' },
      lines,
      fees,
      expectedTotalCents: null,
      attribution: { utmSource: 'instagram' },
      firstTouch: undefined,
      hp: '',
    });
    expect(b.customer).toMatchObject({ whatsapp: '70 123 456', whatsappSameAsPhone: false });
    expect(b.delivery).toEqual({ areaName: 'Jounieh', address: 'Main street, building 5', notes: 'ring twice' });
    expect(b).not.toHaveProperty('expectedTotalCents');
    expect(b.attribution).toEqual({ utmSource: 'instagram' });
  });
});

/* ------------------------------------------------------------------------- submit sequence */

interface Call {
  path: string;
  body: Record<string, unknown>;
  key?: string;
}

function placed(over: Partial<PlacedOrder['order']> = {}): PlacedOrder {
  return {
    order: { number: 'STP-1042', status: 'NEW', placedAt: '2026-10-14T09:30:00.000Z', customerName: 'Rami Haddad', contactEmail: 'rami@example.com', items: [], subtotalCents: 4500, deliveryFeeCents: 300, totalCents: 4800, estimateText: '2-3 working days', ...over },
    whatsappUrl: null,
    trackUrl: 'http://localhost:3000/track?order=STP-1042',
  };
}

function validateData(store: CartStore, over: Record<string, unknown> = {}) {
  const lines = store.getState().lines;
  return {
    ok: true,
    lines: lines.map((l, i) => ({ itemIndex: i, ok: true, unitPriceCents: l.ui.unitPriceCents, lineTotalCents: l.ui.unitPriceCents * l.item.qty, problems: [] })),
    subtotalCents: lines.reduce((n, l) => n + l.ui.unitPriceCents * l.item.qty, 0),
    deliveryFeeCents: 300,
    totalCents: lines.reduce((n, l) => n + l.ui.unitPriceCents * l.item.qty, 0) + 300,
    estimateText: '2-3 working days',
    ...over,
  };
}

function fake(store: CartStore, orders: (call: Call, n: number) => unknown, validate?: (store: CartStore) => unknown) {
  const calls: Call[] = [];
  let n = 0;
  const client = {
    POST: async (path: string, opts: { body: Record<string, unknown>; headers?: Record<string, string> }) => {
      const call: Call = { path, body: opts.body, key: opts.headers?.['Idempotency-Key'] };
      calls.push(call);
      if (path.endsWith('/cart/validate')) {
        const v = validate ? validate(store) : validateData(store);
        if (v instanceof Error) throw v;
        return { data: v };
      }
      const out = orders(call, n++);
      if (out instanceof Error) throw out;
      return out;
    },
  } as unknown as ApiClient;
  return { client, calls, orderCalls: () => calls.filter((c) => c.path.endsWith('/orders')) };
}

const created = (p = placed()) => ({ data: p, response: { status: 201, headers: new Headers() } });
const api = (code: ApiError['code'], status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, code, message: 'm', requestId: 'req-9', ...extra });

function setup() {
  const store = createCartStore();
  store.getState().add(stimpieLine().item, stimpieLine().ui);
  return store;
}

const base = (store: CartStore, client: ApiClient, over: Record<string, unknown> = {}) => ({
  client,
  store,
  values: good,
  fees,
  hp: '',
  displayedTotalCents: 1300,
  attribution: undefined,
  isOnline: () => true,
  ...over,
});

describe('submit sequence (3)', () => {
  it('validates, sends expectedTotalCents from the validation, uses a key, treats 201 and 200 alike', async () => {
    const store = setup();
    const f = fake(store, () => created());
    const out = await submitOrder(base(store, f.client));
    expect(out).toMatchObject({ type: 'success', replayed: false });
    expect(f.calls.map((c) => c.path)).toEqual(['/api/v1/cart/validate', '/api/v1/orders']);
    expect(f.orderCalls()[0]!.body.expectedTotalCents).toBe(1300);
    expect(f.orderCalls()[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.calls[0]!.body).toMatchObject({ areaId: 1 });
    const replay = fake(store, () => ({ data: placed(), response: { status: 200, headers: new Headers() } }));
    expect(await submitOrder(base(store, replay.client))).toMatchObject({ type: 'success', replayed: true });
  });

  it('sends latest touch to the order and immutable session first touch to the customer separately', async () => {
    const store = setup();
    captureUtm('?utm_source=first&utm_campaign=welcome', { landingPath: '/', referrer: 'https://social.example/path?token=secret' });
    captureUtm('?utm_source=latest&utm_medium=paid&utm_content=ad1&utm_term=hoodie', { landingPath: '/shop', referrer: 'https://ads.example/click?email=private' });
    const f = fake(store, () => created());
    expect((await submitOrder(base(store, f.client))).type).toBe('success');
    expect(f.orderCalls()[0]!.body.attribution).toEqual({ utmSource: 'latest', utmMedium: 'paid' });
    expect(f.orderCalls()[0]!.body.firstTouch).toEqual({ utmSource: 'first', utmCampaign: 'welcome' });
  });

  it('empty cart and offline never reach the network', async () => {
    const empty = createCartStore();
    const f = fake(empty, () => created());
    expect(await submitOrder(base(empty, f.client))).toEqual({ type: 'empty' });
    const store = setup();
    const g = fake(store, () => created());
    expect(await submitOrder(base(store, g.client, { isOnline: () => false }))).toEqual({ type: 'offline' });
    expect(g.calls).toHaveLength(0);
  });

  it('an unavailable line stops the submit before POST /orders (cart re-validation states)', async () => {
    const store = setup();
    const f = fake(store, () => created(), (s) => ({
      ...validateData(s),
      ok: false,
      lines: [{ itemIndex: 0, ok: false, unitPriceCents: 1000, lineTotalCents: 1000, problems: [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 1, available: 0 }] }],
    }));
    expect(await submitOrder(base(store, f.client))).toEqual({ type: 'blocked', reason: 'UNAVAILABLE' });
    expect(f.orderCalls()).toHaveLength(0);
    expect(store.getState().lines[0]?.check).toMatchObject({ state: 'UNAVAILABLE', reasons: ['THE VOID just sold out.'] });
  });

  it('a total that differs from what the customer saw asks for confirmation instead of sending', async () => {
    const store = setup();
    const f = fake(store, () => created(), (s) => validateData(s, { totalCents: 1800, subtotalCents: 1500 }));
    expect(await submitOrder(base(store, f.client))).toEqual({ type: 'price_changed', oldTotalCents: 1300, newTotalCents: 1800, source: 'validate' });
    expect(f.orderCalls()).toHaveLength(0);
  });

  it('if the validation call fails the displayed total is sent and the server decides', async () => {
    const store = setup();
    const f = fake(store, () => created(), () => api('NETWORK', 0));
    expect((await submitOrder(base(store, f.client))).type).toBe('success');
    expect(f.orderCalls()[0]!.body.expectedTotalCents).toBe(1300);
  });

  it('server PRICE_CHANGED: nothing resubmitted, key forgotten, new total reported', async () => {
    const store = setup();
    const f = fake(store, () => api('PRICE_CHANGED', 422, { details: { totalCents: 1900 } }));
    const out = await submitOrder(base(store, f.client));
    expect(out).toEqual({ type: 'price_changed', oldTotalCents: 1300, newTotalCents: 1900, source: 'server' });
    expect(f.orderCalls()).toHaveLength(1);
    expect(peekAttempt()).toBeNull();
  });

  it('SOLD_OUT / NOT_PURCHASABLE / VALIDATION_ERROR are definitive: a new key is used afterwards', async () => {
    const store = setup();
    const items = [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 1, available: 0 }];
    const f = fake(store, (_c, n) => (n === 0 ? api('SOLD_OUT', 409, { details: { items } }) : created()));
    expect((await submitOrder(base(store, f.client))).type).toBe('sold_out');
    expect(peekAttempt()).toBeNull();
    await submitOrder(base(store, f.client));
    const [a, b] = f.orderCalls();
    expect(a!.key).not.toBe(b!.key);
  });

  it('RATE_LIMITED keeps the key (nothing was created); retry reuses it', async () => {
    const store = setup();
    const f = fake(store, (_c, n) => (n === 0 ? api('RATE_LIMITED', 429, { retryAfterSeconds: 30 }) : created()));
    expect(await submitOrder(base(store, f.client))).toEqual({ type: 'rate_limited', retryAfterSeconds: 30 });
    await submitOrder(base(store, f.client));
    const [a, b] = f.orderCalls();
    expect(a!.key).toBe(b!.key);
  });

  it('network failure: unknown outcome; Retry resends the identical body with the same key while nothing changed', async () => {
    const store = setup();
    const f = fake(store, (_c, n) => (n === 0 ? api('NETWORK', 0) : created()));
    const first = await submitOrder(base(store, f.client));
    expect(first).toMatchObject({ type: 'unknown_outcome', network: true });
    if (first.type !== 'unknown_outcome') throw new Error('unreachable');
    const retry = await submitOrder(base(store, f.client, { pending: first.pending }));
    expect(retry.type).toBe('success');
    const [a, b] = f.orderCalls();
    expect(b!.key).toBe(a!.key);
    expect(b!.body).toEqual(a!.body);
    // only one validate: the retry did not re-validate
    expect(f.calls.filter((c) => c.path.endsWith('/cart/validate'))).toHaveLength(1);
  });

  it('recovers the exact pending body and key from session storage after reload', async () => {
    const firstStore = setup();
    const f = fake(firstStore, (_c, n) => (n === 0 ? api('NETWORK', 0) : created()));
    const first = await submitOrder(base(firstStore, f.client));
    expect(first.type).toBe('unknown_outcome');
    const persisted = readPendingAttempt();
    expect(persisted).not.toBeNull();

    // A reload creates a new store instance, but the cart line IDs are rehydrated from localStorage unchanged.
    const reloadedStore = createCartStore();
    reloadedStore.setState({ lines: structuredClone(firstStore.getState().lines) });
    const retryClient = fake(reloadedStore, () => created());
    const retry = await submitOrder(base(reloadedStore, retryClient.client, { pending: persisted }));
    expect(retry.type).toBe('success');
    const originalCall = f.orderCalls()[0]!;
    const replayCall = retryClient.orderCalls()[0]!;
    expect(replayCall.key).toBe(originalCall.key);
    expect(replayCall.body).toEqual(originalCall.body);
    expect(retryClient.calls.filter((c) => c.path.endsWith('/cart/validate'))).toHaveLength(0);
  });

  it('a changed form after a failure sends a new key', async () => {
    const store = setup();
    const f = fake(store, (_c, n) => (n === 0 ? api('NETWORK', 0) : created()));
    const first = await submitOrder(base(store, f.client));
    if (first.type !== 'unknown_outcome') throw new Error('unreachable');
    await submitOrder(base(store, f.client, { values: { ...good, address: 'Another street 9' }, pending: first.pending }));
    const [a, b] = f.orderCalls();
    expect(b!.key).not.toBe(a!.key);
  });

  it('409 CONFLICT on Idempotency-Key: new key, resent once automatically (not twice)', async () => {
    const store = setup();
    const f = fake(store, (_c, n) => (n === 0 ? api('CONFLICT', 409, { details: { field: 'Idempotency-Key' } }) : created()));
    expect((await submitOrder(base(store, f.client))).type).toBe('success');
    const [a, b] = f.orderCalls();
    expect(a!.key).not.toBe(b!.key);
    expect(b!.body).toEqual(a!.body);
    const stuck = fake(store, () => api('CONFLICT', 409, { details: { field: 'Idempotency-Key' } }));
    expect((await submitOrder(base(store, stuck.client))).type).toBe('generic');
    expect(stuck.orderCalls()).toHaveLength(2);
  });

  it('attribution rejected by the server: dropped and resent once with a new key', async () => {
    const store = setup();
    const f = fake(store, (_c, n) => (n === 0 ? api('VALIDATION_ERROR', 400, { fields: { 'attribution.utmSource': 'bad' } }) : created()));
    const out = await submitOrder(base(store, f.client, { attribution: { utmSource: 'x' }, firstTouch: { utmSource: 'x' } }));
    expect(out.type).toBe('success');
    const [a, b] = f.orderCalls();
    expect(a!.body.attribution).toEqual({ utmSource: 'x' });
    expect(a!.body.firstTouch).toEqual({ utmSource: 'x' });
    expect(b!.body).not.toHaveProperty('attribution');
    expect(b!.body).not.toHaveProperty('firstTouch');
    expect(b!.key).not.toBe(a!.key);
  });

  it('VALIDATION_ERROR with fields is returned for the form; 500 keeps the request id', async () => {
    const store = setup();
    const f = fake(store, () => api('VALIDATION_ERROR', 400, { fields: { 'customer.email': 'Enter a valid email address.' } }));
    expect(await submitOrder(base(store, f.client))).toMatchObject({ type: 'validation', fields: { 'customer.email': 'Enter a valid email address.' } });
    const g = fake(store, () => api('INTERNAL', 500));
    expect(await submitOrder(base(store, g.client))).toMatchObject({ type: 'unknown_outcome', network: false, requestId: 'req-9' });
  });

  it('the honeypot value is sent exactly as read from the field', async () => {
    const store = setup();
    const f = fake(store, () => created());
    await submitOrder(base(store, f.client, { hp: 'bot' }));
    expect(f.orderCalls()[0]!.body.hp).toBe('bot');
  });
});

describe('checkout draft', () => {
  it('round-trips, never stores a honeypot, ignores corrupt data', () => {
    saveDraft({ ...good, whatsappSame: false, whatsapp: '70 123 456' });
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY)!;
    expect(raw).not.toMatch(/website_url|"hp"/);
    expect(loadDraft()).toMatchObject({ name: 'Rami Haddad', whatsappSame: false, whatsapp: '70 123 456' });
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, '{bad');
    expect(loadDraft()).toBeNull();
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ v: 9, values: {} }));
    expect(loadDraft()).toBeNull();
  });
});
