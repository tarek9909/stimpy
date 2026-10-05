/**
 * Runs `POST /cart/validate` for the current cart and applies the result to the store
 * (checkout-and-order-flow 1.6). Browser only. Returns what happened so callers can react:
 * - `ok`: the cart was checked; inspect `store.validation` and the lines' `check` states
 * - `skipped`: nothing to check, offline, or a fresh check exists (drawer open within 30 s)
 * - `kept`: network failure, timeout or 429: the previous state stays and no notice is shown (the server's answer at
 *   submit time is the authority)
 */
import { isApiError, type ApiClient } from '@stimpy/api-client';
import { applyValidation, invalidItemIndices, markInvalidLines } from './validation';
import { cartStore, type CartStore } from './store';
import { cartLinesFingerprint } from './helpers';

export const CART_FRESH_MS = 30_000;

export type ValidateResult = 'ok' | 'skipped' | 'kept';

export interface ValidateOptions {
  /** Delivery area for the fee; omit for the default fee. */
  areaId?: number | null;
  /** Ignore the 30 s freshness window (checkout mount, quantity or area changes, before submit). */
  force?: boolean;
  store?: CartStore;
  client: ApiClient;
  /** Called with toast texts (e.g. "Only 2 left, we updated your cart."). */
  onToast?: (message: string) => void;
  now?: () => Date;
}

export async function validateCart(options: ValidateOptions): Promise<ValidateResult> {
  const store = options.store ?? cartStore;
  const now = options.now ?? (() => new Date());
  const state = store.getState();
  if (state.lines.length === 0) return 'skipped';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'skipped';
  if (!options.force && state.validation) {
    const age = now().getTime() - Date.parse(state.validation.checkedAt);
    if (age >= 0 && age < CART_FRESH_MS && state.validation.areaId === (options.areaId ?? null)) return 'skipped';
  }

  // Up to two passes: an adjustment can free or require stock for another line (stock is summed across lines).
  for (let pass = 0; pass < 2; pass++) {
    const lines = store.getState().lines;
    const fingerprint = cartLinesFingerprint(lines);
    // Every line is sent in cart order, UNAVAILABLE ones included, so `itemIndex` matches the cart.
    const items = lines.map((l) => l.item);
    try {
      const { data } = await options.client.POST('/api/v1/cart/validate', {
        body: { items, ...(options.areaId ? { areaId: options.areaId } : {}) },
        cache: 'no-store',
      });
      if (!data) return 'kept';
      // The cart may have changed while the request was in flight: only apply when it is unchanged.
      const current = store.getState().lines;
      if (cartLinesFingerprint(current) !== fingerprint) {
        return 'kept';
      }
      const outcome = applyValidation(current, data, { areaId: options.areaId ?? null, now: now() });
      store.getState().applyChecks(outcome.lines, outcome.summary);
      outcome.toasts.forEach((t) => options.onToast?.(t));
      if (!outcome.rerun) return 'ok';
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        // Unknown or removed product, wrong stimpieIds count: mark those lines unavailable.
        const indices = invalidItemIndices(error.fields);
        if (indices.length > 0) {
          // Validation errors also refer to the request's item indexes; do not apply them to a cart that
          // was replaced while the request was in flight.
          const current = store.getState().lines;
          if (cartLinesFingerprint(current) !== fingerprint) return 'kept';
          store.getState().applyChecks(markInvalidLines(current, indices, now()), store.getState().validation);
          return 'ok';
        }
      }
      return 'kept';
    }
  }
  return 'ok';
}
