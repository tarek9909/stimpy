import type { NextConfig } from 'next';
import { publicEnv, serverEnv } from './lib/env';
import { assertProductionPublicUrls } from './lib/production-env';
import { buildContentSecurityPolicy, configuredImageOrigin } from './lib/security-policy';

const isProd = process.env.NODE_ENV === 'production';
assertProductionPublicUrls(process.env);

function hostParts(url: string): { protocol: 'http' | 'https'; hostname: string; port: string } {
  const u = new URL(url);
  return {
    protocol: u.protocol === 'https:' ? 'https' : 'http',
    hostname: u.hostname,
    port: u.port,
  };
}

const apiOrigins = Array.from(
  new Set([publicEnv.NEXT_PUBLIC_API_URL, serverEnv.API_URL_INTERNAL].filter((v): v is string => !!v).map((v) => new URL(v).origin)),
);

const configuredMediaOrigins = Array.from(
  new Set((serverEnv.NEXT_IMAGE_REMOTE_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean).map(configuredImageOrigin)),
);

const remotePatterns = [
  ...apiOrigins.map((o) => ({ ...hostParts(o), pathname: '/uploads/**' })),
  ...configuredMediaOrigins.map((o) => ({ ...hostParts(o), pathname: '/**' })),
];

/** Content Security Policy. Next injects small inline scripts, so `script-src` needs 'unsafe-inline' without nonces. */
function contentSecurityPolicy(): string {
  const analytics = publicEnv.NEXT_PUBLIC_ANALYTICS_SRC ? new URL(publicEnv.NEXT_PUBLIC_ANALYTICS_SRC).origin : '';
  return buildContentSecurityPolicy({
    apiOrigins,
    mediaOrigins: configuredMediaOrigins,
    analyticsOrigin: analytics || undefined,
    development: !isProd,
  });
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isProd && publicEnv.NEXT_PUBLIC_SITE_URL.startsWith('https://')
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  // Parallel engineers each serve from their own build directory (set STIMPY_DIST_DIR, a junction onto D: when C: is full).
  distDir: process.env.STIMPY_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@stimpy/ui', '@stimpy/api-client', '@stimpy/builder'],
  images: {
    remotePatterns,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
  },
  experimental: {
    optimizePackageImports: ['@stimpy/ui', 'lucide-react'],
  },
  // On a machine with a nearly full disk set STIMPY_NO_BUILD_CACHE=1: webpack then keeps no on-disk cache (slower rebuilds, far smaller .next).
  webpack: (config) => {
    if (process.env.STIMPY_NO_BUILD_CACHE === '1') config.cache = false;
    // node_modules reached through junctions onto another drive: Next builds the framework entries as
    // `./` + path.relative(projectDir, realPath), which on Windows is `./D:/...` across drives. Make those absolute.
    const crossDrive = /^\.\/([A-Za-z]:[\\/])/;
    const fixImport = (v: unknown): unknown => {
      if (typeof v === 'string') return v.replace(crossDrive, '$1');
      if (Array.isArray(v)) return v.map(fixImport);
      if (v && typeof v === 'object' && 'import' in v) return { ...(v as object), import: fixImport((v as { import: unknown }).import) };
      return v;
    };
    if (process.platform === 'win32' && typeof config.entry === 'function') {
      const original = config.entry as () => Promise<Record<string, unknown>>;
      config.entry = async () => {
        const entries = await original();
        return Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, fixImport(v)]));
      };
    }
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
