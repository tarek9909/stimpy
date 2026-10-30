import type { Metadata } from 'next';
import { Section, TextLink } from '@stimpy/ui';
import { getPacks, getStimpies } from '@/lib/data';
import { must } from '@/lib/api-server';
import { pageMetadata } from '@/lib/seo';
import { StimpiePackComposer } from '@/features/shop/StimpiePackComposer';

export const revalidate = 30;

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: 'Stimpie-only sets',
    description: 'Choose the exact Stimpies you want in a Stimpie-only set.',
    path: '/shop/stimpie-packs',
  });
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StimpiePacksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [packs, stimpies] = await Promise.all([
    must(() => getPacks()),
    must(() => getStimpies({ includeSoldOut: true, includeUpcoming: false, includeEnded: false })),
  ]);
  const rawList = one(params.stimpies);
  const stimpieSlugs = rawList ? rawList.split(',').slice(0, 200) : [];
  const firstStimpie = one(params.stimpie);
  if (firstStimpie && stimpieSlugs.length === 0) stimpieSlugs.push(firstStimpie);

  return (
    <Section tone="white" heading="Stimpies without the hoodie" headingLevel={1}>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-prose text-lead text-fg-muted">Choose the exact number in your offer. Pick one design more than once when stock allows.</p>
        <TextLink href="/shop?tab=stimpies">Browse individual Stimpies</TextLink>
      </div>
      <StimpiePackComposer packs={packs} stimpies={stimpies} preset={{ packSlug: one(params.pack) ?? null, stimpieSlugs }} />
    </Section>
  );
}
