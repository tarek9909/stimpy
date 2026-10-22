import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createPublicClient, errorFromResponse } from '@stimpy/api-client';
import { formatCents } from '@stimpy/ui';
import { captureUtm, cleanForApi, getAttribution, getFirstTouchAttribution, FIRST_TOUCH_STORAGE_KEY, UTM_STORAGE_KEY } from '@/lib/utm';
import { resetMemoryStorage } from '@/lib/storage';
import { toUserError, isReportable } from '@/lib/errors';
import { backoffDelay, inEarlyWindow, runHandoff } from '@/features/drops/handoff';
import { measureClockOffset } from '@/lib/server-clock';
import { feeText, estimateFor } from '@/lib/delivery';
import { groupFaqs, parseHelpTab } from '@/lib/help';
import { JsonLd, priceString } from '@/lib/jsonld';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseShopParams, shopHref, activeFilterCount } from '@/features/shop/params';
import { pickCurrentDrop, secondStimpieExtraCents } from '@/features/home/logic';
import { applyValidation, invalidItemIndices } from '@/features/cart/validation';
import { badgeText, cartLabel } from '@/components/layout/Header';
import { scrub } from '@/lib/track';
import { packs, pack, ui } from './fixtures';
import type { CartLine } from '@/features/cart/types';
import type { Drop, Faq, ValidateCartResponse } from '@stimpy/api-client';

beforeEach(() => {
  window.sessionStorage.clear();
  resetMemoryStorage();
});

describe('UTM capture', () => {
  it('keeps full session data while sending only the documented campaign fields', () => {
    const rec = captureUtm('?utm_source=instagram&utm_medium=story&utm_campaign=drop 002!&utm_content=x&utm_term=summer', {
      landingPath: '/shop',
      referrer: 'https://l.instagram.com/',
    });
    expect(rec?.utm_source).toBe('instagram');
    expect(JSON.parse(window.sessionStorage.getItem(UTM_STORAGE_KEY) ?? '{}')).toMatchObject({
      utm_content: 'x',
      utm_term: 'summer',
      referrer: 'https://l.instagram.com',
    });
    const campaign = {
      utmSource: 'instagram',
      utmMedium: 'story',
      utmCampaign: 'drop002',
    };
    expect(getAttribution()).toEqual(campaign);
    expect(getFirstTouchAttribution()).toEqual(campaign);
    expect(window.sessionStorage.getItem(FIRST_TOUCH_STORAGE_KEY)).toBeTruthy();
    expect(window.sessionStorage.getItem(UTM_STORAGE_KEY)).toBeTruthy();
  });

  it('updates latest campaign attribution while preserving immutable first-touch data', () => {
    captureUtm('?utm_source=a', { landingPath: '/', referrer: '' });
    expect(captureUtm('?foo=1', { landingPath: '/x', referrer: '' })?.landingPath).toBe('/');
    expect(getAttribution()).toEqual({ utmSource: 'a' });
    captureUtm('?utm_source=b', { landingPath: '/', referrer: '' });
    expect(getAttribution()).toEqual({ utmSource: 'b' });
    expect(getFirstTouchAttribution()).toEqual({ utmSource: 'a' });
  });

  it('keeps content, term, and referrer local to the browser', () => {
    const rec = captureUtm('?utm_term=summer%20drop', {
      landingPath: '/shop',
      referrer: 'https://search.example/results?email=private@example.com',
    });
    expect(rec?.referrer).toBe('https://search.example');
    expect(getAttribution()).toBeUndefined();
    expect(getFirstTouchAttribution()).toBeUndefined();
    window.sessionStorage.clear();
    expect(captureUtm('?foo=1', { landingPath: '/', referrer: 'https://social.example/path?token=secret' })?.referrer)
      .toBe('https://social.example');
    expect(JSON.parse(window.sessionStorage.getItem(FIRST_TOUCH_STORAGE_KEY) ?? '{}').referrer).toBe('https://social.example');
    expect(getFirstTouchAttribution()).toBeUndefined();
  });

  it('no latest or first touch is created without a tag or external referrer', () => {
    expect(captureUtm('?foo=1', { landingPath: '/', referrer: '' })).toBeNull();
    expect(getAttribution()).toBeUndefined();
    expect(getFirstTouchAttribution()).toBeUndefined();
  });

  it('replaces latest touch but not first touch after another campaign landing', () => {
    captureUtm('?utm_source=a', { landingPath: '/', referrer: '' });
    captureUtm('?utm_source=b&utm_medium=paid', { landingPath: '/shop', referrer: 'https://ads.example/' });
    expect(getAttribution()).toEqual({ utmSource: 'b', utmMedium: 'paid' });
    expect(getFirstTouchAttribution()).toEqual({ utmSource: 'a' });
  });

  it('retains latest attribution when a later visit has no UTM', () => {
    captureUtm('?utm_source=a', { landingPath: '/', referrer: '' });
    captureUtm('?foo=1', { landingPath: '/x', referrer: '' });
    expect(getAttribution()).toEqual({ utmSource: 'a' });
  });

  it('omits empty values and caps at 80 characters; no attribution when nothing remains', () => {
    expect(cleanForApi('x'.repeat(120))).toHaveLength(80);
    captureUtm('?utm_source=%20%20!!', { landingPath: '/', referrer: '' });
    expect(getAttribution()).toBeUndefined();
  });
});

