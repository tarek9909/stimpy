import type { Faq } from '@stimpy/api-client';

export type HelpTab = 'size' | 'care' | 'faq';

export function parseHelpTab(raw: string | string[] | undefined): HelpTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'care' || v === 'faq' ? v : 'size';
}

export interface FaqGroup {
  /** Heading text; null when no FAQ in the list has a group (no headings at all). */
  heading: string | null;
  items: Faq[];
}

/**
 * FAQ grouping (website-pages 4.13): one group per distinct label in order of first appearance; FAQs with `group: null`
 * come last under "More questions". With no grouped FAQ at all there are no headings.
 */
export function groupFaqs(faqs: readonly Faq[]): FaqGroup[] {
  if (faqs.length === 0) return [];
  if (faqs.every((f) => !f.group)) return [{ heading: null, items: [...faqs] }];
  const order: string[] = [];
  const byGroup = new Map<string, Faq[]>();
  const ungrouped: Faq[] = [];
  for (const f of faqs) {
    if (!f.group) {
      ungrouped.push(f);
      continue;
    }
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)?.push(f);
  }
  const groups: FaqGroup[] = order.map((g) => ({ heading: g, items: byGroup.get(g) ?? [] }));
  if (ungrouped.length > 0) groups.push({ heading: 'More questions', items: ungrouped });
  return groups;
}
