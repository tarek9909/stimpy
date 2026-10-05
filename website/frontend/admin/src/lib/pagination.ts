export const ADMIN_PAGE_SIZE = 100;

export interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Read a complete paginated list before using it for a global action such as reordering.
 * Reject inconsistent/overlapping pages so a concurrent list change can never turn a partial
 * snapshot into a destructive full-list request.
 */
export async function fetchAllPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<ApiPage<T>>,
  pageSize = ADMIN_PAGE_SIZE,
  getId: (item: T) => number = (item) => {
    const id = (item as { id?: unknown } | null)?.id;
    if (typeof id !== 'number') throw new Error('A stable numeric id is required to verify a complete list.');
    return id;
  },
): Promise<ApiPage<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Page size must be a positive integer.');

  const first = await loadPage(1, pageSize);
  validatePage(first, 1, pageSize);
  const pages = Math.ceil(first.total / pageSize);
  const items = [...first.items];
  const ids = new Set(items.map(getId));
  if (ids.size !== items.length) throw new Error('The list changed while it was loading. Refresh and try again.');

  for (let page = 2; page <= pages; page += 1) {
    const next = await loadPage(page, pageSize);
    validatePage(next, page, pageSize);
    if (next.total !== first.total || next.pageSize !== first.pageSize) {
      throw new Error('The list changed while it was loading. Refresh and try again.');
    }
    appendUnique(items, ids, next.items, getId);
  }

  if (items.length !== first.total) {
    throw new Error('The list changed while it was loading. Refresh and try again.');
  }

  // A quick first-page check catches inserts, deletes, and order changes that happened while the
  // remaining pages were being read. The server still validates the full id set at mutation time.
  const verifiedFirst = await loadPage(1, pageSize);
  validatePage(verifiedFirst, 1, pageSize);
  if (
    verifiedFirst.total !== first.total ||
    verifiedFirst.items.length !== first.items.length ||
    verifiedFirst.items.some((item, index) => getId(item) !== (first.items[index] ? getId(first.items[index] as T) : undefined))
  ) {
    throw new Error('The list changed while it was loading. Refresh and try again.');
  }

  return { ...first, items };
}

function validatePage<T>(page: ApiPage<T>, requestedPage: number, requestedSize: number): void {
  if (
    page.page !== requestedPage ||
    page.pageSize !== requestedSize ||
    !Number.isInteger(page.total) ||
    page.total < 0 ||
    page.items.length > requestedSize ||
    (requestedPage === 1 && page.items.length > page.total)
  ) {
    throw new Error('The server returned an invalid page. Refresh and try again.');
  }
}

function appendUnique<T>(items: T[], ids: Set<number>, nextItems: T[], getId: (item: T) => number): void {
  for (const item of nextItems) {
    const id = getId(item);
    if (ids.has(id)) throw new Error('The list changed while it was loading. Refresh and try again.');
    ids.add(id);
    items.push(item);
  }
}
