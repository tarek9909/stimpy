import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, resolveTimeZone } from '@stimpy/ui';
import type { Pack, Stimpie } from '@stimpy/api-client';
import { StoreHero } from '@/components/StoreHero';
import { ArrowRight, Banknote, Layers, RefreshCw, Shirt, Truck } from '@/components/icons';
import { must } from '@/lib/api-server';
import { getContent, getDrop, getDrops, getHoodies, getPacks, getStimpies } from '@/lib/data';
import { staticDropText } from '@/lib/business';
import { JsonLd, organizationJsonLd } from '@/lib/jsonld';
import { DEFAULT_DESCRIPTION, pageMetadata } from '@/lib/seo';
import { DropCountdown } from '@/features/drops/DropCountdown';
import { BuilderTeaserSlot } from '@/features/home/BuilderTeaserSlot';
import { HomeDeferredGate } from '@/features/home/HomeDeferredGate';
import { HomeCommerce } from '@/features/home/HomeCommerce';
import { pickCurrentDrop, secondStimpieExtraCents } from '@/features/home/logic';

export const revalidate = 10;

export async function generateMetadata(): Promise<Metadata> {
  const [content, drops] = await Promise.all([getContent().catch(() => null), getDrops().catch(() => null)]);
  return pageMetadata({ title: 'Stimpy | One hoodie. Multiple identities.', absoluteTitle: true,
    description: drops?.live ? `${DEFAULT_DESCRIPTION} ${drops.live.name} is live.` : DEFAULT_DESCRIPTION,
    path: '/', image: content?.homepage.heroImageUrl ?? null });
}

const STEPS = [
  { title: 'Start with the hoodie', text: 'A heavyweight essential. Made to be worn your way.', Icon: Shirt },
  { title: 'Find your Stimpie', text: 'Original back panels with a personality of their own.', Icon: Layers },
  { title: 'Change your perspective', text: 'Zip off. Zip on. A new look, without a new hoodie.', Icon: RefreshCw },
] as const;

