import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Button, Section, TrustStrip, formatCents, resolveTimeZone, type AccentColor } from '@stimpy/ui';
import type { Pack, Stimpie } from '@stimpy/api-client';
import { HeroMedia } from '@/components/HeroMedia';
import { Layers, RefreshCw, Shirt } from '@/components/icons';
import { must } from '@/lib/api-server';
import { getContent, getDrop, getDrops, getHoodies, getPacks, getStimpies } from '@/lib/data';
import { staticDropText } from '@/lib/business';
import { JsonLd, organizationJsonLd } from '@/lib/jsonld';
import { DEFAULT_DESCRIPTION, pageMetadata } from '@/lib/seo';
import { DropCountdown } from '@/features/drops/DropCountdown';
import { BuilderTeaserSlot } from '@/features/home/BuilderTeaserSlot';
import { HomeDeferredGate } from '@/features/home/HomeDeferredGate';
import { pickCurrentDrop, secondStimpieExtraCents } from '@/features/home/logic';

/** ISR 10 s: drop state changes with the clock (GET /drops is cached 10 s by the API). */
export const revalidate = 10;

export async function generateMetadata(): Promise<Metadata> {
  const [content, drops] = await Promise.all([getContent().catch(() => null), getDrops().catch(() => null)]);
  const live = drops?.live ?? null;
  return pageMetadata({
    title: 'Stimpy | One hoodie. Multiple identities.',
    absoluteTitle: true,
    description: live ? `${DEFAULT_DESCRIPTION} ${live.name} is live.` : DEFAULT_DESCRIPTION,
    path: '/',
    image: content?.homepage.heroImageUrl ?? null,
  });
}

const STEPS = [
  { title: 'Wear it plain', text: 'One premium hoodie. Calm, clean, yours.', Icon: Shirt },
  { title: 'Zip on a Stimpie', text: 'Pick a back panel and zip it on in seconds.', Icon: Layers },
  { title: 'Swap tomorrow', text: 'New mood, new Stimpie. The hoodie stays.', Icon: RefreshCw },
] as const;

