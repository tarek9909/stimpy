import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/app';
import { buildWorld, createDrop, createStimpie } from './helpers/fixtures';
import { advanceTime, freezeTime } from './helpers/clock';
import { rateLimiter } from '../src/lib/rate-limiter';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: { retryAfterSeconds?: number } | null } };
type PDrop = {
  id: number; slug: string; name: string; story: string; accentColor: string; accentHex: string; startsAt: string; endsAt: string | null;
  state: string; teaserImage: string | null; teaserVideo: string | null; unitsRemaining: number | null;
  stimpies: { id: number; slug: string; status: string; remaining: number | null; purchasable: boolean; drop: { id: number } | null }[];
};
type Overview = { live: PDrop | null; upcoming: PDrop[]; archive: PDrop[] };

const DROP_KEYS = ['accentColor', 'accentHex', 'endsAt', 'id', 'name', 'slug', 'startsAt', 'state', 'stimpies', 'story', 'teaserImage', 'teaserVideo', 'unitsRemaining'];
const T0 = new Date('2026-10-14T10:00:00Z');
const at = (min: number): Date => new Date(T0.getTime() + min * 60_000);

describe('GET /drops', () => {
  it('splits drops into live, upcoming (soonest first) and archive (newest first), with exact keys and 10 s cache', async () => {
    freezeTime(T0);
    const live = await createDrop(t.prisma, { slug: 'live', name: 'Live', startsAt: at(-60) });
    await createStimpie(t.prisma, { slug: 'live-1', dropId: live.id, quantity: 30 });
    const up2 = await createDrop(t.prisma, { slug: 'up-2', startsAt: at(2 * 24 * 60), accentColor: 'LILAC' });
    const up1 = await createDrop(t.prisma, { slug: 'up-1', startsAt: at(24 * 60), accentColor: 'SKY' });
    await createStimpie(t.prisma, { slug: 'up-1-a', dropId: up1.id });
    const sold = await createDrop(t.prisma, { slug: 'sold', startsAt: at(-3 * 24 * 60) });
    await createStimpie(t.prisma, { slug: 'sold-a', dropId: sold.id, quantity: 5, reserved: 5 });
    const old = await createDrop(t.prisma, { slug: 'old', startsAt: at(-10 * 24 * 60), endsAt: at(-9 * 24 * 60) });
    await createStimpie(t.prisma, { slug: 'old-a', dropId: old.id, quantity: 5 });
    const early = await createDrop(t.prisma, { slug: 'early', startsAt: at(-6 * 24 * 60), endedAt: at(-5 * 24 * 60) });
    await createStimpie(t.prisma, { slug: 'early-a', dropId: early.id, quantity: 5 });

    const res = await t.client.get('/drops');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=10');
    const body = res.json<Overview>();
    expect(Object.keys(body).sort()).toEqual(['archive', 'live', 'upcoming']);
    expect(body.live!.slug).toBe('live');
    expect(Object.keys(body.live!).sort()).toEqual(DROP_KEYS);
    expect(body.upcoming.map((d) => d.slug)).toEqual(['up-1', 'up-2']);
    expect(body.archive.map((d) => d.slug)).toEqual(['sold', 'early', 'old']);
    expect(body.archive.map((d) => d.state)).toEqual(['SOLD_OUT', 'ENDED', 'ENDED']);
    expect(body.upcoming.map((d) => d.state)).toEqual(['UPCOMING', 'UPCOMING']);
    expect(up2.id).toBeGreaterThan(0);
  });

  it('empty database: live null, empty lists', async () => {
    const res = await t.client.get('/drops');
    expect(res.json()).toEqual({ live: null, upcoming: [], archive: [] });
  });

  it('live is the most recently started LIVE drop when two overlap', async () => {
    freezeTime(T0);
    const a = await createDrop(t.prisma, { slug: 'a', startsAt: at(-120) });
    const b = await createDrop(t.prisma, { slug: 'b', startsAt: at(-10) });
    await createStimpie(t.prisma, { dropId: a.id });
    await createStimpie(t.prisma, { dropId: b.id });
    const body = (await t.client.get('/drops')).json<Overview>();
    expect(body.live!.slug).toBe('b');
    expect(body.upcoming).toEqual([]);
    expect(body.archive).toEqual([]);
  });

  it('a drop moves between lists as the (fake) clock advances: UPCOMING -> LIVE -> ENDED', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'moving', startsAt: at(10), endsAt: at(20) });
    await createStimpie(t.prisma, { dropId: d.id, quantity: 12 });
    const get = async () => (await t.client.get('/drops')).json<Overview>();
    let o = await get();
    expect([o.live, o.upcoming.length, o.archive.length]).toEqual([null, 1, 0]);
    advanceTime(10 * 60_000);
    o = await get();
    expect([o.live?.slug, o.upcoming.length, o.archive.length]).toEqual(['moving', 0, 0]);
    advanceTime(10 * 60_000);
    o = await get();
    expect([o.live, o.upcoming.length, o.archive.map((x) => x.slug)]).toEqual([null, 0, ['moving']]);
  });
});

