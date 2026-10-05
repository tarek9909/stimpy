export const PRINT_VIEWS = ['sheet', 'labels', 'invoices'] as const;
export type PrintView = (typeof PRINT_VIEWS)[number];

export const PRINT_GROUPS = ['none', 'area', 'status', 'source', 'date', 'delivery'] as const;
export type PrintGroup = (typeof PRINT_GROUPS)[number];

export const PRINT_VIEW_LABEL: Record<PrintView, string> = { sheet: 'Delivery sheet', labels: 'Labels', invoices: 'Invoices' };
export const PRINT_GROUP_LABEL: Record<PrintGroup, string> = {
  none: 'No grouping',
  area: 'Area',
  status: 'Status',
  source: 'Source',
  date: 'Order date',
  delivery: 'Delivery number',
};

/** Filters a print page can re-run (the same keys the orders list keeps in its URL). */
export const PRINT_FILTER_KEYS = ['status', 'source', 'areaId', 'dropId', 'from', 'to', 'deliveryNumber', 'q', 'holdExpired'] as const;
export type PrintFilterKey = (typeof PRINT_FILTER_KEYS)[number];

/** `/orders/print` for a hand-picked selection, or for every order matching `filters`. */
export function printPath(opts: {
  view: PrintView;
  group?: PrintGroup;
  ids?: number[];
  filters?: Partial<Record<PrintFilterKey, string | number | boolean | undefined>>;
}): string {
  const sp = new URLSearchParams();
  sp.set('view', opts.view);
  if (opts.group && opts.group !== 'none') sp.set('group', opts.group);
  if (opts.ids && opts.ids.length > 0) sp.set('ids', opts.ids.slice(0, 100).join(','));
  else for (const k of PRINT_FILTER_KEYS) {
    const v = opts.filters?.[k];
    if (v !== undefined && v !== '' && v !== false) sp.set(k, String(v));
  }
  return `/orders/print?${sp.toString()}`;
}
