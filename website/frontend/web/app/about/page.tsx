import type { Metadata } from 'next';
import { Button, Logo, Pill, RichText, Section } from '@stimpy/ui';
import { must } from '@/lib/api-server';
import { getContent } from '@/lib/data';
import { pageMetadata } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: 'About Stimpy',
  description: 'The story behind the hoodie with a swappable back panel.',
  path: '/about',
});

/** Brand personality (brand identity section 1). */
const PERSONALITY = ['Confident', 'Clever', 'Playful', 'Clean'] as const;

export default async function AboutPage() {
  const content = await must(() => getContent());
  const story = content.about;
  return (
    <>
      <Section tone="coral" className="!py-14 md:!py-24">
        <h1 className="text-display max-w-3xl">Keep the hoodie. Change the story.</h1>
      </Section>

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,42.5rem)_1fr] lg:gap-20">
          <div className="flex flex-col gap-6">
            {story.trim() ? (
              <RichText text={story} className="max-w-[42.5rem]" />
            ) : (
              <p className="text-lead text-fg-muted">Stimpy is one hoodie with a swappable back panel. Wear your mood.</p>
            )}
            <ul className="flex flex-wrap gap-2" aria-label="Our personality">
              {PERSONALITY.map((p) => (
                <li key={p}>
                  <Pill tone="cream">{p}</Pill>
                </li>
              ))}
            </ul>
          </div>

          <aside aria-labelledby="split-s" className="flex flex-col gap-4 rounded-lg bg-cream p-6 text-ink">
            <h2 id="split-s" className="text-h3">
              The split S
            </h2>
            <div className="self-start">
              <Logo
                variant="icon"
                surface="coral"
                width={96}
                alt="The Stimpy icon: a letter S split down the middle, a solid half on the left and an outlined half on the right"
              />
            </div>
            <ul className="flex flex-col gap-2 text-body">
              <li>The solid half is the hoodie: it stays.</li>
              <li>The outline half is the Stimpie: it changes.</li>
            </ul>
          </aside>
        </div>
      </Section>

      <Section tone="cream">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="mr-auto text-h2">See it for yourself.</h2>
          <Button href="/builder" variant="dark" size="lg">
            Try the Builder
          </Button>
          <Button href="/shop" variant="secondary" size="lg">
            Shop
          </Button>
        </div>
      </Section>
    </>
  );
}
