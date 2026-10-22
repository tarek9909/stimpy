import { describe, expect, it } from 'vitest';
import { useTestApp, type TestClient } from './helpers/app';
import { buildWorld, createDrop } from './helpers/fixtures';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: unknown } };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
type Faq = { id: number; question: string; answer: string; group: string | null; showOnHome: boolean; position: number };
type Review = { id: number; name: string; text: string; mediaUrl: string | null; visible: boolean };
type Content = {
  business: Record<string, unknown>; announcement: { text: string; linkUrl: string | null } | null;
  homepage: Record<string, unknown>; policies: Record<string, string>; about: string;
  howItWorks: { steps: { title: string; text: string; mediaUrl: string | null }[]; promises: string[]; faqs: { question: string; answer: string }[] };
  faqs: Page<{ id: number; question: string; answer: string; group: string | null; showOnHome: boolean }>;
  reviews: Page<{ id: number; name: string; text: string; mediaUrl: string | null }>;
};

const admin = async (): Promise<TestClient> => (await t.adminClient()).client;
const IMG = 'http://localhost:4000/uploads/2026/10/aaaaaaaaaaaaaaaa.webp';

describe('GET /content (public)', () => {
  it('has exactly the documented shape and a 30 s cache, with defaults on an empty database', async () => {
    const res = await t.client.get('/content');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const c = res.json<Content>();
    expect(Object.keys(c).sort()).toEqual(['about', 'announcement', 'business', 'faqs', 'homepage', 'howItWorks', 'policies', 'reviews']);
    expect(Object.keys(c.business).sort()).toEqual(['instagramUrl', 'name', 'supportEmail', 'timezone', 'whatsappNumber']);
    expect(c.business).toMatchObject({ name: 'Stimpy', timezone: 'Asia/Beirut', whatsappNumber: null, instagramUrl: null });
    expect(c.announcement).toBeNull();
    expect(Object.keys(c.homepage).sort()).toEqual(['featuredDropSlug', 'featuredStimpieSlug', 'heroHeadline', 'heroImageUrl', 'heroSubheadline', 'heroVideoUrl', 'showDropSections']);
    expect(Object.keys(c.policies).sort()).toEqual(['care', 'deliveryReturns', 'privacy', 'terms']);
    expect(c.about).toBe('');
    expect(c.howItWorks).toEqual({ steps: [], promises: [], faqs: [] });
    expect(c.faqs).toMatchObject({ items: [], page: 1, pageSize: 25, total: 0 });
    expect(c.reviews).toMatchObject({ items: [], page: 1, pageSize: 25, total: 0 });
  });

  it('reflects what the owner saved: business settings, announcement, homepage, policies, about, how-it-works, FAQs, visible reviews', async () => {
    const c = await admin();
    await t.ctx.settings.update({ business: { whatsappNumber: '03 123 456', instagramUrl: 'https://instagram.com/stimpy', timezone: 'Europe/Paris' } });
    expect((await c.put('/admin/content/announcement', { enabled: true, text: 'Drop 002 is coming', linkUrl: '/drops' })).status).toBe(200);
    expect((await c.put('/admin/content/homepage', { heroHeadline: 'Hello', heroSubheadline: 'World', heroImageUrl: IMG })).status).toBe(200);
    expect((await c.put('/admin/content/policies', { deliveryReturns: 'D\n\n**bold**', care: 'C', terms: 'T', privacy: 'P' })).status).toBe(200);
    expect((await c.put('/admin/content/about', { about: 'About us' })).status).toBe(200);
    expect((await c.put('/admin/content/how-it-works', { steps: [{ title: 'One', text: 'First', mediaUrl: IMG }], promises: ['Tested zips'], faqs: [{ question: 'Q?', answer: 'A.' }] })).status).toBe(200);
    await c.post('/admin/faqs', { question: 'Second', answer: 'b', group: 'Sizing', showOnHome: true });
    await c.post('/admin/reviews', { name: 'Rami', text: 'Love it', mediaUrl: IMG });
    await c.post('/admin/reviews', { name: 'Hidden', text: 'nope', visible: false });

    const out = (await t.client.get('/content')).json<Content>();
    expect(out.business).toEqual({ name: 'Stimpy', whatsappNumber: '+9613123456', supportEmail: 'info@stimpylb.com', instagramUrl: 'https://instagram.com/stimpy', timezone: 'Europe/Paris' });
    expect(out.announcement).toEqual({ text: 'Drop 002 is coming', linkUrl: '/drops' });
    expect(out.homepage).toEqual({ heroHeadline: 'Hello', heroSubheadline: 'World', heroVideoUrl: null, heroImageUrl: IMG, featuredDropSlug: null, featuredStimpieSlug: null, showDropSections: true });
    expect(out.policies).toEqual({ deliveryReturns: 'D\n\n**bold**', care: 'C', terms: 'T', privacy: 'P' });
    expect(out.about).toBe('About us');
    expect(out.howItWorks).toEqual({ steps: [{ title: 'One', text: 'First', mediaUrl: IMG }], promises: ['Tested zips'], faqs: [{ question: 'Q?', answer: 'A.' }] });
    expect(out.faqs.items).toEqual([expect.objectContaining({ question: 'Second', group: 'Sizing', showOnHome: true })]);
    expect(Object.keys(out.faqs.items[0]!).sort()).toEqual(['answer', 'group', 'id', 'question', 'showOnHome']);
    expect(out.reviews.items).toHaveLength(1);
    expect(Object.keys(out.reviews.items[0]!).sort()).toEqual(['id', 'mediaUrl', 'name', 'text']);
    expect(out.reviews.items[0]).toMatchObject({ name: 'Rami', mediaUrl: IMG });
  });

  it('announcement is null when switched off or when its text is blank, even if text is stored', async () => {
    const c = await admin();
    await c.put('/admin/content/announcement', { enabled: false, text: 'Stored but off', linkUrl: null });
    expect((await t.client.get('/content')).json<Content>().announcement).toBeNull();
    await t.prisma.contentBlock.update({ where: { key: 'announcement' }, data: { value: { enabled: true, text: '   ', linkUrl: null } } });
    expect((await t.client.get('/content')).json<Content>().announcement).toBeNull();
  });

  it('tolerates malformed stored JSON by falling back to defaults', async () => {
    await t.prisma.contentBlock.create({ data: { key: 'policies', value: ['not', 'an', 'object'] } });
    await t.prisma.contentBlock.create({ data: { key: 'how_it_works', value: { steps: 'nope', promises: [1, 'ok'], faqs: [{ question: 5 }] } } });
    const out = (await t.client.get('/content')).json<Content>();
    expect(out.policies).toEqual({ deliveryReturns: '', care: '', terms: '', privacy: '' });
    expect(out.howItWorks).toEqual({ steps: [], promises: ['ok'], faqs: [{ question: '', answer: '' }] });
  });

  it('FAQs come back in the saved order', async () => {
    const c = await admin();
    const ids: number[] = [];
    for (const q of ['A', 'B', 'C']) ids.push((await c.post('/admin/faqs', { question: q, answer: 'x' })).json<Faq>().id);
    await c.put('/admin/faqs/order', { ids: [ids[2]!, ids[0]!, ids[1]!] });
    expect((await t.client.get('/content')).json<Content>().faqs.items.map((f) => f.question)).toEqual(['C', 'A', 'B']);
  });
});

