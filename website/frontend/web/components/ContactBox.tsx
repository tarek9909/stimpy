import { TextLink, WhatsAppButton } from '@stimpy/ui';
import type { Content } from '@stimpy/api-client';

/** "Ask us" block: WhatsApp button and support email, each omitted when the business has not set it. */
export function ContactBox({ business, title = 'Questions?', text }: { business: Content['business'] | null; title?: string; text?: string }) {
  const hasWhatsApp = !!business?.whatsappNumber;
  const email = business?.supportEmail ?? null;
  if (!hasWhatsApp && !email) return null;
  return (
    <aside aria-label="Contact" className="rounded-lg border border-base p-5">
      <h2 className="text-h3">{title}</h2>
      {text ? <p className="mt-1 text-body text-fg-muted">{text}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {hasWhatsApp ? <WhatsAppButton number={business?.whatsappNumber} text="Hi Stimpy" label="Ask us on WhatsApp" variant="dark" /> : null}
        {email ? <TextLink href={`mailto:${email}`}>{email}</TextLink> : null}
      </div>
    </aside>
  );
}

