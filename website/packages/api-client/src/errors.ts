/**
 * The one error type thrown by the clients (api-reference section 1, state-and-errors section 5).
 * Server codes come from the API; NETWORK, TIMEOUT, BAD_RESPONSE and UNKNOWN are synthetic.
 */

export type ServerErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SOLD_OUT'
  | 'NOT_PURCHASABLE'
  | 'INVALID_TRANSITION'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'DELIVERY_NUMBER_REQUIRED'
  | 'PRICE_CHANGED'
  | 'RATE_LIMITED'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL';

export type SyntheticErrorCode = 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNKNOWN';
export type ApiErrorCode = ServerErrorCode | SyntheticErrorCode;

const SERVER_CODES: ReadonlySet<string> = new Set<ServerErrorCode>([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'SOLD_OUT',
  'NOT_PURCHASABLE',
  'INVALID_TRANSITION',
  'CONFLICT',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'DELIVERY_NUMBER_REQUIRED',
  'PRICE_CHANGED',
  'RATE_LIMITED',
  'METHOD_NOT_ALLOWED',
  'INTERNAL',
]);

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string> | null;
  details?: unknown;
  requestId?: string | null;
  retryAfterSeconds?: number | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string> | null;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? null;
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** True for failures that never reached the server's business logic (offline, timeout, proxy HTML). */
  get isTransport(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT' || this.code === 'BAD_RESPONSE';
  }

  /** True when a retry of the same request may succeed (state-and-errors 10.1): network or 5xx. */
  get isRetryable(): boolean {
    return this.isTransport || this.status >= 500;
  }

  /** Short reference to quote to support (first 8 characters of the request id). */
  get reference(): string | null {
    return this.requestId ? this.requestId.slice(0, 8) : null;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRetryAfter(header: string | null, details: unknown): number | null {
  if (isRecord(details) && typeof details.retryAfterSeconds === 'number') return details.retryAfterSeconds;
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n >= 0) return Math.ceil(n);
  }
  return null;
}

/**
 * Turn a non-2xx response into an ApiError. Never throws: unknown shapes become BAD_RESPONSE
 * (HTML from a proxy, empty body) so callers always get a typed error.
 */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  const headerRequestId = response.headers.get('X-Request-Id');
  let body: unknown = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const err = isRecord(body) && isRecord(body.error) ? body.error : null;
  if (!err || typeof err.code !== 'string') {
    return new ApiError({
      status: response.status,
      code: 'BAD_RESPONSE',
      message: 'The server sent an unexpected response.',
      requestId: headerRequestId,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After'), null),
    });
  }
  const code: ApiErrorCode = SERVER_CODES.has(err.code) ? (err.code as ServerErrorCode) : 'UNKNOWN';
  const fields = isRecord(err.fields)
    ? Object.fromEntries(Object.entries(err.fields).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : null;
  return new ApiError({
    status: response.status,
    code,
    message: typeof err.message === 'string' ? err.message : 'Something went wrong.',
    fields,
    details: err.details ?? null,
    requestId: typeof err.requestId === 'string' ? err.requestId : headerRequestId,
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After'), err.details),
  });
}
