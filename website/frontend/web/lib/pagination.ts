export interface ApiPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Read every backend page for existing storefront views that need a complete catalog. */
export async function fetchAllPages<T>(loadPage: (page: number, pageSize: number) => Promise<ApiPage<T>>, pageSize = 100): Promise<T[]> {
  const first = await loadPage(1, pageSize);
  validatePage(first, 1, pageSize);
  const pages = Math.ceil(first.total / pageSize);
  const items = [...first.items];
  for (let page = 2; page <= pages; page += 1) {
    const next = await loadPage(page, pageSize);
    validatePage(next, page, pageSize);
    if (next.total !== first.total) throw new Error('The catalog changed while it was loading. Refresh and try again.');
    items.push(...next.items);
  }
  if (items.length !== first.total) throw new Error('The server returned an incomplete catalog. Refresh and try again.');
  return items;
}

export async function fetchApiAllPages<T>(
  loadPage: (page: number, pageSize: number) => Promise<{ data?: ApiPage<T> }>,
  pageSize = 100,
): Promise<T[]> {
  return fetchAllPages(async (page, size) => {
    const response = await loadPage(page, size);
    if (!response.data) throw new Error('The API returned an empty page.');
    return response.data;
  }, pageSize);
}

function validatePage<T>(response: ApiPage<T>, requestedPage: number, requestedSize: number): void {
  if (
    response.page !== requestedPage ||
    response.pageSize !== requestedSize ||
    !Number.isInteger(response.total) ||
    response.total < 0 ||
    response.items.length > requestedSize ||
    (requestedPage === 1 && response.items.length > response.total)
  ) {
    throw new Error('The server returned an invalid page. Refresh and try again.');
  }
}