describe('GET /drops/:slug (state x stock matrix)', () => {
  type Row = { name: string; start: number; endsAt?: number | null; endedAt?: number; stock: { q: number; r?: number; active?: boolean }[]; state: string; units: number | null };
  const rows: Row[] = [
    { name: 'upcoming, stocked', start: 30, stock: [{ q: 10 }], state: 'UPCOMING', units: null },
    { name: 'live, stocked', start: -30, stock: [{ q: 10, r: 2 }, { q: 4, r: 4 }], state: 'LIVE', units: 8 },
    { name: 'live, last unit', start: -30, stock: [{ q: 3, r: 2 }], state: 'LIVE', units: 1 },
    { name: 'live, inactive Stimpie does not count', start: -30, stock: [{ q: 10, r: 10 }, { q: 50, active: false }], state: 'SOLD_OUT', units: null },
    { name: 'sold out', start: -30, stock: [{ q: 5, r: 5 }, { q: 1, r: 1 }], state: 'SOLD_OUT', units: null },
    { name: 'ended by date', start: -90, endsAt: -1, stock: [{ q: 10 }], state: 'ENDED', units: null },
    { name: 'ended early', start: -90, endedAt: -1, stock: [{ q: 10 }], state: 'ENDED', units: null },
    { name: 'live with a planned end in the future', start: -90, endsAt: 60, stock: [{ q: 10 }], state: 'LIVE', units: 10 },
    { name: 'ended and sold out is ENDED', start: -90, endedAt: -1, stock: [{ q: 2, r: 2 }], state: 'ENDED', units: null },
  ];
  for (const [i, r] of rows.entries()) {
    it(`${r.name} -> ${r.state}`, async () => {
      freezeTime(T0);
      const d = await createDrop(t.prisma, {
        slug: `d${i}`, startsAt: at(r.start), endsAt: r.endsAt === undefined || r.endsAt === null ? null : at(r.endsAt), endedAt: r.endedAt === undefined ? null : at(r.endedAt),
      });
      for (const [j, s] of r.stock.entries()) await createStimpie(t.prisma, { slug: `d${i}-s${j}`, dropId: d.id, quantity: s.q, reserved: s.r ?? 0, active: s.active ?? true });
      const res = await t.client.get(`/drops/d${i}`);
      expect(res.status).toBe(200);
      const body = res.json<PDrop>();
      expect(Object.keys(body).sort()).toEqual(DROP_KEYS);
      expect(body.state).toBe(r.state);
      expect(body.unitsRemaining).toBe(r.units);
      expect(body.stimpies.every((s) => !r.stock.some((x) => x.active === false) || s.slug !== `d${i}-s1`)).toBe(true); // hidden ones are not listed
    });
  }

  it('returns the drop with brand accent hex, teaser media and its active Stimpies (status per Stimpie), hiding exact stock above the threshold', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'full', accentColor: 'LILAC', startsAt: at(-5), endsAt: at(500) });
    await t.prisma.drop.update({ where: { id: d.id }, data: { teaserImage: 'http://x/t.webp', teaserVideo: 'http://x/t.mp4', story: 'Once' } });
    await createStimpie(t.prisma, { slug: 'plenty', dropId: d.id, quantity: 100 });
    await createStimpie(t.prisma, { slug: 'few', dropId: d.id, quantity: 9 });
    await createStimpie(t.prisma, { slug: 'none', dropId: d.id, quantity: 3, reserved: 3 });
    await createStimpie(t.prisma, { slug: 'hidden', dropId: d.id, quantity: 3, active: false });
    const res = await t.client.get('/drops/full');
    expect(res.header('cache-control')).toBe('public, max-age=10');
    const b = res.json<PDrop>();
    expect(b).toMatchObject({ accentColor: 'LILAC', accentHex: '#C9B6FF', teaserImage: 'http://x/t.webp', teaserVideo: 'http://x/t.mp4', story: 'Once', endsAt: at(500).toISOString(), state: 'LIVE' });
    expect(b.stimpies.map((s) => [s.slug, s.status, s.remaining, s.purchasable])).toEqual([
      ['plenty', 'AVAILABLE', null, true],
      ['few', 'LOW', 9, true],
      ['none', 'SOLD_OUT', null, false],
    ]);
    expect(b.unitsRemaining).toBe(109);
    expect(res.body).not.toContain('costCents');
    expect(b.stimpies.every((s) => s.drop?.id === d.id)).toBe(true);
  });

  it('upcoming drops expose their Stimpies as UPCOMING (not purchasable)', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'soon', startsAt: at(60) });
    await createStimpie(t.prisma, { slug: 'soon-1', dropId: d.id });
    const b = (await t.client.get('/drops/soon')).json<PDrop>();
    expect(b.stimpies.map((s) => [s.status, s.purchasable])).toEqual([['UPCOMING', false]]);
  });

  it('404 for an unknown slug', async () => {
    const res = await t.client.get('/drops/nope');
    expect(res.status).toBe(404);
    expect(res.json<Err>().error.code).toBe('NOT_FOUND');
  });
});

