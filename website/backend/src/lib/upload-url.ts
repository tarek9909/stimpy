/**
 * Upload URLs are persisted as absolute URLs for the API contract, but the API may move between hosts/ports.
 * This resolves only paths served by the local /uploads static mount; external URLs stay untouched.
 */
export function rebaseUploadUrl(value: string, publicBaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value, `${publicBaseUrl.replace(/\/+$/, '')}/`);
  } catch {
    return value;
  }
  if (!parsed.pathname.startsWith('/uploads/')) return value;

  const parts = parsed.pathname.slice('/uploads/'.length).split('/');
  try {
    if (parts.some((part) => {
      const decoded = decodeURIComponent(part);
      return decoded === '' || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
    })) return value;
    const path = parts.map((part) => encodeURIComponent(decodeURIComponent(part))).join('/');
    return `${publicBaseUrl.replace(/\/+$/, '')}/uploads/${path}`;
  } catch {
    return value;
  }
}

function mapUploads(value: unknown, publicBaseUrl: string): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    const next = rebaseUploadUrl(value, publicBaseUrl);
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const mapped = mapUploads(item, publicBaseUrl);
      changed ||= mapped.changed;
      return mapped.value;
    });
    return { value: changed ? out : value, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const mapped = mapUploads(item, publicBaseUrl);
      changed ||= mapped.changed;
      out[key] = mapped.value;
    }
    return { value: changed ? out : value, changed };
  }
  return { value, changed: false };
}

/** Rewrites nested API JSON asset references without touching stored records or non-upload URLs. */
export function rebaseUploadUrlsInJson(payload: string, publicBaseUrl: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return payload;
  }
  const mapped = mapUploads(parsed, publicBaseUrl);
  return mapped.changed ? JSON.stringify(mapped.value) : payload;
}

/** Safe relative upload path used to find an Upload row even when its saved absolute URL has an old host. */
export function uploadStoragePath(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value, 'http://upload.local');
  } catch {
    return null;
  }
  if (!parsed.pathname.startsWith('/uploads/')) return null;
  const parts = parsed.pathname.slice('/uploads/'.length).split('/');
  try {
    const decoded = parts.map((part) => decodeURIComponent(part));
    if (decoded.some((part) => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\'))) return null;
    return decoded.join('/');
  } catch {
    return null;
  }
}
