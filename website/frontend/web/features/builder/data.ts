/**
 * Server-safe mapping from the API payloads to the props of `@stimpy/builder`. The package only needs a slice of
 * each payload, so the page ships far less JSON to the browser (no stories, galleries or cost fields).
 */
import type { BuilderConfig, HoodieDetail, OptionsResponse, Pack, Stimpie } from '@stimpy/api-client';
import type { BuilderData, BuilderHoodie, BuilderPack, BuilderStimpie } from '@stimpy/builder';

export function toBuilderStimpie(s: Stimpie): BuilderStimpie {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    type: s.type,
    priceCents: s.priceCents,
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
    stimpieCount: p.stimpieCount,
    priceCents: p.priceCents,
    badge: p.badge,
  };
}

export function toBuilderHoodie(h: HoodieDetail): BuilderHoodie {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    priceCents: h.priceCents,
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
  return {
    config: args.config,
    colors: args.options.colors.map((c) => ({ id: c.id, name: c.name, hex: c.hex, position: c.position, images: c.images.slice(0, 1) })),
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
}): BuilderData {
  return {
    config: {
      ...args.config,
      mode: '2D',
      effectiveMode: '2D',
      defaultView: '2D',
      model3d: null,
      stimpieTextures: [],
      colors: args.config.colors.map((c) => ({ ...c, tint: null, texture3d: null })),
    },
    colors: args.options.colors.map((c) => ({ id: c.id, name: c.name, hex: c.hex, position: c.position, images: [] })),
    stimpies: args.stimpies.map(toBuilderStimpie),
    packs: [],
    hoodie: null,
  };
}