describe('drop cache rules', () => {
  it('max-age=10 normally; no-store while any drop starts within the next 60 seconds; back to max-age=10 afterwards', async () => {
    freezeTime(T0);
    const d = await createDrop(t.prisma, { slug: 'dd', startsAt: at(5) });
    await createDrop(t.prisma, { slug: 'other', startsAt: at(-100) });
    const cc = async (path: string) => (await t.client.get(path)).header('cache-control');
    expect(await cc('/drops')).toBe('public, max-age=10');
    advanceTime(4 * 60_000); // 60 s before the start
    expect(await cc('/drops')).toBe('no-store');
    expect(await cc('/drops/other')).toBe('no-store'); // "any drop" starts soon
    expect(await cc('/drops/dd')).toBe('no-store');
    advanceTime(59_000);
    expect(await cc('/drops')).toBe('no-store');
    advanceTime(1_000); // exactly at the start: it has started
    expect(await cc('/drops')).toBe('public, max-age=10');
    expect(d.id).toBeGreaterThan(0);
  });

  it('61 s before the start is still cacheable; an ended drop with a future start does not trigger no-store', async () => {
    freezeTime(T0);
    await createDrop(t.prisma, { slug: 'x', startsAt: at(1) }); // 60 s away
    expect((await t.client.get('/drops')).header('cache-control')).toBe('no-store');
    await t.prisma.drop.deleteMany({});
    await createDrop(t.prisma, { slug: 'y', startsAt: new Date(T0.getTime() + 61_000) });
    expect((await t.client.get('/drops')).header('cache-control')).toBe('public, max-age=10');
    await t.prisma.drop.deleteMany({});
    await createDrop(t.prisma, { slug: 'z', startsAt: at(1), endedAt: at(-1) });
    expect((await t.client.get('/drops')).header('cache-control')).toBe('public, max-age=10');
  });

  it('other public GETs keep their 30 s cache', async () => {
    await buildWorld(t.prisma);
    expect((await t.client.get('/packs')).header('cache-control')).toBe('public, max-age=30');
  });
});

