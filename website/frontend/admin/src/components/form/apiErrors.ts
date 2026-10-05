import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { asApiError } from '../../api/errors';

export interface UnmappedError {
  path: string;
  message: string;
}

export interface ApplyApiErrorsOptions {
  /**
   * API path -> form field name, for forms whose field names differ from the request body
   * (`priceCents` is edited in a `price` dollars field). A function may return `null` to leave
   * the error unmapped (it then shows in the error summary).
   */
  map?: Record<string, string> | ((path: string) => string | null | undefined);
  /** Extra field names that exist as inputs although they have no value in `getValues()` (optional dynamic rows). */
  known?: readonly string[];
  /** Replace the server's message for a path (change password: `currentPassword` -> "Current password is incorrect."). Keyed by API path. */
  messages?: Record<string, string>;
}

export interface ApplyApiErrorsResult {
  /** The error was a `VALIDATION_ERROR` with `fields`: it has been applied. */
  handled: boolean;
  /** Form field names that received an error, in API order (the first one gets focus). */
  mapped: string[];
  /** Paths with no matching input: show them in the error summary. */
  unmapped: UnmappedError[];
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Maps an `ApiError` of code `VALIDATION_ERROR` onto React Hook Form fields (state-and-errors 6.2).
 * `error.fields` keys are dotted paths into the request body with numeric array indices
 * (`columns.0.label`, `rows.2.values.5`), which RHF uses as field names too. Paths with no input
 * are returned in `unmapped` so the error summary can still show them. Anything that is not a
 * validation error returns `handled: false`: toast it with `useNotifyError`.
 */
export function applyApiErrors<T extends FieldValues, C, O extends FieldValues>(
  form: UseFormReturn<T, C, O>,
  error: unknown,
  options: ApplyApiErrorsOptions = {},
): ApplyApiErrorsResult {
  const e = asApiError(error);
  const result: ApplyApiErrorsResult = { handled: false, mapped: [], unmapped: [] };
  if (!e || e.code !== 'VALIDATION_ERROR' || !e.fields) return result;
  result.handled = true;
  const values = form.getValues();
  for (const [path, serverMessage] of Object.entries(e.fields)) {
    const message = options.messages?.[path] ?? serverMessage;
    let name: string | null | undefined = path;
    if (typeof options.map === 'function') name = options.map(path) ?? null;
    else if (options.map && path in options.map) name = options.map[path];
    const known = name != null && (getByPath(values, name) !== undefined || options.known?.includes(name));
    if (name != null && known) {
      form.setError(name as never, { type: 'server', message }, { shouldFocus: result.mapped.length === 0 });
      result.mapped.push(name);
    } else {
      result.unmapped.push({ path, message });
    }
  }
  return result;
}

/** Flattens RHF's nested `errors` object into `{ name, message }` entries (for the error summary). */
export function flattenFormErrors(errors: unknown, prefix = ''): Array<{ name: string; message: string }> {
  const out: Array<{ name: string; message: string }> = [];
  if (!errors || typeof errors !== 'object') return out;
  for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
    if (key === 'ref' || key === 'type' || key === 'types') continue;
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && 'message' in value && typeof (value as { message: unknown }).message === 'string') {
      out.push({ name, message: (value as { message: string }).message });
    } else if (value && typeof value === 'object') {
      out.push(...flattenFormErrors(value, name));
    }
  }
  return out;
}
