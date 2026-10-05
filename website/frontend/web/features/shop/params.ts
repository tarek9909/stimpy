/** Shop URL state: `/shop?tab=hoodies|stimpies&type=CORE|LIMITED&drop=<slug>&soldOut=show|hide` (website-pages 4.2). */

export type ShopTab = 'hoodies' | 'stimpies';
export type ShopType = 'CORE' | 'LIMITED';

export interface ShopParams {
  tab: ShopTab;
  type: ShopType | null;
  drop: string | null;
  hideSoldOut: boolean;
}

export const DEFAULT_SHOP_PARAMS: ShopParams = { tab: 'hoodies', type: null, drop: null, hideSoldOut: false };

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Unknown or malformed values fall back to the defaults; nothing here ever throws. */
export function parseShopParams(raw: RawParams): ShopParams {
  const tab = one(raw, 'tab') === 'stimpies' ? 'stimpies' : 'hoodies';
  const typeRaw = one(raw, 'type')?.toUpperCase();
  const type = typeRaw === 'CORE' || typeRaw === 'LIMITED' ? typeRaw : null;
  const dropRaw = one(raw, 'drop');
  const drop = dropRaw && /^[a-z0-9-]{1,140}$/.test(dropRaw) ? dropRaw : null;
  return { tab, type, drop, hideSoldOut: one(raw, 'soldOut') === 'hide' };
}

/** Canonical href for a state; defaults are left out so shared URLs stay short. */
export function shopHref(p: Partial<ShopParams>): string {
  const full = { ...DEFAULT_SHOP_PARAMS, ...p };
  const q = new URLSearchParams();
  if (full.tab === 'stimpies') q.set('tab', 'stimpies');
  if (full.tab === 'stimpies') {
    if (full.type) q.set('type', full.type);
    if (full.drop) q.set('drop', full.drop);
    if (full.hideSoldOut) q.set('soldOut', 'hide');
  }
  const s = q.toString();
  return s ? `/shop?${s}` : '/shop';
}

/** Number of active Stimpie filters (type, drop, hide sold out). More than one means `noindex` (thin page). */
export function activeFilterCount(p: ShopParams): number {
  if (p.tab !== 'stimpies') return 0;
  return (p.type ? 1 : 0) + (p.drop ? 1 : 0) + (p.hideSoldOut ? 1 : 0);
}
