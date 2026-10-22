export const API_PREFIX = '/api/v1';

export type RouteGroup = 'uploads' | 'admin' | 'public' | 'other';

/** Path without the query string. */
export const pathOf = (url: string): string => {
  const i = url.indexOf('?');
  return i < 0 ? url : url.slice(0, i);
};

/**
 * Path without the query string, percent-decoded the way the router sees it (`/api/v1/%61dmin` -> `/api/v1/admin`).
 * A malformed escape leaves the raw path (the router rejects such URLs anyway).
 */
export const decodedPathOf = (url: string): string => {
  const p = pathOf(url);
  if (!p.includes('%')) return p;
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};

/**
 * Which CORS / security group a request path belongs to (wiring 5.3):
 * `/auth/*` and `/admin/*` are "admin" (credentials, Origin check, no-store); other `/api/v1/*` are "public".
 * Pass a route pattern or an already decoded path; for a live request use `requestGroup`.
 */
export function groupOf(url: string): RouteGroup {
  const p = pathOf(url);
  if (p === '/uploads' || p.startsWith('/uploads/')) return 'uploads';
  if (p === `${API_PREFIX}/admin` || p.startsWith(`${API_PREFIX}/admin/`)) return 'admin';
  if (p === `${API_PREFIX}/auth` || p.startsWith(`${API_PREFIX}/auth/`)) return 'admin';
  if (p.startsWith(`${API_PREFIX}/`)) return 'public';
  return 'other';
}

/**
 * The group of a live request. The router matches on the percent-DECODED path, so classifying the raw URL would let
 * `POST /api/v1/%61dmin/...` reach an admin route while skipping the Origin check, admin CORS and no-store. Use the
 * matched route pattern when there is one, else the decoded path (404s).
 */
export function requestGroup(req: { url: string; routeOptions?: { url?: string } }): RouteGroup {
  const matched = req.routeOptions?.url;
  return groupOf(matched ? matched : decodedPathOf(req.url));
}