describe('GET/PUT /admin/content/:key', () => {
  it('401 without a session', async () => {
    expect((await t.client.get('/admin/content/about')).status).toBe(401);
    expect((await t.client.put('/admin/content/about', { about: 'x' })).status).toBe(401);
  });

  it('GET returns defaults for every key on an empty database', async () => {
    const c = await admin();
    const get = async (k: string) => (await c.get(`/admin/content/${k}`)).json<Record<string, unknown>>();
    expect(await get('announcement')).toEqual({ enabled: false, text: '', linkUrl: null });
    expect(await get('homepage')).toEqual({ heroHeadline: '', heroSubheadline: '', heroVideoUrl: null, heroImageUrl: null, featuredDropSlug: null, featuredStimpieSlug: null, showDropSections: true });
    expect(await get('policies')).toEqual({ deliveryReturns: '', care: '', terms: '', privacy: '' });
    expect(await get('about')).toEqual({ about: '' });
    expect(await get('how-it-works')).toEqual({ steps: [], promises: [], faqs: [] });
  });

  it('PUT announcement: stores enabled even when off (admin keeps the text), validates text and link', async () => {
    const c = await admin();
    const off = await c.put('/admin/content/announcement', { enabled: false, text: 'Draft', linkUrl: 'https://example.com/x' });
    expect(off.json()).toEqual({ enabled: false, text: 'Draft', linkUrl: 'https://example.com/x' });
    expect((await c.get('/admin/content/announcement')).json()).toEqual({ enabled: false, text: 'Draft', linkUrl: 'https://example.com/x' });

    const noText = await c.put('/admin/content/announcement', { enabled: true, text: '  ' });
    expect(noText.status).toBe(400);
    expect(Object.keys(noText.json<Err>().error.fields!)).toEqual(['text']);
    const long = await c.put('/admin/content/announcement', { enabled: true, text: 'x'.repeat(121) });
    expect(Object.keys(long.json<Err>().error.fields!)).toEqual(['text']);
    expect((await c.put('/admin/content/announcement', { enabled: true, text: 'x'.repeat(120) })).status).toBe(200);
    expect((await c.put('/admin/content/announcement', { text: 'x' })).json<Err>().error.fields).toEqual({ enabled: expect.any(String) });

    for (const bad of ['javascript:alert(1)', 'http://insecure.example', '//evil.example', 'data:text/html,hi', 'shop', 'https://', 'https://a b.com', 'ftp://x.com']) {
      const r = await c.put('/admin/content/announcement', { enabled: true, text: 'Hi', linkUrl: bad });
      expect(r.status, bad).toBe(400);
      expect(Object.keys(r.json<Err>().error.fields!)).toEqual(['linkUrl']);
    }
    for (const good of ['/shop', '/drops/drop-002?x=1', 'https://example.com', 'https://example.com/a?b=c#d']) {
      expect((await c.put('/admin/content/announcement', { enabled: true, text: 'Hi', linkUrl: good })).status, good).toBe(200);
    }
    const unknown = await c.put('/admin/content/announcement', { enabled: true, text: 'Hi', color: 'red' });
    expect(unknown.json<Err>().error.fields).toEqual({ color: 'Unknown field.' });
  });

  it('PUT homepage: required headline (<= 80), media URLs, featured drop must exist', async () => {
    const c = await admin();
    await createDrop(t.prisma, { slug: 'drop-009' });
    const ok = await c.put('/admin/content/homepage', { heroHeadline: 'H', heroSubheadline: 'S', heroVideoUrl: 'http://localhost:4000/uploads/v.mp4', heroImageUrl: IMG, featuredDropSlug: 'drop-009' });
    expect(ok.status).toBe(200);
    expect(ok.json()).toEqual({ heroHeadline: 'H', heroSubheadline: 'S', heroVideoUrl: 'http://localhost:4000/uploads/v.mp4', heroImageUrl: IMG, featuredDropSlug: 'drop-009', featuredStimpieSlug: null, showDropSections: true });
    expect((await c.get('/admin/content/homepage')).json()).toMatchObject({ featuredDropSlug: 'drop-009' });
    const bad = await c.put('/admin/content/homepage', { heroHeadline: 'x'.repeat(81), heroVideoUrl: 'javascript:1', heroImageUrl: 'not a url', featuredDropSlug: 'Bad Slug' });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['featuredDropSlug', 'heroHeadline', 'heroImageUrl', 'heroVideoUrl']);
    expect((await c.put('/admin/content/homepage', { heroHeadline: '' })).status).toBe(400);
    const missing = await c.put('/admin/content/homepage', { heroHeadline: 'H', featuredDropSlug: 'no-such-drop' });
    expect(missing.json<Err>().error.fields).toEqual({ featuredDropSlug: expect.any(String) });
    const cleared = await c.put('/admin/content/homepage', { heroHeadline: 'H' }); // optional fields reset to null / ''
    expect(cleared.json()).toEqual({ heroHeadline: 'H', heroSubheadline: '', heroVideoUrl: null, heroImageUrl: null, featuredDropSlug: null, featuredStimpieSlug: null, showDropSections: true });
  });

  it('PUT policies: four texts up to 20000 characters each; all four are required; the how-to-measure text is not part of it', async () => {
    const c = await admin();
    const big = 'x'.repeat(20_000);
    expect((await c.put('/admin/content/policies', { deliveryReturns: big, care: '', terms: 'T', privacy: 'P' })).status).toBe(200);
    const over = await c.put('/admin/content/policies', { deliveryReturns: big + 'x', care: '', terms: 'T', privacy: 'P' });
    expect(over.json<Err>().error.fields).toEqual({ deliveryReturns: expect.any(String) });
    expect(Object.keys((await c.put('/admin/content/policies', { care: 'c' })).json<Err>().error.fields!).sort()).toEqual(['deliveryReturns', 'privacy', 'terms']);
    const howTo = await c.put('/admin/content/policies', { deliveryReturns: '', care: '', terms: '', privacy: '', howToMeasure: 'x' });
    expect(howTo.json<Err>().error.fields).toEqual({ howToMeasure: 'Unknown field.' });
  });

  it('PUT about accepts { about } (and the stored shape { text }) and limits it to 20000 characters', async () => {
    const c = await admin();
    expect((await c.put('/admin/content/about', { about: 'Story' })).json()).toEqual({ about: 'Story' });
    expect((await c.put('/admin/content/about', { text: 'Other' })).json()).toEqual({ about: 'Other' });
    expect((await c.put('/admin/content/about', { about: 'x'.repeat(20_001) })).status).toBe(400);
    expect((await c.put('/admin/content/about', {})).status).toBe(400);
    expect((await c.put('/admin/content/about', { about: 'a', text: 'b' })).status).toBe(400);
  });

  it('PUT how-it-works: steps, promises and FAQs with nested field paths; wrapped form accepted', async () => {
    const c = await admin();
    const body = { steps: [{ title: 'Pick', text: 'A colour' }, { title: 'Zip', text: '', mediaUrl: IMG }], promises: ['Strong zips'], faqs: [{ question: 'Q', answer: 'A' }] };
    const ok = await c.put('/admin/content/how-it-works', body);
    expect(ok.status).toBe(200);
    expect(ok.json()).toEqual({ steps: [{ title: 'Pick', text: 'A colour', mediaUrl: null }, { title: 'Zip', text: '', mediaUrl: IMG }], promises: ['Strong zips'], faqs: [{ question: 'Q', answer: 'A' }] });
    expect((await c.put('/admin/content/how-it-works', { howItWorks: { steps: [], promises: ['Only'], faqs: [] } })).json()).toEqual({ steps: [], promises: ['Only'], faqs: [] });
    const bad = await c.put('/admin/content/how-it-works', {
      steps: [{ title: '', text: 'x'.repeat(2001) }, { title: 'ok', mediaUrl: 'javascript:1' }], promises: ['', 'x'.repeat(201)], faqs: [{ question: 'Q' }],
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['faqs.0.answer', 'promises.0', 'promises.1', 'steps.0.text', 'steps.0.title', 'steps.1.mediaUrl']);
    expect((await c.put('/admin/content/how-it-works', { steps: Array.from({ length: 21 }, () => ({ title: 'x' })) })).json<Err>().error.fields).toEqual({ steps: expect.any(String) });
  });

  it('an unknown key is a 400 on key; a non-object body is rejected', async () => {
    const c = await admin();
    const r = await c.get('/admin/content/nope');
    expect(r.status).toBe(400);
    expect(r.json<Err>().error.fields).toHaveProperty('key');
    expect((await c.put('/admin/content/nope', {})).status).toBe(400);
    expect((await c.put('/admin/content/about', [1, 2])).status).toBe(400);
    expect((await c.put('/admin/content/about')).status).toBe(400);
  });

  it('saved changes are live immediately on /content', async () => {
    const c = await admin();
    await c.put('/admin/content/about', { about: 'v1' });
    expect((await t.client.get('/content')).json<Content>().about).toBe('v1');
    await c.put('/admin/content/about', { about: 'v2' });
    expect((await t.client.get('/content')).json<Content>().about).toBe('v2');
  });
});

