/**
 * Data helpers for server components. One function per endpoint, each with its documented `revalidate` window and
 * cache tag (state-and-errors 2.2). Wrapped in React `cache` so one render never fetches the same thing twice.
 */
import { cache } from 'react';
import type { Drop, HoodieDetail, HoodieSummary, Pack, Stimpie } from '@stimpy/api-client';
import { REVALIDATE, serverApi, unwrap } from './api-server';

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
  async (): Promise<HoodieSummary[]> =>
    unwrap(await serverApi({ revalidate: REVALIDATE.hoodies, tags: ['catalog'] }).GET('/api/v1/products/hoodies')),
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
  return unwrap(
    await serverApi({ revalidate: REVALIDATE.stimpies, tags: ['catalog'] }).GET('/api/v1/products/stimpies', {
      params: {
        query: {
          ...(q.type ? { type: q.type } : {}),
          ...(q.drop ? { drop: q.drop } : {}),
          ...(q.includeSoldOut === undefined ? {} : { includeSoldOut: q.includeSoldOut ? 'true' : 'false' }),
          ...(q.includeUpcoming === undefined ? {} : { includeUpcoming: q.includeUpcoming ? 'true' : 'false' }),
          ...(q.includeEnded === undefined ? {} : { includeEnded: q.includeEnded ? 'true' : 'false' }),
        },
      },
    }),
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
  async (): Promise<Pack[]> => unwrap(await serverApi({ revalidate: REVALIDATE.packs, tags: ['catalog'] }).GET('/api/v1/packs')),
);

export const getDrops = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.drops, tags: ['drops'] }).GET('/api/v1/drops')),
);

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

export const getContent = cache(async () =>
  unwrap(await serverApi({ revalidate: REVALIDATE.content, tags: ['content'] }).GET('/api/v1/content')),
);

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
