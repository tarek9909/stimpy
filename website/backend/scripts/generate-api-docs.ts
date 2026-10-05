/** Writes the OpenAPI document of the implemented routes to website/docs/openapi.json (`npm run docs:api`). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildApp } from '../src/app';
import { API_ROOT, loadConfigOrExit } from '../src/config';

const OUT = join(API_ROOT, '..', 'docs', 'openapi.json');

const config = loadConfigOrExit();
// Stable output regardless of the developer's own URLs.
const app = await buildApp({ config: { ...config, logLevel: 'silent', apiPublicUrl: 'http://localhost:4000' } });
await app.ready();
const doc = app.swagger();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
await app.close();
console.log(`Wrote ${OUT} (${Object.keys((doc as { paths?: object }).paths ?? {}).length} paths)`);
