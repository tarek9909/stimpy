/**
 * Extracts the endpoint list (method + path) from docs/website/backend/api-reference.md.
 * The document is prose with tables, so the parser understands the notations it uses:
 *   `GET /options`                       full endpoint in backticks
 *   `GET` / `PUT /admin/builder`         several methods sharing one path
 *   `/admin/drops` : `GET`, `POST`, `PATCH /:id`   a resource path followed by relative methods
 *   `/admin/ad-spend` | Same, with ...   "Same" repeats the previous resource row's methods
 *   Resources (all with `GET` list, `GET /:id`, `POST`, ...) + table rows `/admin/hoodies` | ...
 *   `/admin/size-chart`:  then  - `GET` -> ..., - `PUT` ...
 * Paths are normalised (`:id`, `:slug` -> `{}`) for comparison.
 */
export type Endpoint = { method: string; path: string };

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type Method = (typeof METHODS)[number];
const isMethod = (s: string): s is Method => (METHODS as readonly string[]).includes(s);

const spans = (line: string): string[] => [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim());

const stripQuery = (p: string): string => p.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';

/** `:id`, `:slug`, `{id}` -> `{}` so documented and generated paths compare equal. */
export const normalizePath = (p: string): string => stripQuery(p).replace(/:[A-Za-z_]+/g, '{}').replace(/\{[A-Za-z_]+\}/g, '{}');

export const keyOf = (e: Endpoint): string => `${e.method} ${normalizePath(e.path)}`;

export function parseContract(markdown: string): Endpoint[] {
  const found = new Map<string, Endpoint>();
  const add = (method: string, path: string): void => {
    const e = { method, path: stripQuery(path) };
    if (!e.path.startsWith('/')) return;
    found.set(keyOf(e), e);
  };

  let crudTemplate: { method: Method; suffix: string }[] = [];
  let lastResourceTemplate: { method: Method; suffix: string }[] = [];
  let stickyPath: string | null = null;
  let inResourcesTable = false;
  let tableSeen = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine;
    const trimmed = line.trim();
    if (trimmed === '') {
      stickyPath = null;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed) && !trimmed.includes('`')) {
      stickyPath = null;
      inResourcesTable = false;
      continue;
    }
    // The CRUD-template table ends at the first non-table line after it started.
    if (inResourcesTable) {
      if (trimmed.startsWith('|')) tableSeen = true;
      else if (tableSeen) {
        inResourcesTable = false;
        tableSeen = false;
      }
    }
    // Code fences contain TypeScript, not endpoints.
    if (/^\s*```/.test(line)) continue;

    const tokens = spans(line);
    if (tokens.length === 0) continue;

    // The "Resources (all with `GET` list, `GET /:id`, `POST`, ...)" sentence defines the CRUD template.
    if (/^Resources\b/.test(line.trim())) {
      crudTemplate = [];
      for (const t of tokens) {
        const m = /^(GET|POST|PUT|PATCH|DELETE)(?:\s+(\/\S*))?$/.exec(t);
        if (m) crudTemplate.push({ method: m[1] as Method, suffix: m[2] === '/:id' ? '/:id' : '' });
      }
      inResourcesTable = true;
      continue;
    }

    let context: string | null = null; // resource path of this line
    let pendingBare: Method[] = []; // bare methods waiting for a full path ("`GET` / `PUT /admin/x`")
    const rel: { method: Method; suffix: string }[] = [];
    let sawMethod = false;

    for (const t of tokens) {
      const [methodList, groupedPath] = t.split(/\s+/, 2);
      const groupedMethods = methodList?.split('/');
      if (groupedMethods && groupedMethods.length > 1 && groupedMethods.every(isMethod) && groupedPath?.startsWith('/')) {
        for (const method of groupedMethods) add(method, groupedPath);
        sawMethod = true;
        continue;
      }
      const full = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)$/.exec(t);
      const bare = /^(GET|POST|PUT|PATCH|DELETE)(?:\s|$)/.exec(t);
      if (full) {
        const path = full[2]!;
        if (path.startsWith('/:') && context) {
          rel.push({ method: full[1] as Method, suffix: path });
          add(full[1]!, context + path);
        } else {
          add(full[1]!, path);
          for (const b of pendingBare) add(b, path);
          pendingBare = [];
        }
        sawMethod = true;
      } else if (bare && isMethod(bare[1]!)) {
        const m = bare[1] as Method;
        if (context) {
          add(m, context);
          rel.push({ method: m, suffix: '' });
        } else if (stickyPath && /^\s*[-*]\s/.test(line)) {
          add(m, stickyPath);
        } else {
          pendingBare.push(m);
        }
        sawMethod = true;
      } else if (t.startsWith('/') && !/\s/.test(t)) {
        // path-only span: a resource context. Only the first path-only span on a line is the resource.
        if (!context && !sawMethod) context = t;
      }
    }

    if (context && !sawMethod) {
      // A line that only names a resource.
      if (inResourcesTable && /^\|/.test(line.trim()) && crudTemplate.length) {
        for (const c of crudTemplate) add(c.method, context + c.suffix);
      } else if (/\bSame\b/.test(line) && lastResourceTemplate.length) {
        for (const c of lastResourceTemplate) add(c.method, context + c.suffix);
      } else {
        stickyPath = context; // e.g. "`/admin/size-chart`:" followed by bullet lines
      }
    }
    if (context && sawMethod) {
      if (rel.length) lastResourceTemplate = rel.map((r) => ({ method: r.method, suffix: r.suffix }));
      stickyPath = null;
    }
  }

  return [...found.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}
