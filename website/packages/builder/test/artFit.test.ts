import { describe, expect, it } from 'vitest';
import { analyzeArt, CUTOUT_INSET } from '../src/lib/artFit';

/** A small RGBA image painted by a function of the pixel. */
function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
  return data;
}
const FLAT: [number, number, number, number] = [10, 20, 30, 255];

describe('fitting any artwork on the panel', () => {
  it('fills the panel when the shapes match, including within the 2% tolerance', () => {
    expect(analyzeArt(image(75, 100, () => FLAT), 75, 100, 0.75).place).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(analyzeArt(image(76, 100, () => FLAT), 76, 100, 0.75).place).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('keeps a tall image whole, centred, and continues its flat edge colour', () => {
    const fit = analyzeArt(image(50, 100, () => FLAT), 50, 100, 0.75);
    expect(fit.place.h).toBe(1);
    expect(fit.place.w).toBeCloseTo(0.5 / 0.75);
    expect(fit.place.x).toBeCloseTo((1 - 0.5 / 0.75) / 2);
    expect(fit.fill).toBe('rgb(10,20,30)');
  });

  it('keeps a wide image whole and reads the top and bottom edges', () => {
    const fit = analyzeArt(image(100, 50, () => FLAT), 100, 50, 0.75);
    expect(fit.place.w).toBe(1);
    expect(fit.place.h).toBeCloseTo(0.75 / 2);
    expect(fit.fill).toBe('rgb(10,20,30)');
  });

  it('lets the hoodie colour show beside a busy image', () => {
    const noisy = image(50, 100, (x, y) => ((x + y) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(analyzeArt(noisy, 50, 100, 0.75).fill).toBeNull();
  });

  it('does not treat two different flat sides as one colour', () => {
    const split = image(50, 100, (x) => (x < 25 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(analyzeArt(split, 50, 100, 0.75).fill).toBeNull();
  });

  it('ignores transparent margins and shows the hoodie colour around a cutout', () => {
    const cutout = image(100, 100, (x, y) => (x >= 25 && x < 75 && y >= 10 && y < 90 ? FLAT : [0, 0, 0, 0]));
    const fit = analyzeArt(cutout, 100, 100, 0.75);
    expect(fit.source).toEqual({ x: 0.25, y: 0.1, w: 0.5, h: 0.8 });
    expect(fit.fill).toBeNull();
    expect(fit.place.h).toBeCloseTo(1 - CUTOUT_INSET * 2);
    expect(fit.place.w / fit.place.h * 0.75).toBeCloseTo(50 / 80);
  });

  it('survives a fully transparent image', () => {
    expect(analyzeArt(image(10, 10, () => [0, 0, 0, 0]), 10, 10, 0.75).fill).toBeNull();
  });
});