describe('error mapping', () => {
  const body = (code: string, extra: object = {}) => ({ error: { code, message: 'm', details: null, requestId: 'abcdef12-0000', ...extra } });
  const resp = (status: number, json: unknown, headers: Record<string, string> = {}) =>
    new Response(typeof json === 'string' ? json : JSON.stringify(json), { status, headers: { 'content-type': 'application/json', ...headers } });

  it('turns error bodies into a typed ApiError with fields, details and request id', async () => {
    const err = await errorFromResponse(resp(400, body('VALIDATION_ERROR', { fields: { contact: 'Enter a valid email address.' } })));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', requestId: 'abcdef12-0000' });
    expect(err.fields).toEqual({ contact: 'Enter a valid email address.' });
    expect(err.reference).toBe('abcdef12');
  });

  it('reads retryAfterSeconds from details, falling back to the Retry-After header', async () => {
    const a = await errorFromResponse(resp(429, body('RATE_LIMITED', { details: { retryAfterSeconds: 42 } })));
    expect(a.retryAfterSeconds).toBe(42);
    const b = await errorFromResponse(resp(429, body('RATE_LIMITED'), { 'Retry-After': '7' }));
    expect(b.retryAfterSeconds).toBe(7);
  });

  it('maps HTML proxy errors and unknown codes to synthetic codes', async () => {
    expect((await errorFromResponse(new Response('<html>502</html>', { status: 502 }))).code).toBe('BAD_RESPONSE');
    expect((await errorFromResponse(resp(500, body('SOMETHING_NEW')))).code).toBe('UNKNOWN');
  });

  it('maps user-facing copy per code', () => {
    const mk = (code: ApiError['code'], status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
      new ApiError({ status, code, message: 'raw api message', ...extra });
    expect(toUserError(mk('RATE_LIMITED', 429, { retryAfterSeconds: 12 }))).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 12, message: 'Too many tries. Please wait 12 seconds.' });
    expect(toUserError(mk('VALIDATION_ERROR', 400, { fields: { a: 'b' } })).fields).toEqual({ a: 'b' });
    expect(toUserError(mk('INTERNAL', 500, { requestId: 'r-1' }))).toMatchObject({ kind: 'server', reference: 'r-1' });
    expect(toUserError(mk('NETWORK', 0)).kind).toBe('offline');
    expect(toUserError(new Error('x')).kind).toBe('server');
    expect(isReportable(mk('VALIDATION_ERROR', 400))).toBe(false);
    expect(isReportable(mk('INTERNAL', 500))).toBe(true);
  });
});

