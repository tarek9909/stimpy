import Link from 'next/link';
import { Media, STIMPIE_RATIO, Section } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { joinColors, usable2D } from '@stimpy/builder/src/lib/join';
import { getBuilderConfig, getOptions } from '@/lib/data';
import { BuilderTeaserGate } from '@/features/builder/BuilderTeaserGate';
import { toTeaserData } from '@/features/builder/data';

/**
 * Builder teaser slot of the home page (builder.md section 12). The interactive teaser is the Builder package in
 * compact mode: 2D only (colour swatches, tap-to-swap carousel, zip wipe, "Open full Builder"), never three.js. It
 * reads the same cached endpoints as the rest of the page (shared Next fetch cache). When the configuration has no
 * usable 2D asset (3D-only setup, or the config call fails) it degrades to the documented static card strip:
 * a hoodie photo with up to six Stimpie art cards and the same link.
 */
export async function BuilderTeaserSlot({ hoodieImage, stimpies }: { hoodieImage: string | null; stimpies: Stimpie[] }) {
  const shown = stimpies.slice(0, 6);
  const [config, options] = await Promise.all([getBuilderConfig().catch(() => null), getOptions().catch(() => null)]);
  const data = config && options && shown.length > 0 ? toTeaserData({ config, options, stimpies: shown }) : null;
  const interactive = !!data && joinColors(data.colors, data.config).some(usable2D);

  return (
    <Section tone="white" heading="Try it on" id="builder-teaser" aria-label="Builder preview" data-slot="builder-teaser">
      {interactive && data ? (
        <div className="flex flex-col gap-6">
          <p className="text-lead text-fg-muted">Pick a hoodie colour, zip through the Stimpies and see your look before you order.</p>
          <BuilderTeaserGate data={data} fallback={<StaticTeaser hoodieImage={hoodieImage} stimpies={shown} />} />
        </div>
      ) : (
        <StaticTeaser hoodieImage={hoodieImage} stimpies={shown} />
      )}
    </Section>
  );
}

function StaticTeaser({ hoodieImage, stimpies }: { hoodieImage: string | null; stimpies: Stimpie[] }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-center" data-builder-teaser-static>
      <div className="mx-auto w-full max-w-md">
        <Media src={hoodieImage} alt="The Stimpy hoodie" ratio="4 / 5" className="rounded-xl" sizes="(min-width: 768px) 40vw, 100vw" />
      </div>
      <div className="flex flex-col gap-6">
        <p className="text-lead text-fg-muted">Pick a hoodie colour, zip through the Stimpies and see your look before you order.</p>
        {stimpies.length > 0 ? (
          <ul className="grid grid-cols-3 gap-3" aria-label="Stimpies you can try">
            {stimpies.map((s) => (
              <li key={s.id}>
                <Media src={s.artworkUrl} alt={`${s.name} Stimpie`} ratio={STIMPIE_RATIO} sizes="(min-width: 768px) 12vw, 28vw" className="rounded-md" />
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          href={stimpies[0] ? `/builder?stimpie=${encodeURIComponent(stimpies[0].slug)}` : '/builder'}
          className="inline-flex min-h-11 self-start items-center justify-center rounded-md border border-control bg-white px-5 py-3 text-body font-semibold text-ink underline-offset-4 hover:bg-cream hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Open full Builder
        </Link>
      </div>
    </div>
  );
}
