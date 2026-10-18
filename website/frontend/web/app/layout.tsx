import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@stimpy/ui/tokens.css';
import './globals.css';
import { AnnouncementBar, SkipLink } from '@stimpy/ui';
import { CartDrawerGate } from '@/components/layout/CartDrawerGate';
import { ClientEffects } from '@/components/layout/ClientEffects';
import { FloatingWhatsAppGate } from '@/components/layout/FloatingWhatsAppGate';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { AnalyticsLoader } from '@/components/layout/AnalyticsLoader';
import { WebVitals } from '@/components/layout/WebVitals';
import { Providers } from '@/components/Providers';
import { siteUrl } from '@/lib/env';
import { poppins } from '@/lib/fonts';
import { getContentSafe } from '@/lib/data';
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${SITE_NAME} | One hoodie. Multiple identities.`, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    title: `${SITE_NAME} | One hoodie. Multiple identities.`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: [DEFAULT_OG_IMAGE] },
};

// Pinch zoom stays enabled (accessibility: `user-scalable=no` is forbidden).
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/**
 * Root layout: skip link, announcement bar, sticky header, main landmark, footer, cart drawer, floating WhatsApp,
 * providers (UI links/images, server clock, toasts) and the app-wide client effects. `GET /content` (ISR 60 s) feeds the
 * announcement, footer and WhatsApp number; if it fails the shell still renders without them.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const content = await getContentSafe();
  return (
    <html lang="en" className={poppins.variable}>
      <body className="storefront">
        <Providers>
          <SkipLink />
          {content?.announcement ? <AnnouncementBar text={content.announcement.text} linkUrl={content.announcement.linkUrl} /> : null}
          <Header />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <Footer business={content?.business ?? null} />
          <CartDrawerGate />
          <FloatingWhatsAppGate number={content?.business.whatsappNumber ?? null} />
          <AnalyticsLoader />
          <WebVitals />
          <ClientEffects />
        </Providers>
      </body>
    </html>
  );
}
