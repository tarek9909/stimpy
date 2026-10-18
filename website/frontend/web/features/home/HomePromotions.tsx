import { NavigationLink as Link } from '@/components/NavigationLink';
import { PriceTag, formatCents } from '@stimpy/ui';
import type { HoodieSummary, Pack, PublicPromotion, Stimpie } from '@stimpy/api-client';
import { Layers } from '@/components/icons';

type PromotionItem = {
  key: string;
  kind: string;
  name: string;
  href: string;
  imageUrl: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  unavailable: boolean;
  detail: string | null;
};

function discountLabel(promotion: PublicPromotion) {
  return promotion.discountType === 'PERCENTAGE'
    ? `${promotion.discountValue}% off`
    : `${formatCents(promotion.discountValue)} off`;
}

function promotionItems(
  promotion: PublicPromotion,
  hoodies: HoodieSummary[],
  stimpies: Stimpie[],
  packs: Pack[],
  hoodieSlug: string | null,
): PromotionItem[] {
  const catalog: PromotionItem[] = [
    ...hoodies.map((hoodie) => ({
      key: `HOODIE:${hoodie.id}`,
      kind: 'Hoodie',
      name: hoodie.name,
      href: `/shop/hoodie/${hoodie.slug}`,
      imageUrl: hoodie.images[0] ?? null,
      priceCents: hoodie.priceCents,
      compareAtPriceCents: hoodie.compareAtPriceCents,
      unavailable: !hoodie.inStock,
      detail: null,
    })),
    ...stimpies.map((stimpie) => ({
      key: `STIMPIE:${stimpie.id}`,
      kind: stimpie.type === 'CORE' ? 'Core Stimpie' : 'Limited Stimpie',
      name: stimpie.name,
      href: `/shop/stimpie/${stimpie.slug}`,
      imageUrl: stimpie.images[0] ?? stimpie.artworkUrl ?? null,
      priceCents: stimpie.priceCents,
      compareAtPriceCents: stimpie.compareAtPriceCents,
      unavailable: !stimpie.purchasable,
      detail: null,
    })),
    ...packs.map((pack) => ({
      key: `PACK:${pack.id}`,
      kind: 'Set',
      name: pack.name,
      href: hoodieSlug ? `/shop/hoodie/${hoodieSlug}?pack=${encodeURIComponent(pack.slug)}` : '/shop',
      imageUrl: null,
      priceCents: pack.priceCents,
      compareAtPriceCents: pack.compareAtPriceCents,
      unavailable: false,
      detail: `${pack.stimpieCount} Stimpies included`,
    })),
  ];

  if (promotion.allProducts) return catalog;
  const targetKeys = new Set(promotion.targets.map((target) => `${target.productType}:${target.productId}`));
  return catalog.filter((item) => targetKeys.has(item.key));
}

export function HomePromotions({
  promotions,
  hoodies,
  stimpies,
  packs,
  hoodieSlug,
}: {
  promotions: PublicPromotion[];
  hoodies: HoodieSummary[];
  stimpies: Stimpie[];
  packs: Pack[];
  hoodieSlug: string | null;
}) {
  const sections = promotions
    .map((promotion) => ({ promotion, items: promotionItems(promotion, hoodies, stimpies, packs, hoodieSlug) }))
    .filter(({ items }) => items.length > 0);

  if (!sections.length) return null;

  return (
    <section className="store-section" aria-labelledby="promotions-title">
      <div className="container">
        <header className="store-section-heading">
          <div>
            <p className="store-eyebrow">Offers while they last</p>
            <h2 id="promotions-title">Promotions</h2>
            <p>Shop the products included in each current offer.</p>
          </div>
        </header>
        <div className="flex flex-col gap-8">
          {sections.map(({ promotion, items }) => (
            <article key={promotion.id} aria-labelledby={`promotion-${promotion.id}`}>
              <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id={`promotion-${promotion.id}`} className="text-h3 font-medium">{promotion.name}</h3>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {promotion.allProducts ? 'On all current products' : `${items.length} ${items.length === 1 ? 'item' : 'items'} included`}
                  </p>
                </div>
                <span className="inline-flex min-h-9 items-center rounded-sm bg-coral px-3 text-body-sm font-bold text-ink">{discountLabel(promotion)}</span>
              </header>
              <ul className="store-collection-grid" aria-label={`${promotion.name} products`}>
                {items.map((item) => (
                  <li key={item.key}>
                    <article className="store-product-card store-static-product relative flex flex-col">
                      <div className="relative flex aspect-[4/5] items-center justify-center">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={`${item.name} ${item.kind}`} loading="lazy" decoding="async" className="h-full w-full object-contain" />
                        ) : (
                          <Layers size={44} strokeWidth={1.4} aria-hidden="true" className="text-fg-muted" />
                        )}
                      </div>
                      <div className="absolute flex gap-1"><span>{item.kind}</span></div>
                      <div className="flex flex-1 flex-col">
                        <h4 className="text-h4">
                          <Link href={item.href} className="after:absolute after:inset-0">{item.name}</Link>
                        </h4>
                        {item.detail ? <p className="text-body-sm text-fg-muted">{item.detail}</p> : null}
                        <PriceTag cents={item.priceCents} compareAtCents={item.compareAtPriceCents ?? undefined} size="sm" />
                        {item.unavailable ? <p className="text-body-sm text-fg-muted">Currently sold out</p> : null}
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
