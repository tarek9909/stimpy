import { escapeHtml } from './template';

/**
 * The single branded e-mail layout (integrations.md section 1): white page, coral header bar with the logo mark as text,
 * Poppins-with-system-fallback stack, black body text, electric-blue button, footer with the support address.
 * Template authors write plain text; this module turns it into HTML. EVERY inserted value is escaped here.
 */
export const EMAIL_COLORS = { coral: '#FF7A59', black: '#111111', blue: '#2E63FF', white: '#FFFFFF', muted: '#4D4D4D', line: '#E7E1D8' } as const;
const FONT_STACK = "Poppins, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type EmailLayoutInput = {
  subject: string;
  /** Already placeholder-filled plain text. */
  body: string;
  footerText: string;
  supportEmail?: string | null;
  /** Electric-blue call-to-action. `url` must be a trusted, server-built http(s) URL. */
  button?: { label: string; url: string } | null;
  /** Exact URLs (built by the server, never customer input) that are turned into links inside the text. */
  linkUrls?: string[];
};

const isHttpUrl = (u: string): boolean => /^https?:\/\//i.test(u);

/** Plain text -> HTML paragraphs: blank lines split paragraphs, single newlines become <br>. Trusted URLs become links. */
function textToHtml(text: string, linkUrls: string[]): string {
  const links = linkUrls.filter(isHttpUrl);
  const paragraphs = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      let html = escapeHtml(p).replace(/\n/g, '<br>');
      for (const url of links) {
        const escaped = escapeHtml(url);
        html = html.split(escaped).join(`<a href="${escaped}" style="color:${EMAIL_COLORS.blue};word-break:break-all;">${escaped}</a>`);
      }
      return `<p style="margin:0 0 16px 0;">${html}</p>`;
    })
    .join('\n');
}

export function renderEmailLayout(input: EmailLayoutInput): { text: string; html: string } {
  const { subject, body, footerText, supportEmail, button, linkUrls = [] } = input;
  const text = `${body.trim()}\n\n--\n${footerText.trim()}${supportEmail ? `\nQuestions? ${supportEmail}` : ''}`.trim();

  const buttonHtml =
    button && isHttpUrl(button.url)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;"><tr><td style="background:${EMAIL_COLORS.blue};border-radius:8px;">` +
        `<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:16px;font-weight:700;color:${EMAIL_COLORS.white};text-decoration:none;">${escapeHtml(button.label)}</a>` +
        `</td></tr></table>`
      : '';

  const footerLines = [escapeHtml(footerText.trim()).replace(/\n/g, '<br>')];
  if (supportEmail) {
    const e = escapeHtml(supportEmail);
    footerLines.push(`Questions? <a href="mailto:${e}" style="color:${EMAIL_COLORS.muted};">${e}</a>`);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.white};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_COLORS.white};">
<tr><td align="center" style="padding:0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="background:${EMAIL_COLORS.coral};padding:20px 28px;font-family:${FONT_STACK};font-size:24px;font-weight:700;letter-spacing:2px;color:${EMAIL_COLORS.black};">STIMPY</td></tr>
<tr><td style="padding:28px;font-family:${FONT_STACK};font-size:16px;line-height:1.55;color:${EMAIL_COLORS.black};">
${textToHtml(body, linkUrls)}
${buttonHtml}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid ${EMAIL_COLORS.line};font-family:${FONT_STACK};font-size:13px;line-height:1.5;color:${EMAIL_COLORS.muted};">
${footerLines.join('<br>')}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { text, html };
}
