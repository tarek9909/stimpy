export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(s: string): boolean {
  return s.length <= 140 && SLUG_RE.test(s);
}

/** "THE VOID" -> "the-void". Strips accents, collapses everything else into single dashes. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/g, '');
}

/** Finds a free slug: base, base-2, base-3, ... `exists` is typically a DB lookup. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base) || 'item';
  let candidate = root;
  for (let i = 2; await exists(candidate); i++) candidate = `${root.slice(0, 130)}-${i}`;
  return candidate;
}
