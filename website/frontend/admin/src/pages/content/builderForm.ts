import type { BuilderConfigData, BuilderData, BuilderStimpie, OptionColor } from '@stimpy/builder';
import type { Schemas } from '../../api/client';
import { validatePlacement, type Placement } from './placement';

/** `GET /admin/builder`; also the shape of the form held in local state (builder.md 8). */
export type AdminBuilder = Schemas['AdminBuilder'];
export type BuilderModel = NonNullable<AdminBuilder['model3d']>;
export type BuilderColorEntry = AdminBuilder['colors'][number];
export type Lighting = 'STUDIO' | 'SOFT' | 'NIGHT';
export type Mode = '2D' | '3D' | 'BOTH';

type PreviewHoodie = Pick<Schemas['AdminHoodie'], 'id' | 'slug' | 'name' | 'active' | 'colorIds' | 'sizeIds'>;

/** Match the storefront's active hoodie and its assigned options, including hidden sizes. */
export function builderOptionScope<C extends { id: number; active: boolean }>(
  hoodieId: number | null,
  hoodies: readonly PreviewHoodie[],
  colors: readonly C[],
  sizes: readonly { id: number; active: boolean }[],
) {
  const hoodie = hoodies.find((h) => h.id === hoodieId && h.active) ?? hoodies.find((h) => h.active) ?? null;
  const hasSize = hoodie?.sizeIds.some((id) => sizes.some((s) => s.id === id && s.active)) ?? false;
  const assigned = new Set(hasSize ? hoodie?.colorIds : []);
  return { hoodie, colors: colors.filter((c) => c.active && assigned.has(c.id)) };
}

export const emptyColorEntry = (colorId: number): BuilderColorEntry => ({
  colorId,
  tint: null,
  texture3d: null,
  hoodieImage2d: null,
  overlay2d: null,
  placement2d: null,
});

/**
 * The server returns an entry for every colour, but a colour created later has none: make sure the
 * form has one per colour so the cards can edit it (an all-null entry is "not set" and is hidden publicly).
 */
export function withAllColors(form: AdminBuilder, colorIds: readonly number[]): AdminBuilder {
  const have = new Set(form.colors.map((c) => c.colorId));
  const extra = colorIds.filter((id) => !have.has(id)).map(emptyColorEntry);
  return extra.length ? { ...form, colors: [...form.colors, ...extra] } : form;
}

/**
 * Body of `PUT /admin/builder`: the FULL object (it replaces the stored config). Read-only mirrors
 * (`tint`, `texture3d`, `assetsReady`, `warnings`, `hoodie`) are left out; the server ignores them anyway and
 * `sizeBytes` remains a server-owned value from the configured model upload.
 */
export function toPutBody(form: AdminBuilder) {
  return {
    mode: form.mode,
    defaultView: form.defaultView,
    hoodieId: form.hoodieId,
    model3d: form.model3d
      ? {
          url: form.model3d.url,
          backPanelMesh: form.model3d.backPanelMesh.trim(),
          panelAspect: form.model3d.panelAspect,
          camera: { position: [...form.model3d.camera.position], target: [...form.model3d.camera.target], fov: form.model3d.camera.fov },
          lighting: form.model3d.lighting,
        }
      : null,
    colors: form.colors.map((c) => ({ colorId: c.colorId, hoodieImage2d: c.hoodieImage2d, overlay2d: c.overlay2d, placement2d: c.placement2d })),
    stimpieTextures: form.stimpieTextures.map((t) => ({ stimpieId: t.stimpieId, textureUrl: t.textureUrl })),
  };
}

/** True when a 3D model with a named back-panel mesh is set (business-rules 12). */
export const model3dReady = (form: Pick<AdminBuilder, 'model3d'>): boolean => !!form.model3d && !!form.model3d.url && form.model3d.backPanelMesh.trim() !== '';

/** `effectiveMode` by business-rules 12: 3D and BOTH fall back to 2D without a ready model. */
export function effectiveModeOf(form: Pick<AdminBuilder, 'mode' | 'model3d'>): Mode {
  if (form.mode === '2D') return '2D';
  return model3dReady(form) ? form.mode : '2D';
}

