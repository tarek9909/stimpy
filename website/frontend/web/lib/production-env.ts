/** Production URL checks run in Next's server-side config, never in browser bundles. */
function isLocalOrPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  return /^(?:localhost|0\.0\.0\.0|::1|::)$/.test(host)
    || /(?:^|\.)(?:localhost|local|test|example|invalid)$/.test(host)
    || /(?:^|\.)example\.(?:com|net|org)$/.test(host)
    || /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function assertProductionPublicUrls(env: Record<string, string | undefined>): void {
  if (env.NEXT_PUBLIC_APP_ENV?.trim() !== 'production') return;
  for (const name of ['NEXT_PUBLIC_API_URL', 'NEXT_PUBLIC_SITE_URL'] as const) {
    const raw = env[name]?.trim();
    try {
      if (!raw) throw new Error('missing');
      const url = new URL(raw);
      if (url.protocol !== 'https:' || isLocalOrPlaceholderHost(url.hostname) || url.username || url.password) throw new Error('not production-safe');
    } catch {
      throw new Error(`Invalid website environment (see frontend/web/.env.example):\n  - ${name}: production URL must use HTTPS and a non-local, non-example host`);
    }
  }
}
