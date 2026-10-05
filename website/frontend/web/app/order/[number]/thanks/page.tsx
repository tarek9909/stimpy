import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section } from '@stimpy/ui';
import { ThanksView } from '@/features/order/ThanksView';
import { isValidOrderNumber } from '@/features/order/handoff';
import { getContentSafe } from '@/lib/data';

export const metadata: Metadata = { title: 'Order placed', robots: { index: false, follow: false } };

type Params = Promise<{ number: string }>;

/**
 * Client-only confirmation (checkout-and-order-flow 5): the data comes from the response checkout left in
 * sessionStorage. The order number in the URL is validated here; anything else is a real 404.
 */
export default async function ThanksPage({ params }: { params: Params }) {
  const { number } = await params;
  if (!isValidOrderNumber(number)) notFound();
  const content = await getContentSafe();
  return (
    <Section tone="white">
      <ThanksView number={number} business={content?.business ?? null} />
    </Section>
  );
}
