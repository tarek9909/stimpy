import type { Metadata } from 'next';
import { Section } from '@stimpy/ui';
import { CheckoutLoader } from '@/features/checkout/CheckoutLoader';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

/** Client-only checkout (checkout-and-order-flow 2): depends on the browser cart and session state. */
export default function CheckoutPage() {
  return (
    <Section tone="white" heading="Checkout" headingLevel={1}>
      <CheckoutLoader />
    </Section>
  );
}
