/**
 * Compares the method+path pairs of the generated OpenAPI document with the endpoint list in
 * docs/website/backend/api-reference.md.
 *
 *   npm run contract:check             prints "documented but not yet implemented" (the TODO list); exits 1 only if
 *                                      something is implemented but NOT documented
 *   npm run contract:check -- --strict also exits 1 when documented endpoints are missing (the final gate)
 *   npm run contract:check -- --list   prints every documented endpoint and stops
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from '../src/app';
import { API_ROOT, loadConfigOrExit } from '../src/config';
import { keyOf, normalizePath, parseContract, type Endpoint } from './contract-parser';

const CONTRACT = join(API_ROOT, '..', '..', 'docs', 'website', 'backend', 'api-reference.md');
const CRM_CONTRACT = join(API_ROOT, '..', 'docs', 'crm', 'backend.md');
const strict = process.argv.includes('--strict');

const documented = parseContract(readFileSync(CONTRACT, 'utf8'));
if (existsSync(CRM_CONTRACT)) {
  const crmDoc = parseContract(readFileSync(CRM_CONTRACT, 'utf8'));
  for (const e of crmDoc) {
    const path = e.path.startsWith('/admin') ? e.path : `/admin${e.path}`;
    documented.push({ method: e.method, path });
  }
}
const documentedEndpoints = [...new Map(documented.map((e) => [keyOf(e), e])).values()];

if (process.argv.includes('--list')) {
  for (const e of documentedEndpoints) console.log(`${e.method.padEnd(6)} ${e.path}`);
  console.log(`\n${documentedEndpoints.length} documented endpoints`);
  process.exit(0);
}

const config = loadConfigOrExit();
const app = await buildApp({ config: { ...config, logLevel: 'silent' } });
await app.ready();
const doc = app.swagger() as { paths?: Record<string, Record<string, unknown>> };

const implemented: Endpoint[] = [];
for (const [path, item] of Object.entries(doc.paths ?? {})) {
  if (!path.startsWith('/api/v1')) continue;
  for (const method of Object.keys(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    implemented.push({ method: method.toUpperCase(), path: path.slice('/api/v1'.length) || '/' });
  }
}
await app.close();

const docKeys = new Set(documentedEndpoints.map(keyOf));
const implKeys = new Set(implemented.map(keyOf));
const missing = documentedEndpoints.filter((e) => !implKeys.has(keyOf(e)));
const undocumented = implemented.filter((e) => !docKeys.has(keyOf(e)));
const ok = documentedEndpoints.length - missing.length;

console.log(`Contract check: ${documentedEndpoints.length} documented, ${implKeys.size} implemented, ${ok} matching.\n`);

if (undocumented.length) {
  console.log(`IMPLEMENTED BUT NOT DOCUMENTED (${undocumented.length}) - fix the code or change api-reference.md first:`);
  for (const e of undocumented) console.log(`  ${e.method.padEnd(6)} ${normalizePath(e.path).replace(/\{\}/g, ':param')}`);
  console.log('');
}

// Group the TODO list by first path segment(s) so work packages can pick theirs.
const groups = new Map<string, Endpoint[]>();
for (const e of missing) {
  const segs = e.path.split('/').filter(Boolean);
  const g = segs[0] === 'admin' ? `admin/${segs[1] ?? ''}` : (segs[0] ?? '');
  groups.set(g, [...(groups.get(g) ?? []), e]);
}
if (missing.length) {
  console.log(`DOCUMENTED BUT NOT YET IMPLEMENTED (${missing.length}):`);
  for (const [g, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  [${g}]`);
    for (const e of list) console.log(`    ${e.method.padEnd(6)} ${e.path}`);
  }
} else {
  console.log('Every documented endpoint is implemented.');
}

const failed = undocumented.length > 0 || (strict && missing.length > 0);
if (failed) console.log(`\nFAILED${strict ? ' (--strict)' : ''}`);
process.exit(failed ? 1 : 0);
