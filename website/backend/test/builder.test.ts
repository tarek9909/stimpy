import { describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { useTestApp, type TestClient } from './helpers/app';
import { buildWorld, createColor, createHoodie, createStimpie } from './helpers/fixtures';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: unknown } };
type Placement = { x: number; y: number; width: number; rotation: number };
type Entry = { colorId: number; tint: string | null; texture3d: string | null; hoodieImage2d: string | null; overlay2d: string | null; placement2d: Placement | null };
type Model = { url: string; sizeBytes: number; backPanelMesh: string; panelAspect: number; camera: { position: number[]; target: number[]; fov: number }; lighting: string };
type Public = { mode: string; effectiveMode: string; defaultView: string; hoodie: { id: number; slug: string; name: string } | null; model3d: Model | null; colors: Entry[]; stimpieTextures: { stimpieId: number; textureUrl: string }[] };
type AdminB = {
  mode: string; defaultView: string; hoodieId: number | null; hoodie: { id: number; slug: string; name: string } | null; model3d: Model | null; colors: Entry[];
  stimpieTextures: { stimpieId: number; textureUrl: string }[]; warnings: string[];
  assetsReady: { model3d: boolean; colors2d: { colorId: number; ready: boolean }[]; overlays2d: number; stimpieTextures: number };
};

const admin = async (): Promise<TestClient> => (await t.adminClient()).client;
const IMG = (n: number) => `http://localhost:4000/uploads/2026/10/${String(n).padStart(16, '0')}.webp`;
const GLB = 'http://localhost:4000/uploads/2026/10/glbglbglbglbglb0.glb';
const PLACEMENT: Placement = { x: 0.5, y: 0.46, width: 0.36, rotation: 0 };
const CAMERA = { position: [0, 0.2, 3.2], target: [0, 0, 0], fov: 35 };
const MODEL = { url: GLB, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: CAMERA, lighting: 'STUDIO' };

