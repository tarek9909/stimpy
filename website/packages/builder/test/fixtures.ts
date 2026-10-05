import type { BuilderData, BuilderPack, BuilderStimpie } from '../src/types';

export const PLACEMENT = { x: 0.5, y: 0.46, width: 0.36, rotation: 0 };

export function stimpie(id: number, over: Partial<BuilderStimpie> = {}): BuilderStimpie {
  return {
    id,
    slug: `stimpie-${id}`,
    name: `Stimpie ${id}`,
    type: 'CORE',
    priceCents: 1000,
    artworkUrl: `http://api.test/uploads/art-${id}.webp`,
    artworkWidth: 800,
    artworkHeight: 1250,
    drop: null,
    status: 'AVAILABLE',
    remaining: null,
    purchasable: true,
    ...over,
  };
}

export const PACKS: BuilderPack[] = [
  { id: 1, slug: 'hoodie-1', name: 'Hoodie + 1 Stimpie', description: 'One hoodie, one Stimpie.', stimpieCount: 1, priceCents: 3500, badge: null },
  { id: 2, slug: 'hoodie-2', name: 'Hoodie + 2 Stimpies', description: 'One hoodie, two Stimpies.', stimpieCount: 2, priceCents: 4500, badge: 'Most popular' },
];

export function data(over: Partial<BuilderData> = {}): BuilderData {
  return {
    config: {
      mode: '2D',
      effectiveMode: '2D',
      defaultView: '2D',
      hoodie: { id: 7, slug: 'stimpy-hoodie', name: 'Stimpy Hoodie' },
      model3d: null,
      colors: [
        { colorId: 1, tint: '#111111', texture3d: null, hoodieImage2d: 'http://api.test/uploads/black.webp', overlay2d: 'http://api.test/uploads/shade.webp', placement2d: PLACEMENT },
        { colorId: 2, tint: null, texture3d: null, hoodieImage2d: 'http://api.test/uploads/cream.webp', overlay2d: null, placement2d: { ...PLACEMENT, rotation: 10 } },
        { colorId: 3, tint: null, texture3d: null, hoodieImage2d: null, overlay2d: null, placement2d: null },
      ],
      stimpieTextures: [{ stimpieId: 2, textureUrl: 'http://api.test/uploads/tex-2.webp' }],
    },
    colors: [
      { id: 2, name: 'Cream', hex: '#FFF4E6', position: 2, images: ['http://api.test/uploads/cream-photo.webp'] },
      { id: 1, name: 'Black', hex: '#111111', position: 1, images: [] },
      { id: 3, name: 'Stone', hex: '#B8B2A7', position: 3 },
      { id: 4, name: 'Coral', hex: '#FF7A59', position: 4 },
    ],
    stimpies: [
      stimpie(1),
      stimpie(2),
      stimpie(3, { status: 'SOLD_OUT', purchasable: false }),
      stimpie(4, { type: 'LIMITED', status: 'LOW', remaining: 3, drop: { slug: 'drop-1', name: 'Drop 1', accentHex: '#FFE45C' } }),
    ],
    packs: PACKS,
    hoodie: {
      id: 7,
      slug: 'stimpy-hoodie',
      name: 'Stimpy Hoodie',
      priceCents: 2500,
      images: ['http://api.test/uploads/hoodie.webp'],
      inStock: true,
      sizes: [
        { id: 10, label: 'S', position: 1 },
        { id: 11, label: 'M', position: 2 },
        { id: 12, label: 'L', position: 3 },
      ],
      variants: [
        { colorId: 1, sizeId: 10, inStock: true, remaining: null },
        { colorId: 1, sizeId: 11, inStock: true, remaining: 4 },
        { colorId: 1, sizeId: 12, inStock: false, remaining: null },
        { colorId: 2, sizeId: 10, inStock: false, remaining: null },
        { colorId: 2, sizeId: 11, inStock: false, remaining: null },
        { colorId: 2, sizeId: 12, inStock: false, remaining: null },
      ],
    },
    ...over,
  };
}
