import { defineConfig } from 'vite';

// STIMPY_NO_HMR=1: exports must not reload mid-render when a file changes
export default defineConfig({
  server: { port: 5190, strictPort: false, hmr: process.env.STIMPY_NO_HMR ? false : undefined },
  build: { target: 'esnext' },
});