async function put(prisma: PrismaClient, key: string, value: unknown): Promise<void> {
  const v = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  await prisma.builderConfig.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

async function setBuilder(
  prisma: PrismaClient,
  o: { mode?: string; defaultView?: string; hoodieId?: number | null; model?: unknown; colors?: unknown[]; textures?: unknown[] },
): Promise<void> {
  await put(prisma, 'mode', o.mode ?? '2D');
  await put(prisma, 'defaultView', o.defaultView ?? '2D');
  await put(prisma, 'hoodieId', o.hoodieId ?? null);
  await put(prisma, 'model3d', o.model ?? null);
  await put(prisma, 'colors', o.colors ?? []);
  await put(prisma, 'stimpieTextures', o.textures ?? []);
}

async function glbUpload(prisma: PrismaClient, sizeBytes = 975_480): Promise<void> {
  await prisma.upload.create({ data: { path: '2026/10/glbglbglbglbglb0.glb', url: GLB, mime: 'model/gltf-binary', sizeBytes, originalName: 'hoodie.glb' } });
}

// ================================================================ effectiveMode

describe('GET /builder/config: effectiveMode (business-rules 12)', () => {
  type ModelState = 'none' | 'noMesh' | 'ready';
  const models: Record<ModelState, unknown> = {
    none: null,
    noMesh: { ...MODEL, sizeBytes: 100, backPanelMesh: '' },
    ready: { ...MODEL, sizeBytes: 100 },
  };
  const expected: Record<string, Record<ModelState, string>> = {
    '2D': { none: '2D', noMesh: '2D', ready: '2D' },
    '3D': { none: '2D', noMesh: '2D', ready: '3D' },
    BOTH: { none: '2D', noMesh: '2D', ready: 'BOTH' },
  };
  for (const mode of ['2D', '3D', 'BOTH']) {
    for (const ms of ['none', 'noMesh', 'ready'] as ModelState[]) {
      for (const has2d of [true, false]) {
        it(`mode ${mode}, model ${ms}, 2D assets ${has2d ? 'present' : 'missing'} -> ${expected[mode]![ms]}`, async () => {
          const w = await buildWorld(t.prisma);
          await setBuilder(t.prisma, {
            mode, defaultView: '3D', hoodieId: w.hoodie.id, model: models[ms],
            colors: has2d ? [{ colorId: w.colors.black.id, hoodieImage2d: IMG(1), overlay2d: null, placement2d: PLACEMENT }] : [],
          });
          const res = await t.client.get('/builder/config');
          expect(res.status).toBe(200);
          const b = res.json<Public>();
          expect(b.mode).toBe(mode);
          expect(b.effectiveMode).toBe(expected[mode]![ms]);
          // defaultView is forced to 2D whenever the page will use 2D
          expect(b.defaultView).toBe(b.effectiveMode === '2D' ? '2D' : '3D');
          expect(b.model3d !== null).toBe(ms === 'ready');
        });
      }
    }
  }
});

// ================================================================ public shape

describe('GET /builder/config: shape', () => {
  it('returns exactly the documented keys, absolute URLs, mirrored tint/texture and a 30 s cache', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { builderTint: '#222222', builderTexture: IMG(9) } });
    await glbUpload(t.prisma);
    await setBuilder(t.prisma, {
      mode: 'BOTH', defaultView: '3D', hoodieId: w.hoodie.id, model: { ...MODEL, sizeBytes: 975_480 },
      colors: [{ colorId: w.colors.black.id, hoodieImage2d: IMG(1), overlay2d: IMG(2), placement2d: PLACEMENT }],
      textures: [{ stimpieId: w.core[0]!.id, textureUrl: IMG(3) }],
    });
    const res = await t.client.get('/builder/config');
    expect(res.header('cache-control')).toBe('public, max-age=30');
    const b = res.json<Public>();
    expect(Object.keys(b).sort()).toEqual(['colors', 'defaultView', 'effectiveMode', 'hoodie', 'mode', 'model3d', 'stimpieTextures']);
    expect(b.hoodie).toEqual({ id: w.hoodie.id, slug: 'stimpy-hoodie', name: 'Stimpy Hoodie' });
    expect(Object.keys(b.model3d!).sort()).toEqual(['backPanelMesh', 'camera', 'lighting', 'panelAspect', 'sizeBytes', 'url']);
    expect(b.model3d).toEqual({ url: GLB, sizeBytes: 975_480, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: CAMERA, lighting: 'STUDIO' });
    expect(b.colors).toEqual([{ colorId: w.colors.black.id, tint: '#222222', texture3d: IMG(9), hoodieImage2d: IMG(1), overlay2d: IMG(2), placement2d: PLACEMENT }]);
    expect(Object.keys(b.colors[0]!).sort()).toEqual(['colorId', 'hoodieImage2d', 'overlay2d', 'placement2d', 'texture3d', 'tint']);
    expect(b.stimpieTextures).toEqual([{ stimpieId: w.core[0]!.id, textureUrl: IMG(3) }]);
  });

  it('empty database: 2D, no hoodie, no model, no colours', async () => {
    const b = (await t.client.get('/builder/config')).json<Public>();
    expect(b).toEqual({ mode: '2D', effectiveMode: '2D', defaultView: '2D', hoodie: null, model3d: null, colors: [], stimpieTextures: [] });
  });

  it('the hoodie is the configured active one, else the first active hoodie (by position)', async () => {
    const first = await createHoodie(t.prisma, { slug: 'first' });
    const second = await createHoodie(t.prisma, { slug: 'second' });
    await setBuilder(t.prisma, { hoodieId: null });
    expect((await t.client.get('/builder/config')).json<Public>().hoodie!.id).toBe(first.id);
    await setBuilder(t.prisma, { hoodieId: second.id });
    expect((await t.client.get('/builder/config')).json<Public>().hoodie!.id).toBe(second.id);
    await t.prisma.hoodie.update({ where: { id: second.id }, data: { active: false } });
    expect((await t.client.get('/builder/config')).json<Public>().hoodie!.id).toBe(first.id); // hidden: falls back
    await t.prisma.hoodie.update({ where: { id: first.id }, data: { position: 99 } });
    await t.prisma.hoodie.update({ where: { id: second.id }, data: { active: true, position: 1 } });
    await setBuilder(t.prisma, { hoodieId: 999999 }); // deleted hoodie id
    expect((await t.client.get('/builder/config')).json<Public>().hoodie!.id).toBe(second.id);
  });

  it('a colour is listed only once its look is set (2D asset, tint or texture), only while active, in colour order', async () => {
    const w = await buildWorld(t.prisma);
    const tinted = await createColor(t.prisma, { name: 'Tinted', position: 10 });
    await t.prisma.color.update({ where: { id: tinted.id }, data: { builderTint: '#00AAFF' } });
    const hidden = await createColor(t.prisma, { name: 'Hidden', position: 11, active: false });
    const unset = await createColor(t.prisma, { name: 'Unset', position: 12 });
    await t.prisma.color.update({ where: { id: w.colors.cream.id }, data: { position: 1 } });
    await setBuilder(t.prisma, {
      mode: '2D',
      colors: [
        { colorId: tinted.id, hoodieImage2d: null, overlay2d: null, placement2d: null },
        { colorId: w.colors.cream.id, hoodieImage2d: IMG(5), overlay2d: null, placement2d: PLACEMENT },
        { colorId: hidden.id, hoodieImage2d: IMG(6), overlay2d: null, placement2d: PLACEMENT },
        { colorId: 777777, hoodieImage2d: IMG(7), overlay2d: null, placement2d: PLACEMENT }, // deleted colour
      ],
    });
    const b = (await t.client.get('/builder/config')).json<Public>();
    expect(b.colors.map((c) => c.colorId)).toEqual([w.colors.cream.id, tinted.id]);
    expect(b.colors.find((c) => c.colorId === unset.id)).toBeUndefined();
    expect(b.colors[1]).toMatchObject({ tint: '#00AAFF', hoodieImage2d: null, placement2d: null });
  });

  it('per-Stimpie textures are listed only for existing, active Stimpies', async () => {
    const w = await buildWorld(t.prisma);
    const hidden = await createStimpie(t.prisma, { active: false });
    await setBuilder(t.prisma, { textures: [{ stimpieId: w.core[0]!.id, textureUrl: IMG(1) }, { stimpieId: hidden.id, textureUrl: IMG(2) }, { stimpieId: 424242, textureUrl: IMG(3) }] });
    expect((await t.client.get('/builder/config')).json<Public>().stimpieTextures.map((x) => x.stimpieId)).toEqual([w.core[0]!.id]);
  });

  it('tolerates malformed stored values (falls back to 2D, drops bad entries, default camera and aspect)', async () => {
    await put(t.prisma, 'mode', 'WRONG');
    await put(t.prisma, 'defaultView', 5);
    await put(t.prisma, 'colors', 'nope');
    await put(t.prisma, 'model3d', { url: GLB, backPanelMesh: 'm', panelAspect: -3, camera: { position: [1, 'x'], fov: 'wide' }, lighting: 'DISCO' });
    const b = (await t.client.get('/builder/config')).json<Public>();
    expect([b.mode, b.defaultView, b.colors]).toEqual(['2D', '2D', []]);
    expect(b.model3d).toMatchObject({ panelAspect: 0.64, lighting: 'STUDIO', camera: { position: [0, 0.2, 3.2], target: [0, 0, 0], fov: 35 }, sizeBytes: 0 });
  });
});

