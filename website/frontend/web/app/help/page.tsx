import type { Metadata } from 'next';
import { Accordion, EmptyState, RichText, Section, WhatsAppButton } from '@stimpy/ui';
import type { Content, SizeChartResponse } from '@stimpy/api-client';
import { UrlTabs } from '@/components/UrlTabs';
import { must } from '@/lib/api-server';
import { getContent, getSizeChart } from '@/lib/data';
import { groupFaqs, parseHelpTab, type HelpTab } from '@/lib/help';
import { JsonLd, faqJsonLd } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { Ruler } from '@/components/icons';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_META: Record<HelpTab, { title: string; description: string }> = {
  size: { title: 'Size guide', description: 'Find your size: measurements for every Stimpy hoodie size and how to measure yourself.' },
  care: { title: 'Care guide', description: 'How to wash and care for your Stimpy hoodie and Stimpies so they last.' },
  faq: { title: 'FAQ', description: 'Answers about sizing, delivery, payment and swapping Stimpies.' },
};

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const tab = parseHelpTab((await searchParams).tab);
  return pageMetadata({ ...TAB_META[tab], path: '/help' });
}

export default async function HelpPage({ searchParams }: { searchParams: SearchParams }) {
  const tab = parseHelpTab((await searchParams).tab);
  const content = await must(() => getContent());
  const chart = tab === 'size' ? await getSizeChart().catch(() => null) : null;
  const faqs = content.faqs;

  return (
    <Section tone="white" heading="Size guide & FAQ" headingLevel={1}>
      {tab === 'faq' && faqs.length > 0 ? <JsonLd data={faqJsonLd(faqs)} /> : null}
      <UrlTabs
        label="Help sections"
        basePath="/help"
        value={tab}
        tabs={[
          { id: 'size', label: 'Size guide' },
          { id: 'care', label: 'Care' },
          { id: 'faq', label: 'FAQ' },
        ]}
      >
        {tab === 'size' ? <SizePanel chart={chart} business={content.business} /> : null}
        {tab === 'care' ? <CarePanel text={content.policies.care} business={content.business} /> : null}
        {tab === 'faq' ? <FaqPanel faqs={faqs} business={content.business} /> : null}
      </UrlTabs>
    </Section>
  );
}

function ComingSoon({ title, business }: { title: string; business: Content['business'] }) {
  return (
    <EmptyState
      icon={<Ruler width={32} height={32} />}
      title={title}
      text="Ask us on WhatsApp and we will help."
      action={<WhatsAppButton number={business.whatsappNumber} text="Hi Stimpy, I have a question" label="Ask us on WhatsApp" />}
    />
  );
}

function SizePanel({ chart, business }: { chart: SizeChartResponse | null; business: Content['business'] }) {
  if (!chart || chart.rows.length === 0 || chart.columns.length === 0) {
    return <ComingSoon title="The size guide is coming soon." business={business} />;
  }
  return (
    <div className="flex flex-col gap-8">
      <div
        role="region"
        aria-label="Size chart, scrolls sideways"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-base"
      >
        <table className="w-full min-w-[28rem] border-collapse text-left" data-testid="size-chart">
          <caption className="sr-only">Hoodie measurements by size</caption>
          <thead>
            <tr className="border-b border-base bg-cream text-ink">
              <th scope="col" className="sticky left-0 z-10 bg-cream px-4 py-3 font-medium">
                Size
              </th>
              {chart.columns.map((c) => (
                <th key={c.id} scope="col" className="px-4 py-3 font-medium">
                  {c.label}
                  {c.unit ? <span className="ml-1 text-body-sm font-normal">({c.unit})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((r) => (
              <tr key={r.sizeId} className="border-b border-base last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface-base px-4 py-3 font-medium">
                  {r.label}
                </th>
                {chart.columns.map((c) => (
                  <td key={c.id} className="px-4 py-3 tabular-nums">
                    {r.values[String(c.id)] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chart.howToMeasure.trim() ? (
        <section aria-labelledby="how-to-measure" className="max-w-prose">
          <h2 id="how-to-measure" className="mb-3 text-h3">
            How to measure
          </h2>
          <RichText text={chart.howToMeasure} />
        </section>
      ) : null}
    </div>
  );
}

function CarePanel({ text, business }: { text: string; business: Content['business'] }) {
  if (!text.trim()) return <ComingSoon title="The care guide is coming soon." business={business} />;
  return <RichText text={text} className="max-w-prose" />;
}

function FaqPanel({ faqs, business }: { faqs: Content['faqs']; business: Content['business'] }) {
  if (faqs.length === 0) return <ComingSoon title="Answers are coming soon." business={business} />;
  const groups = groupFaqs(faqs);
  return (
    <div className="grid gap-10 md:grid-cols-2 md:gap-x-12" data-testid="faq">
      {groups.map((g) => (
        <section key={g.heading ?? 'all'} aria-label={g.heading ?? 'Questions'} className={g.heading ? undefined : 'md:col-span-2'}>
          {g.heading ? <h2 className="mb-3 text-h3">{g.heading}</h2> : null}
          <Accordion items={g.items.map((f) => ({ id: `faq-${f.id}`, question: f.question, answer: f.answer }))} />
        </section>
      ))}
    </div>
  );
}
