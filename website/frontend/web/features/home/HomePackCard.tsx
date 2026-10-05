'use client';

import { useRouter } from 'next/navigation';
import { PackCard } from '@stimpy/ui';
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
  highlight,
}: {
  pack: Pack;
  hoodieSlug: string | null;
  effectiveExtraCents?: number;
  highlight?: boolean;
}) {
  const router = useRouter();
  return (
    <PackCard
      pack={pack}
      effectiveExtraCents={effectiveExtraCents}
      highlight={highlight}
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
