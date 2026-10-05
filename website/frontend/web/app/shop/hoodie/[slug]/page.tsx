import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section, TextLink } from '@stimpy/ui';
import { getDeliveryFees, getHoodie, getPacks, getStimpies } from '@/lib/data';
import { must, orNull } from '@/lib/api-server';
import { JsonLd, breadcrumbJsonLd, hoodieJsonLd } from '@/lib/jsonld';
import { excerpt, pageMetadata } from '@/lib/seo';
import { HoodieConfigurator } from '@/features/shop/HoodieConfigurator';

/** ISR: 30 s. Slugs come from the API, so unknown slugs render on demand. The configurator refetches stock itself. */
export const revalidate = 30;
export const dynamicParams = true;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const hoodie = await orNull(() => getHoodie(slug));
  if (!hoodie) return pageMetadata({ title: 'Page not found', path: `/shop/hoodie/${slug}`, noindex: true });
  return pageMetadata({
    title: hoodie.name,
    description: excerpt(hoodie.description, 155),
    path: `/shop/hoodie/${hoodie.slug}`,
    image: hoodie.images[0] ?? null,
  });
}

export default async function HoodiePage({ params }: { params: Params }) {
  const { slug } = await params;
  const hoodie = await orNull(() => getHoodie(slug));
  if (!hoodie) notFound();
  const [packs, stimpies, fees] = await Promise.all([
    must(() => getPacks()),
    must(() => getStimpies({ includeSoldOut: true })),
    getDeliveryFees().catch(() => null),
  ]);

  return (
    <>
      <JsonLd
        data={[
          hoodieJsonLd(hoodie),
          breadcrumbJsonLd([
            { name: 'Shop', path: '/shop' },
            { name: hoodie.name, path: `/shop/hoodie/${hoodie.slug}` },
          ]),
        ]}
      />
      <Section tone="white" className="pb-28 md:pb-20">
        <HoodieConfigurator
          hoodie={hoodie}
          packs={packs}
          stimpies={stimpies}
          estimateText={fees?.estimateText ?? null}
        />
        {hoodie.details.length > 0 ? (
          <div className="mt-12 max-w-2xl">
            <details open className="border-y border-base">
              <summary className="min-h-12 cursor-pointer py-3 text-h4 font-medium">Details</summary>
              <ul className="list-disc space-y-1 pb-4 pl-6 text-fg">
                {hoodie.details.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}
              </ul>
            </details>
            <p className="mt-4 text-body-sm text-fg-muted">
              How to look after it: <TextLink href="/help?tab=care">Care guide</TextLink>
            </p>
          </div>
        ) : (
          <p className="mt-8 text-body-sm text-fg-muted">
            How to look after it: <TextLink href="/help?tab=care">Care guide</TextLink>
          </p>
        )}
      </Section>
    </>
  );
}
