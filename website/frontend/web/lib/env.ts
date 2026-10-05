/**
 * The only module that reads `process.env` (frontend README section 4). Validate at startup without pulling a
 * schema-validation library into every browser route. Every public variable is referenced literally so Next
 * can inline it into client bundles.
 */
type AppEnv = 'local' | 'staging' | 'production';

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function absoluteUrl(name: string, raw: string | undefined, required: boolean, httpsOnly = false): string | undefined {
  const value = clean(raw);
  if (!value) {
    if (required) throw new Error(`Invalid website environment (see frontend/web/.env.example):\n  - ${name}: ${name} is required`);
    return undefined;
  }
  try {
    const url = new URL(value);
    if (!url.hostname || (url.protocol !== 'http:' && url.protocol !== 'https:')) throw new Error('invalid scheme');
    if (httpsOnly && url.protocol !== 'https:') throw new Error('not https');
    return value.replace(/\/+$/, '');
  } catch {
    const requirement = httpsOnly ? 'must be an absolute HTTPS URL' : 'must be an absolute http(s) URL';
    throw new Error(`Invalid website environment (see frontend/web/.env.example):\n  - ${name}: ${name} ${requirement}`);
  }
}

const appEnvValue = clean(process.env.NEXT_PUBLIC_APP_ENV) ?? 'local';
if (!['local', 'staging', 'production'].includes(appEnvValue)) {
  throw new Error('Invalid website environment (see frontend/web/.env.example):\n  - NEXT_PUBLIC_APP_ENV: expected local, staging or production');
}
const isProductionApp = appEnvValue === 'production';
const apiUrl = absoluteUrl('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL, true, isProductionApp)!;
const siteUrlValue = absoluteUrl('NEXT_PUBLIC_SITE_URL', process.env.NEXT_PUBLIC_SITE_URL, true, isProductionApp)!;
const analyticsSrc = absoluteUrl('NEXT_PUBLIC_ANALYTICS_SRC', process.env.NEXT_PUBLIC_ANALYTICS_SRC, false, true);

/** Variables safe for the browser. */
export const publicEnv = {
  NEXT_PUBLIC_API_URL: apiUrl,
  NEXT_PUBLIC_SITE_URL: siteUrlValue,
  NEXT_PUBLIC_DEV_NO_CACHE: clean(process.env.NEXT_PUBLIC_DEV_NO_CACHE),
  NEXT_PUBLIC_ANALYTICS_DOMAIN: clean(process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN),
  NEXT_PUBLIC_ANALYTICS_SRC: analyticsSrc,
  NEXT_PUBLIC_ERROR_DSN: clean(process.env.NEXT_PUBLIC_ERROR_DSN),
  NEXT_PUBLIC_APP_ENV: appEnvValue as AppEnv,
  NEXT_PUBLIC_BUILD_ID: clean(process.env.NEXT_PUBLIC_BUILD_ID) ?? 'dev',
};

const isServer = typeof window === 'undefined';
const internalApiUrl = isServer ? absoluteUrl('API_URL_INTERNAL', process.env.API_URL_INTERNAL, false) : undefined;

/** Server-only variables (empty in the browser). */
export const serverEnv = {
  API_URL_INTERNAL: internalApiUrl,
  NEXT_IMAGE_REMOTE_HOSTS: isServer ? clean(process.env.NEXT_IMAGE_REMOTE_HOSTS) : undefined,
};

/** API base URL for the current runtime: internal on the server, public in the browser. */
export const apiBaseUrl: string = isServer ? (serverEnv.API_URL_INTERNAL ?? publicEnv.NEXT_PUBLIC_API_URL) : publicEnv.NEXT_PUBLIC_API_URL;

/** True in development when edits in the dashboard must show immediately (revalidate 0). */
export const devNoCache: boolean = publicEnv.NEXT_PUBLIC_DEV_NO_CACHE === '1';

export const siteUrl: string = publicEnv.NEXT_PUBLIC_SITE_URL;
