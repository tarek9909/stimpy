'use client';

import { useRouter } from 'next/navigation';
import { PackTile } from './HomeCommerce';
import type { Pack } from '@stimpy/api-client';
import { track } from '@/lib/track';

/**
 * Pack tile for the home page. "Choose" opens the hoodie page with the pack preselected
 * (`/shop/hoodie/{slug}?pack={packSlug}`), where the shared `PackComposer` collects colour, size and Stimpies.
 */
export function HomePackCard({
  pack,
  hoodieSlug,
  effectiveExtraCents,
}: {
  pack: Pack;
  hoodieSlug: string | null;
  effectiveExtraCents?: number;
}) {
  const router = useRouter();
  return (
    <PackTile
      pack={pack}
      hoodieSlug={hoodieSlug}
      extraCents={effectiveExtraCents}
      onChoose={
        hoodieSlug
          ? () => {
              track('cta_click', { id: `pack_${pack.slug}`, path: '/' });
              router.push(`/shop/hoodie/${hoodieSlug}?pack=${encodeURIComponent(pack.slug)}`);
            }
          : undefined
      }
    />
  );
}
