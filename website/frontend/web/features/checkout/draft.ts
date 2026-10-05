/**
 * Checkout draft (checkout-and-order-flow 1.2, state-and-errors 6.4): form values survive a refresh or an in-app
 * browser reload. Stored in sessionStorage (the two documents disagree on localStorage vs sessionStorage; session
 * storage keeps personal data from outliving the tab: see DECISIONS.md). Never stores the honeypot. Cleared on
 * a successful order.
 */
import { readStored, removeStored, writeStored } from '@/lib/storage';
import { EMPTY_VALUES, type CheckoutValues } from './form';

export const DRAFT_STORAGE_KEY = 'stimpy.checkout.draft';
export const DRAFT_VERSION = 1;

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function loadDraft(): CheckoutValues | null {
  const raw = readStored('session', DRAFT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; values?: Record<string, unknown> } | null;
    if (!parsed || parsed.v !== DRAFT_VERSION || typeof parsed.values !== 'object' || parsed.values === null) {
      removeStored('session', DRAFT_STORAGE_KEY);
      return null;
    }
    const x = parsed.values;
    return {
      name: str(x.name, 200),
      email: str(x.email, 300),
      phone: str(x.phone, 60),
      whatsappSame: typeof x.whatsappSame === 'boolean' ? x.whatsappSame : EMPTY_VALUES.whatsappSame,
      whatsapp: str(x.whatsapp, 60),
      areaChoice: str(x.areaChoice, 12),
      areaOther: str(x.areaOther, 200),
      address: str(x.address, 500),
      notes: str(x.notes, 500),
    };
  } catch {
    removeStored('session', DRAFT_STORAGE_KEY);
    return null;
  }
}

export function saveDraft(values: CheckoutValues): void {
  const empty = JSON.stringify(values) === JSON.stringify(EMPTY_VALUES);
  if (empty) {
    removeStored('session', DRAFT_STORAGE_KEY);
    return;
  }
  writeStored('session', DRAFT_STORAGE_KEY, JSON.stringify({ v: DRAFT_VERSION, values }));
}

export function clearDraft(): void {
  removeStored('session', DRAFT_STORAGE_KEY);
}
