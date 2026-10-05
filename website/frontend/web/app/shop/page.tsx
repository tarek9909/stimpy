import type { Metadata } from 'next';
import { Button, EmptyState, ProductCard, Section } from '@stimpy/ui';
import type { Drop } from '@stimpy/api-client';
import { getDrops, getHoodies, getStimpies } from '@/lib/data';
import { must } from '@/lib/api-server';
import { pageMetadata } from '@/lib/seo';
import { StimpieAddCard } from '@/features/shop/StimpieAddCard';
import { ShopTabs, StimpieFilters } from '@/features/shop/ShopControls';
import { activeFilterCount, parseShopParams, shopHref } from '@/features/shop/params';
import { Layers, Sparkles } from '@/components/icons';

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
  const drops = params.tab === 'stimpies' ? await must(() => getDrops()) : null;
  const dropList = drops ? allDrops(drops) : [];
  // An unknown drop slug is ignored (with a notice) instead of failing.
  const unknownDrop = !!params.drop && !dropList.some((d) => d.slug === params.drop);
  const effectiveDrop = unknownDrop ? null : params.drop;
  const filters = { ...params, drop: effectiveDrop };

  return (
    <Section tone="white" heading="Shop" headingLevel={1}>
      <ShopTabs params={filters}>
        {params.tab === 'hoodies' ? <HoodiesPanel /> : <StimpiesPanel filters={filters} dropList={dropList} unknownDrop={unknownDrop} />}
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
        text="The hoodie is coming soon. Follow the next drop."
        action={<Button href="/drops" variant="dark">Go to Drops</Button>}
      />
    );
  }
  return (
    <div className="mt-6">
      <p role="status" className="sr-only">
        {hoodies.length} {hoodies.length === 1 ? 'hoodie' : 'hoodies'}
      </p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {hoodies.map((h, i) => (
          <li key={h.id}>
            <ProductCard hoodie={h} priority={i === 0} sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function StimpiesPanel({
  filters,
  dropList,
  unknownDrop,
}: {
  filters: ReturnType<typeof parseShopParams>;
  dropList: Drop[];
  unknownDrop: boolean;
}) {
  const stimpies = await must(() =>
    getStimpies({
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.drop ? { drop: filters.drop } : {}),
      includeSoldOut: !filters.hideSoldOut,
    }),
  );
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

