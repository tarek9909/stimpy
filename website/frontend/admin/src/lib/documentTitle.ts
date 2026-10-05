/**
 * `<Page> - Stimpy Dashboard`, with `(3) ` in front while unread new orders exist
 * (dashboard-pages 2.5). One module so the page title and the unread badge do not overwrite each other.
 */
const SUFFIX = 'Stimpy Dashboard';

let page: string | null = null;
let unread = 0;

function apply(): void {
  if (typeof document === 'undefined') return;
  const base = page ? `${page} - ${SUFFIX}` : SUFFIX;
  document.title = unread > 0 ? `(${unread}) ${base}` : base;
}

export function setDocumentPage(title: string | null): void {
  page = title;
  apply();
}

export function setDocumentUnread(count: number): void {
  unread = Math.max(0, Math.floor(count));
  apply();
}
