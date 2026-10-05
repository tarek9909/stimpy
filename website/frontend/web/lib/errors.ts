/**
 * Website error mapping (state-and-errors section 5.2). One place turns an unknown thrown value into the copy and the
 * flags the UI needs. `message` from the API is only shown for the codes where the table says so; everything else
 * uses our own plain-English line. Never shows `details` raw.
 */
import { isApiError, type ApiError } from '@stimpy/api-client';

export type ErrorKind =
  | 'validation'
  | 'not_found'
  | 'rate_limited'
  | 'offline'
  | 'timeout'
  | 'conflict'
  | 'sold_out'
  | 'not_purchasable'
  | 'price_changed'
  | 'server';

export interface UserError {
  kind: ErrorKind;
  /** Copy for the customer. */
  message: string;
  /** Field errors for forms (`fields` of a VALIDATION_ERROR), keyed by the API's dotted path. */
  fields: Record<string, string> | null;
  /** Seconds to wait before retrying (RATE_LIMITED). */
  retryAfterSeconds: number | null;
  /** Short request id to quote to support (unexpected failures only). */
  reference: string | null;
  /** The original error code, for analytics `error_shown` and branching. */
  code: string;
}

export const GENERIC_SERVER_MESSAGE = 'Something went wrong on our side. Please try again.';

export function rateLimitMessage(seconds: number | null): string {
  return seconds && seconds > 0 ? `Too many tries. Please wait ${seconds} seconds.` : 'Too many tries. Please wait a moment.';
}

/** Map anything thrown by an API call. Non-ApiError values are treated as UNKNOWN. */
export function toUserError(error: unknown): UserError {
  if (!isApiError(error)) {
    return { kind: 'server', message: GENERIC_SERVER_MESSAGE, fields: null, retryAfterSeconds: null, reference: null, code: 'UNKNOWN' };
  }
  return fromApiError(error);
}

function fromApiError(e: ApiError): UserError {
  const base = { fields: null, retryAfterSeconds: null, reference: null, code: e.code };
  switch (e.code) {
    case 'VALIDATION_ERROR':
      return { ...base, kind: 'validation', message: 'Please check your details and try again.', fields: e.fields };
    case 'NOT_FOUND':
      return { ...base, kind: 'not_found', message: "We couldn't find that." };
    case 'RATE_LIMITED':
      return {
        ...base,
        kind: 'rate_limited',
        message: rateLimitMessage(e.retryAfterSeconds),
        retryAfterSeconds: e.retryAfterSeconds,
      };
    case 'NETWORK':
      return { ...base, kind: 'offline', message: 'You seem to be offline. Check your connection and try again.' };
    case 'TIMEOUT':
      return { ...base, kind: 'timeout', message: "That's taking longer than usual. Please try again." };
    case 'SOLD_OUT':
      return { ...base, kind: 'sold_out', message: 'Something in your cart just sold out.' };
    case 'NOT_PURCHASABLE':
      return { ...base, kind: 'not_purchasable', message: "Something in your cart isn't available." };
    case 'PRICE_CHANGED':
      return { ...base, kind: 'price_changed', message: 'The total changed. Please review your order.' };
    case 'CONFLICT':
      return { ...base, kind: 'conflict', message: GENERIC_SERVER_MESSAGE };
    default:
      // INTERNAL, BAD_RESPONSE, UNKNOWN, FORBIDDEN, UNAUTHENTICATED and any 5xx: generic line plus the reference.
      return { ...base, kind: 'server', message: GENERIC_SERVER_MESSAGE, reference: e.requestId };
  }
}

/** True for unexpected failures that deserve a console report (state-and-errors 18). Expected product flow does not. */
export function isReportable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.status >= 500 || error.code === 'BAD_RESPONSE' || error.code === 'UNKNOWN' || error.code === 'FORBIDDEN';
}
