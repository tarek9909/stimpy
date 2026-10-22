import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './schema';
import { ApiError, errorFromResponse } from './errors';

export type ApiClient = Client<paths>;

export interface ClientOptions {
  /** API origin, with or without the `/api/v1` suffix (the generated paths already include it). */
  baseUrl: string;
  /** Custom fetch (tests, Next's `next: { revalidate }` options, node). Receives the finished Request. */
  fetch?: (input: Request) => Promise<Response>;
  /** Timeouts in ms (state-and-errors 10.1). */
  timeouts?: { get?: number; post?: number; upload?: number };
  /** Delays (ms) between automatic retries of GET requests on NETWORK/TIMEOUT/5xx. Default none. */
  getRetryDelays?: number[];
  /** Accept non-JSON success bodies (CSV exports in the dashboard). */
  allowNonJson?: boolean;
  /** Called for every failed request (logging). Never receives bodies. */
  onError?: (error: ApiError, info: { method: string; path: string }) => void;
}

const DEFAULT_TIMEOUTS = { get: 15_000, post: 30_000, upload: 120_000 };

/** `http://host:4000/api/v1/` -> `http://host:4000` */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function timeoutFor(request: Request, t: typeof DEFAULT_TIMEOUTS): number {
  if (request.method === 'GET' || request.method === 'HEAD') return t.get;
  const ct = request.headers.get('content-type') ?? '';
  return ct.startsWith('multipart/') ? t.upload : t.post;
}

function buildFetch(options: ClientOptions): (input: Request) => Promise<Response> {
  const base = options.fetch ?? ((r: Request) => globalThis.fetch(r));
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const retryDelays = options.getRetryDelays ?? [];

  async function once(request: Request): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutFor(request, timeouts));
    const onCallerAbort = () => controller.abort();
    // An 'abort' event never fires again for a signal that is already aborted: honour it now.
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener('abort', onCallerAbort, { once: true });
    try {
      // Rebuild the request with our signal so the timeout can cancel it.
      const guarded = new Request(request, { signal: controller.signal });
      const response = await base(guarded);
      if (!response.ok) throw await errorFromResponse(response);
      if (!options.allowNonJson && response.status !== 204) {
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('json')) {
          throw new ApiError({
            status: response.status,
            code: 'BAD_RESPONSE',
            message: 'The server sent an unexpected response.',
            requestId: response.headers.get('X-Request-Id'),
          });
        }
      }
      return response;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (timedOut) {
        throw new ApiError({ status: 0, code: 'TIMEOUT', message: "That's taking longer than usual.", cause: e });
      }
      if (request.signal.aborted) throw e; // the caller cancelled: let the AbortError through untouched
      throw new ApiError({ status: 0, code: 'NETWORK', message: 'You seem to be offline.', cause: e });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', onCallerAbort);
    }
  }

  return async (request: Request) => {
    const isGet = request.method === 'GET' || request.method === 'HEAD';
    for (let i = 0; ; i++) {
      try {
        // Requests are single-use streams: clone per attempt when a retry is possible.
        return await once(isGet && retryDelays.length > 0 ? request.clone() : request);
      } catch (e) {
        const delay = retryDelays[i];
        if (isGet && e instanceof ApiError && e.isRetryable && delay !== undefined) {
          await sleep(delay);
          continue;
        }
        if (e instanceof ApiError) {
          options.onError?.(e, { method: request.method, path: new URL(request.url).pathname });
        }
        throw e;
      }
    }
  };
}

function make(options: ClientOptions, credentials: RequestCredentials): ApiClient {
  return createClient<paths>({
    baseUrl: normalizeBaseUrl(options.baseUrl),
    fetch: buildFetch(options),
    credentials,
  });
}

/** Public website client: never sends cookies (`credentials: 'omit'`). Throws ApiError on any failure. */
export function createPublicClient(options: ClientOptions): ApiClient {
  return make(options, 'omit');
}

/** Dashboard client: `credentials: 'include'` for the session cookie. Throws ApiError on any failure. */
export function createAdminClient(options: ClientOptions): ApiClient {
  return make({ allowNonJson: true, ...options }, 'include');
}
