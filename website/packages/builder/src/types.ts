/**
 * Structural types for everything the Builder consumes. They are deliberately NOT imported from the API client:
 * the generated `@stimpy/api-client` types satisfy them (the website passes them straight in) and the dashboard can
 * build them from unsaved form state. No `next/*`, no fetching, no globals.
 */

export type BuilderMode = '2D' | '3D' | 'BOTH';
export type BuilderView = '2d' | '3d';
export type LightingPreset = 'STUDIO' | 'SOFT' | 'NIGHT';
export type Tier = 'high' | 'mid' | 'low';

export type Vec3 = readonly [number, number, number];

export interface CameraView {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface Placement2d {
  /** Panel centre as a fraction (0..1) of the hoodie image width. */
  x: number;
  /** Panel centre as a fraction (0..1) of the hoodie image height. */
  y: number;
  /** Panel width as a fraction of the image width. */
  width: number;
  /** Degrees, clockwise, about the centre. */
  rotation: number;
}

export interface BuilderModel3d {
  url: string;
  sizeBytes: number;
  backPanelMesh: string;
  panelAspect: number;
  camera: { position: readonly number[]; target: readonly number[]; fov: number };
  lighting: LightingPreset;
}

export interface BuilderConfigColor {
  colorId: number;
  tint: string | null;
  texture3d: string | null;
  hoodieImage2d: string | null;
  overlay2d: string | null;
  placement2d: Placement2d | null;
}

export interface BuilderConfigData {
  mode: BuilderMode;
  /** The only mode the page may use (builder.md 2.1). */
  effectiveMode: BuilderMode;
  defaultView: BuilderView | '2D' | '3D';
  hoodie: { id: number; slug: string; name: string } | null;
  model3d: BuilderModel3d | null;
  colors: readonly BuilderConfigColor[];
  stimpieTextures: readonly { stimpieId: number; textureUrl: string }[];
}

/** `GET /options` colour. */
export interface OptionColor {
  id: number;
  name: string;
  hex: string;
  position: number;
  images?: readonly string[];
}

export type StimpieStatus = 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';

export interface BuilderStimpie {
  id: number;
  slug: string;
  name: string;
  type: 'CORE' | 'LIMITED';
  priceCents: number;
  compareAtPriceCents?: number | null;
  artworkUrl: string;
  artworkWidth: number | null;
  artworkHeight: number | null;
  drop: { slug: string; name: string; accentHex: string } | null;
  status: StimpieStatus;
  remaining: number | null;
  purchasable: boolean;
}

export interface BuilderPack {
  id: number;
  slug: string;
  name: string;
  description: string;
  stimpieCount: number;
  priceCents: number;
  compareAtPriceCents?: number | null;
  badge: string | null;
}

export interface BuilderSize {
  id: number;
  label: string;
  position: number;
}

/** `GET /products/hoodies/:slug` (the hoodie the Builder sells). */
export interface BuilderHoodie {
  id: number;
  slug: string;
  name: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  images: readonly string[];
  inStock: boolean;
  sizes: readonly BuilderSize[];
  variants: readonly { colorId: number; sizeId: number; inStock: boolean; remaining: number | null }[];
}

/** The three payloads (plus packs and the hoodie detail) as props. */
export interface BuilderData {
  config: BuilderConfigData;
  colors: readonly OptionColor[];
  stimpies: readonly BuilderStimpie[];
  packs: readonly BuilderPack[];
  /** Absent in the dashboard preview when the hoodie detail is not loaded: sizes and stock then are unknown. */
  hoodie?: BuilderHoodie | null;
}

/** A colour that exists in `GET /options` and has a `config.colors` entry (builder.md 2.2). */
export interface JoinedColor {
  id: number;
  name: string;
  hex: string;
  position: number;
  /** Colour photo from the shop (`Color.images[0]`), used by the static fallback. */
  photo: string | null;
  tint: string | null;
  texture3d: string | null;
  hoodieImage2d: string | null;
  overlay2d: string | null;
  placement2d: Placement2d | null;
}

/** Exactly the `CartItem` of checkout-and-order-flow.md section 1.1 (hoodie and pack kinds). */
export type BuilderCartItem =
  | { kind: 'pack'; packId: number; hoodieId: number; colorId: number; sizeId: number; stimpieIds: number[]; qty: 1 }
  | { kind: 'hoodie'; hoodieId: number; colorId: number; sizeId: number; qty: 1 };

/** Display data the host cart stores next to the item (names, art URLs, unit price estimate). */
export interface BuilderCartSummary {
  title: string;
  imageUrl: string | null;
  hoodieSlug: string | null;
  packSlug: string | null;
  colorName: string | null;
  colorHex: string | null;
  sizeLabel: string | null;
  stimpies: { id: number; slug: string; name: string; artworkUrl: string; type: 'CORE' | 'LIMITED' }[];
  unitPriceCents: number;
}

export type TrackFn = (event: string, props?: Record<string, string | number | boolean | null | undefined>) => void;

export type FallbackReason =
  | 'WEBGL_UNSUPPORTED'
  | 'CONTEXT_LOST'
  | 'GLB_FAILED'
  | 'PANEL_MESH_MISSING'
  | 'SHADER_PATCH_FAILED'
  | 'SLOW_FRAMES'
  | 'NO_RENDERER';

export type ResolveReason =
  | 'DEFAULT'
  | 'WEBGL_UNSUPPORTED'
  | 'LOW_MEMORY'
  | 'SLOW_CONNECTION'
  | 'SAVE_DATA'
  | 'SLOW_FRAMES'
  | 'USER_TOGGLE';

/** Environment signals the decision order reads. Every field may be missing ("no signal"). */
export interface EnvSignals {
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
  saveData?: boolean | undefined;
  effectiveType?: string | undefined;
  reducedData?: boolean | undefined;
  coarsePointer?: boolean | undefined;
}

export interface WebGLProbe {
  supported: boolean;
  /** `UNMASKED_RENDERER_WEBGL` when exposed. */
  renderer?: string | undefined;
  maxTextureSize?: number | undefined;
}

/** What the dashboard's throttle simulator can force. */
export type ThrottleSimulator =
  | 'none'
  | 'no-webgl'
  | 'slow-3g'
  | 'slow-2g'
  | 'low-tier'
  | { signals?: EnvSignals; extraFrameMs?: number; downloadKbps?: number };

/** Handle exposed through `ref` (dashboard "Use current preview view"). */
export interface BuilderHandle {
  /** The orbit camera right now, or null when the 3D view is not active. */
  getCameraView(): CameraView | null;
  /** Move the orbit camera (3D only); no-op in 2D. */
  setCameraView(view: CameraView): void;
  /** `2d`, `3d` or `static`. */
  getView(): BuilderView | 'static';
}
