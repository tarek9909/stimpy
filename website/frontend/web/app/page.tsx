import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { RichText, resolveTimeZone } from '@stimpy/ui';
import type { Content, HoodieSummary, Pack, Stimpie } from '@stimpy/api-client';
import { StoreHero } from '@/components/StoreHero';
import { ArrowRight, Banknote, ChevronDown, RefreshCw, Truck } from '@/components/icons';
import { must } from '@/lib/api-server';
import { getContent, getDrop, getDrops, getHoodies, getPacks, getStimpie, getStimpies } from '@/lib/data';
import { staticDropText } from '@/lib/business';
import { JsonLd, organizationJsonLd } from '@/lib/jsonld';
import { DEFAULT_DESCRIPTION, pageMetadata } from '@/lib/seo';
import { DropCountdown } from '@/features/drops/DropCountdown';
import { BuilderTeaserSlot } from '@/features/home/BuilderTeaserSlot';
import { HomeDeferredGate } from '@/features/home/HomeDeferredGate';
import { HomeCommerce } from '@/features/home/HomeCommerce';
import { HomeReviews } from '@/features/home/HomeReviews';
import { HomeHowItWorks } from '@/features/home/HomeHowItWorks';
import { pickCurrentDrop, secondStimpieExtraCents } from '@/features/home/logic';

export const revalidate = 10;

export async function generateMetadata(): Promise<Metadata> {
  const drops = await getDrops().catch(() => null);
  return pageMetadata({ title: 'Stimpy | One hoodie. Multiple identities.', absoluteTitle: true,
    description: drops?.live ? `${DEFAULT_DESCRIPTION} ${drops.live.name} is live.` : DEFAULT_DESCRIPTION,
    path: '/', image: '/images/stimpy-campaign-v1.png' });
}

async function loadHomeCatalog() {
  const [packs, overview, coreStimpies, allStimpies] = await Promise.all([
    getPacks().catch((): Pack[] => []), getDrops().catch(() => null),
    getStimpies({ type: 'CORE', includeSoldOut: false }).catch((): Stimpie[] => []),
    getStimpies().catch((): Stimpie[] => []),
  ]);
  return { packs, overview, coreStimpies, allStimpies };
}

export default async function HomePage() {
  // Begin the catalog immediately, but let the hero stream without waiting for below-the-fold shopping data.
  const catalog = loadHomeCatalog();
  const [content, hoodies] = await Promise.all([must(() => getContent()), getHoodies().catch(() => [])]);
  const hoodie = hoodies[0] ?? null;
  const featuredStimpieSlug = content.homepage.featuredStimpieSlug ?? 'the-void';
  const heroStimpie = await getStimpie(featuredStimpieSlug).catch(() => getStimpie('the-void').catch(() => null));

  return <>
    <JsonLd data={organizationJsonLd({ instagramUrl: content.business.instagramUrl })} />
    <StoreHero homepage={content.homepage} stimpie={heroStimpie} hoodieHref={hoodie ? `/shop/hoodie/${hoodie.slug}` : '/shop'} />
    <div className="store-service-band"><div className="container">
      <p><Truck size={19} strokeWidth={1.5} aria-hidden="true" /> Delivery across Lebanon</p>
      <p><Banknote size={19} strokeWidth={1.5} aria-hidden="true" /> Cash on delivery</p>
      <p><RefreshCw size={18} strokeWidth={1.5} aria-hidden="true" /> One hoodie. Endless possibilities.</p>
    </div></div>
    <Suspense fallback={<HomeSectionsLoading />}>
      <HomeSections content={content} hoodies={hoodies} catalog={catalog} />
    </Suspense>
  </>;
}

async function HomeSections({ content, hoodies, catalog }: {
  content: Content;
  hoodies: HoodieSummary[];
  catalog: ReturnType<typeof loadHomeCatalog>;
}) {
  const [data, featured] = await Promise.all([
    catalog,
    content.homepage.showDropSections && content.homepage.featuredDropSlug ? getDrop(content.homepage.featuredDropSlug).catch(() => null) : Promise.resolve(null),
  ]);
  const { packs, overview, coreStimpies, allStimpies } = data;
  const tz = resolveTimeZone(content.business.timezone);
  const drop = content.homepage.showDropSections ? pickCurrentDrop(featured, overview) : null;
  const hoodie = hoodies[0] ?? null;
  const orderedPacks = [...packs].sort((a, b) => Number(!!b.badge) - Number(!!a.badge) || a.stimpieCount - b.stimpieCount);
  const purchasable = allStimpies.filter((s) => s.purchasable);
  const commerceProps = { packs: orderedPacks, hoodieSlug: hoodie?.slug ?? null, extraCents: secondStimpieExtraCents(packs) ?? 0,
    minExtra: purchasable.length ? Math.min(...purchasable.map((s) => s.priceCents)) : null, drop, coreStimpies };
  const faqPreview = content.faqs.filter((f) => f.showOnHome).slice(0, 5);
  const teaserStimpies = [...coreStimpies, ...allStimpies.filter((s) => s.drop && s.purchasable)].slice(0, 6);

  return <>
    {drop ? <div className="store-drop-notice"><div className="container">
      {drop.state === 'LIVE' && !drop.endsAt ? <p><span className="store-brand-mark" aria-hidden="true" /> {drop.name} is live{drop.unitsRemaining !== null ? ` / ${drop.unitsRemaining} Stimpies left` : ''}</p> :
        <DropCountdown drop={drop} variant="inline" staticText={staticDropText(drop.state === 'UPCOMING' ? drop.startsAt : (drop.endsAt ?? drop.startsAt), tz)} />}
      <Link href={`/drops/${drop.slug}`} className="store-text-link">Discover the drop <ArrowRight size={16} aria-hidden="true" /></Link>
    </div></div> : null}
    <HomeDeferredGate kind="commerce" {...commerceProps} fallback={<HomeCommerce {...commerceProps} />} />
    <HomeHowItWorks steps={content.howItWorks.steps} />
    <BuilderTeaserSlot hoodieImage={hoodie?.images[0] ?? null} stimpies={teaserStimpies} />
    <HomeReviews reviews={content.reviews} />
    {faqPreview.length ? <section className="store-section store-faq" aria-labelledby="faq-title"><div className="container store-faq-grid">
      <header><p className="store-eyebrow">Good to know</p><h2 id="faq-title">A few quick answers.</h2><Link href="/help?tab=faq" className="store-text-link">Visit the help centre <ArrowRight size={17} aria-hidden="true" /></Link></header>
      <div className="divide-y divide-line border-y border-base">
        {faqPreview.map((faq) => <details key={faq.id} name="home-faq" className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-h4 font-medium text-fg [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span><ChevronDown width={24} height={24} aria-hidden="true" className="shrink-0 transition-transform duration-base ease-standard group-open:rotate-180" />
          </summary>
          <div className="pb-4 pr-8 text-fg"><RichText text={faq.answer} /></div>
        </details>)}
      </div>
    </div></section> : null}
  </>;
}

function HomeSectionsLoading() {
  return <section className="store-section" aria-label="Loading collections" aria-busy="true"><div className="container">
    <div className="mb-8 h-6 max-w-xs rounded bg-cream motion-safe:animate-pulse" />
    <div className="store-collection-grid">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-[4/5] rounded bg-cream motion-safe:animate-pulse" />)}
    </div>
  </div></section>;
}
