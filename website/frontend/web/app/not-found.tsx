import type { Metadata } from 'next';
import { Button, Logo, Section } from '@stimpy/ui';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } };

/** 404 (website-pages 3.6): black section, icon logo, two ways out. Returns a real 404 status. */
export default function NotFound() {
  return (
    <Section tone="black" className="!py-20 md:!py-32">
      <div className="flex flex-col items-center gap-6 text-center">
        <Logo variant="icon" surface="black" width={56} alt="Stimpy" />
        <h1 className="text-h1">That page isn&apos;t here.</h1>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/shop" variant="cta" size="lg">
            Shop
          </Button>
          <Button href="/" variant="secondary" size="lg">
            Home
          </Button>
        </div>
      </div>
    </Section>
  );
}
