const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client check for the test-send address; the server validates again. Returns the message or null. */
export function emailSchemaCheck(value: string): string | null {
  const v = value.trim();
  if (v === '') return 'Enter an email address.';
  return EMAIL.test(v) ? null : 'Enter a valid email address.';
}
