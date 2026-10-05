/**
 * Checkout form model and client validation (checkout-and-order-flow 2.2-2.4). Pure: no React, no fetching.
 * Client validation is for convenience only and never stricter than the server; errors are keyed by the API's
 * dotted request paths so that server `fields` and client errors share one map.
 */
import type { DeliveryFees } from '@stimpy/api-client';
import { normalizeLebanesePhone } from '@stimpy/ui';

export type DeliveryArea = DeliveryFees['areas'][number];

/** Contract limits (api-reference section 1, "Text limits"). */
export const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  emailMax: 190,
  areaNameMax: 120,
  addressMin: 5,
  addressMax: 300,
  notesMax: 300,
} as const;

export const OTHER_AREA = 'other';

export interface CheckoutValues {
  name: string;
  email: string;
  phone: string;
  /** "WhatsApp is the same as my phone number": checked by default. */
  whatsappSame: boolean;
  whatsapp: string;
  /** `''` (not chosen), the area id as a string, or `'other'` (type it below). */
  areaChoice: string;
  areaOther: string;
  address: string;
  notes: string;
}

export const EMPTY_VALUES: CheckoutValues = {
  name: '',
  email: '',
  phone: '',
  whatsappSame: true,
  whatsapp: '',
  areaChoice: '',
  areaOther: '',
  address: '',
  notes: '',
};

export type FieldPath =
  | 'customer.name'
  | 'customer.email'
  | 'customer.phone'
  | 'customer.whatsapp'
  | 'delivery.areaId'
  | 'delivery.areaName'
  | 'delivery.address'
  | 'delivery.notes';

export type FieldErrors = Partial<Record<FieldPath, string>>;

export const FIELD_PATHS: readonly FieldPath[] = [
  'customer.name',
  'customer.email',
  'customer.phone',
  'customer.whatsapp',
  'delivery.areaId',
  'delivery.areaName',
  'delivery.address',
  'delivery.notes',
];

/** DOM ids (`field-<name>`) used by the error summary links and `focusFirstInvalid`. */
export const FIELD_ID: Record<FieldPath, string> = {
  'customer.name': 'field-customer.name',
  'customer.email': 'field-customer.email',
  'customer.phone': 'field-customer.phone',
  'customer.whatsapp': 'field-customer.whatsapp',
  'delivery.areaId': 'field-delivery.areaId',
  'delivery.areaName': 'field-delivery.areaName',
  'delivery.address': 'field-delivery.address',
  'delivery.notes': 'field-delivery.notes',
};

