import Link from 'next/link';
import { Logo, whatsappLink } from '@stimpy/ui';
import type { Content } from '@stimpy/api-client';
import { ArrowRight } from '@/components/icons';

type Business = Content['business'] | null;

interface Column {
  title: string;
  links: Array<{ href: string; label: string; external?: boolean }>;
}

function columns(business: Business): Column[] {
  const contact: Column['links'] = [];
  const wa = whatsappLink(business?.whatsappNumber, 'Hi Stimpy');
  if (wa) contact.push({ href: wa, label: 'WhatsApp', external: true });
  if (business?.instagramUrl) contact.push({ href: business.instagramUrl, label: 'Instagram', external: true });
  if (business?.supportEmail) contact.push({ href: `mailto:${business.supportEmail}`, label: business.supportEmail, external: true });
  return [
    {
      title: 'Shop',
      links: [
        { href: '/shop', label: 'Hoodies' },
        { href: '/shop?tab=stimpies', label: 'Stimpies' },
        { href: '/builder', label: 'Builder' },
        { href: '/drops', label: 'Drops' },
      ],
    },
    {
      title: 'Help',
      links: [
        { href: '/how-it-works', label: 'How it works' },
        { href: '/delivery-returns', label: 'Delivery & Returns' },
        { href: '/help', label: 'Size guide & FAQ' },
        { href: '/track', label: 'Track order' },
      ],
    },
    {
      title: 'Company',
      links: [
        { href: '/about', label: 'About' },
        { href: '/legal', label: 'Legal' },
      ],
    },
    ...(contact.length > 0 ? [{ title: 'Contact', links: contact }] : []),
  ];
}

/** Black footer: link columns, the small icon logo "on black", and the cash-on-delivery line. */
export function Footer({ business }: { business: Business }) {
  const cols = columns(business);
  return (
    <footer className="store-footer surface-dark bg-ink text-white">
      <div className="container py-12 md:py-16">
        <div className="store-footer-intro">
          <div><p className="store-footer-wordmark">STIMPY.</p><p className="mt-3 max-w-sm text-body-sm text-fg-muted">One hoodie. Multiple identities.</p></div>
          <Link href="/shop" className="store-footer-shop">Find your next identity <ArrowRight size={22} aria-hidden="true" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {cols.map((col) => (
            <nav key={col.title} aria-labelledby={`footer-${col.title}`}>
              <h2 id={`footer-${col.title}`} className="mb-3 text-body-sm font-medium">
                {col.title}
              </h2>
              <ul className="flex flex-col">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        className="inline-flex min-h-11 items-center break-all text-body-sm text-fg-muted hover:text-white hover:underline"
                      >
                        {l.label}
                        {l.href.startsWith('http') ? <span className="sr-only"> (opens in a new tab)</span> : null}
                      </a>
                    ) : (
                      <Link href={l.href} className="inline-flex min-h-11 items-center text-body-sm text-fg-muted hover:text-white hover:underline">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-base pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Logo variant="icon" surface="black" width={32} clearSpace={false} alt="Stimpy" />
            <p className="text-body-sm text-fg-muted">Cash on delivery across Lebanon</p>
          </div>
          <p className="text-body-sm text-fg-muted">&copy; {new Date().getFullYear()} Stimpy</p>
        </div>
      </div>
    </footer>
  );
}
