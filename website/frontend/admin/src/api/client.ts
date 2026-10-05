import { ApiError, createAdminClient, createPublicClient, type ApiClient, type components } from '@stimpy/api-client';
import { getEnv } from '../env';
import { isExpiryExemptPath, notifySessionExpired } from '../auth/expiry';

/**
 * The dashboard's ONE API client. Generated types, `credentials: 'include'` (set inside
 * `createAdminClient`, never per call), typed `ApiError` on every failure. Components never call
 * `fetch` directly: use `api.GET('/api/v1/admin/...')` inside query/mutation functions, wrapped
 * with `unwrap`. 401 handling is global: any `UNAUTHENTICATED` outside login / `GET /auth/me` /
 * logout runs the session-expired flow once.
 */
function onApiError(error: ApiError, info: { method: string; path: string }): void {
  if (error.code === 'UNAUTHENTICATED' && !isExpiryExemptPath(info.path)) notifySessionExpired({ method: info.method });
  // Expected product flow (validation, conflicts, transitions) is not a bug: do not spam the console.
  const expected = ['VALIDATION_ERROR', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INVALID_TRANSITION'];
  if (!expected.includes(error.code) && import.meta.env.DEV) {
    // Only method, path pattern, status and request id: never bodies, cookies or customer data.
    console.warn('[stimpy:admin]', info.method, info.path, error.status, error.code, error.requestId ?? '');
  }
}

export function createApi(baseUrl: string = getEnv().apiBaseUrl, fetchImpl?: (input: Request) => Promise<Response>): ApiClient {
  return createAdminClient({
    baseUrl,
    fetch: fetchImpl,
    onError: onApiError,
    getRetryDelays: [], // retries belong to TanStack Query (queries only, never mutations)
  });
}

let instance: ApiClient | null = null;

/** Lazily created so tests can import modules without configuration and stub `globalThis.fetch`. */
export function getApi(): ApiClient {
  instance ??= createApi();
  return instance;
}

let publicInstance: ApiClient | null = null;

/**
 * Client for the PUBLIC endpoints the dashboard also reads (catalog, packs, options, delivery fees
 * for the manual order form). Public routes answer CORS without credentials, so a credentialed
 * request from the dashboard origin would be blocked by the browser: this one sends no cookies.
 */
export function getPublicApi(): ApiClient {
  publicInstance ??= createPublicClient({ baseUrl: getEnv().apiBaseUrl, onError: onApiError, getRetryDelays: [] });
  return publicInstance;
}

/** Proxy so call sites read `api.GET(...)` while creation stays lazy. */
export const api: ApiClient = new Proxy({} as ApiClient, {
  get: (_target, prop: string | symbol) => (getApi() as unknown as Record<string | symbol, unknown>)[prop],
});

/** Unwraps an openapi-fetch response. Failures already threw an `ApiError`; 204 resolves undefined. */
export async function unwrap<T>(request: Promise<{ data?: T; response: Response }>): Promise<T> {
  const result = await request;
  return result.data as T;
}

export type Schemas = components['schemas'];
export { ApiError };
