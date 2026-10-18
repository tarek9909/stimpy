import { describe, expect, it } from 'vitest';
import { useTestApp, type TestClient } from './helpers/app';
import { buildWorld, createColor, createHoodie, createSize, setVariantStock } from './helpers/fixtures';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: { field?: string } | null } };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
type Color = { id: number; name: string; hex: string; position: number; active: boolean; images: string[]; builderTint: string | null; builderTexture: string | null; available: number };
type Size = { id: number; label: string; position: number; active: boolean; available: number };

const admin = async (): Promise<TestClient> => (await t.adminClient()).client;

describe('GET /options (public)', () => {
  it('returns only active colours and sizes, ordered by position, with the documented fields', async () => {
    await createColor(t.prisma, { name: 'Zed', position: 2, hex: '#222222' });
    await createColor(t.prisma, { name: 'Alpha', position: 1, hex: '#111111' });
    await createColor(t.prisma, { name: 'Hidden', position: 3, active: false });
    await createSize(t.prisma, { label: 'M', position: 2 });
    await createSize(t.prisma, { label: 'S', position: 1 });
    await createSize(t.prisma, { label: 'XXL', position: 3, active: false });

    const res = await t.client.get('/options');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const body = res.json<{ colors: Color[]; sizes: Size[] }>();
    expect(body.colors.map((c) => c.name)).toEqual(['Alpha', 'Zed']);
    expect(body.sizes.map((s) => s.label)).toEqual(['S', 'M']);
    expect(Object.keys(body.colors[0]!).sort()).toEqual(['active', 'builderTexture', 'builderTint', 'hex', 'id', 'images', 'name', 'position']);
    expect(body.colors[0]).toMatchObject({ builderTint: null, builderTexture: null, images: [] }); // null, never omitted
    expect(res.body).not.toContain('available'); // no stock numbers on public routes
  });
});

describe('GET /size-chart (public)', () => {
  it('returns columns, rows for active sizes with values keyed by column id, and howToMeasure', async () => {
    const admin1 = await admin();
    const s = await createSize(t.prisma, { label: 'S' });
    const m = await createSize(t.prisma, { label: 'M' });
    await createSize(t.prisma, { label: 'XXL', active: false });
    const put = await admin1.put('/admin/size-chart', {
      columns: [{ label: 'Chest', unit: 'cm' }, { label: 'Length', unit: 'cm' }],
      rows: [
        { sizeId: s.id, values: { 'new:0': '52', 'new:1': '66' } },
        { sizeId: m.id, values: { 'new:0': '54-56' } },
      ],
      howToMeasure: 'Lay it flat.\n\n- Chest: armpit to armpit',
    });
    expect(put.status).toBe(200);

    const res = await t.client.get('/size-chart');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const body = res.json<{ columns: { id: number; label: string; unit: string }[]; rows: { sizeId: number; label: string; values: Record<string, string> }[]; howToMeasure: string }>();
    expect(body.columns.map((c) => [c.label, c.unit])).toEqual([['Chest', 'cm'], ['Length', 'cm']]);
    expect(Object.keys(body.columns[0]!)).toEqual(['id', 'label', 'unit']); // no position on the public chart
    expect(body.rows.map((r) => r.label)).toEqual(['S', 'M']); // XXL is inactive
    const [chest, length] = body.columns;
    expect(body.rows[0]!.values).toEqual({ [chest!.id]: '52', [length!.id]: '66' });
    expect(body.rows[1]!.values).toEqual({ [chest!.id]: '54-56', [length!.id]: '-' }); // empty cell -> "-"
    expect(body.howToMeasure).toBe('Lay it flat.\n\n- Chest: armpit to armpit');
  });

  it('is empty but well-formed on a fresh database', async () => {
    expect((await t.client.get('/size-chart')).json()).toEqual({ columns: [], rows: [], howToMeasure: '' });
  });
});

