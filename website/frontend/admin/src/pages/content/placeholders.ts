/**
 * Placeholder chips for email and WhatsApp templates (dashboard-pages 13.6). The server is
 * authoritative (it rejects unknown placeholders on save); these helpers flag them early.
 */

/** `{name}` token regex: braces around anything without braces or whitespace-only. */
const TOKEN = /\{[^{}\n]*\}/g;

/** Normalises an API placeholder (`customer_name` or `{customer_name}`) to `{customer_name}`. */
export function asToken(placeholder: string): string {
  return placeholder.startsWith('{') ? placeholder : `{${placeholder}}`;
}

/** Every `{...}` token in a text, in order, with duplicates. */
export function findTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Tokens in `text` that are not in the allowed list (unique, in order of appearance). */
export function unknownPlaceholders(text: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed.map(asToken));
  const bad: string[] = [];
  for (const t of findTokens(text)) if (!ok.has(t) && !bad.includes(t)) bad.push(t);
  return bad;
}

/** Inserts `token` at the caret / replacing the selection. Returns the new value and caret position. */
export function insertAtCursor(value: string, start: number, end: number, token: string): { value: string; caret: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  return { value: value.slice(0, s) + token + value.slice(e), caret: s + token.length };
}

/** Sample values for the WhatsApp preview (there is no server preview for WhatsApp templates). */
export const SAMPLE_VALUES: Record<string, string> = {
  customer_name: 'Rima',
  order_number: 'STP-1042',
  items: 'Hoodie + 2 Stimpies',
  total: '$45.00',
  delivery_number: 'D-88231',
  tracking_url: 'https://stimpy.example/track?order=STP-1042',
  cancel_reason: 'Out of stock',
  order_list: 'STP-1042, STP-1031',
};

/** Fills known placeholders with sample values; unknown ones stay as typed (so they are visibly wrong). */
export function renderSample(text: string): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, name: string) => SAMPLE_VALUES[name] ?? m);
}
