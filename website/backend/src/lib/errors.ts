/**
 * The ONE error type. Services and routes throw `AppError`; only plugins/error-handler.ts writes error responses.
 * Codes and statuses are exactly the table in api-reference.md section 1 (plus METHOD_NOT_ALLOWED, see DECISIONS.md).
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'SOLD_OUT'
  | 'NOT_PURCHASABLE'
  | 'INVALID_TRANSITION'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'DELIVERY_NUMBER_REQUIRED'
  | 'PRICE_CHANGED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  SOLD_OUT: 409,
  NOT_PURCHASABLE: 409,
  INVALID_TRANSITION: 409,
  CONFLICT: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  DELIVERY_NUMBER_REQUIRED: 422,
  PRICE_CHANGED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export const ALL_ERROR_CODES = Object.keys(ERROR_STATUS) as ErrorCode[];

export class AppError extends Error {
  /** Dotted field paths -> message. Only for VALIDATION_ERROR. */
  public fields?: Record<string, string>;

  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'AppError';
  }

  // ---- convenience factories (all still the same single error type) ----
  static validation(fields: Record<string, string>, message = 'Please check the highlighted fields.'): AppError {
    const e = new AppError('VALIDATION_ERROR', 400, message);
    e.fields = fields;
    return e;
  }
  static unauthenticated(message = 'Please log in.'): AppError {
    return new AppError('UNAUTHENTICATED', 401, message);
  }
  static forbidden(message = 'You are not allowed to do that.'): AppError {
    return new AppError('FORBIDDEN', 403, message);
  }
  static notFound(message = 'Not found.'): AppError {
    return new AppError('NOT_FOUND', 404, message);
  }
  static conflict(message: string, field?: string): AppError {
    return new AppError('CONFLICT', 409, message, field ? { field } : null);
  }
  static rateLimited(retryAfterSeconds: number, message = 'Too many requests. Please try again later.'): AppError {
    return new AppError('RATE_LIMITED', 429, message, { retryAfterSeconds });
  }
  static internal(message = 'Something went wrong on our side.'): AppError {
    return new AppError('INTERNAL', 500, message);
  }
}

/** Placeholder used by service modules that another work package has yet to implement. */
export function notImplemented(what: string): never {
  throw new AppError('INTERNAL', 501, `Not implemented yet: ${what}`);
}
