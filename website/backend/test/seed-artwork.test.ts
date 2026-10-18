import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { renderSeedHoodieSvg, SEED_PLACEMENT_2D } from '../prisma/seed-assets';

describe('builder seed artwork', () => {
  it.each(['#FFF4E6', '#111111', '#B8B2A7', '#FF7A59'])('renders a clean %s back without a fixed placement guide', async (hex) => {
    const svg = renderSeedHoodieSvg('back', hex, { background: null });
    expect(svg).not.toContain('stroke-dasharray');
    expect(svg).not.toContain('<rect');
    const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 1200, height: 1500, channels: 4 });
    // The old guide crossed empty space beside the hood. It must be fully transparent now.
    for (let y = 350; y < 440; y += 10) {
      for (let x = 380; x <= 390; x++) expect(data[(y * info.width + x) * 4 + 3]).toBe(0);
    }
  });
  it('places new seed artwork in the torso below the hood', () => {
    expect(SEED_PLACEMENT_2D).toEqual({ x: 0.5, y: 0.6, width: 0.3, rotation: 0 });
  });
});
