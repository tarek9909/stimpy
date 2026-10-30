import type { Metadata } from 'next';
import { preload } from 'react-dom';
import { Button, Section } from '@stimpy/ui';
import type { BuilderConfig, HoodieDetail, OptionsResponse, Pack, Stimpie } from '@stimpy/api-client';
import { parseShareParams } from '@stimpy/builder/src/lib/share';
import { getBuilderConfig, getHoodie, getOptions, getPacks, getStimpies } from '@/lib/data';
import { pageMetadata } from '@/lib/seo';
import { BuilderClient } from '@/features/builder/BuilderClient';
import { STOREFRONT_MODEL, toBuilderData } from '@/features/builder/data';

type SearchParams = Record<string, string | string[] | undefined>;

const TITLE = 'Builder: try Stimpies on your hoodie';
const DESCRIPTION = 'Pick a hoodie colour, zip through the Stimpies and see your look before you order.';

/** Everything the page needs. A failure of any call degrades to the static card (builder.md 6.5), never an error page. */
async function loadBuilder(includeSharedUpcoming = false): Promise<{
  config: BuilderConfig;
  options: OptionsResponse;
  stimpies: Stimpie[];
  packs: Pack[];
  hoodie: HoodieDetail | null;
} | null> {
  try {
    const configPromise = getBuilderConfig();
    const [config, options, stimpies, packs, hoodie] = await Promise.all([
      configPromise,
      getOptions(),
      getStimpies({ includeSoldOut: true, includeUpcoming: includeSharedUpcoming, includeEnded: false }),
      getPacks().catch((): Pack[] => []),
      configPromise.then((config) => config.hoodie ? getHoodie(config.hoodie.slug).catch(() => null) : null),
    ]);
    return { config, options, stimpies, packs, hoodie };
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const share = parseShareParams(await searchParams);
  if (!share.stimpie) return pageMetadata({ title: TITLE, description: DESCRIPTION, path: '/builder' });
  const stimpies = await getStimpies({ includeSoldOut: true, includeUpcoming: true, includeEnded: false }).catch((): Stimpie[] => []);
  const stimpie = stimpies.find((s) => s.slug === share.stimpie);
  if (!stimpie) return pageMetadata({ title: TITLE, description: DESCRIPTION, path: '/builder' });
  return pageMetadata({
    title: `${stimpie.name} on a Stimpy hoodie`,
    description: DESCRIPTION,
    path: '/builder',
    image: stimpie.artworkUrl,
  });
}

/**
 * Server-rendered shell: heading, metadata and the Builder's controls. The 3D hoodie loads in the interactive island,
 * which falls back to a browse card only where the browser cannot run 3D. The share link is read once here
 * (`searchParams`); the island keeps the URL in sync afterwards.
 */
export default async function BuilderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const share = parseShareParams(sp);
  const loaded = await loadBuilder(!!share.stimpie);
  const data = loaded ? toBuilderData(loaded) : null;
  // Start the model before the page's images take the bandwidth.
  if (data) preload(STOREFRONT_MODEL.url, { as: 'fetch', crossOrigin: 'anonymous', fetchPriority: 'high' });

  return (
    <Section tone="white" heading="Build your look" headingLevel={1}>
      {data ? (
        <BuilderClient data={data} share={share} source={share.stimpie || share.colorId ? 'share' : 'nav'} />
      ) : (
        <div className="flex max-w-prose flex-col items-start gap-4" data-builder-static>
          <p className="text-lead text-fg-muted">Try Stimpies on the hoodie: browse the shop.</p>
          <Button href="/shop?tab=stimpies" variant="dark" size="lg">
            Browse Stimpies
          </Button>
        </div>
      )}
    </Section>
  );
}
