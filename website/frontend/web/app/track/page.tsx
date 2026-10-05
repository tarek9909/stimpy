import type { Metadata } from 'next';
import { Section } from '@stimpy/ui';
import { TrackView } from '@/features/track/TrackView';
import { getContentSafe } from '@/lib/data';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: 'Track your order',
  description: 'Enter your order number and phone to see where your Stimpy order is.',
  path: '/track',
  noindex: true,
});

/** Static shell with a client-only form and result (checkout-and-order-flow 6). */
export default async function TrackPage() {
  const content = await getContentSafe();
  return (
    <Section tone="white" heading="Track your order" headingLevel={1}>
      <TrackView business={content?.business ?? null} />
    </Section>
  );
}