describe('/admin/colors', () => {
  it('create validates, uppercases hex, appends position, returns the colour with stock summary', async () => {
    const c = await admin();
    const bad = await c.post('/admin/colors', { name: '', hex: 'red', extra: 1 });
    expect(bad.status).toBe(400);
    expect(bad.json<Err>().error.fields).toMatchObject({ name: 'This field is required.', hex: expect.any(String), extra: 'Unknown field.' });

    const a = await c.post('/admin/colors', { name: 'Sage', hex: '#a3b18a' });
    expect(a.status).toBe(201);
    expect(a.json<Color>()).toMatchObject({ name: 'Sage', hex: '#A3B18A', active: true, images: [], builderTint: null, builderTexture: null, available: 0, position: 1 });
    expect(a.json()).not.toHaveProperty('reserved');
    const b = await c.post('/admin/colors', { name: 'Ink', hex: '#000000', builderTint: '#0a0a0a', builderTexture: 'http://localhost:4000/uploads/2026/10/fabric.webp', images: ['http://localhost:4000/uploads/a.webp'] });
    expect(b.json<Color>()).toMatchObject({ position: 2, builderTint: '#0A0A0A', builderTexture: 'http://localhost:4000/uploads/2026/10/fabric.webp', images: ['http://localhost:4000/uploads/a.webp'] });
  });

  it('a duplicate name is 409 CONFLICT (case-insensitive) with details.field', async () => {
    const c = await admin();
    await c.post('/admin/colors', { name: 'Sage', hex: '#A3B18A' });
    const dup = await c.post('/admin/colors', { name: 'SAGE', hex: '#000000' });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error).toMatchObject({ code: 'CONFLICT', details: { field: 'name' } });
    const other = (await c.post('/admin/colors', { name: 'Other', hex: '#000000' })).json<Color>();
    const rename = await c.patch(`/admin/colors/${other.id}`, { name: 'sage' });
    expect(rename.status).toBe(409);
  });

  it('a shared colour gets zero-stock variants only when assigned to a specific hoodie and its sizes', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { hoodieStock: 5, withAdmin: false });
    const hidden = await createSize(t.prisma, { label: 'XXS', active: false });
    const second = await createHoodie(t.prisma, { name: 'Second', slug: 'second' });
    const before = await t.prisma.hoodieVariant.count();

    const res = await c.post('/admin/colors', { name: 'Sage', hex: '#A3B18A' });
    const created = res.json<Color>();
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: created.id } })).toBe(0);
    expect(await t.prisma.hoodieVariant.count()).toBe(before);
    const assigned = await c.patch(`/admin/hoodies/${w.hoodie.id}`, {
      colorIds: [w.colors.black.id, w.colors.cream.id, created.id], sizeIds: [w.sizes.s.id, w.sizes.m.id, w.sizes.l.id],
    });
    expect(assigned.status).toBe(200);
    const variants = await t.prisma.hoodieVariant.findMany({ where: { colorId: created.id } });
    expect(variants).toHaveLength(3);
    expect(variants.every((v) => v.quantity === 0 && v.reserved === 0)).toBe(true);
    expect(new Set(variants.map((v) => v.sizeId))).toEqual(new Set([w.sizes.s.id, w.sizes.m.id, w.sizes.l.id]));
    expect(new Set(variants.map((v) => v.hoodieId))).toEqual(new Set([w.hoodie.id]));
    expect(await t.prisma.hoodieVariant.count({ where: { hoodieId: second.id, colorId: created.id } })).toBe(0);
    expect(await t.prisma.hoodieVariant.count()).toBe(before + 3);
    expect(variants[0]!.sku).toMatch(/^HOOD-\d+-C\d+-S\d+$/);
    expect(hidden.active).toBe(false);
  });

  it('activating a colour preserves assignments and requires an explicit hoodie selection for new ones', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { withAdmin: false });
    const created = (await c.post('/admin/colors', { name: 'Later', hex: '#123456', active: false })).json<Color>();
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: created.id } })).toBe(0);
    await c.patch(`/admin/colors/${created.id}`, { active: true });
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: created.id } })).toBe(0);
    expect((await c.patch(`/admin/hoodies/${w.hoodie.id}`, {
      colorIds: [w.colors.black.id, created.id], sizeIds: [w.sizes.s.id, w.sizes.m.id, w.sizes.l.id],
    })).status).toBe(200);
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: created.id } })).toBe(3);
    // hiding keeps the variants
    await c.patch(`/admin/colors/${created.id}`, { active: false });
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: created.id } })).toBe(3);
  });

  it('lists inactive rows with active flag, filters with ?active=, searches with q, sorts, paginates, and shows stock sums', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { hoodieStock: 5, withAdmin: false });
    await createHoodie(t.prisma, { slug: 'hidden-stock', active: false, stock: 100 });
    await t.prisma.color.update({ where: { id: w.colors.cream.id }, data: { active: false } });
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.s.id }, 5, 2);

    const all = (await c.get('/admin/colors')).json<Page<Color>>();
    expect(all.total).toBe(2);
    expect(all.items.map((x) => [x.name, x.active])).toEqual([['Black', true], ['Cream', false]]);
    const black = all.items[0]!;
    expect(black).toMatchObject({ available: 3 * 5 - 2 }); // 3 sizes x 5 units, less 2 open-order holds
    expect(black).not.toHaveProperty('reserved');
    expect(all.items[1]!.available).toBe(0); // a hidden colour contributes no sellable stock

    expect((await c.get('/admin/colors', { query: { active: 'true' } })).json<Page<Color>>().items.map((x) => x.name)).toEqual(['Black']);
    expect((await c.get('/admin/colors', { query: { active: 'false' } })).json<Page<Color>>().items.map((x) => x.name)).toEqual(['Cream']);
    expect((await c.get('/admin/colors', { query: { q: 'crea' } })).json<Page<Color>>().items).toHaveLength(1);
    expect((await c.get('/admin/colors', { query: { sort: '-name' } })).json<Page<Color>>().items.map((x) => x.name)).toEqual(['Cream', 'Black']);
    const p2 = (await c.get('/admin/colors', { query: { page: 2, pageSize: 1 } })).json<Page<Color>>();
    expect(p2).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(p2.items.map((x) => x.name)).toEqual(['Cream']);
    expect((await c.get('/admin/colors', { query: { pageSize: 500 } })).status).toBe(400);
  });

  it('option availability excludes unassigned pairs, hidden sizes and hidden colours', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { hoodieStock: 5, withAdmin: false });
    await setVariantStock(t.prisma, { hoodieId: w.hoodie.id, colorId: w.colors.black.id, sizeId: w.sizes.s.id }, 5, 2);
    await t.prisma.hoodieVariant.updateMany({ where: { colorId: w.colors.black.id, sizeId: w.sizes.m.id }, data: { active: false } });
    await c.patch(`/admin/sizes/${w.sizes.l.id}`, { active: false });
    await c.patch(`/admin/colors/${w.colors.cream.id}`, { active: false });
    expect((await c.get(`/admin/colors/${w.colors.black.id}`)).json<Color>().available).toBe(3);
    expect((await c.get(`/admin/sizes/${w.sizes.s.id}`)).json<Size>().available).toBe(3);
    expect((await c.get(`/admin/sizes/${w.sizes.m.id}`)).json<Size>().available).toBe(0);
    expect((await c.get(`/admin/sizes/${w.sizes.l.id}`)).json<Size>().available).toBe(0);
  });

  it('GET/PATCH /:id, 404 for unknown ids, builderTint/Texture can be cleared', async () => {
    const c = await admin();
    const col = (await c.post('/admin/colors', { name: 'Ink', hex: '#000000', builderTint: '#111111', builderTexture: 'http://localhost:4000/uploads/f.webp' })).json<Color>();
    expect((await c.get(`/admin/colors/${col.id}`)).json<Color>().builderTint).toBe('#111111');
    const patched = await c.patch(`/admin/colors/${col.id}`, { builderTint: null, builderTexture: null, hex: '#ff00aa', images: ['http://localhost:4000/uploads/x.webp'] });
    expect(patched.status).toBe(200);
    expect(patched.json<Color>()).toMatchObject({ builderTint: null, builderTexture: null, hex: '#FF00AA', images: ['http://localhost:4000/uploads/x.webp'] });
    expect((await c.get('/admin/colors/99999')).status).toBe(404);
    expect((await c.patch('/admin/colors/99999', { name: 'x' })).status).toBe(404);
    expect((await c.get('/admin/colors/abc')).status).toBe(400);
  });

  it('reorders with PUT /admin/colors/order (204) and rejects incomplete, duplicate or unknown id lists', async () => {
    const c = await admin();
    const ids = [] as number[];
    for (const n of ['A', 'B', 'C']) ids.push((await c.post('/admin/colors', { name: n, hex: '#000000' })).json<Color>().id);
    const ok = await c.put('/admin/colors/order', { ids: [ids[2], ids[0], ids[1]] });
    expect(ok.status).toBe(204);
    expect((await c.get('/admin/colors')).json<Page<Color>>().items.map((x) => x.name)).toEqual(['C', 'A', 'B']);
    expect((await c.put('/admin/colors/order', { ids: [ids[0], ids[1]] })).status).toBe(400); // missing one
    expect((await c.put('/admin/colors/order', { ids: [ids[0], ids[0], ids[1]] })).status).toBe(400); // duplicate
    expect((await c.put('/admin/colors/order', { ids: [ids[0], ids[1], 99999] })).json<Err>().error.fields).toHaveProperty('ids');
    expect((await c.get('/admin/colors')).json<Page<Color>>().items.map((x) => x.name)).toEqual(['C', 'A', 'B']); // unchanged
  });

  it('DELETE removes an unused colour with its variants, and is 409 CONFLICT when orders used it', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { withAdmin: false });
    expect((await c.delete(`/admin/colors/${w.colors.cream.id}`)).status).toBe(204);
    expect(await t.prisma.hoodieVariant.count({ where: { colorId: w.colors.cream.id } })).toBe(0);
    expect(await t.prisma.color.count({ where: { id: w.colors.cream.id } })).toBe(0);

    // an order line pointing at a Black variant makes Black undeletable
    const variant = await t.prisma.hoodieVariant.findFirstOrThrow({ where: { colorId: w.colors.black.id } });
    const customer = await t.prisma.customer.create({ data: { phone: '+9613123456', whatsapp: '+9613123456', name: 'R' } });
    const order = await t.prisma.order.create({
      data: { number: 'STP-1', customerId: customer.id, status: 'NEW', source: 'WEBSITE', customerName: 'R', contactPhone: '+9613123456', contactWhatsapp: '+9613123456', areaName: 'x', address: 'x', subtotalCents: 1, deliveryFeeCents: 0, totalCents: 1, costCents: 1 },
    });
    const item = await t.prisma.orderItem.create({ data: { orderId: order.id, kind: 'HOODIE', name: 'h', qty: 1, unitPriceCents: 1, unitCostCents: 1, detail: {} } });
    await t.prisma.orderStockLine.create({ data: { orderId: order.id, orderItemId: item.id, itemType: 'HOODIE_VARIANT', variantId: variant.id, qty: 1 } });
    const refused = await c.delete(`/admin/colors/${w.colors.black.id}`);
    expect(refused.status).toBe(409);
    expect(refused.json<Err>().error.code).toBe('CONFLICT');
    expect(await t.prisma.color.count({ where: { id: w.colors.black.id } })).toBe(1);
    // hiding is the alternative
    expect((await c.patch(`/admin/colors/${w.colors.black.id}`, { active: false })).json<Color>().active).toBe(false);
    expect((await c.delete('/admin/colors/99999')).status).toBe(404);
  });
});

