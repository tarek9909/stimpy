import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBusinessTimezone, staticDropText } from '@/lib/business';
import { orNull } from '@/lib/api-server';
import { getDrop } from '@/lib/data';
import { JsonLd, breadcrumbJsonLd } from '@/lib/jsonld';
import { excerpt, pageMetadata } from '@/lib/seo';
import { DropDetailView } from '@/features/drops/DropDetailView';

/** ISR 10 s (state-and-errors 2.2); the live drop also polls from the browser every 30 s. */
export const revalidate = 10;
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const drop = await orNull(() => getDrop(slug));
  if (!drop) return pageMetadata({ title: 'Page not found', path: `/drops/${slug}`, noindex: true });
  return pageMetadata({
    title: `${drop.name} drop`,
    description: excerpt(drop.story, 155),
    path: `/drops/${drop.slug}`,
    image: drop.teaserImage ?? drop.stimpies[0]?.artworkUrl ?? null,
  });
}

export default async function DropPage({ params }: { params: Params }) {
  const { slug } = await params;
  const drop = await orNull(() => getDrop(slug));
  if (!drop) notFound();
  const tz = await getBusinessTimezone();
  const target = drop.state === 'UPCOMING' ? drop.startsAt : (drop.endsAt ?? drop.startsAt);
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Drops', path: '/drops' },
          { name: drop.name, path: `/drops/${drop.slug}` },
        ])}
      />
      <DropDetailView drop={drop} businessTimeZone={tz} staticStartText={staticDropText(target, tz)} />
    </>
  );
}
