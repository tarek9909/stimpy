import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Button, EmptyState, ProductCard, Section } from '@stimpy/ui';
import type { Drop } from '@stimpy/api-client';
import { getDrops, getHoodie, getHoodies, getStimpies } from '@/lib/data';
import { must } from '@/lib/api-server';
import { pageMetadata } from '@/lib/seo';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { ShopTabs, StimpieFilters } from '@/features/shop/ShopControls';
import { activeFilterCount, parseShopParams, shopHref } from '@/features/shop/params';
import { Layers, Sparkles } from '@/components/icons';
import { HoodieFeature } from '@/features/shop/HoodieFeature';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = parseShopParams(await searchParams);
  const hoodies = params.tab === 'hoodies' ? await getHoodies().catch(() => []) : [];
  return pageMetadata({
    title: 'Shop hoodies and Stimpies',
    description: 'Heavyweight hoodies with a one-way zip system and swappable back panels called Stimpies.',
    // Filter params are excluded from the canonical; pages with more than one active filter stay out of the index.
    path: '/shop',
    image: hoodies[0]?.images[0] ?? null,
    noindex: activeFilterCount(params) > 1,
  });
}

function allDrops(drops: { live: Drop | null; upcoming: Drop[]; archive: Drop[] }): Drop[] {
  return [...(drops.live ? [drops.live] : []), ...drops.upcoming, ...drops.archive];
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseShopParams(await searchParams);
  return (
    <Section tone="white" heading="The collection." eyebrow="Made for your every day" headingLevel={1} className="store-shop">
      <p className="store-shop-intro">One essential hoodie. A whole world of Stimpies.</p>
      <ShopTabs params={params}>
        <Suspense fallback={<ShopPanelLoading />}>
          {params.tab === 'hoodies' ? <HoodiesPanel /> : <StimpiesPanel filters={params} />}
        </Suspense>
      </ShopTabs>
    </Section>
  );
}

async function HoodiesPanel() {
  const hoodies = await must(() => getHoodies());
  if (hoodies.length === 0) {
    return (
      <EmptyState
        icon={<Layers width={32} height={32} />}
        title="Nothing here yet"
        text="No hoodie is listed right now. Browse the Stimpies collection or contact us at info@stimpylb.com for help."
        action={<Button href="/shop?tab=stimpies" variant="dark">Browse Stimpies</Button>}
      />
    );
  }
  if (hoodies.length === 1) {
    const hoodie = hoodies[0]!;
    const detail = await must(() => getHoodie(hoodie.slug));
    return <HoodieFeature hoodie={hoodie} detail={detail} />;
  }
  return (
    <div className="mt-6">
      <p role="status" className="sr-only">
        {hoodies.length} {hoodies.length === 1 ? 'hoodie' : 'hoodies'}
      </p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {hoodies.map((h, i) => (
          <li key={h.id}>
            <ProductCard hoodie={h} className="store-product-card" priority={i === 0} sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function StimpiesPanel({
  filters: requestedFilters,
}: {
  filters: ReturnType<typeof parseShopParams>;
}) {
  const query = {
    ...(requestedFilters.type ? { type: requestedFilters.type } : {}),
    includeSoldOut: !requestedFilters.hideSoldOut,
  };
  // A valid drop filter needs no serial round-trip through the drop list before its products start loading.
  const [drops, initialStimpies] = await Promise.all([
    must(() => getDrops()),
    must(() => getStimpies({ ...query, ...(requestedFilters.drop ? { drop: requestedFilters.drop } : {}) })),
  ]);
  const dropList = allDrops(drops);
  const unknownDrop = !!requestedFilters.drop && !dropList.some((drop) => drop.slug === requestedFilters.drop);
  const filters = { ...requestedFilters, drop: unknownDrop ? null : requestedFilters.drop };
  const stimpies = unknownDrop ? await must(() => getStimpies(query)) : initialStimpies;
  const count = activeFilterCount(filters);
  const noneAtAll = stimpies.length === 0 && count === 0;
  return (
    <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <aside aria-label="Filters" className="md:w-60 md:shrink-0">
        <StimpieFilters params={filters} drops={dropList.map((d) => ({ slug: d.slug, name: d.name }))} activeCount={count} />
      </aside>
      <div className="min-w-0 flex-1">
        {unknownDrop ? (
          <p className="mb-4 rounded-lg bg-cream p-3 text-body-sm text-ink">
            We couldn&apos;t find that drop, so we are showing everything.
          </p>
        ) : null}
        <p role="status" aria-live="polite" className="mb-4 text-body-sm text-fg-muted">
          {stimpies.length} {stimpies.length === 1 ? 'Stimpie' : 'Stimpies'}
        </p>
        {stimpies.length === 0 ? (
          noneAtAll ? (
            <EmptyState
              icon={<Sparkles width={32} height={32} />}
              title="New Stimpies are on the way"
              text="Follow the next drop."
              action={<Button href="/drops" variant="dark">Go to Drops</Button>}
            />
          ) : (
            <EmptyState
              icon={<Sparkles width={32} height={32} />}
              title="Nothing here yet"
              text="Try clearing a filter."
              action={
                <Button href={shopHref({ tab: 'stimpies' })} variant="dark">
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
            {stimpies.map((s, i) => (
              <li key={s.id}>
                <StimpieAddCard
                  stimpie={s}
                  showDrop
                  priority={i < 2}
                  sizes="(min-width: 1024px) 22vw, (min-width: 768px) 28vw, 50vw"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ShopPanelLoading() {
  return <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6" aria-label="Loading products" aria-busy="true">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-[4/5] rounded bg-cream motion-safe:animate-pulse" />)}
  </div>;
}