describe('/admin/sizes', () => {
  it('create, duplicate label conflict, validation', async () => {
    const c = await admin();
    const a = await c.post('/admin/sizes', { label: 'M' });
    expect(a.status).toBe(201);
    expect(a.json<Size>()).toMatchObject({ label: 'M', active: true, position: 1, available: 0 });
    expect(a.json()).not.toHaveProperty('reserved');
    const dup = await c.post('/admin/sizes', { label: 'm' });
    expect(dup.status).toBe(409);
    expect(dup.json<Err>().error.details).toEqual({ field: 'label' });
    const bad = await c.post('/admin/sizes', { label: 'x'.repeat(21) });
    expect(bad.status).toBe(400);
    expect(bad.json<Err>().error.fields).toHaveProperty('label');
  });

  it('a shared size gets zero-stock variants only on the hoodie where it is selected', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { withAdmin: false });
    const second = await createHoodie(t.prisma, { slug: 'other-size-options' });
    await createColor(t.prisma, { name: 'Hidden', active: false });
    const res = (await c.post('/admin/sizes', { label: 'XL' })).json<Size>();
    expect(await t.prisma.hoodieVariant.count({ where: { sizeId: res.id } })).toBe(0);
    expect((await c.patch(`/admin/hoodies/${w.hoodie.id}`, {
      colorIds: [w.colors.black.id, w.colors.cream.id], sizeIds: [w.sizes.s.id, w.sizes.m.id, w.sizes.l.id, res.id],
    })).status).toBe(200);
    const variants = await t.prisma.hoodieVariant.findMany({ where: { sizeId: res.id } });
    expect(variants).toHaveLength(2); // Black, Cream (Hidden skipped)
    expect(variants.every((v) => v.quantity === 0 && v.hoodieId === w.hoodie.id)).toBe(true);
    expect(await t.prisma.hoodieVariant.count({ where: { sizeId: res.id, hoodieId: second.id } })).toBe(0);
  });

  it('lists inactive sizes, filters by active, reorders, patches, deletes', async () => {
    const c = await admin();
    const ids: number[] = [];
    for (const l of ['S', 'M', 'L']) ids.push((await c.post('/admin/sizes', { label: l })).json<Size>().id);
    await c.patch(`/admin/sizes/${ids[1]}`, { active: false });
    expect((await c.get('/admin/sizes')).json<Page<Size>>().items.map((s) => [s.label, s.active])).toEqual([['S', true], ['M', false], ['L', true]]);
    expect((await c.get('/admin/sizes', { query: { active: 'false' } })).json<Page<Size>>().items.map((s) => s.label)).toEqual(['M']);
    expect((await c.put('/admin/sizes/order', { ids: [ids[2], ids[1], ids[0]] })).status).toBe(204);
    expect((await c.get('/admin/sizes')).json<Page<Size>>().items.map((s) => s.label)).toEqual(['L', 'M', 'S']);
    expect((await c.patch(`/admin/sizes/${ids[0]}`, { label: 'XS' })).json<Size>().label).toBe('XS');
    expect((await c.get(`/admin/sizes/${ids[0]}`)).json<Size>().label).toBe('XS');
    expect((await c.delete(`/admin/sizes/${ids[0]}`)).status).toBe(204);
    expect((await c.get(`/admin/sizes/${ids[0]}`)).status).toBe(404);
  });

  it('hiding a size hides its variants publicly (the size disappears from /options) but keeps them', async () => {
    const c = await admin();
    const w = await buildWorld(t.prisma, { withAdmin: false });
    await c.patch(`/admin/sizes/${w.sizes.l.id}`, { active: false });
    expect((await t.client.get('/options')).json<{ sizes: Size[] }>().sizes.map((s) => s.label)).toEqual(['S', 'M']);
    expect(await t.prisma.hoodieVariant.count({ where: { sizeId: w.sizes.l.id } })).toBe(2);
  });
});

