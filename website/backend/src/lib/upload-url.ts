/** Hosts an earlier run of this API may have used (dev ports, LAN addresses for phone testing). */
function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0' || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host);
}

/**
 * Upload URLs are persisted as absolute URLs for the API contract, but the API may move between hosts/ports.
 * This resolves only paths served by the local /uploads static mount: root-relative `/uploads/...` values and absolute
 * http(s) URLs on this API's host or on a local/private development host. External URLs and free text stay untouched.
 */
export function rebaseUploadUrl(value: string, publicBaseUrl: string): string {
  if (!value.startsWith('/uploads/') && !/^https?:\/\//i.test(value)) return value;
  let parsed: URL;
  let base: URL;
  try {
    base = new URL(`${publicBaseUrl.replace(/\/+$/, '')}/`);
    parsed = new URL(value, base);
  } catch {
    return value;
  }
  if (!parsed.pathname.startsWith('/uploads/')) return value;
  if (!value.startsWith('/uploads/') && parsed.hostname !== base.hostname && !isLocalOrPrivateHost(parsed.hostname)) return value;
  if (parsed.search || parsed.hash) return value;

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
