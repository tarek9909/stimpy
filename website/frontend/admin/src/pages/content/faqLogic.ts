import { moveItem } from '../../lib/reorder';

export interface FaqLike {
  id: number;
  group: string | null;
}

/** Distinct non-empty group labels in order of first appearance (case-sensitive, as stored). */
export function faqGroups(faqs: readonly FaqLike[]): string[] {
  const seen: string[] = [];
  for (const f of faqs) {
    const g = f.group?.trim();
    if (g && !seen.includes(g)) seen.push(g);
  }
  return seen;
}

export const UNGROUPED = '__ungrouped__';

/** Client-side group filter: `all`, `UNGROUPED` or a label. */
export function filterFaqs<T extends FaqLike>(faqs: readonly T[], group: string): T[] {
  if (group === 'all') return [...faqs];
  if (group === UNGROUPED) return faqs.filter((f) => !f.group?.trim());
  return faqs.filter((f) => (f.group?.trim() ?? '') === group);
}

/** A blank group saves as `null` (ungrouped). */
export function normalizeGroup(group: string): string | null {
  const g = group.trim();
  return g === '' ? null : g;
}

/**
 * Move one step inside a FILTERED view while the order stays ONE global list (`PUT /admin/faqs/order`
 * always gets the full id list). The item takes the global position of its neighbour in the view.
 */
export function moveInView(allIds: readonly number[], viewIds: readonly number[], id: number, delta: -1 | 1): number[] {
  if (viewIds.length === allIds.length) return moveItem(allIds, id, delta);
  const at = viewIds.indexOf(id);
  const neighbour = viewIds[at + delta];
  if (at === -1 || neighbour === undefined) return [...allIds];
  const next = [...allIds];
  const from = next.indexOf(id);
  next.splice(from, 1);
  next.splice(next.indexOf(neighbour) + (delta === 1 ? 1 : 0), 0, id);
  return next;
}
