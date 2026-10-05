/**
 * `returnTo` validation (auth-and-sessions 2.3): prevents open redirects. The value must be a
 * root-relative path: one leading `/`, not `//`, not `/\`, no scheme, no backslash or control
 * characters, and not the login page itself. Anything else becomes `/`.
 */
export function validateReturnTo(raw: string | null | undefined): string {
  if (!raw) return '/';
  let value = raw;
  // The router already decodes the query string once; decode again only if it is still encoded.
  if (/%2f/i.test(value) || /%5c/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return '/';
    }
  }
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0x5c || code < 0x20 || code === 0x7f) return '/';
  }
  if (/^\/login(?:[/?#]|$)/.test(value)) return '/';
  try {
    const parsed = new URL(value, 'http://stimpy.invalid');
    if (parsed.origin !== 'http://stimpy.invalid') return '/';
  } catch {
    return '/';
  }
  return value;
}

/** `/login?returnTo=%2Forders%3Fstatus%3DNEW` for a location (plain `/login` when it is `/`). */
export function loginUrl(returnTo?: string): string {
  const safe = validateReturnTo(returnTo);
  return safe === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(safe)}`;
}