describe('/admin/faqs', () => {
  it('create appends, list is paged in display order, PATCH edits, DELETE removes', async () => {
    const c = await admin();
    const a = await c.post('/admin/faqs', { question: 'How?', answer: 'Like this.', group: 'Ordering', showOnHome: true });
    expect(a.status).toBe(201);
    expect(Object.keys(a.json<Faq>()).sort()).toEqual(['answer', 'group', 'id', 'position', 'question', 'showOnHome']);
    expect(a.json<Faq>()).toMatchObject({ question: 'How?', group: 'Ordering', showOnHome: true, position: 1 });
    const b = (await c.post('/admin/faqs', { question: 'Why?', answer: 'Because.' })).json<Faq>();
    expect(b).toMatchObject({ group: null, showOnHome: false, position: 2 });

    const list = (await c.get('/admin/faqs')).json<Page<Faq>>();
    expect(list.items.map((f) => f.id)).toEqual([a.json<Faq>().id, b.id]);
    expect(list).toMatchObject({ page: 1, pageSize: 25, total: 2 });
    expect((await c.get('/admin/faqs', { query: { pageSize: 1, page: 2 } })).json<Page<Faq>>().items.map((f) => f.id)).toEqual([b.id]);
    expect((await c.get('/admin/faqs', { query: { group: 'Ordering' } })).json<Page<Faq>>().total).toBe(1);
    expect((await c.get('/admin/faqs', { query: { showOnHome: 'true' } })).json<Page<Faq>>().total).toBe(1);

    const upd = await c.patch(`/admin/faqs/${b.id}`, { answer: 'New answer', group: 'Sizing', showOnHome: true });
    expect(upd.json<Faq>()).toMatchObject({ answer: 'New answer', group: 'Sizing', showOnHome: true, question: 'Why?' });
    expect((await c.patch(`/admin/faqs/${b.id}`, { group: null })).json<Faq>().group).toBeNull();

    expect((await c.delete(`/admin/faqs/${b.id}`)).status).toBe(204);
    expect((await c.delete(`/admin/faqs/${b.id}`)).status).toBe(404);
    expect((await c.patch(`/admin/faqs/${b.id}`, { question: 'x' })).status).toBe(404);
  });

  it('validation: question <= 200, answer <= 2000, required fields, group <= 60, unknown fields', async () => {
    const c = await admin();
    const bad = await c.post('/admin/faqs', { question: 'q'.repeat(201), answer: 'a'.repeat(2001), group: 'g'.repeat(61), extra: 1 });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['answer', 'extra', 'group', 'question']);
    expect(Object.keys((await c.post('/admin/faqs', {})).json<Err>().error.fields!).sort()).toEqual(['answer', 'question']);
    expect((await c.post('/admin/faqs', { question: '   ', answer: 'x' })).status).toBe(400);
    expect((await c.post('/admin/faqs', { question: 'q'.repeat(200), answer: 'a'.repeat(2000) })).status).toBe(201);
  });

  it('PUT /order reorders and validates the full list', async () => {
    const c = await admin();
    const ids: number[] = [];
    for (const q of ['one', 'two', 'three']) ids.push((await c.post('/admin/faqs', { question: q, answer: 'x' })).json<Faq>().id);
    expect((await c.put('/admin/faqs/order', { ids: [ids[1]!, ids[2]!, ids[0]!] })).status).toBe(204);
    expect((await c.get('/admin/faqs')).json<Page<Faq>>().items.map((f) => [f.question, f.position])).toEqual([['two', 1], ['three', 2], ['one', 3]]);
    for (const bad of [[ids[0]!, ids[1]!], [ids[0]!, ids[0]!, ids[1]!], [...ids, 99999], []]) expect((await c.put('/admin/faqs/order', { ids: bad })).status).toBe(400);
    // a new FAQ goes to the end after reordering
    const last = (await c.post('/admin/faqs', { question: 'four', answer: 'x' })).json<Faq>();
    expect(last.position).toBe(4);
  });

  it('is behind the session', async () => {
    expect((await t.client.get('/admin/faqs')).status).toBe(401);
    expect((await t.client.post('/admin/faqs', { question: 'q', answer: 'a' })).status).toBe(401);
  });
});

