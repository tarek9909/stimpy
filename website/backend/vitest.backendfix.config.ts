import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export default mergeConfig(baseConfig, defineConfig({ resolve: { alias: { '@prisma/client': resolve(here, '../.tmp-prisma-client/index.js') } } }));