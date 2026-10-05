import type { Drop, Hoodie, Pack, Stimpie } from '@prisma/client';
import { jsonStringArray } from '../../lib/db';
import { iso, isoOrNull } from '../../lib/dates';
import { ACCENT_HEX, availableUnits, stimpieAvailability } from '../../services/drops';

export type StimpieWithDrop = Stimpie & { drop: Drop | null };

export const accentHexOf = (d: Pick<Drop, 'accentColor'>): string => ACCENT_HEX[d.accentColor];

export function toDropSummary(d: Drop) {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    accentColor: d.accentColor,
    accentHex: accentHexOf(d),
    startsAt: iso(d.startsAt),
    endsAt: isoOrNull(d.endsAt),
  };
}

/** Public `Stimpie` (api-reference section 2). Never exposes cost or exact stock above the threshold. */
export function toPublicStimpie(row: StimpieWithDrop, lowStockThreshold: number, at: Date) {
  const a = stimpieAvailability({ ...row, drop: row.drop }, lowStockThreshold, at);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type,
    priceCents: row.priceCents,
    story: row.story,
    images: jsonStringArray(row.images),
    artworkUrl: row.artworkUrl,
    artworkWidth: row.artworkWidth,
    artworkHeight: row.artworkHeight,
    drop: row.drop ? toDropSummary(row.drop) : null,
    status: a.status,
    remaining: a.remaining,
    purchasable: a.purchasable,
  };
}

export const toPublicPack = (p: Pack) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  description: p.description,
  stimpieCount: p.stimpieCount,
  priceCents: p.priceCents,
  badge: p.badge,
});

export const toAdminHoodie = (h: Hoodie, stock: { available: number; reserved: number }) => ({
  id: h.id,
  name: h.name,
  slug: h.slug,
  description: h.description,
  details: jsonStringArray(h.details),
  priceCents: h.priceCents,
  costCents: h.costCents,
  images: jsonStringArray(h.images),
  active: h.active,
  position: h.position,
  available: stock.available,
  reserved: stock.reserved,
});

export const toAdminStimpie = (s: Stimpie) => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  type: s.type,
  dropId: s.dropId,
  priceCents: s.priceCents,
  costCents: s.costCents,
  story: s.story,
  images: jsonStringArray(s.images),
  artworkUrl: s.artworkUrl,
  artworkWidth: s.artworkWidth,
  artworkHeight: s.artworkHeight,
  active: s.active,
  position: s.position,
  quantity: s.quantity,
  available: availableUnits(s),
  reserved: s.reserved,
});

export const toAdminPack = (p: Pack) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  description: p.description,
  stimpieCount: p.stimpieCount,
  priceCents: p.priceCents,
  badge: p.badge,
  active: p.active,
  position: p.position,
});
