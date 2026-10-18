import { describe, expect, it } from 'vitest';
import type { BuilderConfig } from '@stimpy/api-client';
import { storefrontBuilderConfig, toBuilderData, toTeaserData } from '@/features/builder/data';
import { hoodie } from './fixtures';

const config = {
  mode: 'BOTH',
  effectiveMode: 'BOTH',
  defaultView: '3D',
  hoodie: { id: 1, slug: 'h', name: 'H' },
  model3d: { url: 'u', sizeBytes: 1, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 30 }, lighting: 'STUDIO' },
  colors: [{ colorId: 1, tint: '#111111', texture3d: 't', hoodieImage2d: 'i', overlay2d: null, placement2d: { x: 0.5, y: 0.5, width: 0.3, rotation: 0 } }],
  stimpieTextures: [{ stimpieId: 1, textureUrl: 'x' }],
} as never;
const options = { colors: [{ id: 1, name: 'Black', hex: '#111111', position: 1, active: true, images: ['a', 'b'], builderTint: null, builderTexture: null }], sizes: [] } as never;
const stimpie = { id: 1, slug: 's', name: 'S', type: 'CORE', priceCents: 1000, story: 'long story', images: ['1', '2'], artworkUrl: 'art', artworkWidth: 800, artworkHeight: 1250, drop: null, status: 'AVAILABLE', remaining: null, purchasable: true } as never;

describe('Builder data mapping', () => {
  it.each(['cream', 'black', 'stone', 'coral'])('centres the %s starter panel below the hood without mutating the API configuration', (name) => {
    const original = { ...config as BuilderConfig, colors: [{ ...((config as BuilderConfig).colors[0]!), hoodieImage2d: `http://localhost:4000/uploads/seed/builder/back-${name}-8ce8c4fc.webp`, placement2d: { x: 0.5, y: 0.46, width: 0.36, rotation: 0 } }] };
    const calibrated = storefrontBuilderConfig(original);
    expect(calibrated.colors[0]?.placement2d).toEqual({ x: 0.5, y: 0.6, width: 0.3, rotation: 0 });
    expect(calibrated.colors[0]?.hoodieImage2d).toBe(`/images/builder/back-${name}-v2.webp`);
    expect(original.colors[0]?.hoodieImage2d).toContain('/uploads/seed/builder/');
    expect(original.colors[0]?.placement2d?.y).toBe(0.46);
    expect(toTeaserData({ config: original, options, stimpies: [stimpie] }).config.colors[0]?.placement2d?.y).toBe(0.6);
  });
  it('preserves custom artwork placement and merchant-uploaded hoodie images', () => {
    const original = { ...config as BuilderConfig, colors: [{ ...((config as BuilderConfig).colors[0]!), hoodieImage2d: '/uploads/custom/back.webp', placement2d: { x: 0.5, y: 0.46, width: 0.36, rotation: 0 } }] };
    expect(storefrontBuilderConfig(original).colors[0]?.placement2d).toEqual(original.colors[0]?.placement2d);
    expect(storefrontBuilderConfig(original).colors[0]?.hoodieImage2d).toBe('/uploads/custom/back.webp');
    original.colors[0]!.hoodieImage2d = '/uploads/seed/builder/back-black-eed97999.webp';
    original.colors[0]!.placement2d.y = 0.57;
    expect(storefrontBuilderConfig(original).colors[0]?.placement2d?.y).toBe(0.57);
  });
  it('keeps the guide-free seed image when mapped repeatedly', () => {
    const original = { ...config as BuilderConfig, colors: [{ ...((config as BuilderConfig).colors[0]!), hoodieImage2d: '/uploads/seed/builder/back-black-eed97999.webp', placement2d: { x: 0.5, y: 0.46, width: 0.36, rotation: 0 } }] };
    const mapped = storefrontBuilderConfig(original);
    expect(storefrontBuilderConfig(mapped)).toEqual(mapped);
  });
  it('keeps only the fields the Builder needs (no story, no gallery)', () => {
    const d = toBuilderData({ config, options, stimpies: [stimpie], packs: [], hoodie: null });
    expect(Object.keys(d.stimpies[0] ?? {})).not.toContain('story');
    expect(Object.keys(d.stimpies[0] ?? {})).not.toContain('images');
    expect(d.colors[0]?.images).toEqual(['a']);
    expect(d.hoodie).toBeNull();
  });
  it('the teaser payload carries no 3D at all', () => {
    const d = toTeaserData({ config, options, stimpies: [stimpie] });
    expect(d.config.model3d).toBeNull();
    expect(d.config.effectiveMode).toBe('2D');
    expect(d.config.colors[0]?.texture3d).toBeNull();
    expect(d.config.stimpieTextures).toEqual([]);
    expect(JSON.stringify(d)).not.toContain('back_panel');
  });
  it('uses only the configured hoodie colours in both the Builder and home teaser', () => {
    const selected = hoodie();
    selected.colors = selected.colors.filter((color) => color.id === 2);
    const args = { config, options: { colors: hoodie().colors, sizes: hoodie().sizes }, stimpies: [stimpie], hoodie: selected };
    expect(toBuilderData({ ...args, packs: [] }).colors.map((color) => color.id)).toEqual([2]);
    expect(toTeaserData(args).colors.map((color) => color.id)).toEqual([2]);
    selected.colors = [];
    expect(toTeaserData(args).colors).toEqual([]);
  });
});
