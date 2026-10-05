'use client';

import { useState } from 'react';
import { STIMPIE_RATIO } from '@stimpy/ui';
import { Gallery } from './Gallery';

/** Flat artwork first, then lifestyle photos. The artwork keeps its 0.64 ratio and is never cropped. */
export function StimpieGallery({ name, artworkUrl, images }: { name: string; artworkUrl: string; images: string[] }) {
  const [index, setIndex] = useState(0);
  const urls = [artworkUrl, ...images.filter((u) => u !== artworkUrl)];
  return (
    <Gallery
      images={urls.map((src, i) => ({ src, alt: i === 0 ? `${name} Stimpie, flat` : `${name} Stimpie, photo ${i}` }))}
      index={index}
      onIndexChange={setIndex}
      label={`${name} photos`}
      ratio={STIMPIE_RATIO}
      priority
      sizes="(min-width: 1024px) 480px, 100vw"
      className="mx-auto w-full max-w-md"
    />
  );
}
