import { useCallback } from 'react';
import { ApiError, isApiError } from '@stimpy/api-client';
import { useToast } from '@stimpy/ui';

/**
 * Global error mapping (state-and-errors 5.2, dashboard column). `error.message` from the API is
 * safe to show; codes drive logic; `details` is never rendered raw. Unexpected failures show the
 * short request id as a "Reference" so the founder can quote it.
 */
export interface ErrorInfo {
  code: string;
  status: number;
  /** Plain-English line for a toast or inline panel. */
  message: string;
  /** First 8 characters of the request id when the server sent one. */
  reference: string | null;
  retryAfterSeconds: number | null;
  /** Never reached the server's business logic (offline, timeout, proxy page). */
  transport: boolean;
  /** An unexpected failure worth quoting a reference for. */
  unexpected: boolean;
}

export type ErrorContext = 'read' | 'write';

export function asApiError(error: unknown): ApiError | null {
  return isApiError(error) ? error : null;
}

function megabytes(bytes: unknown): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

function detailString(details: unknown, key: string): string | null {
  if (typeof details === 'object' && details !== null && key in details) {
    const v = (details as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return null;
}

function allowedList(details: unknown): string | null {
  if (typeof details === 'object' && details !== null && 'allowed' in details) {
    const v = (details as Record<string, unknown>).allowed;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0) return v.join(', ');
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export function describeError(error: unknown, context: ErrorContext = 'write'): ErrorInfo {
  const e = asApiError(error);
  if (!e) {
    return {
      code: 'UNKNOWN',
      status: 0,
      message: 'Something went wrong. Try again.',
      reference: null,
      retryAfterSeconds: null,
      transport: false,
      unexpected: true,
    };
  }
  const base = {
    code: e.code as string,
    status: e.status,
    reference: e.reference,
    retryAfterSeconds: e.retryAfterSeconds,
    transport: e.isTransport,
    unexpected: false,
  };
  switch (e.code) {
    case 'VALIDATION_ERROR':
      return { ...base, message: e.message || 'Please check the highlighted fields.' };
    case 'UNAUTHENTICATED':
      return { ...base, message: 'Your session ended. Please log in again.' };
    case 'FORBIDDEN':
      return {
        ...base,
        unexpected: true,
        message: "You don't have permission to do that. If you think you should, refresh the page and try again.",
      };
    case 'NOT_FOUND':
      return { ...base, message: 'This item no longer exists.' };
    case 'INVALID_TRANSITION': {
      const from = detailString(e.details, 'from');
      return {
        ...base,
        message: from ? `That status change isn't allowed from ${STATUS_LABEL[from] ?? from}.` : "That status change isn't allowed.",
      };
    }
    case 'FILE_TOO_LARGE': {
      const max = megabytes((e.details as { maxBytes?: unknown } | null)?.maxBytes);
      return { ...base, message: max ? `That file is too large (maximum ${max}).` : 'That file is too large.' };
    }
    case 'UNSUPPORTED_FILE_TYPE': {
      const list = allowedList(e.details);
      return { ...base, message: list ? `That file type isn't supported. Use ${list}.` : "That file type isn't supported." };
    }
    case 'DELIVERY_NUMBER_REQUIRED':
      return { ...base, message: 'Enter the delivery number from the delivery slip.' };
    case 'RATE_LIMITED': {
      const n = e.retryAfterSeconds;
      return { ...base, message: n ? `Too many requests. Try again in ${n} seconds.` : 'Too many requests. Try again in a moment.' };
    }
    case 'CONFLICT':
    case 'SOLD_OUT':
    case 'NOT_PURCHASABLE':
    case 'PRICE_CHANGED':
      return { ...base, message: e.message || 'That conflicts with the current data. Refresh and try again.' };
    case 'NETWORK':
      return {
        ...base,
        message: context === 'write' ? 'Not sent. Check your connection and try again.' : "Can't reach the server. Check your connection and try again.",
      };
    case 'TIMEOUT':
      return { ...base, message: "That's taking longer than usual. Try again." };
    default:
      return { ...base, unexpected: true, message: 'Something went wrong on our side. Try again.' };
  }
}

/** `message` plus "Reference: 4c1f0a9e" for unexpected failures. */
export function errorText(error: unknown, context: ErrorContext = 'write'): string {
  const info = describeError(error, context);
  return info.unexpected && info.reference ? `${info.message} Reference: ${info.reference}` : info.message;
}

/** `toast.error` with the standard mapping. Error toasts persist in the dashboard. */
export function useNotifyError() {
  const toast = useToast();
  return useCallback(
    (error: unknown, options: { context?: ErrorContext; fallback?: string } = {}) => {
      const info = describeError(error, options.context ?? 'write');
      // A session that ended is handled by the redirect and its banner, not by a toast pile.
      if (info.code === 'UNAUTHENTICATED') return;
      const text = errorText(error, options.context ?? 'write');
      toast.error(info.code === 'UNKNOWN' && options.fallback ? options.fallback : text);
    },
    [toast],
  );
}
