/**
 * Session expiry plumbing (auth-and-sessions 2.3). This module has no React and no router import
 * so the API layer, the upload helper and the query cache can all call it without cycles. The app
 * wires the real behaviour once at start-up with `configureSessionExpiry`.
 */
export interface ExpiryInfo {
  /** HTTP method of the request that got the 401. A non-GET means "your last change wasn't saved". */
  method?: string;
}

export interface SessionExpiryHandlers {
  /** Runs the whole "session ended" flow once (cancel, clear cache, drafts, broadcast, navigate). */
  onExpired: (info: ExpiryInfo) => void;
}

let handlers: SessionExpiryHandlers | null = null;
let handled = false;

export function configureSessionExpiry(next: SessionExpiryHandlers | null): void {
  handlers = next;
  handled = false;
}

/**
 * Idempotent: a burst of simultaneous 401s runs the handler once. The flag is cleared by
 * `resetSessionExpiry()` after the next successful login (or a successful `GET /auth/me`).
 */
export function notifySessionExpired(info: ExpiryInfo = {}): void {
  if (handled) return;
  handled = true;
  handlers?.onExpired(info);
}

export function resetSessionExpiry(): void {
  handled = false;
}

/** Requests whose 401 is NOT a session expiry (the login attempt itself, the bootstrap check, logout). */
const EXEMPT = ['/api/v1/auth/login', '/api/v1/auth/me', '/api/v1/auth/logout'];

export function isExpiryExemptPath(path: string): boolean {
  return EXEMPT.includes(path);
}
