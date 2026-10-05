import { describe, expect, it } from 'vitest';
import { toBuilderData, toTeaserData } from '@/features/builder/data';

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
});
