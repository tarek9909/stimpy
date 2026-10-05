import { z } from 'zod';
import { assetUrl } from '../catalog/schemas';

export const modeEnum = z.enum(['2D', '3D', 'BOTH']);
export const viewEnum = z.enum(['2D', '3D']);
export const lightingEnum = z.enum(['STUDIO', 'SOFT', 'NIGHT']);

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const coord = z.number().min(-1000).max(1000);
const vec3In = z.tuple([coord, coord, coord]);

const cameraSchema = z.object({ position: vec3, target: vec3, fov: z.number() });
const placementSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), rotation: z.number() });

const model3dSchema = z.object({
  url: z.string(),
  sizeBytes: z.number().int(),
  backPanelMesh: z.string(),
  panelAspect: z.number(),
  camera: cameraSchema,
  lighting: lightingEnum,
});

const colorEntrySchema = z.object({
  colorId: z.number().int(),
  tint: z.string().nullable(),
  texture3d: z.string().nullable(),
  hoodieImage2d: z.string().nullable(),
  overlay2d: z.string().nullable(),
  placement2d: placementSchema.nullable(),
});
const textureSchema = z.object({ stimpieId: z.number().int(), textureUrl: z.string() });
const hoodieRef = z.object({ id: z.number().int(), slug: z.string(), name: z.string() });

/** `GET /builder/config` (public). */
export const publicBuilderSchema = z
  .object({
    mode: modeEnum,
    effectiveMode: modeEnum,
    defaultView: viewEnum,
    hoodie: hoodieRef.nullable(),
    model3d: model3dSchema.nullable(),
    colors: z.array(colorEntrySchema),
    stimpieTextures: z.array(textureSchema),
  })
  .meta({ id: 'BuilderConfig' });

/** `GET` / `PUT /admin/builder`: the public shape with `mode` as set (no `effectiveMode`) plus `assetsReady` and `warnings`. */
export const adminBuilderSchema = z
  .object({
    mode: modeEnum,
    defaultView: viewEnum,
    hoodieId: z.number().int().nullable(),
    hoodie: hoodieRef.nullable(),
    model3d: model3dSchema.nullable(),
    colors: z.array(colorEntrySchema),
    stimpieTextures: z.array(textureSchema),
    assetsReady: z.object({
      model3d: z.boolean(),
      colors2d: z.array(z.object({ colorId: z.number().int(), ready: z.boolean() })),
      overlays2d: z.number().int(),
      stimpieTextures: z.number().int(),
    }),
    warnings: z.array(z.string()),
  })
  .meta({ id: 'AdminBuilder' });

// ---------------------------------------------------------------- PUT body (the full object as returned by GET)

const placementIn = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  rotation: z.number().min(-180).max(180),
});

export const builderPutBody = z.strictObject({
  mode: modeEnum,
  defaultView: viewEnum,
  hoodieId: z.number().int().min(1).nullable().optional(),
  /** Read-only echo of GET (`hoodieId` wins when both are sent). */
  hoodie: z.looseObject({ id: z.number().int().optional() }).nullable().optional(),
  model3d: z
    .strictObject({
      url: assetUrl,
      /** Filled in by the server from the upload; accepted so GET's object can be sent back unchanged. */
      sizeBytes: z.number().optional(),
      backPanelMesh: z.string().trim().min(1, 'Name the mesh that receives the Stimpie artwork.').max(120),
      panelAspect: z.number().gt(0).max(10),
      camera: z.strictObject({
        position: vec3In,
        target: vec3In,
        fov: z.number().min(10).max(100),
      }),
      lighting: lightingEnum,
    })
    .nullable()
    .default(null),
  colors: z
    .array(
      z.strictObject({
        colorId: z.number().int().min(1),
        /** Read-only (edited in /admin/colors): accepted and ignored. */
        tint: z.unknown().optional(),
        texture3d: z.unknown().optional(),
        hoodieImage2d: assetUrl.nullable().default(null),
        overlay2d: assetUrl.nullable().default(null),
        placement2d: placementIn.nullable().default(null),
      }),
    )
    .max(200)
    .default([]),
  stimpieTextures: z.array(z.strictObject({ stimpieId: z.number().int().min(1), textureUrl: assetUrl })).max(500).default([]),
  /** Read-only echoes of GET, ignored. */
  assetsReady: z.unknown().optional(),
  warnings: z.unknown().optional(),
});
export type BuilderPutBody = z.infer<typeof builderPutBody>;
