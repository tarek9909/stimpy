/**
 * Data helpers for server components. One function per endpoint, each with its documented `revalidate` window and
 * cache tag (state-and-errors 2.2). Wrapped in React `cache` so one render never fetches the same thing twice.
 */
import { cache } from 'react';
import type { Content, Drop, DropsOverview, HoodieDetail, HoodieSummary, Pack, PublicPromotion, Stimpie } from '@stimpy/api-client';
import { REVALIDATE, serverApi, unwrap } from './api-server';
import { fetchAllPages } from './pagination';

export interface StimpieQuery {
  type?: 'CORE' | 'LIMITED';
  drop?: string;
  includeSoldOut?: boolean;
  includeUpcoming?: boolean;
  includeEnded?: boolean;
}

export const getOptions = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.options, tags: ['options'] }).GET('/api/v1/options')),
);

export const getSizeChart = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.sizeChart, tags: ['size-chart'] }).GET('/api/v1/size-chart')),
);

export const getHoodies = cache(
  async (): Promise<HoodieSummary[]> => {
    const api = serverApi({ revalidate: REVALIDATE.hoodies, tags: ['catalog'] });
    return fetchAllPages(async (page, pageSize) =>
      unwrap(await api.GET('/api/v1/products/hoodies', { params: { query: { page, pageSize } } })),
    );
  },
);

export const getHoodie = cache(
  async (slug: string): Promise<HoodieDetail> =>
    unwrap(
      await serverApi({ revalidate: REVALIDATE.hoodies, tags: ['catalog'] }).GET('/api/v1/products/hoodies/{slug}', {
        params: { path: { slug } },
      }),
    ),
);

// React `cache` keys on argument identity, so the query travels as a JSON string: equal queries share one result.
const getStimpiesCached = cache(async (queryJson: string): Promise<Stimpie[]> => {
  const q = JSON.parse(queryJson) as StimpieQuery;
  const api = serverApi({ revalidate: REVALIDATE.stimpies, tags: ['catalog'] });
  return fetchAllPages(async (page, pageSize) =>
    unwrap(
      await api.GET('/api/v1/products/stimpies', {
        params: {
          query: {
            ...(q.type ? { type: q.type } : {}),
            ...(q.drop ? { drop: q.drop } : {}),
            ...(q.includeSoldOut === undefined ? {} : { includeSoldOut: q.includeSoldOut ? 'true' : 'false' }),
            ...(q.includeUpcoming === undefined ? {} : { includeUpcoming: q.includeUpcoming ? 'true' : 'false' }),
            ...(q.includeEnded === undefined ? {} : { includeEnded: q.includeEnded ? 'true' : 'false' }),
            page,
            pageSize,
          },
        },
      }),
    ),
  );
});

export const getStimpies = (q: StimpieQuery = {}): Promise<Stimpie[]> =>
  getStimpiesCached(JSON.stringify({ type: q.type, drop: q.drop, includeSoldOut: q.includeSoldOut, includeUpcoming: q.includeUpcoming, includeEnded: q.includeEnded }));

export const getStimpie = cache(
  async (slug: string): Promise<Stimpie> =>
    unwrap(
      await serverApi({ revalidate: REVALIDATE.stimpies, tags: ['catalog'] }).GET('/api/v1/products/stimpies/{slug}', {
        params: { path: { slug } },
      }),
    ),
);

export const getPacks = cache(
  async (): Promise<Pack[]> => {
    const api = serverApi({ revalidate: REVALIDATE.packs, tags: ['catalog'] });
    return fetchAllPages(async (page, pageSize) => unwrap(await api.GET('/api/v1/packs', { params: { query: { page, pageSize } } })));
  },
);

export const getPublicPromotions = cache(async (): Promise<PublicPromotion[]> =>
  unwrap(await serverApi({ revalidate: REVALIDATE.promotions, tags: ['promotions'] }).GET('/api/v1/promotions')),
);

export const getDrops = cache(async (): Promise<{ live: DropsOverview['live']; upcoming: Drop[]; archive: Drop[] }> => {
    const api = serverApi({ revalidate: REVALIDATE.drops, tags: ['drops'] });
    const loadPage = async (page: number, pageSize: number) =>
      unwrap(await api.GET('/api/v1/drops', { params: { query: { page, pageSize } } }));
    const first = await loadPage(1, 100);
    const upcoming = [...first.upcoming.items];
    const archive = [...first.archive.items];
    const upcomingPages = Math.ceil(first.upcoming.total / first.upcoming.pageSize);
    const archivePages = Math.ceil(first.archive.total / first.archive.pageSize);
    for (let page = 2; page <= Math.max(upcomingPages, archivePages); page += 1) {
      const next = await loadPage(page, 100);
      if (page <= upcomingPages) {
        if (next.upcoming.total !== first.upcoming.total) throw new Error('The drop list changed while it was loading. Refresh and try again.');
        upcoming.push(...next.upcoming.items);
      }
      if (page <= archivePages) {
        if (next.archive.total !== first.archive.total) throw new Error('The drop list changed while it was loading. Refresh and try again.');
        archive.push(...next.archive.items);
      }
    }
    if (upcoming.length !== first.upcoming.total || archive.length !== first.archive.total) throw new Error('The API returned an incomplete drop list. Refresh and try again.');
    return { live: first.live, upcoming, archive };
  });

export const getDrop = cache(
  async (slug: string): Promise<Drop> =>
    unwrap(
      await serverApi({ revalidate: REVALIDATE.drops, tags: ['drops'] }).GET('/api/v1/drops/{slug}', {
        params: { path: { slug } },
      }),
    ),
);

export const getDeliveryFees = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.delivery, tags: ['delivery'] }).GET('/api/v1/delivery/fees')),
);

export const getContent = cache(async (): Promise<Content> => {
  const api = serverApi({ revalidate: REVALIDATE.content, tags: ['content'] });
  const loadPage = async (page: number, pageSize: number) =>
    unwrap(await api.GET('/api/v1/content', { params: { query: { page, pageSize } } }));
  const first = await loadPage(1, 100);
  const faqs = [...first.faqs.items];
  const reviews = [...first.reviews.items];
  const faqPages = Math.ceil(first.faqs.total / first.faqs.pageSize);
  const reviewPages = Math.ceil(first.reviews.total / first.reviews.pageSize);
  for (let page = 2; page <= Math.max(faqPages, reviewPages); page += 1) {
    const next = await loadPage(page, 100);
    if (page <= faqPages) {
      if (next.faqs.total !== first.faqs.total) throw new Error('The FAQ list changed while it was loading. Refresh and try again.');
      faqs.push(...next.faqs.items);
    }
    if (page <= reviewPages) {
      if (next.reviews.total !== first.reviews.total) throw new Error('The review list changed while it was loading. Refresh and try again.');
      reviews.push(...next.reviews.items);
    }
  }
  if (faqs.length !== first.faqs.total || reviews.length !== first.reviews.total) throw new Error('The API returned incomplete page content. Refresh and try again.');
  const { faqs: _faqPage, reviews: _reviewPage, ...rest } = first;
  return { ...rest, faqs, reviews };
});

/** Layout and non-critical sections: a content outage must not take a page down. */
export const getContentSafe = cache(async () => {
  try {
    return await getContent();
  } catch {
    return null;
  }
});

export const getBuilderConfig = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.builder, tags: ['builder'] }).GET('/api/v1/builder/config')),
);
