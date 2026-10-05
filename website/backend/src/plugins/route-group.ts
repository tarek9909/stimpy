export const API_PREFIX = '/api/v1';

export type RouteGroup = 'uploads' | 'admin' | 'public' | 'other';

/** Path without the query string. */
export const pathOf = (url: string): string => {
  const i = url.indexOf('?');
  return i < 0 ? url : url.slice(0, i);
};

/**
 * Which CORS / security group a request path belongs to (wiring 5.3):
 * `/auth/*` and `/admin/*` are "admin" (credentials, Origin check, no-store); other `/api/v1/*` are "public".
 */
export function groupOf(url: string): RouteGroup {
  const p = pathOf(url);
  if (p === '/uploads' || p.startsWith('/uploads/')) return 'uploads';
  if (p === `${API_PREFIX}/admin` || p.startsWith(`${API_PREFIX}/admin/`)) return 'admin';
  if (p === `${API_PREFIX}/auth` || p.startsWith(`${API_PREFIX}/auth/`)) return 'admin';
  if (p.startsWith(`${API_PREFIX}/`)) return 'public';
  return 'other';
}