/** Client copy (2.2). Used when the server sends no message for a field. */
export const FIELD_COPY: Record<FieldPath, string> = {
  'customer.name': 'Enter your full name.',
  'customer.email': 'Enter a valid email address.',
  'customer.phone': 'Enter a Lebanese phone number, like 03 123 456.',
  'customer.whatsapp': 'Enter your WhatsApp number.',
  'delivery.areaId': 'Choose your area.',
  'delivery.areaName': 'Type your area or town.',
  'delivery.address': 'Enter your delivery address: street, building, floor.',
  'delivery.notes': 'Notes can be up to 300 characters.',
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 7 or 8 digits remain after removing separators and a leading +961 / 00961 / 961 / 0 (business-rules 2). */
export function isLebanesePhone(input: string): boolean {
  return normalizeLebanesePhone(input.trim()) !== null;
}

export function isEmailShape(input: string): boolean {
  const v = input.trim();
  return v.length <= LIMITS.emailMax && EMAIL_SHAPE.test(v);
}

export interface ValidateOptions {
  /** False when `GET /delivery/fees` failed: the area is then a free-text field (no select). */
  areasAvailable: boolean;
}

/** Validate every field. Returns the errors keyed by API path (empty object = valid). */
export function validateCheckout(v: CheckoutValues, options: ValidateOptions): FieldErrors {
  const errors: FieldErrors = {};
  for (const path of FIELD_PATHS) {
    const message = validateField(path, v, options);
    if (message) errors[path] = message;
  }
  return errors;
}

export function validateField(path: FieldPath, v: CheckoutValues, { areasAvailable }: ValidateOptions): string | null {
  switch (path) {
    case 'customer.name': {
      const n = v.name.trim().length;
      return n < LIMITS.nameMin || n > LIMITS.nameMax ? FIELD_COPY[path] : null;
    }
    case 'customer.email':
      return isEmailShape(v.email) ? null : FIELD_COPY[path];
    case 'customer.phone':
      return isLebanesePhone(v.phone) ? null : FIELD_COPY[path];
    case 'customer.whatsapp':
      if (v.whatsappSame) return null;
      return isLebanesePhone(v.whatsapp) ? null : FIELD_COPY[path];
    case 'delivery.areaId':
      if (!areasAvailable) return null;
      return v.areaChoice === '' ? FIELD_COPY[path] : null;
    case 'delivery.areaName': {
      const typed = !areasAvailable || v.areaChoice === OTHER_AREA;
      if (!typed) return null;
      const n = v.areaOther.trim().length;
      return n < 1 || n > LIMITS.areaNameMax ? FIELD_COPY[path] : null;
    }
    case 'delivery.address': {
      const n = v.address.trim().length;
      return n < LIMITS.addressMin || n > LIMITS.addressMax ? FIELD_COPY[path] : null;
    }
    case 'delivery.notes':
      return v.notes.length > LIMITS.notesMax ? FIELD_COPY[path] : null;
  }
}

/** The area row for the current choice, or null for "not chosen", "other" and the free-text fallback. */
export function selectedArea(v: Pick<CheckoutValues, 'areaChoice'>, fees: DeliveryFees | null): DeliveryArea | null {
  if (!fees || v.areaChoice === '' || v.areaChoice === OTHER_AREA) return null;
  const id = Number(v.areaChoice);
  return fees.areas.find((a) => a.id === id) ?? null;
}

/** `areaId` sent to the API: only for a real area. "Other" and the fallback send none. */
export function areaIdFor(v: Pick<CheckoutValues, 'areaChoice'>, fees: DeliveryFees | null): number | null {
  return selectedArea(v, fees)?.id ?? null;
}

/** Name sent as `delivery.areaName`: the area's name, or what the customer typed. */
export function areaNameFor(v: CheckoutValues, fees: DeliveryFees | null): string {
  return selectedArea(v, fees)?.name ?? v.areaOther.trim();
}

export type FeeLine =
  /** No area chosen yet: "Delivery: from $3", total is an estimate. */
  | { kind: 'from'; cents: number }
  /** Area chosen: "Delivery to {area}: {fee}", with the area's estimate. */
  | { kind: 'area'; areaName: string; cents: number; estimate: string }
  /** "Other (type it below)": default fee. */
  | { kind: 'other'; cents: number }
  /** `GET /delivery/fees` failed: "Delivery fee confirmed on WhatsApp". */
  | { kind: 'unknown' };

/** Fee shown for the current choice (2.4): `area.feeCents ?? defaultFeeCents`; "other" uses the default. */
export function feeLine(v: Pick<CheckoutValues, 'areaChoice'>, fees: DeliveryFees | null): FeeLine {
  if (!fees) return { kind: 'unknown' };
  if (v.areaChoice === '') return { kind: 'from', cents: fees.defaultFeeCents };
  if (v.areaChoice === OTHER_AREA) return { kind: 'other', cents: fees.defaultFeeCents };
  const area = selectedArea(v, fees);
  if (!area) return { kind: 'from', cents: fees.defaultFeeCents };
  const estimate = area.estDays ? `about ${area.estDays} ${area.estDays === 1 ? 'day' : 'days'}` : fees.estimateText;
  return { kind: 'area', areaName: area.name, cents: area.feeCents ?? fees.defaultFeeCents, estimate };
}

/** Map server `fields` (dotted request paths) onto form fields; the rest is returned for the summary. */
export function mapServerFields(fields: Record<string, string> | null): {
  form: FieldErrors;
  cart: Record<string, string>;
  other: string[];
} {
  const form: FieldErrors = {};
  const cart: Record<string, string> = {};
  const other: string[] = [];
  if (!fields) return { form, cart, other };
  for (const [key, message] of Object.entries(fields)) {
    if ((FIELD_PATHS as readonly string[]).includes(key)) {
      form[key as FieldPath] = message || FIELD_COPY[key as FieldPath];
    } else if (key === 'customer.whatsappSameAsPhone') {
      form['customer.whatsapp'] = message || FIELD_COPY['customer.whatsapp'];
    } else if (key === 'items' || key.startsWith('items.')) {
      cart[key] = message;
    } else {
      other.push(key);
    }
  }
  return { form, cart, other };
}