describe('countdown hand-off and clock', () => {
  it('polls with backoff until the server says LIVE', async () => {
    const delays: number[] = [];
    const states = [null, 'UPCOMING', 'UPCOMING', 'LIVE'] as const;
    let i = 0;
    const result = await runHandoff({
      fetchState: async () => states[i++] ?? null,
      sleep: async (ms) => {
        delays.push(ms);
      },
      now: () => 0,
    });
    expect(result).toBe('live');
    expect(delays).toEqual([1000, 2000, 4000]);
    expect([0, 1, 2, 3, 4].map(backoffDelay)).toEqual([1000, 2000, 4000, 4000, 4000]);
  });

  it('never decides live itself: times out after 30 s of UPCOMING', async () => {
    let t = 0;
    const result = await runHandoff({
      fetchState: async () => 'UPCOMING',
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    expect(result).toBe('timeout');
    expect(t).toBeGreaterThanOrEqual(30_000);
  });

  it('end mode: anything but LIVE counts', async () => {
    expect(await runHandoff({ fetchState: async () => 'SOLD_OUT', reached: (s) => s !== 'LIVE', sleep: async () => undefined })).toBe('live');
  });

  it('early window is the last 60 s before start on the server clock', () => {
    expect(inEarlyWindow(100_000, 30_000, 0)).toBe(false);
    expect(inEarlyWindow(100_000, 50_000, 0)).toBe(true);
    expect(inEarlyWindow(100_000, 50_000, -20_000)).toBe(false);
    expect(inEarlyWindow(100_000, 100_001, 0)).toBe(false);
  });

  it('picks the smallest round trip and falls back to the Date header', async () => {
    // server clock is 5 s ahead of the device; samples have rtt 400, 40, 200
    const rtts = [400, 40, 200];
    let perf = 0;
    let call = 0;
    const est = await measureClockOffset(
      async () => {
        const rtt = rtts[call++]!;
        perf += rtt;
        return { time: new Date(1_000_000 + 5_000 + rtt / 2 - 0).toISOString(), dateHeader: null };
      },
      { now: () => 1_000_000, perf: () => perf, gapMs: 0 },
    );
    expect(est.uncertain).toBe(false);
    expect(Math.abs(est.offsetMs - 5000)).toBeLessThan(60);
    const none = await measureClockOffset(async () => {
      throw new Error('down');
    }, { gapMs: 0 });
    expect(none).toEqual({ offsetMs: 0, uncertain: true });
    const header = await measureClockOffset(async () => {
      throw new Error('x');
    }, { gapMs: 0, samples: 1 });
    expect(header.uncertain).toBe(true);
  });
});

describe('formatters and small rules in use', () => {
  it('formats money from cents', () => {
    expect(formatCents(4500)).toBe('$45');
    expect(formatCents(4550)).toBe('$45.50');
    expect(priceString(4550)).toBe('45.50');
    expect(priceString(300)).toBe('3.00');
  });

  it('delivery fee and estimate text', () => {
    expect(feeText({ feeCents: null }, 300)).toBe('$3');
    expect(feeText({ feeCents: 0 }, 300)).toBe('Free delivery');
    expect(estimateFor({ estDays: 2 }, '2-3 working days')).toBe('2 working days');
    expect(estimateFor({ estDays: null }, '2-3 working days')).toBe('2-3 working days');
  });

  it('shop params round-trip and noindex rule', () => {
    const p = parseShopParams({ tab: 'stimpies', type: 'limited', drop: 'drop-001', soldOut: 'hide', junk: '1' });
    expect(p).toEqual({ tab: 'stimpies', type: 'LIMITED', drop: 'drop-001', hideSoldOut: true });
    expect(shopHref(p)).toBe('/shop?tab=stimpies&type=LIMITED&drop=drop-001&soldOut=hide');
    expect(shopHref({})).toBe('/shop');
    expect(activeFilterCount(p)).toBe(3);
    expect(parseShopParams({ drop: 'Bad Slug!' }).drop).toBeNull();
  });

  it('help tab and FAQ grouping', () => {
    expect(parseHelpTab('nope')).toBe('size');
    expect(parseHelpTab('faq')).toBe('faq');
    const f = (id: number, group: string | null): Faq => ({ id, question: `q${id}`, answer: 'a', group, showOnHome: false });
    const g = groupFaqs([f(1, 'Care'), f(2, null), f(3, 'Sizing'), f(4, 'Care')]);
    expect(g.map((x) => x.heading)).toEqual(['Care', 'Sizing', 'More questions']);
    expect(g[0]?.items.map((i) => i.id)).toEqual([1, 4]);
    expect(groupFaqs([f(1, null)])[0]?.heading).toBeNull();
  });

  it('home: second Stimpie price and current drop choice', () => {
    expect(secondStimpieExtraCents(packs)).toBe(1000);
    expect(secondStimpieExtraCents([packs[0]!])).toBeUndefined();
    const d = (slug: string, state: Drop['state']): Drop => ({ id: 1, slug, name: slug, story: '', accentColor: 'BUTTER', accentHex: '#FFE45C', startsAt: '', endsAt: null, state, teaserImage: null, teaserVideo: null, unitsRemaining: null, stimpies: [] });
    expect(pickCurrentDrop(null, { live: d('live', 'LIVE'), upcoming: [d('next', 'UPCOMING')] })?.slug).toBe('live');
    expect(pickCurrentDrop(d('old', 'ENDED'), { live: null, upcoming: [d('next', 'UPCOMING')] })?.slug).toBe('next');
    expect(pickCurrentDrop(null, { live: null, upcoming: [] })).toBeNull();
  });

  it('header badge and analytics scrub', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(12)).toBe('9+');
    expect(cartLabel(1)).toBe('Cart, 1 item');
    expect(scrub({ kind: 'pack', email: 'a@b.c', order_number: 'STP-1', value_cents: 3500 })).toEqual({ kind: 'pack', value_cents: 3500 });
  });
});

