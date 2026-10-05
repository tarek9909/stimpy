/** Placeholder rendering for email and WhatsApp templates: `{customer_name}` style, plain text only. */
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;

export function extractPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))];
}

/** Placeholders used in `text` that are not in `allowed` (empty array = valid). Saving such a template is a VALIDATION_ERROR. */
export function unknownPlaceholders(text: string, allowed: readonly string[]): string[] {
  return extractPlaceholders(text).filter((p) => !allowed.includes(p));
}

/** Missing values render as empty strings; unknown placeholders are never left in an outgoing message. */
export function renderTemplate(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (_m, key: string) => values[key] ?? '');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
