import type { Metadata } from 'next';
import { RichText, Section, TextLink } from '@stimpy/ui';
import { must } from '@/lib/api-server';
import { getContent } from '@/lib/data';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: 'Privacy and terms',
  description: 'How Stimpy handles your data and the terms of sale.',
  path: '/legal',
});

export default async function LegalPage() {
  const content = await must(() => getContent());
  const email = content.business.supportEmail;
  const sections = [
    { id: 'privacy', title: 'Privacy', text: content.policies.privacy },
    { id: 'terms', title: 'Terms of sale', text: content.policies.terms },
  ] as const;

  return (
    <Section tone="white" heading="Privacy and terms" headingLevel={1}>
      <div className="grid gap-8 lg:grid-cols-[12rem_1fr] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-6 lg:flex-col lg:gap-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="inline-flex min-h-11 items-center text-body font-medium underline underline-offset-4">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-[43.75rem] flex-col gap-12">
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id}>
              <h2 id={s.id} tabIndex={-1} className="mb-4 scroll-mt-24 text-h2 outline-none">
                {s.title}
              </h2>
              {s.text.trim() ? (
                <RichText text={s.text} />
              ) : (
                <p className="text-body text-fg-muted">
                  This section is being finalized.{' '}
                  {email ? <TextLink href={`mailto:${email}`}>Contact us for details.</TextLink> : 'Contact us for details.'}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </Section>
  );
}
