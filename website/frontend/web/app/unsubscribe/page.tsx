import type { Metadata } from 'next';
import { Section } from '@stimpy/ui';
import { UnsubscribeView } from '@/features/unsubscribe/UnsubscribeView';

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Public token confirmation; the token is read only by the client flow and never placed in visible text. */
export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const value = (await searchParams).token;
  const token = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  return (
    <Section tone="white" heading="Email preferences" headingLevel={1}>
      <UnsubscribeView token={token} />
    </Section>
  );
}