describe('/admin/reviews', () => {
  it('create / list (newest first, hidden included, ?visible= filter) / patch / delete', async () => {
    const c = await admin();
    const r1 = await c.post('/admin/reviews', { name: 'Rami', text: 'Great swap', mediaUrl: IMG });
    expect(r1.status).toBe(201);
    expect(Object.keys(r1.json<Review>()).sort()).toEqual(['id', 'mediaUrl', 'name', 'text', 'visible']);
    expect(r1.json<Review>()).toMatchObject({ visible: true, mediaUrl: IMG });
    const r2 = (await c.post('/admin/reviews', { name: 'Lina', text: 'Soft', visible: false })).json<Review>();
    expect(r2).toMatchObject({ visible: false, mediaUrl: null });

    const list = (await c.get('/admin/reviews')).json<Page<Review>>();
    expect(list.items.map((r) => r.name)).toEqual(['Lina', 'Rami']);
    expect((await c.get('/admin/reviews', { query: { visible: 'false' } })).json<Page<Review>>().items.map((r) => r.name)).toEqual(['Lina']);
    expect((await c.get('/admin/reviews', { query: { visible: 'true' } })).json<Page<Review>>().total).toBe(1);

    // hide without deleting, show again
    const id = r1.json<Review>().id;
    expect((await c.patch(`/admin/reviews/${id}`, { visible: false })).json<Review>().visible).toBe(false);
    expect((await t.client.get('/content')).json<Content>().reviews.items).toEqual([]);
    expect((await c.patch(`/admin/reviews/${id}`, { visible: true, text: 'Edited', mediaUrl: null })).json<Review>()).toMatchObject({ visible: true, text: 'Edited', mediaUrl: null });
    expect((await t.client.get('/content')).json<Content>().reviews.items.map((r) => r.name)).toEqual(['Rami']);

    expect((await c.delete(`/admin/reviews/${id}`)).status).toBe(204);
    expect((await c.delete(`/admin/reviews/${id}`)).status).toBe(404);
    expect((await c.patch('/admin/reviews/999999', { name: 'x' })).status).toBe(404);
  });

  it('validation: name <= 120, text <= 2000 and required, mediaUrl must be http(s)', async () => {
    const c = await admin();
    const bad = await c.post('/admin/reviews', { name: 'n'.repeat(121), text: 't'.repeat(2001), mediaUrl: 'javascript:alert(1)', visible: 'yes' });
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual(['mediaUrl', 'name', 'text', 'visible']);
    expect(Object.keys((await c.post('/admin/reviews', {})).json<Err>().error.fields!).sort()).toEqual(['name', 'text']);
    expect((await c.post('/admin/reviews', { name: 'x', text: '   ' })).status).toBe(400);
    expect((await c.post('/admin/reviews', { name: 'n'.repeat(120), text: 't'.repeat(2000) })).status).toBe(201);
  });

  it('is behind the session', async () => {
    expect((await t.client.get('/admin/reviews')).status).toBe(401);
    await buildWorld(t.prisma); // keeps the helper import honest
  });
});
