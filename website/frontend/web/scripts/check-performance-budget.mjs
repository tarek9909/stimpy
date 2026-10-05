import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const buildDir = path.resolve(process.cwd(), process.env.STIMPY_DIST_DIR || '.next');
const manifestPaths = {
  app: path.join(buildDir, 'app-build-manifest.json'),
  pages: path.join(buildDir, 'build-manifest.json'),
  lazy: path.join(buildDir, 'react-loadable-manifest.json'),
};
for (const [name, file] of Object.entries(manifestPaths)) {
  if (!fs.existsSync(file)) {
    console.error(`Missing Next ${name} manifest: ${path.relative(process.cwd(), file)}. Run next build first.`);
    process.exit(2);
  }
}

const appManifest = JSON.parse(fs.readFileSync(manifestPaths.app, 'utf8'));
const pagesManifest = JSON.parse(fs.readFileSync(manifestPaths.pages, 'utf8'));
const lazyManifest = JSON.parse(fs.readFileSync(manifestPaths.lazy, 'utf8'));
const unique = (files) => [...new Set(files)];
const routeFiles = (route) => appManifest.pages[route];
const gzipBytes = (file) => {
  const absolute = path.join(buildDir, file);
  if (!fs.existsSync(absolute)) throw new Error(`Manifest asset not found: ${file}`);
  return zlib.gzipSync(fs.readFileSync(absolute), { level: 9 }).byteLength;
};
const measure = (files, extension = '.js') => {
  const selected = unique(files.filter((file) => file.endsWith(extension)));
  return { bytes: selected.reduce((sum, file) => sum + gzipBytes(file), 0), files: selected };
};
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const routeBudgets = [
  ['/', '/page', 130],
  ['/shop', '/shop/page', 140],
  ['/shop/stimpie/[slug]', '/shop/stimpie/[slug]/page', 140],
  ['/shop/hoodie/[slug]', '/shop/hoodie/[slug]/page', 140],
  ['/checkout', '/checkout/page', 170],
  ['/builder (2D)', '/builder/page', 180],
];

const failures = [];
function check(name, bytes, limit) {
  const passed = bytes <= limit * 1024;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${kib(bytes)} / ${limit} KiB gzip`);
  if (!passed) failures.push(`${name} exceeds ${limit} KiB by ${kib(bytes - limit * 1024)}`);
}

// The app manifest is Next's initial route JS set (including all applicable layouts).
// Compute the shared shell as files present in every documented key route. The Next root
// runtime is identified directly from build-manifest.rootMainFiles; the app-owned shell is
// the remaining intersection (layout/header/cart). Route-only delta is each route's initial
// JavaScript outside that shared intersection.
const routes = routeBudgets.map(([name, route]) => {
  const files = routeFiles(route);
  if (!files) {
    failures.push(`Unable to classify route ${name}: ${route} is missing from app-build-manifest.json`);
    console.log(`FAIL ${name}: route is not present in the Next app manifest`);
    return null;
  }
  return { name, route, files: unique(files.filter((file) => file.endsWith('.js'))) };
}).filter(Boolean);

if (routes.length === routeBudgets.length) {
  const sharedFiles = routes[0].files.filter((file) => routes.every((route) => route.files.includes(file)));
  const frameworkFiles = unique((pagesManifest.rootMainFiles ?? []).filter((file) => file.endsWith('.js')));
  const frameworkSet = new Set(frameworkFiles);
  if (frameworkFiles.length === 0 || frameworkFiles.some((file) => !sharedFiles.includes(file))) {
    failures.push('Unable to classify Next framework rootMainFiles in the shared key-route intersection');
    console.log('FAIL Next framework runtime: rootMainFiles are missing or not shared by every key route');
  } else {
    const framework = measure(frameworkFiles);
    const appShellFiles = sharedFiles.filter((file) => !frameworkSet.has(file));
    const appShell = measure(appShellFiles);
    check('Next framework root runtime (build-manifest rootMainFiles)', framework.bytes, 105);
    check('app-owned shared shell (shared key-route intersection minus rootMainFiles)', appShell.bytes, 10);
    check('combined shared shell (framework + app-owned shared files)', framework.bytes + appShell.bytes, 110);
  }

  for (const [name, route, budget] of routeBudgets) {
    const entry = routes.find((candidate) => candidate.route === route);
    const total = measure(entry.files);
    check(`${name} initial route JS`, total.bytes, budget);
    const delta = measure(entry.files.filter((file) => !sharedFiles.includes(file)));
    check(`${name} route-only JS delta`, delta.bytes, 40);
  }
}

// Modern supported browsers load module chunks and skip Next's legacy nomodule polyfills.
// Keep that bundle out of modern-browser budgets; app-build-manifest route files are the
// authoritative App Router initial route set. Include shared CSS from the layout entry.
const layoutFiles = routeFiles('/layout') ?? [];
check('website CSS', measure(layoutFiles, '.css').bytes, 25);
if (!pagesManifest.polyfillFiles?.every((file) => file.endsWith('.js'))) {
  failures.push('Unable to classify Next legacy polyfills; expected build-manifest polyfillFiles to contain JavaScript only');
}

const threeFiles = new Set();
for (const [name, entry] of Object.entries(lazyManifest)) {
  const normalizedName = name.replaceAll('\\', '/');
  if (normalizedName.includes('BuilderCanvas3D.tsx -> ./three/engine')) {
    for (const file of entry.files ?? []) if (file.endsWith('.js')) threeFiles.add(file);
  }
}
if (threeFiles.size === 0) {
  failures.push('Unable to classify lazy Three.js engine assets from react-loadable-manifest.json');
  console.log('FAIL Builder lazy Three.js chunk: could not classify dynamic assets');
} else {
  check('Builder lazy Three.js chunk', measure([...threeFiles]).bytes, 250);
}

if (failures.length) {
  console.error('\nPerformance budget failures:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('\nAll measured website JavaScript and CSS budgets passed.');
}
