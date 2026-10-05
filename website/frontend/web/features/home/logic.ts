import type { Drop, Pack } from '@stimpy/api-client';

/** Current drop for the strip and the "Current drop" section: the featured one if set, else live, else the next upcoming. */
export function pickCurrentDrop(
  featured: Drop | null,
  overview: { live: Drop | null; upcoming: Drop[] } | null,
): Drop | null {
  const isCurrent = (d: Drop | null): d is Drop => !!d && (d.state === 'LIVE' || d.state === 'UPCOMING');
  if (isCurrent(featured)) return featured;
  if (isCurrent(overview?.live ?? null)) return overview?.live ?? null;
  return overview?.upcoming.find(isCurrent) ?? null;
}

/** "Second Stimpie effectively {x}": price of the 2-Stimpie pack minus the 1-Stimpie pack, only when positive. */
export function secondStimpieExtraCents(packs: readonly Pack[]): number | undefined {
  const sorted = [...packs].sort((a, b) => a.stimpieCount - b.stimpieCount);
  const one = sorted.find((p) => p.stimpieCount === 1);
  const two = sorted.find((p) => p.stimpieCount === 2);
  if (!one || !two) return undefined;
  const x = two.priceCents - one.priceCents;
  return x > 0 ? x : undefined;
}

