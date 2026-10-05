import type { z } from 'zod';
import { AppError } from './errors';

type Issue = z.core.$ZodIssue & { origin?: string; minimum?: number | bigint; maximum?: number | bigint; format?: string; keys?: string[] };

const isDefaultMessage = (m: string): boolean => /^(Invalid|Too small|Too big|Unrecognized|Input not)/.test(m);

function friendly(i: Issue): string {
  if (i.message && !isDefaultMessage(i.message)) return i.message; // custom message written in the schema
  switch (i.code) {
    case 'invalid_type':
      return /received undefined/.test(i.message) ? 'This field is required.' : 'This value has the wrong type.';
    case 'too_small': {
      const min = Number(i.minimum);
      if (i.origin === 'string') return min <= 1 ? 'This field is required.' : `Must be at least ${min} characters.`;
      if (i.origin === 'array') return min <= 1 ? 'Add at least one item.' : `Add at least ${min} items.`;
      return `Must be at least ${min}.`;
    }
    case 'too_big': {
      const max = Number(i.maximum);
      if (i.origin === 'string') return `Must be at most ${max} characters.`;
      if (i.origin === 'array') return `Too many items (at most ${max}).`;
      return `Must be at most ${max}.`;
    }
    case 'invalid_format':
      if (i.format === 'email') return 'Enter a valid email address.';
      if (i.format === 'url') return 'Enter a valid URL.';
      return 'This value has an invalid format.';
    case 'invalid_value':
      return 'Choose one of the allowed options.';
    case 'unrecognized_keys':
      return 'Unknown field.';
    default:
      return i.message || 'This value is not valid.';
  }
}

/**
 * Parses `value` with a Zod schema inside a service (for bodies whose shape depends on a path parameter) and turns
 * failures into the standard VALIDATION_ERROR with dotted `fields` paths (`steps.0.title`).
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, context = 'body'): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const raw of r.error.issues) {
    const i = raw as Issue;
    const base = i.path.map(String).join('.');
    if (i.code === 'unrecognized_keys' && Array.isArray(i.keys)) {
      for (const k of i.keys) fields[base ? `${base}.${k}` : k] ??= 'Unknown field.';
      continue;
    }
    fields[base || context] ??= friendly(i);
  }
  throw AppError.validation(fields);
}
