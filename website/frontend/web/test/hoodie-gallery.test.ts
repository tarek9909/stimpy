import { describe, expect, it } from 'vitest';
import { galleryImages } from '@/features/shop/HoodieConfigurator';
import { hoodie } from './fixtures';

describe('hoodie shop gallery', () => {
  it.each(['black', 'cream', 'stone', 'coral'])('uses the guide-free %s back photo, including after fresh API data arrives', (color) => {
    const product = hoodie();
    const front = `http://localhost:4000/uploads/seed/hoodies/photo-front-${color}-1234abcd.webp`;
    const back = `http://localhost:4000/uploads/seed/hoodies/photo-back-${color}-1234abcd.webp`;
    product.colors[0]!.name = color;
    product.colors[0]!.images = [front, back];
    product.images = [front, back];

    expect(galleryImages(product, 1)).toEqual([
      { src: front, alt: `Stimpy Hoodie, ${color}, photo 1` },
      { src: `/images/hoodies/back-${color}-v2.webp`, alt: `Stimpy Hoodie, ${color}, photo 2` },
    ]);
    const refreshed = { ...product, colors: product.colors.map((c) => ({ ...c, images: c.images.map((url) => `${url}?updated=1`) })) };
    expect(galleryImages(refreshed, 1).filter((img) => img.src === `/images/hoodies/back-${color}-v2.webp`)).toHaveLength(1);
    expect(product.colors[0]!.images).toEqual([front, back]);
  });

  it('preserves custom uploads, front views, other seed assets and invalid URLs', () => {
    const product = hoodie();
    product.images = [
      '/uploads/custom/photo-back-cream-1234abcd.webp',
      '/uploads/seed/hoodies/photo-front-cream-1234abcd.webp',
      '/uploads/seed/hoodies/photo-back-custom-1234abcd.webp',
      '/uploads/seed/builder/back-cream-1234abcd.webp',
      'http://[invalid',
    ];
    expect(galleryImages(product, null).map((image) => image.src)).toEqual(product.images);
  });

  it('replaces product-level back photos even without a selected colour and is idempotent', () => {
    const product = hoodie();
    product.images = ['/uploads/seed/hoodies/photo-back-cream-aabbccdd.webp'];
    const mapped = galleryImages(product, null);
    expect(mapped).toEqual([{ src: '/images/hoodies/back-cream-v2.webp', alt: 'Stimpy Hoodie, photo 1' }]);
    expect(galleryImages({ ...product, images: mapped.map((image) => image.src) }, null)).toEqual(mapped);
  });

  it('deduplicates old and new versions while keeping the selected colour first', () => {
    const product = hoodie();
    product.colors[0]!.images = ['/uploads/seed/hoodies/photo-back-black-aabbccdd.webp'];
    product.images = ['/images/hoodies/back-black-v2.webp', '/uploads/seed/hoodies/photo-back-cream-aabbccdd.webp'];
    expect(galleryImages(product, 1)).toEqual([
      { src: '/images/hoodies/back-black-v2.webp', alt: 'Stimpy Hoodie, Black, photo 1' },
      { src: '/images/hoodies/back-cream-v2.webp', alt: 'Stimpy Hoodie, photo 2' },
    ]);
  });
});