describe('cart validation mapping', () => {
  const lineFor = (item: CartLine['item'], price = 4500): CartLine => ({
    lineId: crypto.randomUUID(),
    item,
    ui: { ...ui({ unitPriceCents: price }), addedAt: '' },
    check: { state: 'OK', reasons: [], checkedAt: null },
  });
  const base = { ok: false, subtotalCents: 0, deliveryFeeCents: 300, totalCents: 300, estimateText: '2-3 working days' };

  it('flags a price change and stores the new price', () => {
    const r = applyValidation([lineFor(pack())], { ...base, ok: true, lines: [{ itemIndex: 0, ok: true, unitPriceCents: 4000, lineTotalCents: 4000, problems: [] }] } as ValidateCartResponse);
    expect(r.lines[0]?.check.state).toBe('PRICE_CHANGED');
    expect(r.lines[0]?.ui.unitPriceCents).toBe(4000);
  });

  it('adjusts quantity when stock is partly available and asks for a re-run', () => {
    const r = applyValidation([lineFor(pack({ qty: 3 }))], {
      ...base,
      lines: [{ itemIndex: 0, ok: false, unitPriceCents: 4500, lineTotalCents: 0, problems: [{ kind: 'STIMPIE', stimpieId: 4, itemIndex: 0, name: 'THE VOID', requested: 3, available: 1 }] }],
    } as ValidateCartResponse);
    expect(r.lines[0]?.item.qty).toBe(1);
    expect(r.lines[0]?.check.state).toBe('ADJUSTED');
    expect(r.rerun).toBe(true);
    expect(r.toasts[0]).toContain('Only 1 left');
  });

  it('marks sold out and not-purchasable lines unavailable with the documented copy', () => {
    const r = applyValidation([lineFor(pack()), lineFor({ kind: 'stimpie', stimpieId: 9, qty: 1 })], {
      ...base,
      lines: [
        { itemIndex: 0, ok: false, unitPriceCents: 4500, lineTotalCents: 0, problems: [{ kind: 'HOODIE_VARIANT', hoodieId: 1, colorId: 1, sizeId: 3, itemIndex: 0, name: 'x', requested: 1, available: 0 }] },
        { itemIndex: 1, ok: false, unitPriceCents: 1000, lineTotalCents: 0, problems: [{ kind: 'STIMPIE', stimpieId: 9, itemIndex: 1, name: 'SIGNAL', reason: 'DROP_NOT_STARTED' }] },
      ],
    } as ValidateCartResponse);
    expect(r.lines[0]?.check).toMatchObject({ state: 'UNAVAILABLE', reasons: ['Black, M just sold out.'] });
    expect(r.lines[1]?.check.reasons[0]).toBe("SIGNAL isn't on sale yet. The drop hasn't started.");
    expect(r.summary.ok).toBe(false);
  });

  it('finds the line indices of items.N validation errors', () => {
    expect(invalidItemIndices({ 'items.2.stimpieIds.0': 'x', 'items.0.qty': 'y', 'customer.name': 'z' })).toEqual([0, 2]);
  });
});

describe('JSON-LD', () => {
  it('escapes < as the JSON escape so CMS text cannot close the script element, and stays valid JSON', () => {
    const html = renderToStaticMarkup(JsonLd({ data: { name: 'a</script><img src=x onerror=alert(1)>' } }));
    expect(html).not.toContain('</script><img');
    // Our own escape, not React's internal `<script` rewriting.
    expect(html).toContain('\\u003c/script>\\u003cimg');
    const json = html.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    expect(JSON.parse(json)).toEqual({ name: 'a</script><img src=x onerror=alert(1)>' });
  });
});