// ================================================================ admin GET

describe('GET /admin/builder', () => {
  it('401 without a session', async () => {
    expect((await t.client.get('/admin/builder')).status).toBe(401);
    expect((await t.client.put('/admin/builder', {})).status).toBe(401);
  });

  it('returns mode as set (no effectiveMode), an entry for EVERY colour, assetsReady counts and warnings', async () => {
    const w = await buildWorld(t.prisma);
    const hiddenColor = await createColor(t.prisma, { name: 'Hidden', active: false });
    await setBuilder(t.prisma, {
      mode: '3D', defaultView: '3D', hoodieId: w.hoodie.id, model: null,
      colors: [
        { colorId: w.colors.black.id, hoodieImage2d: IMG(1), overlay2d: IMG(2), placement2d: PLACEMENT },
        { colorId: w.colors.cream.id, hoodieImage2d: IMG(3), overlay2d: null, placement2d: null },
      ],
      textures: [{ stimpieId: w.core[0]!.id, textureUrl: IMG(4) }, { stimpieId: 999999, textureUrl: IMG(5) }],
    });
    const c = await admin();
    const res = await c.get('/admin/builder');
    expect(res.status).toBe(200);
    expect(res.header('cache-control')).toBe('no-store');
    const b = res.json<AdminB>();
    expect(Object.keys(b).sort()).toEqual(['assetsReady', 'colors', 'defaultView', 'hoodie', 'hoodieId', 'mode', 'model3d', 'stimpieTextures', 'warnings']);
    expect(b).not.toHaveProperty('effectiveMode');
    expect(b).toMatchObject({ mode: '3D', defaultView: '3D', hoodieId: w.hoodie.id, hoodie: { id: w.hoodie.id, slug: 'stimpy-hoodie', name: 'Stimpy Hoodie' }, model3d: null });
    expect(b.colors.map((x) => x.colorId)).toEqual([w.colors.black.id, w.colors.cream.id, hiddenColor.id]);
    expect(b.colors[2]).toEqual({ colorId: hiddenColor.id, tint: null, texture3d: null, hoodieImage2d: null, overlay2d: null, placement2d: null });
    expect(b.stimpieTextures).toEqual([{ stimpieId: w.core[0]!.id, textureUrl: IMG(4) }]); // the deleted Stimpie's entry is dropped
    expect(b.assetsReady).toEqual({
      model3d: false,
      colors2d: [{ colorId: w.colors.black.id, ready: true }, { colorId: w.colors.cream.id, ready: false }], // active colours only; image without placement is not ready
      overlays2d: 1,
      stimpieTextures: 1,
    });
    expect(b.warnings.some((x) => /3D model/.test(x))).toBe(true);
    expect(b.warnings.some((x) => /1 of 2 active colours/.test(x))).toBe(true);
  });

  it('defaults on an empty database', async () => {
    const c = await admin();
    const b = (await c.get('/admin/builder')).json<AdminB>();
    expect(b).toMatchObject({ mode: '2D', defaultView: '2D', hoodieId: null, hoodie: null, model3d: null, colors: [], stimpieTextures: [] });
    expect(b.assetsReady).toEqual({ model3d: false, colors2d: [], overlays2d: 0, stimpieTextures: 0 });
    expect(b.warnings).toEqual(['No active hoodie exists for the Builder to sell.']);
  });

  it('assetsReady.model3d needs both a URL and a named mesh', async () => {
    await buildWorld(t.prisma);
    const c = await admin();
    await setBuilder(t.prisma, { mode: 'BOTH', model: { ...MODEL, sizeBytes: 5, backPanelMesh: '  ' } });
    const b = (await c.get('/admin/builder')).json<AdminB>();
    expect(b.assetsReady.model3d).toBe(false);
    expect(b.warnings.some((x) => /mesh name/.test(x))).toBe(true);
    await setBuilder(t.prisma, { mode: 'BOTH', model: { ...MODEL, sizeBytes: 5 } });
    const ok = (await c.get('/admin/builder')).json<AdminB>();
    expect(ok.assetsReady.model3d).toBe(true);
    expect(ok.warnings.some((x) => /3D model|mesh/.test(x))).toBe(false);
  });
});

