import type { Metadata } from 'next';
import { Banknote, Ruler, Truck } from '@/components/icons';
import { RichText, Section, TextLink, WhatsAppButton, formatCents } from '@stimpy/ui';
import { ContactBox } from '@/components/ContactBox';
import { must } from '@/lib/api-server';
import { getContent, getDeliveryFees } from '@/lib/data';
import { estimateFor, feeText } from '@/lib/delivery';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: 'Delivery & returns',
  description: 'Delivery fees, timing, cash on delivery and our exchange policy.',
  path: '/delivery-returns',
});

export default async function DeliveryReturnsPage() {
  const [content, fees] = await Promise.all([must(() => getContent()), getDeliveryFees().catch(() => null)]);
  const policy = content.policies.deliveryReturns;
  const hasPolicy = policy.trim().length > 0;

  return (
    <Section tone="white" heading="Delivery & returns" headingLevel={1}>
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <div className="flex max-w-3xl flex-col gap-10">
          {fees ? (
            <div className="flex flex-col gap-4 rounded-lg bg-cream p-5 text-ink md:flex-row md:items-center md:justify-between" data-testid="fee-highlight">
              <div className="flex items-start gap-3">
                <Truck width={32} height={32} className="shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-h3">{fees.defaultFeeCents === 0 ? 'Free delivery' : `${formatCents(fees.defaultFeeCents)} delivery`}</p>
                  <p className="text-body">{fees.estimateText}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-start gap-3">
            <Banknote width={32} height={32} className="shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-h3">Cash on delivery</h2>
              <p className="mt-1 text-body text-fg-muted">You pay in cash when your order arrives. No card, no online payment.</p>
            </div>
          </div>

          {fees && fees.areas.length > 0 ? (
            <section aria-labelledby="fees-heading">
              <h2 id="fees-heading" className="mb-4 text-h2">
                Fees by area
              </h2>
              <table className="hidden w-full border-collapse text-left md:table" data-testid="fees-table">
                <caption className="sr-only">Delivery fee and estimate by area</caption>
                <thead>
                  <tr className="border-b border-base text-body-sm text-fg-muted">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Area
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Fee
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Estimate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fees.areas.map((a) => (
                    <tr key={a.id} className="border-b border-base">
                      <th scope="row" className="py-3 pr-4 font-medium">
                        {a.name}
                      </th>
                      <td className="py-3 pr-4 tabular-nums">{feeText(a, fees.defaultFeeCents)}</td>
                      <td className="py-3">{estimateFor(a, fees.estimateText)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="flex flex-col md:hidden" aria-label="Delivery fee and estimate by area">
                {fees.areas.map((a) => (
                  <li key={a.id} className="border-b border-base py-3">
                    <dl>
                      <dt className="text-body font-medium">{a.name}</dt>
                      <dd className="text-body-sm text-fg-muted">
                        <span className="tabular-nums">{feeText(a, fees.defaultFeeCents)}</span> · {estimateFor(a, fees.estimateText)}
                      </dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="returns-heading">
            <h2 id="returns-heading" className="mb-4 text-h2">
              Returns and exchanges
            </h2>
            {hasPolicy ? (
              <RichText text={policy} className="max-w-prose" />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-body text-fg-muted">Ask us about delivery, exchanges and returns.</p>
                <WhatsAppButton number={content.business.whatsappNumber} text="Hi Stimpy" label="Ask us on WhatsApp" />
              </div>
            )}
          </section>

          <p className="flex items-center gap-2 text-body">
            <Ruler width={20} height={20} aria-hidden="true" />
            Not sure about your size? <TextLink href="/help?tab=size">See the size guide</TextLink>
          </p>
        </div>

        <ContactBox business={content.business} title="Need help with delivery?" />
      </div>
    </Section>
  );
}