export default async function HomePage() {
  const content = await must(() => getContent());
  const tz = resolveTimeZone(content.business.timezone);
  const [packs, overview, coreStimpies, allStimpies, hoodies] = await Promise.all([
    getPacks().catch((): Pack[] => []),
    getDrops().catch(() => null),
    getStimpies({ type: 'CORE', includeSoldOut: false }).catch((): Stimpie[] => []),
    getStimpies().catch((): Stimpie[] => []),
    getHoodies().catch(() => []),
  ]);
  const featuredSlug = content.homepage.featuredDropSlug;
  const featured = featuredSlug ? await getDrop(featuredSlug).catch(() => null) : null;
  const drop = pickCurrentDrop(featured, overview);

  const hoodie = hoodies[0] ?? null;
  const steps = content.howItWorks.steps.length >= 3 ? content.howItWorks.steps.slice(0, 3) : null;
  const orderedPacks = [...packs].sort((a, b) => Number(!!b.badge) - Number(!!a.badge) || a.stimpieCount - b.stimpieCount);
  const extraCents = secondStimpieExtraCents(packs);
  const purchasable = allStimpies.filter((s) => s.purchasable);
  const minExtra = purchasable.length > 0 ? Math.min(...purchasable.map((s) => s.priceCents)) : null;
  const faqPreview = content.faqs.filter((f) => f.showOnHome).slice(0, 5);
  const teaserStimpies = [...coreStimpies, ...allStimpies.filter((s) => s.drop && s.purchasable)].slice(0, 6);

  // Keep the below-fold previews fully server-rendered. Interactive product cards hydrate as their
  // sections approach the viewport, avoiding the card/cart modules in the initial home route.
  const commerceFallback = (
    <>
      <section id="packs" className="bg-surface-base py-12 md:py-16 lg:py-20">
        <div className="container">
          <header className="mb-8 md:mb-10"><h2 className="text-h2">Pick your set</h2></header>
          {orderedPacks.length === 0 ? (
            <a href="/shop" className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 font-medium text-white">Shop</a>
          ) : (
            <div className="grid gap-4 md:grid-cols-3 md:gap-6">
              {orderedPacks.map((pack) => (
                <article key={pack.id} className={`flex flex-col gap-3 rounded-lg border border-base bg-surface-base p-5 ${pack.badge ? 'border-2 border-coral' : ''}`}>
                  {pack.badge ? <p className="self-start rounded-full bg-coral px-3 py-1 text-caption font-medium">{pack.badge}</p> : null}
                  <h3 className="text-h3 text-fg">{pack.name}</h3>
                  <p className="text-body text-fg-muted">{pack.description}</p>
                  <p className="text-h3 font-medium tabular-nums">{formatCents(pack.priceCents)}</p>
                  {pack.stimpieCount === 2 && (extraCents ?? 0) > 0 ? (
                    <p className="text-body-sm text-fg-muted">Second Stimpie effectively <span className="font-medium text-fg">{formatCents(extraCents ?? 0)}</span></p>
                  ) : null}
                  {hoodie?.slug ? (
                    <a href={`/shop/hoodie/${hoodie.slug}?pack=${encodeURIComponent(pack.slug)}`} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md bg-ink px-5 font-medium text-white">Choose</a>
                  ) : null}
                </article>
              ))}
              {minExtra !== null ? (
                <div className="flex flex-col justify-between gap-3 rounded-lg border border-base p-5">
                  <div><h3 className="text-h4">Extra Stimpies</h3><p className="mt-1 text-body-sm text-fg-muted">Already have the hoodie? Add a new back.</p></div>
                  <a href="/shop?tab=stimpies" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Extra Stimpies from {formatCents(minExtra)}</a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
      {drop ? (
        <section className="bg-cream py-12 md:py-16 lg:py-20">
          <div className="container">
            <header className="mb-8 md:mb-10"><h2 className="text-h2">Current drop</h2></header>
            <article className="mx-auto max-w-sm overflow-hidden rounded-lg bg-surface-base text-fg">
              {drop.teaserImage ? <img src={drop.teaserImage} alt={`${drop.name} drop`} loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" /> : null}
              <div className="flex flex-col gap-3 p-4 md:p-5">
                <p className="text-caption font-medium uppercase">{drop.state === 'LIVE' ? 'Live now' : 'Upcoming'}</p>
                <h3 className="text-h3"><a href={`/drops/${drop.slug}`} className="underline underline-offset-4">{drop.name}</a></h3>
                {drop.state === 'LIVE' && drop.unitsRemaining !== null ? <p className="text-body-sm font-medium tabular-nums">{drop.unitsRemaining} Stimpies left</p> : null}
              </div>
            </article>
          </div>
        </section>
      ) : null}
      {coreStimpies.length > 0 ? (
        <section className="bg-surface-base py-12 md:py-16 lg:py-20">
          <div className="container">
            <header className="mb-8 md:mb-10"><h2 className="text-h2">The core collection</h2></header>
            <ul aria-label="Core Stimpies" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-6 md:px-0">
              {coreStimpies.slice(0, 4).map((stimpie) => (
                <li key={stimpie.id} className="w-44 shrink-0 snap-start md:w-60">
                  <a href={`/shop/stimpie/${stimpie.slug}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-base bg-surface-base">
                    {stimpie.images[0] || stimpie.artworkUrl ? <img src={stimpie.images[0] ?? stimpie.artworkUrl!} alt={`${stimpie.name} Stimpie`} loading="lazy" decoding="async" className="aspect-[0.64] w-full object-contain" /> : null}
                    <span className="flex flex-1 flex-col gap-1.5 p-3 md:p-4"><span className="font-medium text-fg">{stimpie.name}</span><span className="text-body-sm">{formatCents(stimpie.priceCents)}</span></span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-6"><a href="/shop?tab=stimpies&type=CORE" className="font-medium underline underline-offset-4">See all Stimpies</a></p>
          </div>
        </section>
      ) : null}
    </>
  );
  const reviewsFallback = content.reviews.length > 0 ? (
    <section className="bg-surface-base py-12 md:py-16 lg:py-20">
      <div className="container">
        <header className="mb-8 md:mb-10"><h2 className="text-h2">Customer swaps</h2></header>
        <ul aria-label="Customer swaps" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-6 md:px-0">
          {content.reviews.map((review) => (
            <li key={review.id} className="w-72 shrink-0 snap-start">
              <figure className="flex h-full flex-col overflow-hidden rounded-lg border border-base bg-surface-base text-fg">
                {review.mediaUrl ? (/(mp4|webm|mov|m4v)(\?.*)?$/i.test(review.mediaUrl)
                  ? <video className="aspect-[9/16] max-h-96 w-full bg-cream object-cover" src={review.mediaUrl} controls muted playsInline preload="none" aria-label={`Video from ${review.name}`} />
                  : <img src={review.mediaUrl} alt={`Photo from ${review.name}`} loading="lazy" decoding="async" className="aspect-[0.64] w-full object-cover" />) : null}
                <blockquote className="flex-1 p-4 text-body">{review.text}</blockquote>
                <figcaption className="px-4 pb-4 text-body-sm font-medium text-fg-muted">{review.name}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  ) : null;

  return (
    <>
      <JsonLd data={organizationJsonLd({ instagramUrl: content.business.instagramUrl })} />

      {/* 1. Hero */}
      <Section tone="black" className="!py-8 md:!py-14">
        <div className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12">
          <div className="flex flex-col items-start gap-5">
            <h1 className="text-display">{content.homepage.heroHeadline}</h1>
            <p className="text-lead text-fg-muted">{content.homepage.heroSubheadline}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/shop" variant="cta" size="lg">
                Order now
              </Button>
              <Button href="/builder" variant="secondary" size="lg">
                Try the Builder
              </Button>
            </div>
          </div>
          <HeroMedia
            videoUrl={content.homepage.heroVideoUrl}
            imageUrl={content.homepage.heroImageUrl}
            alt=""
            ratio="9 / 16"
            mediaClassName="max-h-[70svh] md:!aspect-video md:max-h-none"
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            label="Background video"
          />
        </div>
      </Section>

      {/* 2. Drop strip */}
      {drop ? (
        <Section tone="accent" accentColor={drop.accentColor as AccentColor} className="!py-4" aria-label="Current drop">
          <div className="flex flex-col items-center justify-between gap-3 text-center md:flex-row md:text-left">
            {drop.state === 'LIVE' && !drop.endsAt ? (
              <p className="text-body font-medium">{drop.name}: live now{drop.unitsRemaining !== null ? ` · ${drop.unitsRemaining} units left` : ''}</p>
            ) : (
              <DropCountdown
                drop={drop}
                variant="inline"
                staticText={staticDropText(drop.state === 'UPCOMING' ? drop.startsAt : (drop.endsAt ?? drop.startsAt), tz)}
              />
            )}
            <Link href={`/drops/${drop.slug}`} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
              {drop.state === 'LIVE' ? 'Enter the drop' : 'See the drop'}
            </Link>
          </div>
        </Section>
      ) : null}

      {/* 3. The idea in three steps (ZipWipe leads into it) */}
      <Section tone="cream" heading="The idea in three steps" zipIn zipFrom="black">
        <ol className="grid gap-6 md:grid-cols-3">
          {(steps ?? STEPS).map((step, i) => {
            const Icon = STEPS[i]?.Icon ?? Shirt;
            return (
              <li key={step.title} className="flex flex-col gap-3 rounded-lg bg-white p-5">
                <Icon width={32} height={32} aria-hidden="true" />
                <h3 className="text-h3">{step.title}</h3>
                <p className="text-body text-fg-muted">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* 4. Builder teaser (FE-Web2 fills this slot) */}
      <BuilderTeaserSlot hoodieImage={hoodie?.images[0] ?? null} stimpies={teaserStimpies} />

      {/* 5. Packs */}
      <HomeDeferredGate
        kind="commerce"
        fallback={commerceFallback}
        packs={orderedPacks}
        hoodieSlug={hoodie?.slug ?? null}
        extraCents={extraCents ?? 0}
        minExtra={minExtra}
        drop={drop}
        coreStimpies={coreStimpies}
      />

      {/* 8. Trust strip */}
      <Section tone="cream" className="!py-8 md:!py-10">
        <TrustStrip />
      </Section>

      {/* 9. Customer swaps */}
      <HomeDeferredGate kind="reviews" fallback={reviewsFallback} reviews={content.reviews} />

      {/* 10. FAQ preview */}
      {faqPreview.length > 0 ? (
        <Section tone="cream" heading="Quick answers">
          <div className="max-w-3xl">
            <Accordion items={faqPreview.map((f) => ({ id: `faq-${f.id}`, question: f.question, answer: f.answer }))} />
            <p className="mt-6">
              <Link href="/help?tab=faq" className="font-medium underline underline-offset-4">
                All questions
              </Link>
            </p>
          </div>
        </Section>
      ) : null}
    </>
  );
}

