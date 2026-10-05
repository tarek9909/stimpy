import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/** Static visual gallery of every @stimpy/ui component. `npm run gallery:build -w @stimpy/ui`. */
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  css: { postcss: here },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
  server: { port: 5290, strictPort: true },
});
