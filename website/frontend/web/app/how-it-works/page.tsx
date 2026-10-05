import type { Metadata } from 'next';
import { Accordion, Button, Media, RichText, Section, ZipWipe } from '@stimpy/ui';
import { LoopVideo } from '@/components/LoopVideo';
import { Check } from '@/components/icons';
import { must } from '@/lib/api-server';
import { getContent } from '@/lib/data';
import { JsonLd, faqJsonLd } from '@/lib/jsonld';
import { isVideoUrl } from '@/lib/media';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent().catch(() => null);
  const image = content?.howItWorks.steps.find((s) => s.mediaUrl && !isVideoUrl(s.mediaUrl))?.mediaUrl ?? null;
  return pageMetadata({
    title: 'How it works',
    description: 'Zip a Stimpie on, swap it tomorrow. See how the one-way zipper system works.',
    path: '/how-it-works',
    image,
  });
}

export default async function HowItWorksPage() {
  const content = await must(() => getContent());
  const { steps, promises, faqs } = content.howItWorks;

  return (
    <>
      {faqs.length > 0 ? <JsonLd data={faqJsonLd(faqs)} /> : null}
      <Section tone="black" className="!py-14 md:!py-24">
        <h1 className="text-display max-w-3xl">Wear it plain. Zip on a Stimpie. Switch it tomorrow.</h1>
      </Section>

      {steps.length === 0 ? (
        <Section tone="white">
          <p className="max-w-prose text-lead text-fg-muted">
            One hoodie, one zip, endless backs. Pick a Stimpie, zip it on and swap it whenever you like.
          </p>
        </Section>
      ) : (
        <Section tone="white" aria-label="The steps">
          <ol className="flex flex-col gap-12 md:gap-20">
            {steps.map((step, i) => {
              const body = (
                <div
                  className={`grid gap-6 md:items-center md:gap-12 ${step.mediaUrl ? 'md:grid-cols-2' : ''}`}
                  data-testid="how-step"
                >
                  <div className={`flex flex-col gap-3 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                    <p className="text-caption font-medium uppercase tracking-[0.04em] text-fg-muted">Step {i + 1}</p>
                    <h2 className="text-h2">{step.title}</h2>
                    <RichText text={step.text} />
                  </div>
                  {step.mediaUrl ? (
                    isVideoUrl(step.mediaUrl) ? (
                      <LoopVideo src={step.mediaUrl} ratio="4 / 5" label={step.title} className={i % 2 === 1 ? 'md:order-1' : ''} />
                    ) : (
                      <Media src={step.mediaUrl} alt={step.title} ratio="4 / 5" sizes="(min-width: 768px) 45vw, 100vw" className={`rounded-xl ${i % 2 === 1 ? 'md:order-1' : ''}`} />
                    )
                  ) : null}
                </div>
              );
              return (
                <li key={`${i}-${step.title}`}>
                  {i === 1 ? (
                    <ZipWipe trigger="inView" direction="down" color="cream">
                      {body}
                    </ZipWipe>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {promises.length > 0 ? (
        <Section tone="cream" heading="Our quality promises">
          <ul className="grid gap-4 md:grid-cols-3">
            {promises.map((p) => (
              <li key={p} className="flex items-start gap-3 text-body">
                <Check width={24} height={24} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {faqs.length > 0 ? (
        <Section tone="white" heading="Questions we get">
          <div className="max-w-3xl">
            <Accordion items={faqs.map((f, i) => ({ id: `faq-${i}`, question: f.question, answer: f.answer }))} />
          </div>
        </Section>
      ) : null}

      <Section tone="black">
        <div className="flex flex-col items-start gap-4">
          <h2 className="text-h2">Ready when you are.</h2>
          <div className="flex flex-wrap gap-3">
            <Button href="/shop" variant="cta" size="lg">
              Order now
            </Button>
            <Button href="/builder" variant="secondary" size="lg">
              Try the Builder
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
