/**
 * Server-safe mapping from the API payloads to the props of `@stimpy/builder`. The package only needs a slice of
 * each payload, so the page ships far less JSON to the browser (no stories, galleries or cost fields).
 */
import type { BuilderConfig, HoodieDetail, OptionsResponse, Pack, Stimpie } from '@stimpy/api-client';
import type { BuilderData, BuilderHoodie, BuilderPack, BuilderStimpie } from '@stimpy/builder';

/** Replace legacy seed drawings with guide-free versions; preserve merchant images and calibrations. */
export function storefrontBuilderConfig(config: BuilderConfig): BuilderConfig {
  return {
    ...config,
    colors: config.colors.map((color) => {
      const p = color.placement2d;
      let seedColor: string | undefined;
      try {
        seedColor = /^\/uploads\/seed\/builder\/back-(black|cream|stone|coral)-[a-f0-9]+\.webp$/.exec(new URL(color.hoodieImage2d ?? '', 'http://localhost').pathname)?.[1];
      } catch { /* Non-URL assets retain their configured placement. */ }
      const starterPlacement = p?.x === 0.5 && p.y === 0.46 && p.width === 0.36 && p.rotation === 0;
      if (!seedColor) return color;
      return {
        ...color,
        hoodieImage2d: `/images/builder/back-${seedColor}-v2.webp`,
        placement2d: starterPlacement ? { ...p, y: 0.6, width: 0.3 } : p,
      };
    }),
  };
}

/** The Builder's hoodie model. It lives in the website, not in the Builder config. */
const STOREFRONT_MODEL: NonNullable<BuilderConfig['model3d']> = {
  url: '/models/hoodie.glb',
  sizeBytes: 2_721_180,
  backPanelMesh: 'back_panel',
  // The print measures 30 x 40 cm; the engine fits any artwork inside this shape.
  panelAspect: 0.75,
  // Starts on the back of the hoodie, where the Stimpie sits. The whole garment, arms included, fits a square stage.
  camera: { position: [0, 0.02, -2.35], target: [0, 0, 0], fov: 32 },
  lighting: 'STUDIO',
};

/** The `/builder` page shows only the 3D model. */
export function threeDimensionalBuilderConfig(config: BuilderConfig): BuilderConfig {
  const storefront = storefrontBuilderConfig(config);
  return {
    ...storefront,
    mode: '3D',
    effectiveMode: '3D',
    defaultView: '3D',
    model3d: STOREFRONT_MODEL,
    stimpieTextures: [],
    colors: storefront.colors.map((color) => ({ ...color, texture3d: null })),
  };
}

/** The homepage teaser uses the image based preview only. */
export function twoDimensionalBuilderConfig(config: BuilderConfig): BuilderConfig {
  const storefront = storefrontBuilderConfig(config);
  return {
    ...storefront,
    mode: '2D',
    effectiveMode: '2D',
    defaultView: '2D',
    model3d: null,
    stimpieTextures: [],
    colors: storefront.colors.map((color) => ({ ...color, texture3d: null })),
  };
}

export function toBuilderStimpie(s: Stimpie): BuilderStimpie {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    type: s.type,
    priceCents: s.priceCents,
    compareAtPriceCents: s.compareAtPriceCents,
    artworkUrl: s.artworkUrl,
    artworkWidth: s.artworkWidth,
    artworkHeight: s.artworkHeight,
    drop: s.drop ? { slug: s.drop.slug, name: s.drop.name, accentHex: s.drop.accentHex } : null,
    status: s.status,
    remaining: s.remaining,
    purchasable: s.purchasable,
  };
}

export function toBuilderPack(p: Pack): BuilderPack {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    type: p.type ?? 'HOODIE_SET',
    eligibleStimpieIds: p.eligibleStimpieIds ?? null,
    stimpieCount: p.stimpieCount,
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    badge: p.badge,
  };
}

export function toBuilderHoodie(h: HoodieDetail): BuilderHoodie {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    priceCents: h.priceCents,
    compareAtPriceCents: h.compareAtPriceCents,
    images: h.images,
    inStock: h.inStock,
    sizes: h.sizes.map((s) => ({ id: s.id, label: s.label, position: s.position })),
    variants: h.variants.map((v) => ({ colorId: v.colorId, sizeId: v.sizeId, inStock: v.inStock, remaining: v.remaining })),
  };
}

export function toBuilderData(args: {
  config: BuilderConfig;
  options: OptionsResponse;
  stimpies: readonly Stimpie[];
  packs: readonly Pack[];
  hoodie: HoodieDetail | null;
}): BuilderData {
  const hoodieColorIds = args.hoodie ? new Set(args.hoodie.colors.map((color) => color.id)) : null;
  return {
    config: threeDimensionalBuilderConfig(args.config),
    colors: args.options.colors
      .filter((color) => hoodieColorIds === null || hoodieColorIds.has(color.id))
      .map((c) => ({ id: c.id, name: c.name, hex: c.hex, position: c.position, images: c.images.slice(0, 1) })),
    stimpies: args.stimpies.map(toBuilderStimpie),
    packs: args.packs.map(toBuilderPack),
    hoodie: args.hoodie ? toBuilderHoodie(args.hoodie) : null,
  };
}

/** The teaser never loads 3D: strip the model and the 3D-only fields so nothing 3D reaches the home page payload. */
export function toTeaserData(args: {
  config: BuilderConfig;
  options: OptionsResponse;
  stimpies: readonly Stimpie[];
  hoodie?: Pick<HoodieDetail, 'colors'> | null;
}): BuilderData {
  const hoodieColorIds = args.hoodie ? new Set(args.hoodie.colors.map((color) => color.id)) : null;
  return {
    config: twoDimensionalBuilderConfig(args.config),
    colors: args.options.colors
      .filter((color) => hoodieColorIds === null || hoodieColorIds.has(color.id))
      .map((c) => ({ id: c.id, name: c.name, hex: c.hex, position: c.position, images: [] })),
    stimpies: args.stimpies.map(toBuilderStimpie),
    packs: [],
    hoodie: null,
  };
}