describe('/admin/size-chart', () => {
  it('GET returns every size (including hidden) with empty strings for empty cells', async () => {
    const c = await admin();
    const s = await createSize(t.prisma, { label: 'S' });
    await createSize(t.prisma, { label: 'XXL', active: false });
    const chart = (await c.get('/admin/size-chart')).json<{ columns: unknown[]; rows: { sizeId: number; values: Record<string, string> }[]; howToMeasure: string }>();
    expect(chart.rows).toHaveLength(2);
    expect(chart.rows.find((r) => r.sizeId === s.id)!.values).toEqual({});
  });

  it('PUT replaces the whole chart: updates existing columns, creates new ones, drops omitted ones', async () => {
    const c = await admin();
    const s = await createSize(t.prisma, { label: 'S' });
    const m = await createSize(t.prisma, { label: 'M' });
    const first = (await c.put('/admin/size-chart', {
      columns: [{ label: 'Chest', unit: 'cm' }, { label: 'Length', unit: 'cm' }, { label: 'Sleeve', unit: 'cm' }],
      rows: [{ sizeId: s.id, values: { 'new:0': '52', 'new:1': '66', 'new:2': '60' } }, { sizeId: m.id, values: { 'new:0': '54' } }],
      howToMeasure: 'v1',
    })).json<{ columns: { id: number; label: string; position: number }[]; rows: { sizeId: number; values: Record<string, string> }[]; howToMeasure: string }>();
    expect(first.columns.map((x) => x.label)).toEqual(['Chest', 'Length', 'Sleeve']);
    const [chest, length] = first.columns;

    const second = await c.put('/admin/size-chart', {
      columns: [{ id: length!.id, label: 'Body length', unit: 'in' }, { id: chest!.id, label: 'Chest', unit: 'cm' }, { id: 9999, label: 'Hem', unit: 'cm' }],
      rows: [{ sizeId: s.id, values: { [chest!.id]: '53', [length!.id]: '26', 9999: '48' } }],
      howToMeasure: 'v2',
    });
    expect(second.status).toBe(200);
    const body = second.json<{ columns: { id: number; label: string; unit: string }[]; rows: { sizeId: number; values: Record<string, string> }[]; howToMeasure: string }>();
    expect(body.columns.map((x) => [x.label, x.unit])).toEqual([['Body length', 'in'], ['Chest', 'cm'], ['Hem', 'cm']]);
    expect(body.columns[0]!.id).toBe(length!.id); // ids preserved
    expect(body.columns[1]!.id).toBe(chest!.id);
    expect(body.columns[2]!.id).not.toBe(9999); // a temporary client id is replaced
    const rowS = body.rows.find((r) => r.sizeId === s.id)!;
    expect(rowS.values).toEqual({ [length!.id]: '26', [chest!.id]: '53', [body.columns[2]!.id]: '48' });
    expect(Object.values(body.rows.find((r) => r.sizeId === m.id)!.values)).toEqual(['', '', '']); // M was not sent: its old values are gone (empty cells are "" in the admin chart)
    expect(body.howToMeasure).toBe('v2');
    expect(await t.prisma.sizeChartColumn.count()).toBe(3); // Sleeve was removed with its values
    expect(await t.prisma.sizeChartValue.count()).toBe(3);
  });

  it('PUT is atomic: a rejected chart leaves the old one untouched', async () => {
    const c = await admin();
    const s = await createSize(t.prisma, { label: 'S' });
    await c.put('/admin/size-chart', { columns: [{ label: 'Chest', unit: 'cm' }], rows: [{ sizeId: s.id, values: { 'new:0': '52' } }], howToMeasure: 'keep' });
    const bad = await c.put('/admin/size-chart', {
      columns: [{ label: 'Chest', unit: 'cm' }, { label: 'chest', unit: 'cm' }],
      rows: [{ sizeId: 424242, values: { nope: 'x' } }],
      howToMeasure: 'lost',
    });
    expect(bad.status).toBe(400);
    expect(bad.json<Err>().error.fields).toMatchObject({
      'columns.1.label': 'Column names must be unique.',
      'rows.0.sizeId': 'Unknown size.',
      'rows.0.values.nope': 'Unknown column.',
    });
    const after = (await c.get('/admin/size-chart')).json<{ rows: { values: Record<string, string> }[]; howToMeasure: string }>();
    expect(after.howToMeasure).toBe('keep');
    expect(Object.values(after.rows[0]!.values)).toEqual(['52']);
  });

  it('PUT validates limits (value length, at least one column)', async () => {
    const c = await admin();
    const s = await createSize(t.prisma, { label: 'S' });
    const long = await c.put('/admin/size-chart', { columns: [{ label: 'Chest', unit: 'cm' }], rows: [{ sizeId: s.id, values: { 'new:0': 'x'.repeat(31) } }], howToMeasure: '' });
    expect(long.status).toBe(400);
    expect(long.json<Err>().error.fields).toHaveProperty('rows.0.values.new:0');
    expect((await c.put('/admin/size-chart', { columns: [], rows: [], howToMeasure: '' })).status).toBe(400);
  });
});