describe('POST /drops/:id/subscribe', () => {
  const sub = (id: number, body: unknown, ip?: string) => t.client.post(`/drops/${id}/subscribe`, body, ip ? { ip } : undefined);

  it('stores an e-mail subscriber and answers 204 with no body; subscribing again is not an error and stores nothing new', async () => {
    const d = await createDrop(t.prisma);
    const first = await sub(d.id, { contact: 'Fan@Example.com', type: 'EMAIL' });
    expect(first.status).toBe(204);
    expect(first.body).toBe('');
    const again = await sub(d.id, { contact: 'fan@example.com', type: 'EMAIL' });
    expect(again.status).toBe(204);
    const rows = await t.prisma.subscriber.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contact: 'Fan@Example.com', type: 'EMAIL', dropId: d.id });
  });

  it('normalises WhatsApp numbers (03 123 456, +961 3 123 456, 03123456 are one subscriber)', async () => {
    const d = await createDrop(t.prisma);
    for (const c of ['03 123 456', '+961 3 123 456', '03123456', '00961-3-123-456']) expect((await sub(d.id, { contact: c, type: 'WHATSAPP' })).status).toBe(204);
    const rows = await t.prisma.subscriber.findMany();
    expect(rows.map((r) => r.contact)).toEqual(['+9613123456']);
    expect(rows[0]!.type).toBe('WHATSAPP');
  });

  it('the same contact may follow different drops; concurrent duplicates are stored once', async () => {
    const a = await createDrop(t.prisma);
    const b = await createDrop(t.prisma);
    await sub(a.id, { contact: 'x@y.com', type: 'EMAIL' });
    await sub(b.id, { contact: 'x@y.com', type: 'EMAIL' });
    expect(await t.prisma.subscriber.count()).toBe(2);
    const results = await Promise.all(Array.from({ length: 6 }, () => sub(a.id, { contact: 'race@y.com', type: 'EMAIL' })));
    expect(results.map((r) => ({ status: r.status, body: r.body }))).toEqual(Array.from({ length: 6 }, () => ({ status: 204, body: '' })));
    expect(await t.prisma.subscriber.count({ where: { contact: 'race@y.com' } })).toBe(1);
  });

  it('VALIDATION_ERROR on fields.contact for a bad e-mail or a bad Lebanese number', async () => {
    const d = await createDrop(t.prisma);
    const e = await sub(d.id, { contact: 'not-an-email', type: 'EMAIL' });
    expect(e.status).toBe(400);
    expect(e.json<Err>().error.fields).toEqual({ contact: expect.any(String) });
    for (const c of ['12345', 'abc', '+44 7911 123456', '0 123 456', '03 123 45678901']) {
      const r = await sub(d.id, { contact: c, type: 'WHATSAPP' });
      expect(r.status, c).toBe(400);
      expect(Object.keys(r.json<Err>().error.fields!)).toEqual(['contact']);
    }
    // a phone number is not an e-mail and vice versa
    expect((await sub(d.id, { contact: '03 123 456', type: 'EMAIL' })).status).toBe(400);
    expect((await sub(d.id, { contact: 'a@b.co', type: 'WHATSAPP' })).status).toBe(400);
    expect(await t.prisma.subscriber.count()).toBe(0);
  });

  it('rejects missing/unknown fields and a bad type; 404 for an unknown drop', async () => {
    const d = await createDrop(t.prisma);
    const bad = await sub(d.id, { type: 'SMS', extra: 1 });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['contact', 'extra', 'type']);
    expect((await sub(999999, { contact: 'a@b.co', type: 'EMAIL' })).status).toBe(404);
    expect((await t.client.post('/drops/abc/subscribe', { contact: 'a@b.co', type: 'EMAIL' })).status).toBe(400);
  });

  it('is rate limited to 10 per hour per IP with 429, Retry-After and details.retryAfterSeconds; other IPs and the next hour are free', async () => {
    freezeTime(T0);
    rateLimiter.clear();
    const d = await createDrop(t.prisma);
    for (let i = 0; i < 10; i++) expect((await sub(d.id, { contact: `u${i}@y.com`, type: 'EMAIL' }, '10.0.0.9')).status).toBe(204);
    const limited = await sub(d.id, { contact: 'u11@y.com', type: 'EMAIL' }, '10.0.0.9');
    expect(limited.status).toBe(429);
    expect(limited.json<Err>().error.code).toBe('RATE_LIMITED');
    expect(limited.json<Err>().error.details!.retryAfterSeconds).toBe(3600);
    expect(limited.header('retry-after')).toBe('3600');
    expect((await sub(d.id, { contact: 'other@y.com', type: 'EMAIL' }, '10.0.0.10')).status).toBe(204);
    advanceTime(3600_000 + 1);
    expect((await sub(d.id, { contact: 'later@y.com', type: 'EMAIL' }, '10.0.0.9')).status).toBe(204);
  });

  it('works for an upcoming, live and ended drop alike', async () => {
    freezeTime(T0);
    const ids = [await createDrop(t.prisma, { startsAt: at(60) }), await createDrop(t.prisma, { startsAt: at(-60) }), await createDrop(t.prisma, { startsAt: at(-60), endedAt: at(-1) })];
    for (const d of ids) expect((await sub(d.id, { contact: 'all@y.com', type: 'EMAIL' })).status).toBe(204);
    expect(await t.prisma.subscriber.count()).toBe(3);
  });
});
