import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Pill, RichText, Section, accentTone, formatCents } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { getBusinessTimezone, staticDropText } from '@/lib/business';
import { must, orNull } from '@/lib/api-server';
import { getStimpie, getStimpies } from '@/lib/data';
import { JsonLd, breadcrumbJsonLd, stimpieJsonLd } from '@/lib/jsonld';
import { excerpt, pageMetadata } from '@/lib/seo';
import { StimpieGallery } from '@/components/StimpieGallery';
import { StimpieRecommendationsGate } from '@/features/shop/StimpieRecommendationsGate';
import { StimpieActions } from '@/features/shop/StimpieActions';

/** ISR 10 s: a Stimpie of a drop changes with the clock (30 s without a drop; the shorter window covers both). */
export const revalidate = 10;
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const s = await orNull(() => getStimpie(slug));
  if (!s) return pageMetadata({ title: 'Page not found', path: `/shop/stimpie/${slug}`, noindex: true });
  return pageMetadata({
    title: `${s.name} Stimpie`,
    description: excerpt(s.story, 155),
    path: `/shop/stimpie/${s.slug}`,
    image: s.images[0] ?? s.artworkUrl,
  });
}

export default async function StimpiePage({ params }: { params: Params }) {
  const { slug } = await params;
  const stimpie = await orNull(() => getStimpie(slug));
  if (!stimpie) notFound();
  const drop = stimpie.drop;
  const tz = await getBusinessTimezone();

  // "More from this drop" (when it belongs to one) and, when sold out, similar Stimpies that can still be bought.
  const soldOut = stimpie.status === 'SOLD_OUT';
  const [dropMates, similar] = await Promise.all([
    drop ? must(() => getStimpies({ drop: drop.slug, includeSoldOut: true })) : Promise.resolve([]),
    soldOut ? must(() => getStimpies({ type: stimpie.type, includeSoldOut: false })) : Promise.resolve([]),
  ]);
  const moreFromDrop = dropMates.filter((s) => s.id !== stimpie.id).slice(0, 4);
  const similarAvailable = similar.filter((s) => s.id !== stimpie.id && s.purchasable).slice(0, 4);

  const statusBadge =
    stimpie.status === 'LOW'
      ? ({ kind: 'LOW', remaining: stimpie.remaining } as const)
      : stimpie.status === 'SOLD_OUT'
        ? ({ kind: 'SOLD_OUT' } as const)
        : stimpie.status === 'UPCOMING'
          ? ({ kind: 'UPCOMING' } as const)
          : stimpie.status === 'ENDED'
            ? ({ kind: 'ENDED' } as const)
            : null;

  return (
    <>
      <JsonLd
        data={[
          stimpieJsonLd(stimpie),
          breadcrumbJsonLd([
            { name: 'Shop', path: '/shop?tab=stimpies' },
            { name: stimpie.name, path: `/shop/stimpie/${stimpie.slug}` },
          ]),
        ]}
      />
      <Section tone="white">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <StimpieGallery name={stimpie.name} artworkUrl={stimpie.artworkUrl} images={stimpie.images} />
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind={stimpie.type === 'CORE' ? 'CORE' : 'LIMITED'} accent={drop?.accentColor ?? null} />
              {statusBadge ? <Badge {...statusBadge} /> : null}
            </div>
            <h1 className="text-h1 text-fg">{stimpie.name}</h1>
            {drop ? (
              <Link href={`/drops/${drop.slug}`} className="self-start no-underline">
                <Pill tone={accentTone(drop.accentColor)}>{drop.name}</Pill>
              </Link>
            ) : null}
            <RichText text={stimpie.story} />
            <StimpieActions
              stimpie={stimpie}
              staticStartText={stimpie.status === 'UPCOMING' && drop ? staticDropText(drop.startsAt, tz) : null}
            />
          </div>
        </div>
      </Section>
      {similarAvailable.length > 0 ? (
        <StimpieRecommendationsGate
          stimpies={similarAvailable}
          heading="Similar Stimpies you can still get"
          tone="cream"
          fallback={<StimpieRowPreview stimpies={similarAvailable} heading="Similar Stimpies you can still get" tone="cream" />}
        />
      ) : null}
      {moreFromDrop.length > 0 ? (
        <StimpieRecommendationsGate
          stimpies={moreFromDrop}
          heading="More from this drop"
          tone={similarAvailable.length > 0 ? 'white' : 'cream'}
          fallback={
            <StimpieRowPreview
              stimpies={moreFromDrop}
              heading="More from this drop"
              tone={similarAvailable.length > 0 ? 'white' : 'cream'}
            />
          }
        />
      ) : null}
    </>
  );
}

function StimpieRowPreview({ stimpies, heading, tone }: { stimpies: Stimpie[]; heading: string; tone: 'white' | 'cream' }) {
  return (
    <Section tone={tone} heading={heading}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        {stimpies.map((stimpie) => (
          <li key={stimpie.id}>
            <a href={`/shop/stimpie/${stimpie.slug}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-base bg-surface-base">
              <img src={stimpie.images[0] ?? stimpie.artworkUrl} alt={`${stimpie.name} Stimpie`} loading="lazy" decoding="async" className="aspect-[0.64] w-full object-contain" />
              <span className="flex flex-1 flex-col gap-1.5 p-3 md:p-4">
                <span className="font-medium text-fg">{stimpie.name}</span>
                <span className="text-body-sm">{formatCents(stimpie.priceCents)}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
