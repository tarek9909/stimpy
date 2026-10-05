import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The dashboard origin MUST be one the API allows (`ADMIN_URL`): the Origin check on writes and the
 * CORS allow-list use it. So the port is strict: Vite fails instead of silently picking another.
 * Canonical port 5173; parallel workers set ADMIN_PORT (and put that origin in the API's ADMIN_URL).
 * `host` stays `localhost`: the session cookie is host-only and `127.0.0.1` is a different site.
 */
const port = Number(process.env.ADMIN_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': resolve(here, 'src') } },
  server: { port, strictPort: true, host: 'localhost' },
  preview: { port, strictPort: true, host: 'localhost' },
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
