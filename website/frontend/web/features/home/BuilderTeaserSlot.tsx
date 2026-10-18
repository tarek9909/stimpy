import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { Media, STIMPIE_RATIO, Section } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { joinColors, usable2D } from '@stimpy/builder/src/lib/join';
import { getBuilderConfig, getHoodie, getOptions } from '@/lib/data';
import { BuilderTeaserGate } from '@/features/builder/BuilderTeaserGate';
import { BuilderTeaserStatic } from '@/features/builder/BuilderTeaserView';
import { toTeaserData } from '@/features/builder/data';

/**
 * Builder teaser slot of the home page (builder.md section 12). The interactive teaser is the Builder package in
 * compact mode: 2D only (colour swatches, tap-to-swap carousel, zip wipe, "Open full Builder"), never three.js. It
 * reads the same cached endpoints as the rest of the page (shared Next fetch cache). When the configuration has no
 * usable 2D asset (3D-only setup, or the config call fails) it degrades to the documented static card strip:
 * a hoodie photo with up to six Stimpie art cards and the same link.
 */
export function BuilderTeaserSlot(props: { hoodieImage: string | null; stimpies: Stimpie[] }) {
  return <Suspense fallback={<TeaserSection><StaticTeaser hoodieImage={props.hoodieImage} stimpies={props.stimpies.slice(0, 6)} /></TeaserSection>}>
    <ConfiguredTeaser {...props} />
  </Suspense>;
}

async function ConfiguredTeaser({ hoodieImage, stimpies }: { hoodieImage: string | null; stimpies: Stimpie[] }) {
  const shown = stimpies.slice(0, 6);
  const [config, options] = await Promise.all([getBuilderConfig().catch(() => null), getOptions().catch(() => null)]);
  const hoodie = config?.hoodie ? await getHoodie(config.hoodie.slug).catch(() => null) : null;
  const previewImage = hoodie?.images[0] ?? hoodieImage;
  const data = config && options && shown.length > 0 && (!config.hoodie || hoodie)
    ? toTeaserData({ config, options, stimpies: shown, hoodie }) : null;
  const interactive = !!data && joinColors(data.colors, data.config).some(usable2D);

  return (
    <TeaserSection>
      {interactive && data ? (
        <BuilderTeaserGate data={data} fallback={<BuilderTeaserStatic data={data} />} />
      ) : (
        <StaticTeaser hoodieImage={previewImage} stimpies={shown} />
      )}
    </TeaserSection>
  );
}

function TeaserSection({ children }: { children: ReactNode }) {
  return <Section tone="white" heading="A look that's yours." className="store-builder-teaser" id="builder-teaser" aria-label="Builder preview" data-slot="builder-teaser">
    <div className="flex flex-col gap-6"><p className="text-lead text-fg-muted">Your colour. Your artwork. Your Stimpy.</p>{children}</div>
  </Section>;
}

function StaticTeaser({ hoodieImage, stimpies }: { hoodieImage: string | null; stimpies: Stimpie[] }) {
  return (
    <div className="store-teaser grid grid-cols-1 items-center gap-6 md:grid-cols-2" data-builder-teaser-static>
      <div className="mx-auto w-full max-w-[384px]">
        <Media src={hoodieImage} alt="The Stimpy hoodie" ratio="4 / 5" sizes="(min-width: 768px) 384px, 100vw" />
        <div className="store-teaser-caption"><span>{stimpies[0]?.name ?? 'Your Stimpy'}</span><span>The Stimpy hoodie</span></div>
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <div className="min-h-[74px]" aria-hidden="true" />
        {stimpies.length > 0 ? (
          <div><p className="text-body-sm font-medium text-fg">Choose a Stimpie</p>
            <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-1" aria-label="Stimpies you can try" style={{ scrollbarWidth: 'none' }}>
              {stimpies.map((s) => <li key={s.id} className="w-[88px] shrink-0 snap-start overflow-hidden rounded-md bg-white">
                <Media src={s.artworkUrl} alt={`${s.name} Stimpie`} ratio={STIMPIE_RATIO} sizes="88px" />
                <span className="block truncate px-1 pb-1 pt-1 text-caption font-medium text-ink">{s.name}</span>
              </li>)}
            </ul>
          </div>
        ) : null}
        <Link
          href={stimpies[0] ? `/builder?stimpie=${encodeURIComponent(stimpies[0].slug)}` : '/builder'}
          data-builder-open-full
          className="inline-flex min-h-11 self-start items-center justify-center rounded-md border border-control bg-white px-5 py-3 text-body font-semibold text-ink underline-offset-4 hover:bg-cream hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Open full Builder
        </Link>
      </div>
    </div>
  );
}
