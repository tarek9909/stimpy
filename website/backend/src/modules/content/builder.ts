import type { Color } from '@prisma/client';
import type { AppContext } from '../../context';
import { Prisma, type Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { uploadStoragePath } from '../../lib/upload-url';
import type { BuilderPutBody } from './builder-schemas';

/**
 * Builder configuration (business-rules 12, api-reference 3.6 / 5.11). Stored as separate JSON keys in `builder_config`
 * (shapes in DECISIONS.md "content"); colour tint and texture are NOT stored here, they live on `colors`.
 */

export type Mode = '2D' | '3D' | 'BOTH';
export type View = '2D' | '3D';
export type Lighting = 'STUDIO' | 'SOFT' | 'NIGHT';
export type Vec3 = [number, number, number];
export type Placement = { x: number; y: number; width: number; rotation: number };
export type Model3d = { url: string; sizeBytes: number; backPanelMesh: string; panelAspect: number; camera: { position: Vec3; target: Vec3; fov: number }; lighting: Lighting };
export type StoredColor = { colorId: number; hoodieImage2d: string | null; overlay2d: string | null; placement2d: Placement | null };
export type Stored = {
  mode: Mode;
  defaultView: View;
  hoodieId: number | null;
  model3d: Model3d | null;
  colors: StoredColor[];
  stimpieTextures: { stimpieId: number; textureUrl: string }[];
};

export const DEFAULT_PANEL_ASPECT = 0.64;
const DEFAULT_CAMERA = { position: [0, 0.2, 3.2] as Vec3, target: [0, 0, 0] as Vec3, fov: 35 };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const vec3 = (v: unknown, d: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? ([v[0], v[1], v[2]] as Vec3) : d;

function parsePlacement(v: unknown): Placement | null {
  const o = obj(v);
  const x = num(o.x);
  const y = num(o.y);
  const width = num(o.width);
  if (x === null || y === null || width === null) return null;
  return { x, y, width, rotation: num(o.rotation) ?? 0 };
}

function parseModel(v: unknown): Model3d | null {
  const o = obj(v);
  const url = strOrNull(o.url);
  if (!url) return null;
  const cam = obj(o.camera);
  return {
    url,
    sizeBytes: Math.max(0, Math.trunc(num(o.sizeBytes) ?? 0)),
    backPanelMesh: typeof o.backPanelMesh === 'string' ? o.backPanelMesh : '',
    panelAspect: num(o.panelAspect) && num(o.panelAspect)! > 0 ? num(o.panelAspect)! : DEFAULT_PANEL_ASPECT,
    camera: { position: vec3(cam.position, DEFAULT_CAMERA.position), target: vec3(cam.target, DEFAULT_CAMERA.target), fov: num(cam.fov) ?? DEFAULT_CAMERA.fov },
    lighting: o.lighting === 'SOFT' || o.lighting === 'NIGHT' ? o.lighting : 'STUDIO',
  };
}

export async function readStored(db: Db): Promise<Stored> {
  const rows = await db.builderConfig.findMany();
  const v = new Map(rows.map((r) => [r.key, r.value as unknown]));
  const mode = v.get('mode');
  const view = v.get('defaultView');
  const colorsRaw = v.get('colors');
  const texturesRaw = v.get('stimpieTextures');
  return {
    mode: mode === '3D' || mode === 'BOTH' ? mode : '2D',
    defaultView: view === '3D' ? '3D' : '2D',
    hoodieId: num(v.get('hoodieId')),
    model3d: parseModel(v.get('model3d')),
    colors: (Array.isArray(colorsRaw) ? colorsRaw : []).flatMap((c) => {
      const o = obj(c);
      const colorId = num(o.colorId);
      return colorId === null ? [] : [{ colorId, hoodieImage2d: strOrNull(o.hoodieImage2d), overlay2d: strOrNull(o.overlay2d), placement2d: parsePlacement(o.placement2d) }];
    }),
    stimpieTextures: (Array.isArray(texturesRaw) ? texturesRaw : []).flatMap((t) => {
      const o = obj(t);
      const stimpieId = num(o.stimpieId);
      const textureUrl = strOrNull(o.textureUrl);
      return stimpieId === null || !textureUrl ? [] : [{ stimpieId, textureUrl }];
    }),
  };
}

// ---------------------------------------------------------------- derived values

/** A model counts as uploaded only with a URL and a named back-panel mesh (business-rules 12). */
export const modelReady = (m: Model3d | null): m is Model3d => m !== null && m.url !== '' && m.backPanelMesh.trim() !== '';

/** business-rules 12: 3D and BOTH fall back to 2D without a usable model; 2D stays 2D. */
export function resolveEffectiveMode(mode: Mode, model: Model3d | null): Mode {
  if (mode === '2D') return '2D';
  return modelReady(model) ? mode : '2D';
}

/** `defaultView` is forced to 2D whenever the effective mode is 2D. */
export function resolveDefaultView(view: View, effective: Mode): View {
  return effective === '2D' ? '2D' : view;
}

const ready2d = (c: StoredColor | undefined): boolean => !!c && c.hoodieImage2d !== null && c.placement2d !== null;

async function resolveHoodie(db: Db, hoodieId: number | null) {
  if (hoodieId !== null) {
    const h = await db.hoodie.findFirst({ where: { id: hoodieId, active: true }, select: { id: true, slug: true, name: true } });
    if (h) return h;
  }
  return db.hoodie.findFirst({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true, slug: true, name: true } });
}

const byPosition = (a: Color, b: Color): number => a.position - b.position || a.id - b.id;

async function load(db: Db) {
  const [stored, colors, stimpies] = await Promise.all([
    readStored(db),
    db.color.findMany(),
    db.stimpie.findMany({ select: { id: true, active: true } }),
  ]);
  return { stored, colors: colors.sort(byPosition), stimpies, hoodie: await resolveHoodie(db, null) };
}

const entryFor = (c: Color, s: StoredColor | undefined) => ({
  colorId: c.id,
  tint: c.builderTint,
  texture3d: c.builderTexture,
  hoodieImage2d: s?.hoodieImage2d ?? null,
  overlay2d: s?.overlay2d ?? null,
  placement2d: s?.placement2d ?? null,
});

/** A colour appears in the public Builder once its look is set: a 2D image, an overlay or placement, a tint or a texture. */
const lookIsSet = (c: Color, s: StoredColor | undefined): boolean =>
  !!s && (s.hoodieImage2d !== null || s.overlay2d !== null || s.placement2d !== null) ? true : c.builderTint !== null || c.builderTexture !== null;

// ================================================================ public

export async function getPublicBuilderConfig(ctx: AppContext) {
  const { stored, colors, stimpies } = await load(ctx.prisma);
  const hoodie = await resolveHoodie(ctx.prisma, stored.hoodieId);
  const effectiveMode = resolveEffectiveMode(stored.mode, stored.model3d);
  const byColor = new Map(stored.colors.map((c) => [c.colorId, c]));
  const activeStimpies = new Set(stimpies.filter((s) => s.active).map((s) => s.id));
  return {
    mode: stored.mode,
    effectiveMode,
    defaultView: resolveDefaultView(stored.defaultView, effectiveMode),
    hoodie,
    model3d: modelReady(stored.model3d) ? stored.model3d : null,
    colors: colors.filter((c) => c.active && lookIsSet(c, byColor.get(c.id))).map((c) => entryFor(c, byColor.get(c.id))),
    stimpieTextures: stored.stimpieTextures.filter((t) => activeStimpies.has(t.stimpieId)),
  };
}

// ================================================================ admin

function warningsFor(stored: Stored, hoodie: { id: number } | null, colors: Color[]): string[] {
  const out: string[] = [];
  const byColor = new Map(stored.colors.map((c) => [c.colorId, c]));
  const active = colors.filter((c) => c.active);
  if (stored.mode !== '2D') {
    if (!stored.model3d) out.push('No 3D model is set, so the website will use 2D until one is uploaded.');
    else if (stored.model3d.backPanelMesh.trim() === '') out.push('The back panel mesh name is missing, so the website will use 2D until it is set.');
  }
  const readyCount = active.filter((c) => ready2d(byColor.get(c.id))).length;
  if (active.length > 0 && readyCount === 0) out.push('No active colour has a 2D image and placement yet, so the 2D Builder cannot show a hoodie.');
  else if (readyCount < active.length) out.push(`${active.length - readyCount} of ${active.length} active colours have no 2D image and placement yet; they are hidden in the 2D Builder.`);
  if (!hoodie) out.push('No active hoodie exists for the Builder to sell.');
  else if (stored.hoodieId !== null && stored.hoodieId !== hoodie.id) out.push('The chosen hoodie is hidden or deleted, so the Builder sells the first active hoodie instead.');
  return out;
}

export async function getAdminBuilder(ctx: AppContext) {
  const { stored, colors, stimpies } = await load(ctx.prisma);
  const hoodie = await resolveHoodie(ctx.prisma, stored.hoodieId);
  const byColor = new Map(stored.colors.map((c) => [c.colorId, c]));
  const existing = new Set(stimpies.map((s) => s.id));
  const textures = stored.stimpieTextures.filter((t) => existing.has(t.stimpieId));
  const active = colors.filter((c) => c.active);
  return {
    mode: stored.mode,
    defaultView: stored.defaultView,
    hoodieId: hoodie?.id ?? null,
    hoodie,
    model3d: stored.model3d,
    colors: colors.map((c) => entryFor(c, byColor.get(c.id))),
    stimpieTextures: textures,
    assetsReady: {
      model3d: modelReady(stored.model3d),
      colors2d: active.map((c) => ({ colorId: c.id, ready: ready2d(byColor.get(c.id)) })),
      overlays2d: active.filter((c) => byColor.get(c.id)?.overlay2d != null).length,
      stimpieTextures: textures.length,
    },
    warnings: warningsFor(stored, hoodie, colors),
  };
}

/**
 * `PUT /admin/builder`: replaces the stored config with the full object. Colour tint / texture are ignored (they are
 * edited via /admin/colors). `model3d.sizeBytes` comes from the upload record of `model3d.url`.
 */
export async function putAdminBuilder(ctx: AppContext, input: BuilderPutBody) {
  const fields: Record<string, string> = {};
  const [colorRows, stimpieRows, current] = await Promise.all([
    ctx.prisma.color.findMany({ select: { id: true } }),
    ctx.prisma.stimpie.findMany({ select: { id: true } }),
    readStored(ctx.prisma),
  ]);

  // hoodie
  const requested = input.hoodieId !== undefined ? input.hoodieId : (input.hoodie?.id ?? current.hoodieId);
  if (requested !== null && requested !== undefined) {
    const h = await ctx.prisma.hoodie.findUnique({ where: { id: requested }, select: { active: true } });
    if (!h) fields.hoodieId = 'That hoodie does not exist.';
    else if (!h.active && requested !== current.hoodieId) fields.hoodieId = 'That hoodie is hidden. Choose an active hoodie.';
  }

  // colours
  const colorIds = new Set(colorRows.map((c) => c.id));
  const seen = new Set<number>();
  input.colors.forEach((c, i) => {
    if (!colorIds.has(c.colorId)) fields[`colors.${i}.colorId`] = 'That colour does not exist.';
    else if (seen.has(c.colorId)) fields[`colors.${i}.colorId`] = 'Each colour may appear only once.';
    seen.add(c.colorId);
  });

  // per-Stimpie textures
  const stimpieIds = new Set(stimpieRows.map((s) => s.id));
  const seenS = new Set<number>();
  input.stimpieTextures.forEach((t, i) => {
    if (!stimpieIds.has(t.stimpieId)) fields[`stimpieTextures.${i}.stimpieId`] = 'That Stimpie does not exist.';
    else if (seenS.has(t.stimpieId)) fields[`stimpieTextures.${i}.stimpieId`] = 'Each Stimpie may appear only once.';
    seenS.add(t.stimpieId);
  });

  // model: size comes from the upload record
  let model: Model3d | null = null;
  if (input.model3d) {
    const m = input.model3d;
    const path = uploadStoragePath(m.url);
    const upload = path
      ? await ctx.prisma.upload.findFirst({ where: { path }, select: { sizeBytes: true, mime: true } })
      : await ctx.prisma.upload.findFirst({ where: { url: m.url }, select: { sizeBytes: true, mime: true } });
    if (upload && upload.mime !== 'model/gltf-binary') fields['model3d.url'] = 'That file is not a .glb model.';
    else if (!upload && current.model3d?.url !== m.url) fields['model3d.url'] = 'Upload the model first (POST /admin/uploads with purpose "builder-model") and use the returned URL.';
    if (!fields['model3d.url']) {
      model = {
        url: m.url,
        sizeBytes: upload?.sizeBytes ?? current.model3d?.sizeBytes ?? 0,
        backPanelMesh: m.backPanelMesh,
        panelAspect: m.panelAspect,
        camera: { position: m.camera.position, target: m.camera.target, fov: m.camera.fov },
        lighting: m.lighting,
      };
    }
  }
  if (Object.keys(fields).length) throw AppError.validation(fields);

  const json = (v: Prisma.InputJsonValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull => (v === null ? Prisma.JsonNull : v);
  const write = (tx: Prisma.TransactionClient, key: string, value: Prisma.InputJsonValue | null) =>
    tx.builderConfig.upsert({ where: { key }, create: { key, value: json(value) }, update: { value: json(value) } });
  await ctx.prisma.$transaction(async (tx) => {
    await write(tx, 'mode', input.mode);
    await write(tx, 'defaultView', input.defaultView);
    await write(tx, 'hoodieId', requested ?? null);
    await write(tx, 'model3d', model);
    await write(tx, 'colors', input.colors.map((c) => ({ colorId: c.colorId, hoodieImage2d: c.hoodieImage2d, overlay2d: c.overlay2d, placement2d: c.placement2d })));
    await write(tx, 'stimpieTextures', input.stimpieTextures);
  });
  return getAdminBuilder(ctx);
}

