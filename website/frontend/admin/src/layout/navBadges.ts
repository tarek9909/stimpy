import { useSyncExternalStore } from 'react';
import type { Area } from '../auth/roles';

/**
 * Small counters on navigation items. Orders is fed by the 30 s order-count poll; Stock can be
 * fed by whoever loads the Overview `attention` list (`setNavBadge('stock', lowStockCount)`).
 * A tiny external store so pages never import the layout.
 */
type Badges = Partial<Record<Area, number>>;

let badges: Badges = {};
const listeners = new Set<() => void>();

export function setNavBadge(area: Area, count: number | null): void {
  const next = { ...badges };
  if (!count || count <= 0) delete next[area];
  else next[area] = count;
  if (JSON.stringify(next) === JSON.stringify(badges)) return;
  badges = next;
  listeners.forEach((l) => l());
}

export function useNavBadges(): Badges {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => badges,
    () => badges,
  );
}

export function resetNavBadges(): void {
  badges = {};
  listeners.forEach((l) => l());
}
