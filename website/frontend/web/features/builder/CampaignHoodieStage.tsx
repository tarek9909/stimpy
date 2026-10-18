'use client';

import { useId } from 'react';
import type { BuilderStimpie, JoinedColor } from '@stimpy/builder';
import { placementStyle } from '@stimpy/builder/src/lib/placement';

const CAMPAIGN_IMAGE = '/images/stimpy-campaign-v1.png';
const CAMPAIGN_VIEW = '1000 0 809 809';
const CAMPAIGN_PLACEMENT = { x: 0.522, y: 0.534, width: 0.352, rotation: 0 };

// Coordinates follow the hoodie in the campaign image. The inner path leaves the printed back panel untouched,
// so the chosen Stimpie artwork stays crisp while the fabric takes on the selected colour.
const HOODIE_CLIP = [
  'M 1318 7',
  'C 1360 0 1510 2 1554 16',
  'L 1596 91 C 1627 111 1660 128 1687 158',
  'C 1729 207 1776 333 1808 438',
  'C 1830 514 1821 621 1772 672 L 1725 714 L 1674 679',
  'L 1650 772 C 1553 791 1313 791 1208 773 L 1187 674 L 1139 711',
  'C 1092 703 1051 671 1034 640 C 1005 588 1009 519 1025 468',
  'C 1051 369 1092 270 1135 209 C 1166 166 1198 145 1241 124',
  'L 1283 95 Z',
  'M 1268 199 H 1591 V 671 H 1268 Z',
].join(' ');

/** Photo-based storefront Builder preview, matched to the homepage campaign hoodie. */
export function CampaignHoodieStage({ color, stimpie, priority = false, className }: {
  color: JoinedColor;
  stimpie: BuilderStimpie;
  priority?: boolean;
  className?: string;
}) {
  const clipId = `campaign-hoodie-${useId().replace(/:/g, '')}`;

  return (
    <div
      data-builder-stage="2d"
      data-builder-scene="campaign"
      role="img"
      aria-label={`${color.name} Stimpy hoodie with the ${stimpie.name} Stimpie`}
      className={['relative aspect-square w-full select-none overflow-hidden bg-[#d2d2d2]', className].filter(Boolean).join(' ')}
      style={{ isolation: 'isolate' }}
    >
      <img
        data-layer="hoodie"
        src={CAMPAIGN_IMAGE}
        alt=""
        aria-hidden="true"
        width={1942}
        height={809}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '88.3% center' }}
        draggable={false}
      />

      <svg
        aria-hidden="true"
        viewBox={CAMPAIGN_VIEW}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'screen', opacity: 0.82, filter: 'blur(1px)' }}
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={HOODIE_CLIP} fillRule="evenodd" clipRule="evenodd" />
          </clipPath>
        </defs>
        <rect x="1000" y="0" width="809" height="809" fill={color.hex} clipPath={`url(#${clipId})`} />
      </svg>

      <div data-layer="panel" className="absolute" style={placementStyle(CAMPAIGN_PLACEMENT)}>
        <img
          data-layer="stimpie"
          src={stimpie.artworkUrl}
          alt=""
          aria-hidden="true"
          width={160}
          height={250}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="absolute inset-0 h-full w-full object-fill"
          draggable={false}
        />
      </div>
    </div>
  );
}
