import type { MetadataRoute } from 'next';
import { getDrops, getHoodies, getStimpies } from '@/lib/data';
import { absoluteUrl } from '@/lib/seo';

/** Re-generated at most every 5 minutes; slugs come from the API. */
export const revalidate = 300;

const STATIC_ROUTES = ['/', '/shop', '/builder', '/drops', '/how-it-works', '/delivery-returns', '/help', '/about', '/legal'] as const;

/**
 * Indexable URLs only (state-and-errors 16): static pages plus hoodies, Stimpies and drops from the API.
 * Checkout, order, track and filtered variants are excluded. If the API is unreachable the static routes are still listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === '/' || path === '/drops' ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }));
  const [hoodies, stimpies, drops] = await Promise.all([
    getHoodies().catch(() => []),
    getStimpies({ includeSoldOut: true, includeUpcoming: true }).catch(() => []),
    getDrops().catch(() => null),
  ]);
  for (const h of hoodies) entries.push({ url: absoluteUrl(`/shop/hoodie/${h.slug}`), lastModified: now, changeFrequency: 'weekly', priority: 0.8 });
  for (const s of stimpies) entries.push({ url: absoluteUrl(`/shop/stimpie/${s.slug}`), lastModified: now, changeFrequency: 'daily', priority: 0.6 });
  if (drops) {
    for (const d of [...(drops.live ? [drops.live] : []), ...drops.upcoming, ...drops.archive]) {
      entries.push({ url: absoluteUrl(`/drops/${d.slug}`), lastModified: now, changeFrequency: 'daily', priority: 0.6 });
    }
  }
  return entries;
}