export default async function HomePage() {
  const content = await must(() => getContent());
  const tz = resolveTimeZone(content.business.timezone);
  const [packs, overview, coreStimpies, allStimpies, hoodies] = await Promise.all([
    getPacks().catch((): Pack[] => []), getDrops().catch(() => null),
    getStimpies({ type: 'CORE', includeSoldOut: false }).catch((): Stimpie[] => []),
    getStimpies().catch((): Stimpie[] => []), getHoodies().catch(() => []),
  ]);
  const featured = content.homepage.featuredDropSlug ? await getDrop(content.homepage.featuredDropSlug).catch(() => null) : null;
  const drop = pickCurrentDrop(featured, overview);
  const hoodie = hoodies[0] ?? null;
  const steps = content.howItWorks.steps.length >= 3 ? content.howItWorks.steps.slice(0, 3) : STEPS;
  const orderedPacks = [...packs].sort((a, b) => Number(!!b.badge) - Number(!!a.badge) || a.stimpieCount - b.stimpieCount);
  const purchasable = allStimpies.filter((s) => s.purchasable);
  const commerceProps = { packs: orderedPacks, hoodieSlug: hoodie?.slug ?? null, extraCents: secondStimpieExtraCents(packs) ?? 0,
    minExtra: purchasable.length ? Math.min(...purchasable.map((s) => s.priceCents)) : null, drop, coreStimpies };
  const faqPreview = content.faqs.filter((f) => f.showOnHome).slice(0, 5);
  const teaserStimpies = [...coreStimpies, ...allStimpies.filter((s) => s.drop && s.purchasable)].slice(0, 6);

  return <>
    <JsonLd data={organizationJsonLd({ instagramUrl: content.business.instagramUrl })} />
    <StoreHero homepage={content.homepage} hoodieHref={hoodie ? `/shop/hoodie/${hoodie.slug}` : '/shop'} />
    <div className="store-service-band"><div className="container">
      <p><Truck size={19} strokeWidth={1.5} aria-hidden="true" /> Delivery across Lebanon</p>
      <p><Banknote size={19} strokeWidth={1.5} aria-hidden="true" /> Cash on delivery</p>
      <p><RefreshCw size={18} strokeWidth={1.5} aria-hidden="true" /> One hoodie. Endless possibilities.</p>
    </div></div>
    {drop ? <div className="store-drop-notice"><div className="container">
      {drop.state === 'LIVE' && !drop.endsAt ? <p><span className="store-brand-mark" aria-hidden="true" /> {drop.name} is live{drop.unitsRemaining !== null ? ` / ${drop.unitsRemaining} Stimpies left` : ''}</p> :
        <DropCountdown drop={drop} variant="inline" staticText={staticDropText(drop.state === 'UPCOMING' ? drop.startsAt : (drop.endsAt ?? drop.startsAt), tz)} />}
      <Link href={`/drops/${drop.slug}`} className="store-text-link">Discover the drop <ArrowRight size={16} aria-hidden="true" /></Link>
    </div></div> : null}
    <HomeDeferredGate kind="commerce" {...commerceProps} fallback={<HomeCommerce {...commerceProps} />} />
    <section className="store-how-band" aria-labelledby="how-title"><div className="container">
      <header className="store-section-heading"><div><p className="store-eyebrow">Less wardrobe. More you.</p><h2 id="how-title">Same hoodie. Different energy.</h2></div>
        <Link href="/how-it-works" className="store-text-link">How it works <ArrowRight size={17} aria-hidden="true" /></Link></header>
      <ol className="store-steps">{steps.map((step, i) => { const Icon = STEPS[i]?.Icon ?? Shirt; return <li key={step.title}>
        <div className="store-step-top"><Icon size={28} strokeWidth={1.5} aria-hidden="true" /><span>0{i + 1}</span></div><h3>{step.title}</h3><p>{step.text}</p>
      </li>; })}</ol>
    </div></section>
    <BuilderTeaserSlot hoodieImage={hoodie?.images[0] ?? null} stimpies={teaserStimpies} />
    <HomeDeferredGate kind="reviews" reviews={content.reviews} fallback={content.reviews.length ?
      <section className="store-section"><div className="container"><header className="store-section-heading"><h2>Worn your way.</h2></header>
        <ul className="scroll-row flex gap-6 overflow-x-auto" aria-label="Customer swaps">{content.reviews.map((review) => <li key={review.id} className="w-72 shrink-0">
          <figure className="flex h-full flex-col overflow-hidden rounded-lg border border-base">
            {review.mediaUrl ? /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(review.mediaUrl)
              ? <video src={review.mediaUrl} controls muted playsInline preload="none" className="aspect-[9/16] max-h-96 w-full object-cover" aria-label={`Video from ${review.name}`} />
              : <img src={review.mediaUrl} alt={`Photo from ${review.name}`} loading="lazy" decoding="async" className="aspect-[0.64] w-full object-cover" /> : null}
            <blockquote className="flex-1 p-4 text-body">{review.text}</blockquote><figcaption className="px-4 pb-4 text-body-sm text-fg-muted">{review.name}</figcaption>
          </figure>
        </li>)}</ul>
      </div></section> : null} />
    {faqPreview.length ? <section className="store-section store-faq" aria-labelledby="faq-title"><div className="container store-faq-grid">
      <header><p className="store-eyebrow">Good to know</p><h2 id="faq-title">A few quick answers.</h2><Link href="/help?tab=faq" className="store-text-link">Visit the help centre <ArrowRight size={17} aria-hidden="true" /></Link></header>
      <Accordion items={faqPreview.map((f) => ({ id: `faq-${f.id}`, question: f.question, answer: f.answer }))} />
    </div></section> : null}
  </>;
}
