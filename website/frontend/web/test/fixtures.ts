import type { CartItem, HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import type { CartLineUi } from '@/features/cart/types';

export const ui = (over: Partial<CartLineUi> = {}): Omit<CartLineUi, 'addedAt'> => ({
  title: 'Hoodie + 2 Stimpies',
  imageUrl: null,
  hoodieSlug: 'stimpy-hoodie',
  packSlug: 'two',
  colorName: 'Black',
  colorHex: '#111111',
  sizeLabel: 'M',
  stimpies: [],
  unitPriceCents: 4500,
  ...over,
});

export const pack = (over: Partial<Extract<CartItem, { kind: 'pack' }>> = {}): CartItem => ({
  kind: 'pack',
  packId: 2,
  hoodieId: 1,
  colorId: 1,
  sizeId: 3,
  stimpieIds: [4, 7],
  qty: 1,
  ...over,
});

export const stimpie = (over: Partial<Stimpie> = {}): Stimpie => ({
  id: 4,
  slug: 'the-void',
  name: 'THE VOID',
  type: 'CORE',
  priceCents: 1000,
  compareAtPriceCents: null,
  story: 's',
  images: [],
  artworkUrl: 'http://x/a.webp',
  artworkWidth: 800,
  artworkHeight: 1250,
  drop: null,
  status: 'AVAILABLE',
  remaining: null,
  purchasable: true,
  ...over,
});

export const packs: Pack[] = [
  { id: 1, slug: 'one', name: 'Hoodie + 1 Stimpie', description: '', stimpieCount: 1, priceCents: 3500, compareAtPriceCents: null, badge: null },
  { id: 2, slug: 'two', name: 'Hoodie + 2 Stimpies', description: '', stimpieCount: 2, priceCents: 4500, compareAtPriceCents: null, badge: 'Most popular' },
];

export const hoodie = (): HoodieDetail => ({
  id: 1,
  slug: 'stimpy-hoodie',
  name: 'Stimpy Hoodie',
  description: '',
  priceCents: 2500,
  compareAtPriceCents: null,
  images: ['http://x/h.webp'],
  inStock: true,
  details: [],
  colors: [
    { id: 1, name: 'Black', hex: '#111111', position: 1, active: true, images: [], builderTint: null, builderTexture: null },
    { id: 2, name: 'Cream', hex: '#FFF4E6', position: 2, active: true, images: [], builderTint: null, builderTexture: null },
  ],
  sizes: [
    { id: 3, label: 'M', position: 1, active: true },
    { id: 4, label: 'L', position: 2, active: true },
  ],
  variants: [
    { colorId: 1, sizeId: 3, inStock: true, remaining: null },
    { colorId: 1, sizeId: 4, inStock: false, remaining: null },
    { colorId: 2, sizeId: 3, inStock: false, remaining: null },
    { colorId: 2, sizeId: 4, inStock: true, remaining: 3 },
  ],
});
