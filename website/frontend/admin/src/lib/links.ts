/**
 * Link construction for contact data (auth-and-sessions 6.1). Only values that pass a strict check
 * become links; nothing a customer typed is ever put into a `text`, `subject` or `body` parameter.
 */

/** `tel:+9613123456` from an E.164 number returned by the API, or null when it is not one. */
export function telHref(phone: string | null | undefined): string | null {
  return phone && /^\+[0-9]{6,15}$/.test(phone) ? `tel:${phone}` : null;
}

/** Plain `mailto:` link (no subject or body). */
export function mailtoHref(email: string | null | undefined): string | null {
  return email && /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/.test(email) ? `mailto:${email}` : null;
}

/** The one client-built WhatsApp link (customers list): digits only, no text parameter. */
export function whatsappDigitsLink(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  return /^[0-9]{6,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
}

/** `https://wa.me/...` only. Anything else (other host, other scheme) is refused. */
export function isSafeWhatsAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'wa.me';
  } catch {
    return false;
  }
}

/**
 * Opens a WhatsApp chat from a click handler without tripping popup blockers (dashboard-pages
 * 5.7): a blank tab is opened synchronously, then pointed at the URL once `load` resolves. If the
 * request fails or the URL is not `https://wa.me/`, the tab is closed and the error is rethrown
 * (callers toast it).
 */
export async function openWhatsAppTab(load: () => Promise<{ url: string }>): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await load();
    if (!isSafeWhatsAppUrl(url)) throw new Error('Unsafe WhatsApp link');
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      // The browser refused the blank tab: fall back to a normal navigation in a new window.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    tab?.close();
    throw e;
  }
}