export interface Readiness {
  model3d: boolean;
  /** Active colours with a 2D image AND a placement. */
  colors2d: { colorId: number; ready: boolean }[];
  overlays2d: number;
  stimpieTextures: number;
}

/** Same definitions as the server's `assetsReady`, computed live from the unsaved form. */
export function readinessOf(form: AdminBuilder, activeColorIds: readonly number[]): Readiness {
  const active = new Set(activeColorIds);
  const entries = form.colors.filter((c) => active.has(c.colorId));
  return {
    model3d: model3dReady(form),
    colors2d: activeColorIds.map((id) => {
      const e = form.colors.find((c) => c.colorId === id);
      return { colorId: id, ready: !!e && !!e.hoodieImage2d && !!e.placement2d };
    }),
    overlays2d: entries.filter((c) => !!c.overlay2d).length,
    stimpieTextures: form.stimpieTextures.length,
  };
}

/** Amber notes shown under the mode selector (before saving; the server's `warnings` are shown after). */
export function modeNotes(form: AdminBuilder, r: Readiness): string[] {
  const notes: string[] = [];
  if ((form.mode === '3D' || form.mode === 'BOTH') && !r.model3d) {
    notes.push('No 3D model is configured. The website will use 2D until the model is configured in code.');
  }
  const missing2d = r.colors2d.filter((c) => !c.ready).length;
  if ((form.mode === '2D' || form.mode === 'BOTH') && r.colors2d.length > 0 && missing2d === r.colors2d.length) {
    notes.push('No colour has a 2D image and placement yet. The 2D Builder shows a generic shape until one is set.');
  }
  return notes;
}

export type FormErrors = Record<string, string>;

/** Blocking client validation for editable 2D colour placements. */
export function validateBuilder(form: AdminBuilder): FormErrors {
  const errors: FormErrors = {};
  form.colors.forEach((c, i) => {
    if (c.placement2d) {
      const problems = validatePlacement(c.placement2d as Placement);
      if (problems.length) errors[`colors.${i}.placement2d`] = problems[0] as string;
    }
  });
  return errors;
}

export interface PreviewInput {
  form: AdminBuilder;
  colors: readonly OptionColor[];
  stimpies: readonly BuilderStimpie[];
}

/**
 * Maps the UNSAVED form to what `<Builder />` consumes (the shape of `GET /builder/config`). The preview shows the
 * 2D/3D toggle whatever mode is being edited, so `effectiveMode` is `BOTH` when a model is set (builder.md 8) and the
 * starting view follows the chosen mode.
 */
export function toPreviewData({ form, colors, stimpies }: PreviewInput): BuilderData {
  const ready = model3dReady(form);
  const view = form.mode === '3D' ? '3D' : form.mode === '2D' ? '2D' : form.defaultView;
  const config: BuilderConfigData = {
    mode: form.mode,
    effectiveMode: ready ? 'BOTH' : '2D',
    defaultView: ready ? view : '2D',
    hoodie: form.hoodie ? { id: form.hoodie.id, slug: form.hoodie.slug, name: form.hoodie.name } : null,
    model3d: ready && form.model3d ? { ...form.model3d, camera: { ...form.model3d.camera } } : null,
    colors: form.colors.map((c) => ({ ...c })),
    stimpieTextures: form.stimpieTextures,
  };
  return { config, colors, stimpies, packs: [], hoodie: null };
}

/** Stable text of the part of the form that is saved, for dirty detection. */
export const formFingerprint = (form: AdminBuilder): string => JSON.stringify(toPutBody(form));

/** "Not found" check for the back-panel mesh: the dropdown lists parsed node names; a stored name not in them is flagged. */
export function meshProblem(meshName: string, names: readonly string[] | null): string | null {
  if (!names || names.length === 0 || meshName === '') return null;
  return names.includes(meshName) ? null : `Mesh '${meshName}' not found in this model`;
}
