/**
 * JSON-LD helpers (state-and-errors 16). Truthful data only: no ratings, no invented offers.
 * The script body is plain JSON text (with `<` escaped), never `dangerouslySetInnerHTML`.
 */
import type { HoodieDetail, Stimpie } from '@stimpy/api-client';
import { absoluteUrl, SITE_NAME } from './seo';

type Json = Record<string, unknown>;

export function JsonLd({ data }: { data: Json | Json[] }) {
  const text = JSON.stringify(data).replace(/</g, '\u003c');
  return <script type="application/ld+json">{text}</script>;
}

export function organizationJsonLd(input: { instagramUrl: string | null }): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/og-default.png'),
    ...(input.instagramUrl ? { sameAs: [input.instagramUrl] } : {}),
  };
}

/** `price = priceCents / 100` as a fixed 2-decimal string without float drift. */
export function priceString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function hoodieJsonLd(h: HoodieDetail): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: h.name,
    description: h.description,
    image: h.images.map(absoluteUrl),
    url: absoluteUrl(`/shop/hoodie/${h.slug}`),
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      price: priceString(h.priceCents),
      priceCurrency: 'USD',
      availability: h.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/shop/hoodie/${h.slug}`),
    },
  };
}

/** UPCOMING and ENDED have no live offer: the offer is omitted until the drop is live. */
export function stimpieJsonLd(s: Stimpie): Json {
  const image = s.images[0] ?? s.artworkUrl;
  const base: Json = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${s.name} Stimpie`,
    description: s.story,
    image: [absoluteUrl(image)],
    url: absoluteUrl(`/shop/stimpie/${s.slug}`),
    brand: { '@type': 'Brand', name: SITE_NAME },
  };
  if (s.status === 'UPCOMING' || s.status === 'ENDED') return base;
  return {
    ...base,
    offers: {
      '@type': 'Offer',
      price: priceString(s.priceCents),
      priceCurrency: 'USD',
      availability: s.purchasable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/shop/stimpie/${s.slug}`),
    },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer.replace(/\*\*/g, '') },
    })),
  };
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}
