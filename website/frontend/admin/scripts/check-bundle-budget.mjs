import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const DIST = resolve('dist');
const ENTRY_BUDGET = 250 * 1024;
const ENGINE_BUDGET = 250 * 1024;
const LAZY_CHUNK_BUDGET = 100 * 1024;

async function listJavaScript(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScript(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

function compressedSize(bytes) {
  return gzipSync(bytes).byteLength;
}

function formatSize(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB gzip`;
}

function checkBudget(label, bytes, budget, violations) {
  const passed = bytes <= budget;
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${label}: ${formatSize(bytes)} / ${(budget / 1024).toFixed(0)} KiB\n`);
  if (!passed) violations.push(`${label} is ${formatSize(bytes)}; maximum is ${(budget / 1024).toFixed(0)} KiB gzip.`);
}

const html = await readFile(resolve(DIST, 'index.html'), 'utf8');
const entryMatch = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+\.js)"/i);
if (!entryMatch) throw new Error('Could not locate the initial JavaScript entry in dist/index.html.');

const entryPath = resolve(DIST, `.${new URL(entryMatch[1], 'http://bundle.local').pathname}`);
const allJavaScript = await listJavaScript(resolve(DIST, 'assets'));
const engineChunks = allJavaScript.filter((path) => /^engine-[^/\\]+\.js$/i.test(path.slice(path.lastIndexOf(sep) + 1)));
if (engineChunks.length !== 1) {
  throw new Error(`Expected exactly one separately built Three engine chunk; found ${engineChunks.length}.`);
}
if (!allJavaScript.includes(entryPath)) {
  throw new Error(`Initial entry ${relative(DIST, entryPath)} is missing from dist/assets.`);
}

const enginePath = engineChunks[0];
const violations = [];
const entryBytes = await readFile(entryPath);
const engineBytes = await readFile(enginePath);
checkBudget(`initial entry (${relative(DIST, entryPath)})`, compressedSize(entryBytes), ENTRY_BUDGET, violations);
checkBudget(`Three engine (${relative(DIST, enginePath)})`, compressedSize(engineBytes), ENGINE_BUDGET, violations);

// The entry must not pull Three into its eager dependency graph. The engine itself is also
// excluded from the shared/lazy chunk budget below because it has a separate 250 KiB allowance.
if (entryBytes.includes(Buffer.from('engine-'))) {
  violations.push(`Initial entry ${relative(DIST, entryPath)} references the Three engine chunk.`);
}

for (const path of allJavaScript) {
  if (path === entryPath || path === enginePath) continue;
  checkBudget(`lazy/shared chunk (${relative(DIST, path)})`, compressedSize(await readFile(path)), LAZY_CHUNK_BUDGET, violations);
}

if (violations.length) {
  process.stderr.write(`\nDashboard bundle budget failed:\n${violations.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Dashboard gzip bundle budgets passed.\n');
}
