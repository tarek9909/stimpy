/** Metadata helpers (state-and-errors section 16, website-pages 1.5). Server-safe. */
import type { Metadata } from 'next';
import { siteUrl } from './env';

export const SITE_NAME = 'Stimpy';
export const DEFAULT_DESCRIPTION =
  'One hoodie. Multiple identities. Zip on a Stimpie, swap it tomorrow. Cash on delivery across Lebanon.';
export const DEFAULT_OG_IMAGE = '/og-default.png';

/** Absolute URL for a path or an already absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/** First `max` characters at a word boundary, ending with an ellipsis when cut (descriptions are 120-155 chars). */
export function excerpt(text: string | null | undefined, max = 155): string {
  const clean = (text ?? '')
    .replace(/\*\*/g, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface PageMetaInput {
  /** Page title without the site name (the root template appends ` | Stimpy`). */
  title: string;
  description?: string;
  /** Path used for the canonical URL and og:url, query string excluded. */
  path: string;
  /** Absolute or site-relative image URL. */
  image?: string | null;
  /** Keep out of the index (checkout, order, track, filtered variants, 404). */
  noindex?: boolean;
  /** Use the title as-is, without the template (home). */
  absoluteTitle?: boolean;
}

export function pageMetadata(input: PageMetaInput): Metadata {
  const description = input.description ?? DEFAULT_DESCRIPTION;
  const image = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE);
  const fullTitle = input.absoluteTitle ? input.title : `${input.title} | ${SITE_NAME}`;
  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description,
    alternates: { canonical: absoluteUrl(input.path) },
    ...(input.noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      url: absoluteUrl(input.path),
      siteName: SITE_NAME,
      type: 'website',
      images: [{ url: image }],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: [image] },
  };
}
