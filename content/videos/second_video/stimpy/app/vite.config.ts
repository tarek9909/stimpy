import { defineConfig } from 'vite';
// STIMPY_NO_HMR: the offline renderer runs its own server; a file saved mid-render must not reload the page
export default defineConfig({ server: { port: 5199, hmr: process.env.STIMPY_NO_HMR ? false : undefined }, clearScreen: false });
