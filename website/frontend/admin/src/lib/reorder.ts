/**
 * Pure helpers for list reordering. The API wants the FULL id list in its new order
 * (`PUT /admin/{hoodies,packs,colors,sizes,faqs}/order { ids }`, 204), so reordering always works
 * on the complete list, never on a filtered view.
 */
export function moveItem<T>(ids: readonly T[], id: T, delta: -1 | 1): T[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Shared API contract limit for full-list reorder requests. */
export const MAX_ORDERABLE_ITEMS = 5000;

/** Moves `fromId` to the position currently held by `toId` (drag and drop). */
export function moveToPosition<T>(ids: readonly T[], fromId: T, toId: T): T[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** Re-sorts `rows` into the order of `ids` (rows not in `ids` keep their relative order at the end). */
export function sortByIds<T>(rows: readonly T[], ids: readonly number[], getId: (row: T) => number): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (rank.get(getId(a)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(getId(b)) ?? Number.MAX_SAFE_INTEGER));
}
