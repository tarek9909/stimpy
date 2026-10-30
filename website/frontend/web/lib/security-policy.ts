export interface SecurityPolicyOptions {
  apiOrigins: readonly string[];
  mediaOrigins: readonly string[];
  analyticsOrigin?: string;
  /** Allow the Meta Pixel: its script from connect.facebook.net and its event beacons to www.facebook.com. */
  metaPixel?: boolean;
  development?: boolean;
}

export const META_PIXEL_SCRIPT_ORIGIN = 'https://connect.facebook.net';
export const META_PIXEL_EVENT_ORIGIN = 'https://www.facebook.com';

/** Extra image hosts are explicit hostnames (optionally with a port), never wildcard patterns or full URLs. */
export function configuredImageOrigin(host: string): string {
  const value = host.trim();
  if (!value || /[\s*\/?#@]/.test(value)) {
    throw new Error(`Invalid NEXT_IMAGE_REMOTE_HOSTS entry: ${host}`);
  }
  const parsed = new URL(`https://${value}`);
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`Invalid NEXT_IMAGE_REMOTE_HOSTS entry: ${host}`);
  }
  return parsed.origin;
}

/** CSP origins are exact. No source directive receives a wildcard host. */
export function buildContentSecurityPolicy(options: SecurityPolicyOptions): string {
  const api = [...new Set(options.apiOrigins)];
  const media = [...new Set([...api, ...options.mediaOrigins])];
  const analytics = options.analyticsOrigin ? [options.analyticsOrigin] : [];
  const metaScript = options.metaPixel ? [META_PIXEL_SCRIPT_ORIGIN] : [];
  const metaEvents = options.metaPixel ? [META_PIXEL_EVENT_ORIGIN] : [];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(options.development ? ["'unsafe-eval'"] : []), ...analytics, ...metaScript],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', ...media, ...metaEvents],
    'media-src': ["'self'", 'blob:', ...media],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...media, ...analytics, ...metaScript, ...metaEvents, ...(options.development ? ['ws:', 'wss:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives).map(([name, sources]) => `${name} ${[...new Set(sources)].join(' ')}`).join('; ');
}
