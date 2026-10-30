'use client';

import { useId } from 'react';
import { campaignImages } from '@/lib/campaign-images';

// Matches the garment in the existing campaign crop, leaving its printed panel unchanged.
const GARMENT = [
  'M 1318 7 C 1360 0 1510 2 1554 16',
  'L 1596 91 C 1627 111 1660 128 1687 158',
  'C 1729 207 1776 333 1808 438',
  'C 1830 514 1821 621 1772 672 L 1725 714 L 1674 679',
  'L 1650 772 C 1553 791 1313 791 1208 773 L 1187 674 L 1139 711',
  'C 1092 703 1051 671 1034 640 C 1005 588 1009 519 1025 468',
  'C 1051 369 1092 270 1135 209 C 1166 166 1198 145 1241 124',
  'L 1283 95 Z M 1268 199 H 1591 V 671 H 1268 Z',
].join(' ');

/** Campaign photograph for the bundled catalog, with a colour preview matching the Builder. */
export function CampaignHoodiePhoto({ color }: { color: { name: string; hex: string } }) {
  const clip = `shop-hoodie-${useId().replace(/:/g, '')}`;
  const image = campaignImages.builder;
  const sizes = '(min-width: 768px) min(50vw, 580px), min(100vw, 440px)';
  return (
    <div
      data-campaign-hoodie-photo
      role="img"
      aria-label={`${color.name} Stimpy hoodie, back view with THE VOID Stimpie`}
      className="relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden md:max-w-[580px]"
      style={{ isolation: 'isolate' }}
    >
      <picture>
        <source type="image/avif" srcSet={image.avifSrcSet} sizes={sizes} />
        <img src={image.src} srcSet={image.webpSrcSet} sizes={sizes} alt="" aria-hidden="true"
          width={image.width} height={image.height} fetchPriority="high" decoding="async"
          className="absolute inset-0 h-full w-full object-contain" />
      </picture>
      <svg aria-hidden="true" viewBox="1000 0 809 809" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'screen', opacity: 0.82, filter: 'blur(1px)' }}>
        <defs><clipPath id={clip} clipPathUnits="userSpaceOnUse">
          <path d={GARMENT} fillRule="evenodd" clipRule="evenodd" />
        </clipPath></defs>
        <rect x="1000" y="0" width="809" height="809" fill={color.hex} clipPath={`url(#${clip})`} />
      </svg>
    </div>
  );
}

export function isSeedHoodiePhoto(url: string | null): boolean {
  if (!url) return false;
  try {
    return /^\/uploads\/seed\/hoodies\/photo-(front|back)-(black|cream|stone|coral)-[a-f0-9]+\.webp$/
      .test(new URL(url, 'http://localhost').pathname);
  } catch {
    return false;
  }
}