// ================================================================ admin PUT

describe('PUT /admin/builder', () => {
  function body(w: Awaited<ReturnType<typeof buildWorld>>, over: Record<string, unknown> = {}) {
    return {
      mode: 'BOTH', defaultView: '3D', hoodieId: w.hoodie.id, model3d: MODEL,
      colors: [
        { colorId: w.colors.black.id, hoodieImage2d: IMG(1), overlay2d: IMG(2), placement2d: PLACEMENT },
        { colorId: w.colors.cream.id, hoodieImage2d: IMG(3), overlay2d: null, placement2d: { ...PLACEMENT, rotation: -12.5 } },
      ],
      stimpieTextures: [{ stimpieId: w.core[0]!.id, textureUrl: IMG(4) }],
      ...over,
    };
  }

  it('saves the full object, fills model3d.sizeBytes from the upload, is live on the public config, and returns assetsReady', async () => {
    const w = await buildWorld(t.prisma);
    await glbUpload(t.prisma, 2_345_678);
    const c = await admin();
    const res = await c.put('/admin/builder', body(w));
    expect(res.status).toBe(200);
    const b = res.json<AdminB>();
    expect(b).toMatchObject({ mode: 'BOTH', defaultView: '3D', hoodieId: w.hoodie.id, warnings: [] });
    expect(b.model3d).toEqual({ url: GLB, sizeBytes: 2_345_678, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: CAMERA, lighting: 'STUDIO' });
    expect(b.colors.find((x) => x.colorId === w.colors.cream.id)!.placement2d).toEqual({ ...PLACEMENT, rotation: -12.5 });
    expect(b.assetsReady).toEqual({ model3d: true, colors2d: [{ colorId: w.colors.black.id, ready: true }, { colorId: w.colors.cream.id, ready: true }], overlays2d: 1, stimpieTextures: 1 });
    const pub = (await t.client.get('/builder/config')).json<Public>();
    expect(pub).toMatchObject({ mode: 'BOTH', effectiveMode: 'BOTH', defaultView: '3D', hoodie: { id: w.hoodie.id } });
    expect(pub.model3d!.sizeBytes).toBe(2_345_678);
    expect(pub.colors).toHaveLength(2);
  });

  it('a client-sent sizeBytes is ignored (the server uses the upload record)', async () => {
    const w = await buildWorld(t.prisma);
    await glbUpload(t.prisma, 1000);
    const c = await admin();
    const b = (await c.put('/admin/builder', body(w, { model3d: { ...MODEL, sizeBytes: 999_999_999 } }))).json<AdminB>();
    expect(b.model3d!.sizeBytes).toBe(1000);
  });

  it('GET -> PUT round trip with the unmodified GET object is accepted and changes nothing', async () => {
    const w = await buildWorld(t.prisma);
    await glbUpload(t.prisma);
    const c = await admin();
    await c.put('/admin/builder', body(w));
    const before = (await c.get('/admin/builder')).json<AdminB>();
    const again = await c.put('/admin/builder', before);
    expect(again.status).toBe(200);
    expect(again.json()).toEqual(before);
  });

  it('ignores colour tint and texture3d (edited via /admin/colors only)', async () => {
    const w = await buildWorld(t.prisma);
    await t.prisma.color.update({ where: { id: w.colors.black.id }, data: { builderTint: '#111111', builderTexture: IMG(8) } });
    await glbUpload(t.prisma);
    const c = await admin();
    const sent = body(w, { colors: [{ colorId: w.colors.black.id, tint: '#FF0000', texture3d: 'http://evil/x', hoodieImage2d: IMG(1), overlay2d: null, placement2d: PLACEMENT }] });
    const b = (await c.put('/admin/builder', sent)).json<AdminB>();
    expect(b.colors[0]).toMatchObject({ tint: '#111111', texture3d: IMG(8) });
    expect((await t.prisma.color.findUniqueOrThrow({ where: { id: w.colors.black.id } })).builderTint).toBe('#111111');
  });

  it('saving 3D or BOTH without a model is allowed and returns warnings; effectiveMode stays 2D', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    for (const mode of ['3D', 'BOTH']) {
      const res = await c.put('/admin/builder', body(w, { mode, model3d: null }));
      expect(res.status).toBe(200);
      const b = res.json<AdminB>();
      expect(b.mode).toBe(mode);
      expect(b.warnings.length).toBeGreaterThan(0);
      expect(b.warnings.some((x) => /3D model/.test(x))).toBe(true);
      expect(b.assetsReady.model3d).toBe(false);
      const pub = (await t.client.get('/builder/config')).json<Public>();
      expect(pub).toMatchObject({ mode, effectiveMode: '2D', defaultView: '2D', model3d: null });
    }
    const two = (await c.put('/admin/builder', body(w, { mode: '2D', model3d: null }))).json<AdminB>();
    expect(two.warnings.some((x) => /3D model/.test(x))).toBe(false);
  });

  it('warns when no active colour has a 2D image and placement, and when the hoodie is hidden', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const b = (await c.put('/admin/builder', { mode: '2D', defaultView: '2D', hoodieId: w.hoodie.id, model3d: null, colors: [], stimpieTextures: [] })).json<AdminB>();
    expect(b.warnings.some((x) => /No active colour has a 2D image/.test(x))).toBe(true);
    await t.prisma.hoodie.update({ where: { id: w.hoodie.id }, data: { active: false } });
    const hid = (await c.get('/admin/builder')).json<AdminB>();
    expect(hid.warnings.some((x) => /No active hoodie/.test(x))).toBe(true);
  });

  it('removing the model (model3d: null) and clearing a colour replaces the stored config', async () => {
    const w = await buildWorld(t.prisma);
    await glbUpload(t.prisma);
    const c = await admin();
    await c.put('/admin/builder', body(w));
    const b = (await c.put('/admin/builder', body(w, { mode: '2D', model3d: null, colors: [{ colorId: w.colors.black.id, hoodieImage2d: null, overlay2d: null, placement2d: null }], stimpieTextures: [] }))).json<AdminB>();
    expect(b.model3d).toBeNull();
    expect(b.colors.find((x) => x.colorId === w.colors.black.id)).toMatchObject({ hoodieImage2d: null, overlay2d: null, placement2d: null });
    expect(b.colors.find((x) => x.colorId === w.colors.cream.id)).toMatchObject({ hoodieImage2d: null }); // replaced, not merged
    expect(b.stimpieTextures).toEqual([]);
    expect(b.assetsReady).toMatchObject({ model3d: false, overlays2d: 0, stimpieTextures: 0 });
  });

  it('hoodieId: unknown or hidden hoodies are refused; null resets to the default; `hoodie` echo is used when hoodieId is absent', async () => {
    const w = await buildWorld(t.prisma);
    const hidden = await createHoodie(t.prisma, { slug: 'hid', active: false });
    const other = await createHoodie(t.prisma, { slug: 'other' });
    await glbUpload(t.prisma);
    const c = await admin();
    expect((await c.put('/admin/builder', body(w, { hoodieId: 999999 }))).json<Err>().error.fields).toEqual({ hoodieId: expect.any(String) });
    expect((await c.put('/admin/builder', body(w, { hoodieId: hidden.id }))).json<Err>().error.fields).toEqual({ hoodieId: expect.any(String) });
    expect((await c.put('/admin/builder', body(w, { hoodieId: other.id }))).json<AdminB>().hoodie!.id).toBe(other.id);
    expect((await c.put('/admin/builder', body(w, { hoodieId: null }))).json<AdminB>().hoodie!.id).toBe(w.hoodie.id); // default: first active
    const { hoodieId: _omit, ...noId } = body(w);
    void _omit;
    expect((await c.put('/admin/builder', { ...noId, hoodie: { id: other.id, slug: 'other', name: 'x' } })).json<AdminB>().hoodieId).toBe(other.id);
  });

  it('validation: enums, model fields, camera, placement ranges, unknown colour/Stimpie, duplicates, URLs', async () => {
    const w = await buildWorld(t.prisma);
    await glbUpload(t.prisma);
    const c = await admin();
    const bad = await c.put('/admin/builder', {
      mode: 'FOUR_D', defaultView: 'BOTH', model3d: { url: 'javascript:1', backPanelMesh: '', panelAspect: 0, camera: { position: [0, 1], target: [0, 0, 0], fov: 5 }, lighting: 'DISCO' },
      colors: [{ colorId: w.colors.black.id, hoodieImage2d: 'nope', placement2d: { x: 1.5, y: -0.1, width: 0, rotation: 200 } }], stimpieTextures: [{ stimpieId: 1, textureUrl: 'x' }],
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json<Err>().error.fields!).sort()).toEqual([
      'colors.0.hoodieImage2d', 'colors.0.placement2d.rotation', 'colors.0.placement2d.width', 'colors.0.placement2d.x', 'colors.0.placement2d.y',
      'defaultView', 'mode', 'model3d.backPanelMesh', 'model3d.camera.fov', 'model3d.camera.position', 'model3d.lighting', 'model3d.panelAspect', 'model3d.url',
      'stimpieTextures.0.textureUrl',
    ]);
    const unknown = await c.put('/admin/builder', body(w, { extra: 1, colors: [{ colorId: 987654, hoodieImage2d: null }, { colorId: w.colors.black.id }, { colorId: w.colors.black.id }], stimpieTextures: [{ stimpieId: 987654, textureUrl: IMG(1) }, { stimpieId: w.core[0]!.id, textureUrl: IMG(1) }, { stimpieId: w.core[0]!.id, textureUrl: IMG(2) }] }));
    expect(Object.keys(unknown.json<Err>().error.fields!).sort()).toEqual(['extra']); // zod errors first
    const semantic = await c.put('/admin/builder', body(w, { colors: [{ colorId: 987654 }, { colorId: w.colors.black.id }, { colorId: w.colors.black.id }], stimpieTextures: [{ stimpieId: 987654, textureUrl: IMG(1) }, { stimpieId: w.core[0]!.id, textureUrl: IMG(1) }, { stimpieId: w.core[0]!.id, textureUrl: IMG(2) }] }));
    expect(Object.keys(semantic.json<Err>().error.fields!).sort()).toEqual(['colors.0.colorId', 'colors.2.colorId', 'stimpieTextures.0.stimpieId', 'stimpieTextures.2.stimpieId']);
    const missing = await c.put('/admin/builder', {});
    expect(Object.keys(missing.json<Err>().error.fields!).sort()).toEqual(['defaultView', 'mode']);
    // nothing was saved by the failed calls
    expect((await t.prisma.builderConfig.count())).toBe(0);
  });

  it('model3d.url must be an uploaded .glb: an unknown URL or an image upload is refused', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const unknown = await c.put('/admin/builder', body(w));
    expect(unknown.status).toBe(400);
    expect(Object.keys(unknown.json<Err>().error.fields!)).toEqual(['model3d.url']);
    await t.prisma.upload.create({ data: { path: '2026/10/glbglbglbglbglb0.glb', url: GLB, mime: 'image/webp', sizeBytes: 5, originalName: 'x' } });
    const wrongMime = await c.put('/admin/builder', body(w));
    expect(Object.keys(wrongMime.json<Err>().error.fields!)).toEqual(['model3d.url']);
  });

  it('a model that is already stored may be re-saved with its URL even without an upload record (e.g. seeded)', async () => {
    const w = await buildWorld(t.prisma);
    await setBuilder(t.prisma, { mode: 'BOTH', model: { ...MODEL, sizeBytes: 4242 } });
    const c = await admin();
    const b = (await c.put('/admin/builder', body(w, { model3d: { ...MODEL, lighting: 'NIGHT' } }))).json<AdminB>();
    expect(b.model3d).toMatchObject({ sizeBytes: 4242, lighting: 'NIGHT' });
  });

  it('body size limit for a normal JSON route still applies (no accidental 100 MB window)', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const res = await c.put('/admin/builder', body(w, { stimpieTextures: Array.from({ length: 5000 }, (_, i) => ({ stimpieId: i + 1, textureUrl: IMG(i) })) }));
    expect([400, 413]).toContain(res.status);
  });

  it('uploads feed the builder end to end: upload a GLB with purpose builder-model, then save it', async () => {
    const w = await buildWorld(t.prisma);
    const c = await admin();
    const json = Buffer.from('{"asset":{"version":"2.0"}}   ');
    const head = Buffer.alloc(20);
    head.write('glTF', 0, 'latin1');
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(20 + json.length, 8);
    head.writeUInt32LE(json.length, 12);
    head.writeUInt32LE(0x4e4f534a, 16);
    const glb = Buffer.concat([head, json]);
    const boundary = 'bnd';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbuilder-model\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="h.glb"\r\n\r\n`),
      glb,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await c.request('POST', '/admin/uploads', { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(up.status).toBe(201);
    const { url, sizeBytes } = up.json<{ url: string; sizeBytes: number }>();
    const saved = await c.put('/admin/builder', body(w, { model3d: { ...MODEL, url } }));
    expect(saved.status).toBe(200);
    expect(saved.json<AdminB>().model3d!.sizeBytes).toBe(sizeBytes);
    expect(sizeBytes).toBe(glb.length);
    expect((await t.client.get('/builder/config')).json<Public>().effectiveMode).toBe('BOTH');
  });
});
