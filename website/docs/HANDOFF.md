# Handoff notes (append-only, one heading per topic)

## Backend foundation

Status: B0, B1, B2 and the options module are DONE and tested (`backend`, package `@stimpy/api`). Three more engineers build the rest in parallel, each against their own databases (see "Databases"). **Do not change `prisma/schema.prisma` or add migrations** unless the contract truly needs something the schema lacks; if you must, tell the coordinator first (two people running `prisma generate` at once locks the engine DLL on Windows) and record it in `docs/DECISIONS.md`.

### Commands (from the workspace root `C:\Projects\motion\website` unless noted)

| Command | What it does |
|---|---|
| `npm run infra:status` / `infra:up` | MySQL 3317 and Mailpit 1025/8025 |
| `npm run api:typecheck` | `tsc --noEmit` over src, test, prisma, scripts |
| `npm run api:test` | Vitest against the TEST database (see below). From `backend`: `npx vitest run test/auth.test.ts` for one file |
| `npm run api:dev` | `tsx watch src/server.ts` (PORT from env) |
| `npm run db:deploy` | `prisma migrate deploy` for `DATABASE_URL` (works on an empty database, creates it if missing) |
| `npm run db:seed` | idempotent seed. From `backend`: `npx tsx prisma/seed.ts --reset` (wipe + seed), `--minimal` (no demo catalog), `--no-admin` |
| `npm run db:seed:demo` | fake orders; exits with code 2 until `placeOrder` exists (see "Demo orders") |
| `npm run docs:api` | writes `docs/openapi.json` |
| `npm run contract:check` | lists documented-but-missing endpoints (your TODO list); exit 1 only if something is implemented but undocumented. In `backend`: `npm run contract:check -- --strict` also fails on missing ones, `-- --list` prints every documented endpoint |
| `npm run admin:create` (in `backend`) | `-- --email a@b.c --password "..." --name "..."`; defaults to ADMIN_EMAIL / ADMIN_PASSWORD |
| `db:backup` / `db:restore` | mysqldump / restore (`npm run db:restore -w @stimpy/api -- <file>`) |

Dev admin login (from `backend/.env`, git-ignored; `.env.example` is committed and documents every variable): `owner@stimpy.local` / `Stimpy-Dev-Password-1`. Swagger UI: `http://localhost:<PORT>/docs`, JSON `/docs/json`.

### Databases

Canonical names are `stimpy` / `stimpy_test` (the defaults in `.env`). While working in parallel create your own and **override through the shell environment** (real env vars win over `.env`):

```bash
export DATABASE_URL=mysql://stimpy:stimpy@localhost:3317/stimpy_wpa
export TEST_DATABASE_URL=mysql://stimpy:stimpy@localhost:3317/stimpy_test_wpa
export PORT=4101 API_PUBLIC_URL=http://localhost:4101 UPLOAD_DIR=./uploads-wpa
# create both once:  mysql -uroot -h127.0.0.1 -P3317 -e "CREATE DATABASE stimpy_wpa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
npm run db:deploy && npm run db:seed         # TEST db is migrated automatically by the test run
```

Always export before running anything: a command run without `DATABASE_URL` silently targets the canonical `stimpy` database. The test harness refuses any database whose name does not contain `test`. `backend/uploads*/` is git-ignored. Seeded absolute URLs contain `API_PUBLIC_URL` at seed time: after changing it run the seed with `--reset`.

### File layout

```
backend/
  .env  .env.example  tsconfig.json  vitest.config.ts
  prisma/   schema.prisma  migrations/  seed.ts  seed-assets.ts  seed-demo.ts
  scripts/  create-admin.ts  generate-api-docs.ts  contract-check.ts  contract-parser.ts  db-backup.ts  db-restore.ts
  seed-assets/models/hoodie.glb        (optional; picked up by the seed)
  src/
    server.ts   app.ts (buildApp)   config.ts (Zod env)   context.ts (AppContext)   types.ts
    plugins/    request-id  prisma  openapi  cors  origin-check  rate-limit  security-headers  auth-session  request-log  error-handler  route-group
    lib/        errors  http  db  clock  money  phone  slug  template  templates-catalog  order-number  dates  mask  logger  rate-limiter  storage  email-transport
    services/   settings (done)  auth (done)  variants (done)  uploads (storeUpload, done)  pricing  stock  orders  drops  email-queue  (stubs: signatures only)
    modules/    <name>/routes.ts [schemas.ts] [service.ts]; index.ts is the registry; module.ts is the ModuleDef type
    jobs/       index.ts (timers)  email-worker  hold-expiry  session-cleanup (done)
  test/       *.test.ts  global-setup.ts  helpers/{app,db,fixtures,mailpit,jobs,clock,probe-module}.ts
```

Layering rule (backend README section 3): `modules/*` = HTTP only (validation, auth, response mapping). Business meaning lives in `services/*` (and `modules/<name>/service.ts` for logic private to one module). Routes never touch stock or order status directly.

### Conventions

**Context.** `AppContext = { config, prisma, settings, storage, emailTransport }`, built once by `createContext(config)` and available as `app.ctx` (and `app.prisma`). Services are plain async functions `(ctx, input)`; use `ctx.prisma.$transaction(async (tx) => ...)` and pass `tx` (type `Tx`) down for anything that must be atomic. `Db = PrismaClient | Tx` is for read helpers that work in either.

**Registering a module.** Edit `modules/<name>/routes.ts`; it is already listed in `modules/index.ts`. It exports a `ModuleDef` with up to two Fastify plugins:
- `publicRoutes`: mounted under `/api/v1` (write paths like `/products/hoodies/:slug`).
- `adminRoutes`: mounted under `/api/v1/admin` **inside a scope that already runs `requireAdmin`** (write paths like `/hoodies/:id`). You get `request.auth.user` / `.session`, the `Origin` check and `no-store` for free, and OpenAPI gets `security: cookieAuth`. Never re-check authentication in a handler.

**Declaring a route** (Zod drives validation, types, response serialisation and OpenAPI; copy `modules/options/routes.ts`):

```ts
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, idParams, pageQuerySchema, pageSchema, publicCache, strictObject } from '../../lib/http';

const hoodieSchema = z.object({ id: z.number().int(), name: z.string() /* ...exactly the contract... */ }).meta({ id: 'AdminHoodie' });

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/hoodies', {
    schema: { tags: ['catalog'], summary: 'List hoodies', querystring: pageQuerySchema.extend({ active: boolQuery }),
              response: { 200: pageSchema(hoodieSchema), ...errorResponses } },
  }, async (req) => svc.listHoodies(app.ctx, req.query));

  app.post('/hoodies', {
    schema: { tags: ['catalog'], body: createBody /* z.strictObject(...) */, response: { 201: hoodieSchema, ...errorResponses } },
  }, async (req, reply) => reply.code(201).send(await svc.createHoodie(app.ctx, req.body)));
};
```

Rules: request objects are `z.strictObject` (unknown fields -> `VALIDATION_ERROR`); every route has `tags` (one of `OPENAPI_TAGS` in `plugins/openapi.ts`) and a 2xx `response` schema (a test fails otherwise); responses are serialised through the schema, so internal columns (`costCents` on public routes, hashes, fingerprints) cannot leak: build the response from explicit mappers, never `return row`. Dates in responses are `z.string()` filled with `iso(date)` / `isoOrNull(date)` (`lib/dates.ts`). `204` responses use `noContent` from `modules/auth/schemas.ts` and `reply.code(204).send(null)`. Public cacheable GETs call `publicCache(reply, 30)` (drops: 10, or `noStore(reply)` within 60 s of a start). Public POSTs get rate limits with `{ onRequest: app.limit(RATE_RULES.track) }` (by IP) and, for body keys (phone, e-mail), `rateLimiter.enforce(RATE_RULES.orderPhone, phone)` inside the route/service (`lib/rate-limiter.ts` has every documented rule).

**Errors.** One type: `new AppError(code, httpStatus, message, details)` from `lib/errors.ts`, with helpers `AppError.validation({ 'items.0.sizeId': '...' })`, `.notFound()`, `.conflict(msg, field)`, `.forbidden()`, `.rateLimited(secs)`. Codes and statuses in `ERROR_STATUS`; for SOLD_OUT, NOT_PURCHASABLE, INVALID_TRANSITION, DELIVERY_NUMBER_REQUIRED, PRICE_CHANGED, FILE_TOO_LARGE, UNSUPPORTED_FILE_TYPE use `new AppError('SOLD_OUT', ERROR_STATUS.SOLD_OUT, 'msg', { items })`. Only `plugins/error-handler.ts` writes error bodies. Validation errors from Zod are converted automatically (`fields` with dotted paths such as `items.1.stimpieIds.0`). Business-rule validation in a service uses `AppError.validation({...})` with the same path style. Not-yet-built service functions throw `notImplemented('name')` (HTTP 501).

**Service with a transaction** (pattern):

```ts
export async function createThing(ctx: AppContext, input: CreateInput) {
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      const row = await tx.thing.create({ data: { ... } });
      await ensureVariants(tx, { hoodieId: row.id });          // other tables in the same tx
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw AppError.conflict('That slug is taken.', 'slug');   // lib/db.ts
    throw e;
  }
}
```

**Money** is integer cents in fields named `...Cents` (never decimals). `formatUsd(5800) -> "$58.00"` (`lib/money.ts`). **Phones**: `normalizePhone(input) -> "+961XXXXXXXX" | null` (`lib/phone.ts`); put it in a Zod `.refine` and normalise in the service. **Pagination**: `pageQuerySchema` (page, pageSize<=100, default 25), `toSkipTake(q)`, `toPage(items, total, q)`, `pageSchema(itemSchema)`, type `Page<T>`. **Sorting**: `parseSort(raw, allowedFields, fallback)`. Query booleans: `boolQuery`; comma lists (`status=CONFIRMED,PACKED`): `csvQuery`. **Time**: call `now()` from `lib/clock.ts` instead of `new Date()` for anything time-dependent (tests freeze it); day boundaries in the business timezone: `dayRangeInTz`, `ymdInTz`, `weekdayInTz` (`lib/dates.ts`, tested for Asia/Beirut). **Raw SQL** only for the atomic conditional stock UPDATEs and the order-number counter (inside `services/stock.ts` / `services/orders.ts`, bound parameters only); everything else uses the typed Prisma API. `counters.order_number.value` is the LAST ISSUED number.

**Settings.** `ctx.settings.get('orders')` (typed, defaults, 5 s cache), `getAll()`, `update({ delivery: {...} })` (merges, validates, `group.field` error paths). Groups: business, orders, email, notifications, delivery, setup.

**Logging.** `req.log.info({ ...ids only }, 'order placed')`. Never log request bodies, passwords, cookies, full phones or e-mails (`lib/mask.ts`: `maskPhone`, `maskEmail`). The request line is written automatically.

**Auth in tests/scripts.** Dashboard login is the real endpoint. `requireRole('OWNER')` exists for future roles.

### Test harness (`backend/test/helpers`)

```ts
import { useTestApp } from './helpers/app';
import { buildWorld, createStimpie, createDrop, createPack, createHoodie, createArea, seedTemplates } from './helpers/fixtures';
import { freezeTime, advanceTime } from './helpers/clock';
import { jobs } from './helpers/jobs';

const t = useTestApp();   // builds the app once, resets DB + rate limiter + settings cache + clock + mail recorder before EVERY test

it('does something as the owner', async () => {
  const w = await buildWorld(t.prisma);                 // admin, Black/Cream, S/M/L, hoodie (20 per variant), packs 1/2, core + limited Stimpies, live drop, areas, templates, counter
  const { client } = await t.adminClient();             // logged-in client; Origin = dashboard origin; own cookie jar
  const res = await client.post('/admin/hoodies', { ... });      // '/api/v1' prefix is added automatically
  expect(res.status).toBe(201); expect(res.json().name).toBe('...');
  await t.client.get('/options', { origin: 'http://localhost:3000' });  // anonymous public client
  await jobs.sessionCleanup(t.ctx);                      // job functions are called directly, never via timers
  expect(t.transport.sent).toHaveLength(1);              // RecordingTransport (set `t.transport.failWith = new Error()` to simulate SMTP failure)
});
```

- `useTestApp({ env, logStream, extraModules, reset })` options; `t.app` (Fastify), `t.ctx`, `t.prisma`, `t.config`, `t.client`, `t.adminClient()`, `t.extraApp(envOverrides)` (a second app, e.g. `COOKIE_SECURE=true`).
- `TestClient`: `get/post/put/patch/delete(path, ...)`, `request(method, path, { body, query, headers, origin, ip, payload })`, `.fork()` (new cookie jar), `.cookies`, `.origin`, `.ip` (use different `ip` values to test per-IP limits). Responses: `{ status, headers, body, json(), header(name) }`.
- Database: before each test every table is emptied with `DELETE` (auto-increment ids are NOT reset: never assert literal ids). Fixtures write straight to the database: `createAdmin, createColor, createSize, createHoodie({stock}), setVariantStock, createDrop, createStimpie, createPack, createArea, seedTemplates, seedOrderCounter, buildWorld`.
- Real Mailpit: `helpers/mailpit.ts` (`mailpitAvailable, mailpitMessages({to}), mailpitMessage(id), mailpitClear({to}), mailpitWaitFor(to)`). The inbox is shared by everyone: ALWAYS filter by a unique recipient. Use it together with the real SMTP transport (`createSmtpTransport(t.config.smtp)` passed as `context.emailTransport`).
- Time: `freezeTime('2026-10-14T10:00:00Z')`, `advanceTime(ms)`; sessions, rate limits, settings cache read the injectable clock (Prisma `@default(now())` columns still use the real clock).
- Probe routes for infrastructure tests: `helpers/probe-module.ts`. The sweep test in `auth.test.ts` automatically asserts 401 without session and 403 for a wrong Origin on **every** `/admin/**` route that exists, including yours. `health-openapi.test.ts` asserts every route has tags + a response schema and that nothing is implemented that the contract does not list.
- Concurrency tests need more Prisma connections: the harness client uses `connection_limit=20`.
- Run one file: `cd backend && npx vitest run test/foo.test.ts`. Files run one at a time (one test database per engineer).

### Seed contents

`npm run db:seed` creates (if missing; never overwrites edits): admin from env; settings rows (defaults) and `counters.order_number = 1000`; colours Black `#111111`, Cream `#FFF4E6`, Stone `#B8B2A7`, Coral `#FF7A59` (each with 2 placeholder photos and `builderTint`); sizes S/M/L/XL; size chart Chest/Length/Sleeve (cm, placeholder numbers) + how-to text; hoodie "Stimpy Hoodie" ($25, cost $10, 16 variants with stock incl. LOW and SOLD_OUT cases, INITIAL movements); packs "Hoodie + 1 Stimpie" $35 and "Hoodie + 2 Stimpies" $45 (badge "Most popular"); areas Beirut, Mount Lebanon, North, South, Bekaa, Nabatieh (no fees); 6 email + 4 WhatsApp templates (default copy in `lib/templates-catalog.ts`); 8 FAQs; content blocks (announcement off, homepage with the lookbook image, about, how_it_works, policies, size_chart_howto; all marked PLACEHOLDER where they are guesses); **17 real Stimpies** processed to 800x1250 WebP (+1024x1600 textures in `builder_config.stimpieTextures`): 8 Core, Drop 001 live (Butter), Drop 002 upcoming in 14 days (Sky), Drop 000 ended and sold out (Lilac); builder config with 2D assets per colour (flat back-view hoodie, shared shading overlay, `placement2d {x:0.5,y:0.46,width:0.36,rotation:0}`) and, when `backend/seed-assets/models/hoodie.glb` exists, the 3D model with mode BOTH. JSON shapes of content blocks and builder config are in DECISIONS.md ("content").

### Demo orders (`prisma/seed-demo.ts`)

The generator (30 orders over 4 weeks, all statuses, UTM attribution, sources, delivery numbers) is complete and calls `placeOrder` then `changeStatus` from `services/orders.ts`, passing `placedAt` (demo only: work package B must honour `PlaceOrderInput.placedAt` and use it for `placed_at` / event times, or adapt the script). Until the service exists it exits with code 2 and a message. Run `npm run db:seed` first.

### What still throws `notImplemented` (stubs, signatures only)

`services/pricing.ts`, `services/stock.ts`, `services/orders.ts`, `services/drops.ts`, `services/email-queue.ts`. Jobs `email-worker` and `hold-expiry` are wired (timers in `server.ts`, callable from tests, `jobs/index.ts` lists them) but are safe no-ops: replace the body with the real call (`processDueEmails(ctx)`, the hold-expiry logic). `session-cleanup` is complete.

### Endpoint inventory still to build (generated from `api-reference.md`; `npm run contract:check` prints the live list)

Done by the foundation: `GET /health`; `POST /auth/login|logout|change-password`, `GET /auth/me`; `GET /options`, `GET /size-chart`; `GET|POST /admin/colors`, `GET|PATCH|DELETE /admin/colors/:id`, `PUT /admin/colors/order`; same for `/admin/sizes`; `GET|PUT /admin/size-chart`; `GET|PATCH /admin/settings`.

#### Work package A: catalog, uploads, drops, content, builder, FAQ, reviews, subscribers
Public:
- [ ] `GET /products/hoodies`, `GET /products/hoodies/:slug`
- [ ] `GET /products/stimpies` (query `type`, `drop`, `includeSoldOut`, `includeUpcoming`, `includeEnded`), `GET /products/stimpies/:slug`
- [ ] `GET /packs`
- [ ] `GET /drops`, `GET /drops/:slug`, `POST /drops/:id/subscribe` (10/hour/IP, idempotent)
- [ ] `GET /content`, `GET /builder/config`
Admin:
- [ ] `/admin/hoodies`: `GET`, `GET /:id`, `POST` (creates variants via `ensureVariants`), `PATCH /:id`, `DELETE /:id`, `PUT /admin/hoodies/order`
- [ ] `/admin/stimpies`: `GET`, `GET /:id`, `POST` (initial `quantity` writes an INITIAL movement), `PATCH /:id`, `DELETE /:id` (copy artwork width/height from the upload row when `artworkUrl` is set)
- [ ] `/admin/packs`: `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /admin/packs/order`
- [ ] `POST /admin/uploads` (multipart; magic-byte sniffing, SVG sanitising, EXIF strip, resize, size limits 10/100/50 MB; use `storeUpload` + `ctx.storage`; route body limit 100 MB; register `@fastify/multipart`)
- [ ] `/admin/drops`: `GET` (`?state=`), `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`, `POST /admin/drops/:id/end`; implement `services/drops.ts` (state derivation, purchasability) first, WP B needs it
- [ ] `GET /admin/subscribers` (`?format=csv`)
- [ ] `GET|PUT /admin/content/:key` (announcement, homepage, policies, about, how-it-works)
- [ ] `/admin/faqs`: `GET`, `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /admin/faqs/order`
- [ ] `/admin/reviews`: `GET`, `POST`, `PATCH /:id`, `DELETE /:id`
- [ ] `GET|PUT /admin/builder` (with `assetsReady`, `warnings`, mode resolution of business-rules section 12)

#### Work package B: pricing, stock, orders, status machine, email queue, comms, deliveries, overview
Public:
- [ ] `GET /delivery/fees`
- [ ] `POST /orders` (Idempotency-Key, honeypot, 5/10 min/IP + 3/hour/phone, PRICE_CHANGED, SOLD_OUT), `POST /cart/validate`, `POST /orders/track` (20/10 min), `POST /orders/find` (3/hour per IP and per e-mail, always 202)
Admin:
- [ ] `/admin/orders`: `GET` (filters), `GET /counts`, `GET /:id`, `POST` (manual), `PATCH /:id`, `PATCH /:id/contact`, `POST /:id/status`, `POST /bulk-status`, `POST /:id/delivery`, `POST /:id/cash`, `POST /:id/notes`, `POST /:id/extend-hold`, `POST /:id/email`, `GET /:id/whatsapp`, `POST /export` (CSV, formula-injection prefix). Export `toAdminOrderSummary` from `modules/orders` for WP C
- [ ] `/admin/stock`: `GET /hoodies`, `GET /stimpies`, `POST /adjust`, `POST /set`, `GET /movements`
- [ ] `/admin/deliveries`: `GET`, `POST /dispatch`, `POST /:deliveryNumber/settle`; `/admin/areas`: `GET`, `POST`, `PATCH /:id`, `DELETE /:id`; `GET|PATCH /admin/settings/delivery` (use `ctx.settings.update({ delivery })`)
- [ ] `GET /admin/overview` (incl. `setup`), `POST /admin/setup/:key/done` (stored in `settings.setup.reviewed`)
- [ ] Comms: `GET /admin/email-templates`, `PUT /admin/email-templates/:key`, `POST /admin/email-templates/:key/preview`, `POST /admin/email-templates/:key/test`, `GET|PUT /admin/whatsapp-templates`, `GET /admin/email-log`, `POST /admin/email-log/:id/retry` (placeholder lists in `lib/templates-catalog.ts`)
- [ ] Services and jobs: `services/pricing.ts`, `services/stock.ts`, `services/orders.ts`, `services/email-queue.ts`; fill `jobs/email-worker.ts` and `jobs/hold-expiry.ts`; honour `placedAt` for `seed-demo`

#### Work package C: customers, finance, insights, expenses, ad spend
- [ ] `GET /admin/customers` (`filter`, `q`), `GET /admin/customers/:id`, `PATCH /admin/customers/:id`
- [ ] `GET /admin/finance/profit`, `GET /admin/finance/cash`
- [ ] `/admin/expenses`: `GET`, `POST`, `PATCH /:id`, `DELETE /:id`; `/admin/ad-spend`: the same
- [ ] `GET /admin/insights/sales`, `/products`, `/customers` (ratios 0..1, weekday 0 = Sunday, business timezone via `lib/dates.ts`)
- [ ] `GET /admin/search?q=` (5 orders + 5 customers; needs WP B's summary mapper), `GET /admin/users` (placeholder: the single owner)

Finish line for everyone: `npm run contract:check -- --strict` (from `backend`) prints no missing endpoints.

### Gotchas

- Fastify runs hooks in registration order; `requireAdmin` is an `onRequest` hook so 401 always beats validation errors.
- `reply.send(null)` with a `204` schema is intended; the body is dropped.
- Zod 4: `.default()` on a piped/transformed schema takes the output type, use `.prefault()` for an input default.
- MySQL cannot put CHECK constraints on foreign-key columns; Prisma cannot default JSON columns.
- Argon2 verification costs about 20 ms; tests that create many admins are fine, but avoid logging in thousands of times.
- The first request of each test file spends about 2 s starting Prisma's engine; that is normal.

## UI package (`@stimpy/ui`): wiring for the web and admin workers

Package: `C:\Projects\motion\website\packages\ui` (README there has the inventory). Imports: `@stimpy/ui`, `@stimpy/ui/preset`, `@stimpy/ui/tokens.css`, `@stimpy/ui/fonts.css`, `@stimpy/ui/assets/logo/*`, `@stimpy/ui/fonts/*`. It ships TypeScript source and has no data fetching and no `next/*` imports. Commands: `npm run typecheck -w @stimpy/ui`, `npm run test -w @stimpy/ui` (303 tests), `npm run gallery:build -w @stimpy/ui` then `npm run gallery:shots -w @stimpy/ui`. Open the gallery with `npm run gallery:dev -w @stimpy/ui` (http://localhost:5290) to see every component.

### 1. Tailwind, tokens, fonts

```js
// frontend/web/tailwind.config.js and frontend/admin/tailwind.config.js (Tailwind 3.4)
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  content: [
    './src/**/*.{ts,tsx}',                    // (web: also ./app/**)
    '../../packages/ui/src/**/*.{ts,tsx}',    // REQUIRED, otherwise component classes are purged
  ],
};
```

```ts
// frontend/web/app/layout.tsx and frontend/admin/src/main.tsx
import '@stimpy/ui/fonts.css';    // self-hosted Poppins. If web uses next/font instead, skip this and set --font-sans
import '@stimpy/ui/tokens.css';
import './globals.css';           // only: @tailwind base; @tailwind components; @tailwind utilities;
```

- `frontend/web/next.config`: `transpilePackages: ['@stimpy/ui']`. Preload Poppins 400 and 700 yourself if you use `fonts.css`.
- The palette is replaced: use `bg-coral`, `bg-ink`, `bg-action` (electric blue, actions only), `bg-butter|sky|lilac`, `bg-cream`, `text-ink-70`, `border-line`, `bg-success|danger|neutral`, semantic `text-fg`, `text-fg-muted`, `bg-surface-base`, `border-base`, `border-control`. Anything else (`bg-red-500`, `shadow-md`, gradients) is simply not generated; there is no app lint rule against arbitrary colour values like `bg-[#...]` yet, so do not write them. The page body already gets `background: var(--bg)` and `color: var(--fg)` from `tokens.css`.
- Dark bands: `<Section tone="black">` (or `className="surface-dark"`), never per-component dark classes.
- Reduced motion, focus ring and tabular numbers are in `tokens.css`; do not override `:focus-visible`.

### 2. Providers (mount once at the root, inside a `'use client'` file because they take functions)

```tsx
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ServerClockProvider, ToastProvider, UIProvider, type RenderImage } from '@stimpy/ui';

const renderImage: RenderImage = ({ src, alt, sizes, priority, className, onError }) => (
  <Image src={src} alt={alt} fill sizes={sizes ?? '(min-width: 1024px) 25vw, 50vw'} priority={priority} className={className} onError={onError} />
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { offsetMs, uncertain } = useServerClockOffset();      // your hook, see 3.
  return (
    <UIProvider link={Link} renderImage={renderImage}>
      <ServerClockProvider offsetMs={offsetMs} uncertain={uncertain}>
        <ToastProvider>{children}</ToastProvider>              {/* admin: <ToastProvider persistErrors> */}
      </ServerClockProvider>
    </UIProvider>
  );
}
```

- **Link injection**: every internal `href` in `Button`, `TextLink`, `ProductCard`, `StimpieCard`, `DropCard`, `AnnouncementBar` goes through `UIProvider link`. Absolute URLs (`https:`, `mailto:`, `tel:`) always render a plain `<a>`. For React Router (admin): `link={({ href, ...p }) => <RouterLink to={href} {...p} />}`.
- **Images**: the default renders a lazy `<img>`. With `next/image` use `fill` (the box is `relative` and already has its aspect ratio: Stimpie 0.64, hoodie 4:5). Add the API upload host to `images.remotePatterns`. Pass `priority` only to the single LCP card (`<ProductCard priority>`, `<Media priority>`).
- **Logos**: bundled automatically. To serve them as static files copy `packages/ui/assets/logo/*` to `public/brand/` and pass `logoBaseUrl="/brand"` to `UIProvider`. Header: `<Link href="/" aria-label="Stimpy home"><Logo variant="full" surface="white" /></Link>` (no underline or hover colour). Footer: `<Logo variant="icon" surface="black" width={32} />`. Never place it on butter, sky or lilac.
- **Toasts**: `const toast = useToast(); toast.success('Link copied'); toast.error(msg)`. Success/info vanish after 4 s, error toasts persist only with `persistErrors` (admin). Max 3. Set `--stimpy-sticky-offset: 72px` on `<html>` (or any ancestor) while a sticky bottom bar is shown so toasts and the floating WhatsApp button sit above it. Do not toast form validation.

### 3. Server clock for countdowns

The UI does not call the API. In the app, sample `GET /health` three times (300 ms apart, `cache: 'no-store'`), then:

```ts
import { estimateClockOffset, offsetFromDateHeader, type ClockSample } from '@stimpy/ui';

const samples: ClockSample[] = [];
for (let i = 0; i < 3; i++) {
  const sentAt = Date.now(); const t0 = performance.now();
  const { time } = await api.health();                                   // ISO with ms
  samples.push({ serverTime: time, sentAt, rttMs: performance.now() - t0 });
  await new Promise((r) => setTimeout(r, 300));
}
const { offsetMs, uncertain } = estimateClockOffset(samples);            // smallest RTT wins, RTT > 3 s ignored
// fallback when /health fails: offsetFromDateHeader(res.headers.get('Date'), Date.now())
```

Feed `offsetMs` and `uncertain` to `ServerClockProvider`; re-measure every 5 minutes and when the tab becomes visible after more than 60 s. Then `<Countdown target={drop.startsAt} label="Drop 03 starts in" variant="strip" accent={drop.accentColor} onComplete={refetchDrops} staticText={serverFormattedDate} />`. `onComplete` fires once at zero: refetch `GET /drops` with `no-store` and backoff (state-and-errors 13.3) and flip the UI only when the server says `LIVE`. `useCountdown(target, offsetMs?)` is exported for custom layouts. Pass `staticText` formatted in `business.timezone` to avoid a hydration mismatch.

### 4. Money, dates, phone, WhatsApp (pure functions, safe in server components)

```ts
formatCents(4500) // $45      formatCents(4550) // $45.50     formatCents(125000) // $1,250
formatCents(4500, { fixed: true }) // $45.00 (dashboard)         formatCents(-400, { fixed: true }) // -$4.00
formatDateTime(iso, { timeZone: business.timezone })   // 14 Oct 2026, 12:30   ('device' = visitor zone)
formatRelative(iso, { timeZone })                      // just now | 12 min ago | 3 h ago | Yesterday, 18:05 | date
formatDropStart(iso, { businessTimeZone })             // visitor zone + "(Beirut time)" when it differs
whatsappLink(business.whatsappNumber, 'Hi Stimpy')     // https://wa.me/961...?text=...  or null
normalizeLebanesePhone('03 123 456') // +9613123456 (display/links only; forms send what was typed)
```

Never format the same instant on server and client with `'device'` (hydration mismatch): render `<time dateTime>` on the server and format after mount, or use the business zone.

### 5. Things to know when composing pages

- `Button` variants: `cta` (= `primary`, the ONLY blue) for purchase actions, `dark` for black (website-pages calls it `primary`), `secondary`, `ghost`, `coral`, `danger`. `href` renders a link through the injected `Link`. Never two blue buttons adjacent.
- `Badge kind=...` (CORE, LIMITED, LOW + `remaining`, SOLD_OUT, UPCOMING, ENDED, POPULAR + `label`, CUSTOM); `StatusPill status="OUT_FOR_DELIVERY"` for the dashboard; `StatusTimeline` for the track page.
- Cards take plain structural props (`HoodieSummaryLike`, `StimpieLike`, `PackLike`, `DropLike`) that the generated API client types satisfy. They link to `/shop/hoodie/{slug}`, `/shop/stimpie/{slug}`, `/drops/{slug}` unless you pass `href`. `StimpieCard selectable selected onSelect` is the Builder/pack picker (a toggle button with `aria-pressed`).
- Long API text goes through `<RichText text=... />` only. Never `dangerouslySetInnerHTML`.
- Forms: `<FormField label name error hint required><Input .../></FormField>` wires `id`, `aria-describedby`, `aria-invalid`. Map API `fields` to `error`, render `<ErrorSummary errors=[{ fieldId: 'field-<name>', message }] />` and call `focusFirstInvalid(formEl)` after a failed submit. Field ids are `field-{name}` unless you pass `id`. Do not disable the submit button for invalid forms; use `loading`.
- Loading: `Skeleton` variants (`text`, `rect`, `card`, `table-row`, `stat`) inside `<SkeletonGroup>`; `useSkeletonDelay(isLoading)` implements the 150 ms delay / 300 ms minimum; `<SlowLoadingHint loading onRetry>` shows the 8 s hint. Errors: `ErrorState onRetry requestId={error.requestId}` prints "If it keeps happening, message us and quote this code: ..." only when a request id exists.
- Overlays: `Modal`, `Drawer` (cart, right side, 420 px max), `BottomSheet`, `ConfirmModal` (destructive tone focuses Cancel). They need `title` (accessible name), restore focus to the trigger and lock scroll. Keep `closeOnEsc={false}` while a destructive request is in flight (`ConfirmModal busy` does it).
- `ZipWipe`: only on the section boundaries the plan lists (`<Section zipIn>`) and the Builder swap (`trigger="manual"`, `direction="up"`, `durationMs={ZIP_DURATION.builder}`, `outgoing={oldPanel}`, `await ref.current.play()`). Never on route changes.
- Not provided here (build in the app from these primitives): `Table/DataTable`, `Pagination`, `FileUpload`, `ColorPicker`, date inputs, `SearchField`, `Combobox`, menus, tooltip, charts, header/footer/sidebar/top bar, Builder, cart drawer, `OrderSummary`, `PackComposer`, `SubscribeForm`.

### 6. Export list (`import { ... } from '@stimpy/ui'`)

Components: `Button`, `LinkButton`, `TextLink`, `Spinner`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `SegmentedControl`, `QuantityStepper`, `FormField`, `ErrorSummary`, `ColorSwatches`, `ColorSwatch`, `ColorDots`, `SizeSelector`, `SizeChip`, `Badge`, `Tag`, `Pill`, `StatusPill`, `PriceTag`, `Media`, `Card`, `StretchedLink`, `StatCard`, `ProductCard`, `StimpieCard`, `PackCard`, `DropCard`, `Countdown`, `StatusTimeline`, `Tabs`, `TabPanel`, `Accordion`, `RichText`, `TrustStrip`, `ReviewCard`, `Avatar`, `Section`, `SkipLink`, `Logo`, `ZipWipe`, `Modal`, `Drawer`, `BottomSheet`, `ConfirmModal`, `ToastProvider`, `Banner`, `AnnouncementBar`, `Skeleton`, `SkeletonGroup`, `SlowLoadingHint`, `ProgressBar`, `EmptyState`, `ErrorState`, `CopyButton`, `WhatsAppButton`, `FloatingWhatsApp`.

Providers and hooks: `UIProvider`, `useUI`, `ServerClockProvider`, `useServerClock`, `useCountdown`, `ToastProvider`, `useToast`, `useOptionalToast`, `useSkeletonDelay`, `useIsomorphicLayoutEffect`.

Helpers and data (no React, server-safe): `cn`, `buttonClasses`, `badgeCopy`, `accentTone`, `STATUS_META`, `SURFACE_CLASSES`, `accentSurface`, `parseRichText`, `copyToClipboard`, `focusField`, `focusFirstInvalid`, `browserUrlParamAdapter`, `getFocusable`, `isExternalHref`, `mergeRefs`, `prefersReducedMotion`, constants `STIMPIE_RATIO` (0.64), `HOODIE_RATIO` (4/5), `ZIP_DURATION`, `ZIP_EASING`, `QUANTITY_MIN`/`QUANTITY_MAX`, `MAX_TOASTS`, `LOGO_FILES`, `LOGO_MIN_WIDTH`; formatters `formatCents`, `parseDollarsToCents`, `formatCount`, `formatPercent`, `pluralize`, `formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatDateRange`, `formatDropStart`, `formatCountdown`, `timeZoneCity`, `resolveTimeZone`, `isValidTimeZone`, `DEFAULT_TIME_ZONE`, `normalizeLebanesePhone`, `formatPhoneDisplay`, `phoneDigits`, `whatsappLink`, `telLink`, `relativeLuminance`, `contrastRatio`; clock `estimateClockOffset`, `offsetFromSample`, `offsetFromDateHeader`, `computeRemainingMs`, `countdownParts`, `announcementKey`, `describeRemaining`; icons `icons.*` (lucide subset: `icons.Check`, `icons.Truck`, ...). Types: `OrderStatus`, `AccentColor`, `StimpieLike`, `HoodieSummaryLike`, `PackLike`, `DropLike`, `ColorLike`, `SizeLike`, `VariantLike`, `ReviewLike`, `TimelineEntryLike`, `ImageRenderProps`, `RenderImage`, `ClockSample`, `ZipWipeHandle`, `UrlParamAdapter`, and every component's `*Props`.

Known gaps and cautions: no axe-core run (it is not installed; contrast was measured with a computed-style script over the gallery); the logos are PNG/WebP placeholders until a designer redraws SVGs; overlays have no exit animation; hover states use `brightness` filters (no extra colours).

## WP-A status

- WP-A: drops service ready. `backend/src/services/drops.ts` exports `deriveDropState(drop, stimpies, at)`, `purchaseBlockReason(stimpie, at)` (same signatures as the stub), plus `deriveStimpieStatus`, `stimpieAvailability(stimpie, threshold, at)` (-> `{ status, remaining, purchasable }`; `remaining` only when LOW), `variantAvailability(variant, threshold)`, `availableUnits`, `dropUnitsRemaining`, `isDropEnded/isDropStarted`, `ACCENT_HEX`, and for `placeOrder` / `/cart/validate`: `stimpiePurchaseProblem(stimpie, itemIndex, at)`, `assertStimpiesPurchasable(lines, at)` and `assertNoPurchaseProblems(problems)` (throw `NOT_PURCHASABLE` with `details.items`, `PurchaseProblem` shape of api section 1). A Stimpie row passed to them needs `{ id, name, active, drop: { startsAt, endsAt, endedAt } | null }` (load with `include: { drop: true }`). Pass `now()` from `lib/clock` as `at`. Tests: `test/drops-service.test.ts`.
- WP-A: DONE (catalog, uploads, drops, subscribers, content, FAQs, reviews, Builder). Decisions are in DECISIONS.md under "WP-A". Files: `src/services/drops.ts`, `src/services/uploads.ts` (+ `processUpload`), `src/modules/catalog/*`, `src/modules/uploads/routes.ts`, `src/modules/drops/*`, `src/modules/content/*` (`builder.ts` = Builder service), shared helpers `src/lib/reorder.ts` (`applyOrder` for `PUT .../order`) and `src/lib/zod-errors.ts` (`parseOrThrow(schema, value)`: Zod failure -> VALIDATION_ERROR with dotted `fields`, for bodies validated inside a service). Tests: `drops-service`, `catalog-public`, `catalog-admin`, `uploads`, `drops-public`, `drops-admin`, `content`, `builder` (all in `backend/test`).
- For WP-B: purchasability and statuses come from `services/drops.ts` (see the line above). Public Stimpie mapping (`status`, `remaining`, `purchasable`, drop summary) is `toPublicStimpie(row + drop, threshold, at)` in `modules/catalog/mappers.ts` if you need the same shape. `stimpies.position`/`hoodies.position` are maintained by the catalog module. Admin drop statistics treat order stock lines in state RESERVED/SOLD as "sold" (see DECISIONS): WP-B's stock service must keep line states accurate.
- For the dashboard/web engineers: `/admin/content/about` is `{ about: string }`; `/admin/content/how-it-works` is `{ steps, promises, faqs }`; `GET/PUT /admin/builder` takes and returns `hoodieId` (+ read-only `hoodie`), `assetsReady` and `warnings`; `model3d.url` must come from `POST /admin/uploads` with `purpose: "builder-model"` (the server fills `sizeBytes`); a colour shows in the public Builder only once its look is set; admin lists of FAQs and reviews are `Page<...>`. Uploads: multipart field `file` (+ optional text field `purpose`), images become WebP (transparent PNGs stay PNG), errors 413 `details.maxBytes` / 415 `details.allowed`.
- WP-A did not change `prisma/schema.prisma` and added no dependency.
- BUG for WP-C (found by WP-A): `backend/src/lib/like.ts` `likeEscape` returns the literal text `${c}` for `%` and `_` (the template string is written `${c}`, i.e. an escaped dollar sign), so `likeEscape("50%")` is `50${c}`. WP-A uses its own correct `escapeLike` in `lib/sql-like.ts` (backslash + character); WP-C can switch to it or fix the template (`"\\" + c`).

## WP-C status

Enqueue API is USABLE (typechecked; tests landing next). Everything below is exported from `backend/src/services/email-queue.ts` unless noted. `db` may be the Prisma client or your `tx`; the e-mail row then commits/rolls back with your order transaction. Nothing sends inside the call.

```ts
// Customer e-mail about an order, sent to orders.contact_email. Idempotent per (order, template): returns null when skipped
// (no contact_email, master switch off, template disabled, or that template was already queued for this order).
enqueueOrderEmail(ctx, tx, { orderId, template: 'order_received'|'order_confirmed'|'order_out_for_delivery'|'order_delivered'|'order_cancelled' }): Promise<{ id: number } | null>
// Manual resend (POST /admin/orders/:id/email { template }): skips the one-per-(order,template) rule AND the switches.
enqueueOrderEmail(ctx, db, { orderId, template, resend: true })
// Free-form (POST /admin/orders/:id/email { subject, body }): placeholders in it are filled from the order.
enqueueOrderEmail(ctx, db, { orderId, template: 'custom', custom: { subject, body } })
// New-order alert to notifications.founderEmail (only if onNewOrder + founderEmail set; independent of the customer master switch). One per order.
enqueueFounderNewOrderAlert(ctx, tx, { orderId }): Promise<{ id: number } | null>
// Low-stock alert (onLowStock + founderEmail). YOU decide when an item first crosses down to the threshold; call it once per crossing.
enqueueLowStockAlert(ctx, db, { itemType: 'HOODIE_VARIANT'|'STIMPIE', itemId, name, available, threshold })
// POST /orders/find: queue the "orders_lookup" mail with up to the 10 most recent orders (returns null for an empty list).
enqueueOrdersLookupEmail(ctx, db, { to, orders: [{ number, placedAt, status, totalCents }] })
// Original stub signature is unchanged (generic, caller supplies values):
enqueueEmail(ctx, db, { orderId?, to, template, values?, custom?, force? })
processDueEmails(ctx)      // jobs/email-worker.ts already calls it
```

Call the order e-mail functions AFTER the order row, its items and its new status/`deliveryNumber`/`cancelReason` are written inside the transaction (they read the order through `db`). Suggested wiring: placeOrder -> `order_received` (or `order_confirmed` for a manual CONFIRMED order) + `enqueueFounderNewOrderAlert`; changeStatus -> CONFIRMED `order_confirmed`, OUT_FOR_DELIVERY `order_out_for_delivery`, DELIVERED `order_delivered`, CANCELLED `order_cancelled`; none for PACKED/RETURNED. Correcting a delivery number: do nothing (idempotency would skip it anyway).

WhatsApp (`services/whatsapp.ts`): `buildOrderWhatsapp(ctx, db, { orderId, template })` -> `{ to, text, url }` for `GET /admin/orders/:id/whatsapp` (throws VALIDATION_ERROR for an unknown template, NOT_FOUND for an unknown order); `customerConfirmationWhatsappUrl(ctx, { orderNumber, customerName, totalCents, items: [{ name, qty, detail }] })` -> url | null for `POST /orders` `whatsappUrl`. Formatting helpers in `services/template-values.ts`: `formatItemsText(items)`, `trackingUrl(webUrl, number)`.

WP-C also owns (do not duplicate): `GET /admin/overview`, `POST /admin/setup/:key/done`, `GET /admin/search`, `GET /admin/users`, customers, finance, expenses, ad-spend, insights, and all of `modules/comms` (email templates, whatsapp templates, email log, retry). NOT mine: `GET /admin/orders/counts`, `/admin/orders/:id/whatsapp`, `/admin/orders/:id/email` (WP-B routes, call my services). WP-B: please export `toAdminOrderSummary` from `modules/orders` when ready; until then WP-C uses a private mapper.

### WP-C notes for WP-A / WP-B (added later)
- `lib/like.ts` `likeEscape(text)`: Prisma `contains` does NOT escape `%` and `_`; use it for every user-typed search text (order list `q` too).
- `services/order-text.ts` (WP-B) formerly built `trackingUrl` from `ctx.config.webUrl[0]`; `config.webUrl` is a string (first origin), so `[0]` is its first character. Use `ctx.config.webUrl` (WP-C's `services/template-values.ts` `trackingUrl(webUrl, number)` does).
- WP-C reads order summaries through `modules/orders/mappers` (`toAdminOrderSummary`, `summaryInclude`) and `modules/orders/schemas` (`adminOrderSummarySchema`); please keep those exports.
- Definitions chosen for overview/customers/finance/insights are in DECISIONS.md under `[overview]`, `[customers]`, `[finance]`, `[insights]`. `unitsSold` of the Overview live drop = sold + reserved units; align `/admin/drops` `unitsSold` if you want the two to agree.

## WP-B status

WP-B (orders, stock, deliveries) is complete. Code: `backend/src/services/{orders,stock,pricing,order-admin,order-text}.ts`, `src/modules/{orders,stock,deliveries}/`, `src/lib/semaphore.ts`, `src/jobs/hold-expiry.ts`. Tests: `test/orders-{place,concurrency,status,admin}.test.ts` and `test/stock-deliveries.test.ts` (shared helpers in `test/helpers/orders.ts`, including `assertStockInvariants`, which cross-checks every counter against the stock lines).

- Public API: `POST /cart/validate`, `POST /orders` (Idempotency-Key header, honeypot field `hp`), `POST /orders/track`, `POST /orders/find`, `GET /delivery/fees`. Admin: everything in api-reference 5.3 (orders), 5.5 (stock) and 5.8 (deliveries, areas, `/settings/delivery`).
- Service entry points other code may call: `placeOrder(ctx, input)`, `changeStatus(ctx, { orderId, to, userId, deliveryNumber?, cancelReason?, restock?, note?, at? })`, `setDeliveryNumber`, `autoExpireUnconfirmed` (hold-expiry job), `adjustStock` / `setStock` / `reserveStock` (stock.ts).
- Exports WP-C depends on (keep them): `modules/orders` exports `toAdminOrderSummary`, `summaryInclude`, `adminOrderSummarySchema`; `services/order-text.ts` exports `itemsSummary`. Order e-mails go through WP-C's `enqueueOrderEmail`, `enqueueFounderNewOrderAlert`, `enqueueLowStockAlert` and `enqueueOrdersLookupEmail`.
- `orderTxGate` (`lib/semaphore.ts`): at most 3 order-writing transactions run at once per process. Wrap any new long transaction that also takes the order-counter lock in it; otherwise a burst of orders exhausts the Prisma connection pool (P2024).
- Demo data: `npm run db:seed`, then `npm run db:seed:demo` (30 orders in every status with spread timestamps; refuses to run twice without `--force`). It was run against `stimpy_wpb`.
- Fixed in shared code: `lib/like.ts` (`likeEscape` produced the literal text `${c}`; it now escapes with a real backslash and escapes the backslash itself); `lib/order-number.ts` also accepts `#1001` and `STP1001`. Stock movements now carry the app-clock timestamp instead of the database default.
- Verification: the suites above (real MySQL; 50-way oversell in-process and over HTTP; Mailpit mails per status with a unique recipient), plus a live pass against a running server on port 4102 (customer and admin journeys, CSV over HTTP, 50 simultaneous orders for 5 units gave exactly 5 orders and 45 SOLD_OUT, SQL stock invariants before and after).
- Decisions: DECISIONS.md, section "WP-B: orders, stock, deliveries".

## Admin foundation (FE-Admin1)

DONE: shell, auth flow, shared components, Settings (Account / Business / Notifications / Customer email) and Products (Hoodies / Stimpies / Packs / Options / Size chart) in `frontend/admin`. Verified: `tsc` clean, 46 vitest tests, 14 Playwright tests (`e2e/tests/admin-foundation`, phone-360 + desktop-1280, run with `E2E_API_URL=http://localhost:<api>`; login is rate limited, restart the API if you see 429 after many runs), screenshots viewed at 360 and 1280.

Where things are (all under `frontend/admin/src`):
- `app/router.tsx`: one lazy chunk per area. `pages/<area>/index.tsx` default-exports the WHOLE area and receives `<area>/*`, so declare nested `<Routes>` inside it (see `pages/products/index.tsx`). Placeholders (replace the file): overview, orders, stock, drops, customers, finance, insights, content, deliveries. `app/navigation.ts` is the single nav/permission list (`layout/navBadges.ts` `setNavBadge('stock', n)` feeds badges).
- Auth: `auth/` (session query, `RequireAuth`, `LoginPage`, `sessionFlow`, `expiry`, `drafts`, `broadcast`, `roles`). A 401 anywhere outside login/me/logout runs the expiry flow once. Forms keep unsaved values across expiry via `useFormDraft(form)`; guard leaving with `useUnsavedChangesGuard(isDirty)` (`lib/unsavedChanges`).
- API: `api/client.ts` (`api.GET(...)` + `unwrap`), `api/errors.ts` (`describeError`, `useNotifyError`), `api/queryKeys.ts`. Note: `sessionFlow` navigates BEFORE wiping the cache and passes the login banner reason through `takePendingLoginState()` because the route guard's redirect drops router state.
- Components (`components/`): `DataTable` (table from md, cards below; `selectable`, sort, `reorder={{onMove,onDragMove}}`), `Pagination`, `SearchField`, `FilterBar`, `FileUpload` (+ `lib/upload.ts`: rules, `validateFile`, XHR upload with progress), `ColorPicker`, `DateTimeInput` (business time zone), `Combobox`, `Menu`, `Tooltip`, `Timeline`, `ConfirmDialog`, `PageHeader`/`Breadcrumbs`, `QueryBoundary` (skeleton / 404 / 403 / retry / stale banner). Forms (`components/form/`): `AdminForm` (RHF provider, error summary, API `fields` mapping via `applyApiErrors`), `Field`, `TextField`, `TextAreaField`, `SelectField`, `SwitchField`, `MoneyField`, `ComboboxField`, `FormSection`, `StringListField`, `ImageListField`. Schemas helpers: `lib/schemas.ts` (`moneySchema`, `dollarsToCents`, `slugify`, `emailSchema`, `intStringSchema`). URL state: `lib/urlState.ts` (`useUrlState`, `paginationParams`). Reorder: `lib/reorder.ts` (always send the FULL id list). Settings hooks: `lib/settings.ts` (`useSettings`, `useSaveSettings`; the business time zone feeds every formatter).
- Layout (`layout/`): sidebar, bottom bar + More, top bar, global search (`/`, Ctrl/Cmd+K), notification bell (30 s `orders/counts` poll, `afterId` lookup, sound / browser notifications), shortcuts (`?` help; `n`, `g` then letter), connection banners, error boundary. Call `ignoreOrder(id)` from `useNotifications()` after creating an order in this dashboard so it is not announced.
- Products notes: creating a hoodie/colour/size shows the "zero-stock variants created" notice; delete falls back to "hide instead" on 409; size chart PUT uses `new:<index>` keys for new columns; artwork off the 0.64 aspect by more than 2% warns. Editors: right drawer from `lg`, full page below.
- Tests: `frontend/admin/test/setup.ts` drops AbortSignals from `Request` (jsdom vs undici); use `test/helpers.tsx` (`stubFetch`, `json`, `apiError`).
- Not done / for later: Users tab in Settings is a disabled "Later" tab. Pill tone and a few component prop names were taken from `@stimpy/ui` as found.

## Web foundation (FE-Web1)

Status: typecheck, 42 unit tests (`npm run test -w @stimpy/web`), `next build` and the Playwright smoke (`e2e/tests/web-foundation`, 22 tests at 360 and 1280, run against API 4111 / web 3101) pass. Contract endpoints used: options, size-chart, products/hoodies(+slug), products/stimpies(+slug), packs, drops(+slug, subscribe), content, delivery/fees, cart/validate, health.

Done (frontend/web): root layout (skip link, announcement, header, footer, cart drawer, floating WhatsApp, offline banner, route-change focus, UTM capture, console-only error reporting), cart store (`features/cart`, localStorage `stimpy.cart` v1, 30-day expiry, validate-on-open), pages `/`, `/shop` (URL-driven tabs and Stimpie filters), `/shop/hoodie/[slug]` (PackComposer, preset `?color&size&pack=<slug>&stimpie=<slug,...>` read client-side), `/shop/stimpie/[slug]` (all statuses), `/drops`, `/drops/[slug]` (countdown hand-off, 30 s poll while LIVE), `/how-it-works`, `/delivery-returns`, `/help?tab=size|care|faq`, `/about`, `/legal`, sitemap, robots, JSON-LD, loading/error/not-found/global-error.

Placeholders for FE-Web2: `/builder`, `/checkout`, `/track`, `/order/[number]/thanks`. The home page Builder slot is `features/home/BuilderTeaserSlot.tsx` (static fallback now). Reuse: `PackComposer` + `composer.ts` (emits exact `CartItem`), `useAddToCart`, `StimpieAddCard`, `DropCountdown`/`useDropHandoff`, `SubscribeForm`, `HeroMedia`, `Gallery`, `lib/errors.ts` (`toUserError`), `lib/seo.ts`, `lib/jsonld.tsx`, `lib/data.ts`. Cart validation: `features/cart/validate-cart.ts`. Checkout should call `cartStore` `clear()` after success.

Notes: hoodie, Stimpie and drop detail pages build as dynamic (no `generateStaticParams`), still cached via fetch `revalidate`. On this machine keep `.next` on D: (junction) and set `NODE_PATH=<repo>/node_modules` plus `STIMPY_NO_BUILD_CACHE=1` for dev/build; delete `.next` after builds. The subscribe e2e can hit the API rate limit if re-run repeatedly. Radio-based filters update after the server round trip (no optimistic state yet).

## Builder package (`@stimpy/builder`): for the dashboard engineer (Content -> Builder)

Package: `packages/builder` (React 19, TS strict, ESM, `main: src/index.ts`, no `next/*`, no data fetching). Linked into `@stimpy/web` (`transpilePackages`, Tailwind `content` entry `../../packages/builder/src/**/*.{ts,tsx}`). The dashboard must do the same two things (transpile/bundle the package; add the same Tailwind content line) and mount `@stimpy/ui`'s `UIProvider` (the Builder takes its `Link` from it, and uses `Button`, `Modal`, `Badge`, `ToastProvider` optionally). Commands: `npm run test -w @stimpy/builder` (123 tests), `npm run typecheck -w @stimpy/builder`.

### Using it

```tsx
import { Builder, type BuilderData, type BuilderHandle, type ThrottleSimulator } from '@stimpy/builder';

<Builder
  data={data}                       // BuilderData, see below. Re-render with new data to live-update (no API call needed)
  surface="page"                    // 'page' (full) | 'teaser' (compact, 2D only)
  throttleSimulator="slow-3g"       // 'none' | 'slow-3g' | 'slow-2g' | 'low-tier' | { signals?: EnvSignals, extraFrameMs?: number }
  force3d                           // dashboard: bypass the SwiftShader / slow-frame verdicts so 3D can always be previewed
  hidePhotoLinks                    // hide "See real photos" / hoodie photo links
  track={undefined}                 // analytics callback (event, props); the dashboard passes nothing
  ref={handleRef}                   // BuilderHandle
/>
```

Without `onAddToCart` the whole purchase UI (price, size sheet, Add to cart) is not rendered: that is the dashboard preview. Props of the website island: `initialShare` (parsed share link), `syncUrl`, `shareBaseUrl`, `onAddToCart(item, summary)`, `source`, `hrefs` (override "See real photos"/size guide/shop/full-builder links), `stickyBar`, `debug3d`, `breakShader` (test hooks). Also exported separately: `<BuilderStage2D />`, `<BuilderCanvas3D />` (client-only, lazily imports `three/engine`), `Canvas3DBoundary`, the parts (`ColorSwatchRow`, `StimpieCarousel`, `PackSelector`, `SlotChips`, `SizeSheet`, `ModeToggle`, `Controls3D`, `BuilderStaticFallback`) and every pure function (see `src/index.ts`).

### Feeding unsaved form state

`BuilderData = { config, colors, stimpies, packs, hoodie? }`, all structural types in `src/types.ts` (the generated API client types satisfy them; the website passes them through `frontend/web/features/builder/data.ts`).

| Field | Dashboard source |
|---|---|
| `config` | The form object shaped like `GET /builder/config`: `mode`, `effectiveMode`, `defaultView`, `hoodie`, `model3d` (`url`, `sizeBytes`, `backPanelMesh`, `panelAspect`, `camera {position,target,fov}`, `lighting`), `colors[]` (`colorId`, `tint`, `texture3d`, `hoodieImage2d`, `overlay2d`, `placement2d`), `stimpieTextures[]`. The Builder reads `effectiveMode`, so for the preview set `effectiveMode: 'BOTH'` (and `defaultView`) yourself: that gives the 2D/3D toggle regardless of the mode being edited. Uploaded files that are not saved yet can be `blob:`/object URLs for images; for the GLB use a blob URL too (the engine `fetch`es it; CSP of the dashboard must allow `blob:` in `connect-src`/`img-src`). |
| `colors` | `GET /options` colours (`id,name,hex,position,images?`). A colour with no `config.colors` entry is hidden (this mirrors the public page). |
| `stimpies` | Any list in the `BuilderStimpie` shape (a sample is enough; the placement editor's sample picker can drive `initialShare.stimpie`). |
| `packs`, `hoodie` | Optional for the preview (`packs: []`, `hoodie: null` hides pack/size UI). |

Live updates without remount: placement, images, overlay, tint, texture3d, lighting and `model3d.camera` are applied on prop change (camera via `setCameraConfig`, lighting via `setLighting`, tint animates 150 ms). Changing `model3d.url`/`backPanelMesh`/`panelAspect` recreates the 3D scene (a new GLB is loaded).

### Reading the orbit camera ("Use current preview view")

`const ref = useRef<BuilderHandle>(null)`; `ref.current?.getCameraView()` returns `{ position: [x,y,z], target: [x,y,z], fov } | null` (null when the 3D view is not active). `ref.current?.setCameraView(view)` moves it. `getView()` is `'2d' | '3d' | 'static'`. The values are exactly what `PUT /admin/builder` wants in `model3d.camera`.

### Throttle simulator and test overrides

- `throttleSimulator`: `'slow-3g'` (3D waits for the "Load 3D (about N MB)" tap), `'slow-2g'` (same, never automatic), `'low-tier'` (2 GB / 2 cores: starts in 2D, adds 30 ms per 3D frame so the real sampler falls back to 2D), or `{ signals, extraFrameMs }`. It re-runs the decision order when the value changes.
- `force3d={true}`: skips the software-renderer check and the slow-frame verdict (the dashboard runs on developer GPUs but also in headless Chrome). `force3d="renderer"` skips only the software check so the real frame sampling still runs (used by e2e). A runtime failure (GLB 404, corrupt GLB, missing panel mesh, context lost) still falls back to 2D even with `force3d`.
- Website test overrides (read only when the build sets `NEXT_PUBLIC_BUILDER_TEST_OVERRIDES=1`): `?builder3d=force`, `?builder3d=renderer`, `?builder3dframe=<ms>`, `?builder3dshader=break` (see `frontend/web/features/builder/overrides.ts`). With the override on, `window.__stimpyBuilder3d` exposes `{ scene, camera, renderer, controls, panel, uniforms, handle, info(), busy(), textureKeys(), frames, shaderFailed }`.

### What the website wires (reference for the dashboard)

`frontend/web/app/builder/page.tsx` (server: fetches config/options/stimpies/packs/hoodie with the documented revalidate windows, `generateMetadata` for share links, static fallback when a call fails) -> `features/builder/BuilderClient.tsx` (cart via `useAddToCart`, `track`, `syncUrl`). `features/home/BuilderTeaserSlot.tsx` renders the compact teaser (async server component: shares the cached fetches, falls back to the old static strip when no colour has a usable 2D asset).

### Behaviour worth knowing

- First render is always 2D markup (server-safe, hoodie image = LCP with `fetchpriority=high`); the decision order runs after mount; the 3D canvas fades in over the 2D poster when its first frame is ready.
- `three` is only reachable through `import('./three/engine')` inside `BuilderCanvas3D`'s effect: it is not in the JS of `/` or `/builder` unless 3D is chosen. The EXT_meshopt WASM decoder is loaded only for GLBs that declare it (strict CSPs then need `'wasm-unsafe-eval'`).
- CSP of the host must allow: the API origin in `img-src` and `connect-src` (GLB `fetch`, textures use `crossOrigin=anonymous`).
- Session keys: `stimpy.builder.view` (explicit 2D/3D choice), `stimpy.builder.tier` (`disabled` after a slow-frames fallback, or the settled tier), `stimpy.builder.fallback.<REASON>` (once-per-session reports), `stimpy.size` (remembered size).
- The seed's builder camera (`[0,0.2,3.2]`, fov 35) is for the FRONT of the model; the model's recommended back camera is in `backend/seed-assets/models/hoodie.meta.json` (`[0,0.02,-2.4]`, fov 32). See "Open items" in the final report.

## Admin orders and stock (FE-Admin2)

DONE in `frontend/admin/src`: **Overview**, **Orders** (list, detail, status actions, delivery number, contact / delivery edit, notes, emails sent + resend + free-form email, WhatsApp, bulk status, CSV export, manual order, print label and delivery sheet), **Stock** (hoodie grid, Stimpies, movements, adjust / set dialog), **Deliveries** (out, delivered with cash settlement, fees and areas, dispatch dialog) and **Customers** (all, repeat, subscribers, detail). The placeholder pages are gone.

Where things are (`frontend/admin/src`):
- `pages/orders/`: `index.tsx` (routes `/orders`, `/orders/new`, `/orders/print?ids=`, `/orders/:id`, `/orders/:id/label`), `OrdersList.tsx`, `OrderDetail.tsx`, `StatusActions.tsx` (`StatusActions` bar from `allowedTransitions`; `OrderStatusDialog` opens the same dialogs for an order known by id), `DeliveryNumberField.tsx` (field + advisory duplicate check), `OrderDialogs.tsx` (contact, delivery, delivery number, extend hold, email, exchange help), `NewOrder.tsx`, `PrintViews.tsx`, `BulkResultDialog.tsx` (reuse for any per-item failure list), `api.ts` (all order hooks and `invalidateOrderCaches`), `status.ts` (labels, tabs, bulk actions, WhatsApp default template), `catalog.ts` (public catalog reads for the order form), `parts.tsx` (`OrderNumber`, `HoldExpiredBadge`, `PaymentState`, `useOpenWhatsapp`).
- `pages/stock/`, `pages/deliveries/`, `pages/customers/`, `pages/overview/index.tsx`.
- Shared additions: `lib/links.ts` (`telHref`, `mailtoHref`, `whatsappDigitsLink`, `isSafeWhatsAppUrl`, `openWhatsAppTab`), `lib/download.ts` (`saveBlob`, `filenameFromDisposition`), `lib/refdata.ts` (`useAreas`, `useOverview`, `useStockBadgeFeed`), `api/client.ts` `getPublicApi()` (credential-less client for public endpoints; public CORS does not allow credentials).
- For FE-Admin3 / Finance: `pages/deliveries/api.ts` exports `useSettleDelivery()` (`POST /admin/deliveries/:deliveryNumber/settle`), `useSettleOrder()` (`POST /admin/orders/:id/cash`) and `invalidateCashCaches`; `pages/orders/BulkResultDialog` for partial results; `pages/orders/parts` `OrderNumber`, `EmailFailedBadge`. Overview attention links are `attentionLink()` in `pages/overview`.
- Changes to FE-Admin1 files (all backwards compatible): `layout/AppShell.tsx` mounts `useStockBadgeFeed()`; `layout/Sidebar.tsx` gets `print:hidden`; `layout/notifications.tsx` new-order toast has an **Open** / **View** action; `styles/globals.css` print rules (`.print-page`, shell hidden, toasts hidden); `packages/ui` `Toast` accepts `action: { label, onClick }`.
- Tests: `frontend/admin/test/orders-status.test.tsx`, `orders-list.test.tsx`, `order-new.test.tsx`, `stock-deliveries-customers.test.tsx` (+ `orderFixtures.ts`; `forceDesktop()` makes jsdom report min-width queries as matching). Playwright: `e2e/tests/admin-orders/` (`orders.spec.ts`, `helpers.ts`; needs `mysql.exe` access to the DB named by `E2E_DB`, default `stimpy_fa2`, and Mailpit). Run: `E2E_ADMIN_URL=http://localhost:5273 E2E_API_URL=http://localhost:4151 npx playwright test tests/admin-orders --project=desktop-1280`. Login is rate limited (5 per 15 min per IP and email) and each run logs in once: restart the API between runs. Run the dashboard as a build (`vite build` + `vite preview`) on a loaded machine: the dev server was flaky under memory pressure.
- Not done: `j` / `k` list selection (the shell help lists no such shortcut either), a Playwright check of the Subscribers CSV export and of the customers WhatsApp link, undo for stock changes (by design none), and the Overview "Open" link does not mark REVIEW rows done by itself.

## FE-Admin2 findings

See the final report of this work package. API behaviour worth knowing (no defects found that block the UI):
- `GET /admin/orders?q=1005` also matches phone digit substrings (digits-only queries match the order number by suffix AND phones containing those digits), so a bare four-digit search can return several orders. Documented in DECISIONS (WP-B search), noted here because the top-bar search and the list search show all matches.
- `POST /admin/deliveries/dispatch` lists a number reused inside the same request under `warnings`; the dashboard shows the result dialog even when nothing failed.
- Public endpoints (`/products/*`, `/packs`, `/delivery/fees`) send CORS without `Access-Control-Allow-Credentials`; a `credentials: 'include'` fetch from the dashboard to them is blocked by the browser. The dashboard reads them with a credential-less client.

## CRM Phase 1: Customer Profile, Stats & Timeline

Status: Phase 1 is fully implemented and verified across backend, generated API client, and frontend admin.

### Backend Endpoints Added
- `GET /api/v1/admin/customers/:id/profile` (returns customer contact details, `orderCount`, `lifetimeValueCents`, `averageOrderValueCents`, `firstOrderAt`, `lastOrderAt`, `returnedCount`, `warning`, `favouriteColor` / `favouriteColorHex`, `favouriteStimpie` / `favouriteStimpieType`, and `recentOrders`).
- `GET /api/v1/admin/customers/:id/timeline` (returns merged activity timeline from `orders`, `order_events`, `order_notes`, and `email_log` with cursor-based pagination `limit` + `cursor`).

### Automated Test Coverage
- `backend/test/crm-phase1.test.ts`: 6 tests against real MySQL verifying:
  - Zero-order customer stats, favourites, and empty order list.
  - Multi-order status aggregates: proper exclusion of `CANCELLED` and `RETURNED` orders from LTV, correct AOV computation, correct favourite Stimpie and favourite colour item counts, and top-5 recent orders sorting.
  - 404 for unknown customer, 400 for invalid ID.
  - Empty timeline pagination.
  - Merged timeline chronological sorting and cursor pagination across orders, status events, notes, and email logs.
- `backend/test/customers.test.ts`: 12 passed.
- `backend/test/health-openapi.test.ts`: 7 passed.
- `frontend/admin/test/stock-deliveries-customers.test.tsx`: 20 passed.
- `packages/api-client`: generated and typechecked cleanly.
- `frontend/admin`: built with 0 errors via `npm run admin:build`.

### Browser Verification
- Tested with Playwright in system Chrome at both `desktop-1280` and `phone-360` viewports (`website/e2e/tests/crm-phase1.spec.ts`).
- Confirmed:
  - Login and customer navigation.
  - Stat tiles rendered with exact figures and colour swatches.
  - Contact row actions (copy, tel, mailto, WhatsApp).
  - Top 5 recent orders table (desktop) / cards (mobile).
  - Activity timeline events with chronological display and "Load older activity" pagination.
  - Mobile responsiveness: no horizontal scroll (`scrollWidth <= innerWidth + 1`), stat tiles wrap gracefully into 2 columns.
- Screenshots saved: `test-results/crm-phase1-desktop-1280.png` and `test-results/crm-phase1-phone-360.png`.

## Settings: Configurable Email SMTP

Status: Fully implemented and verified across backend, API client, and frontend admin.

### Backend Changes
- Added `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword`, and `smtpSecure` to `emailShape` in `backend/src/services/settings.ts`.
- Updated `createSmtpTransport` in `backend/src/lib/email-transport.ts` and `createContext` in `backend/src/context.ts` to dynamically resolve the active SMTP configuration on send.
- When `smtpHost` is configured, outgoing transactional emails use the configured host, port, credentials, and TLS settings. When left blank/null, it automatically falls back to environment defaults (`config.smtp`).

### Frontend Changes
- Added the "SMTP server configuration" section to Settings -> Customer email tab (`frontend/admin/src/pages/settings/CustomerEmailTab.tsx`).
- Fields: SMTP host, SMTP port, SMTP username, SMTP password, and SSL/TLS switch.
- Fully wired to form draft, unsaved changes guard, validation, and `useSaveSettings()`.

### Verification
- `backend/test/smtp-settings.test.ts`: 5 tests against real MySQL verifying default null values, persistence via `PATCH /admin/settings`, port validation, and dynamic transport behavior.
- `backend/test/settings.test.ts`: 14 tests passing.
- `e2e/tests/settings-smtp.spec.ts`: Playwright test in system Chrome at desktop (1280px) and phone (360px) width verifying form rendering, filling, saving, toast notification, and persistence upon reload.
- Full-page screenshots saved: `test-results/settings-smtp-desktop-1280.png` and `test-results/settings-smtp-phone-360.png`.

## Stock: Adjustable Reserved Count

Status: Fully implemented, tested, and verified across backend, API client, and frontend admin.

### Backend Changes
- `backend/src/services/stock.ts`:
  - Added `setReservedRow(tx, ref, reserved)` for atomic updates of `reserved` count on `hoodie_variants` and `stimpies`.
  - Extended `adjustStock` to support `field?: 'QUANTITY' | 'RESERVED'`. When adjusting `RESERVED`, verifies `0 <= reserved + delta <= quantity`, executes row update, and logs a movement with `field: 'RESERVED'` and `reason: 'CORRECTION'`.
  - Extended `setStock` to support `field?: 'QUANTITY' | 'RESERVED'`. When setting `RESERVED`, validates non-negative integer, enforces `reserved <= quantity`, and logs `CORRECTION` movement if value changed.
- `backend/src/modules/stock/routes.ts`:
  - Updated `adjustBody` to accept optional `field: 'QUANTITY' | 'RESERVED'`.
  - Updated `setBody` to accept optional `field: 'QUANTITY' | 'RESERVED'` and `reserved` parameter.
  - Regenerated OpenAPI specs (`docs/openapi.json`) and API client (`packages/api-client/src/schema.d.ts`).

### Frontend Changes
- `frontend/admin/src/pages/stock/api.ts`:
  - Updated `AdjustInput` and `useStockChange` to pass `field: 'RESERVED'` and `reserved` payload when applicable.
- `frontend/admin/src/pages/stock/AdjustDialog.tsx`:
  - Added field selection: interactive stat cards ("On hand", "Reserved", "Available") and pill tabs (`On hand (quantity)` / `Reserved`).
  - Added support for adjusting (delta with +/- controls) and setting (total numeric input) reserved stock.
  - Implemented real-time preview computation and bounds checking (`0 <= reserved <= quantity`).
  - Mapped conflict/validation errors cleanly.
- `frontend/admin/src/pages/stock/StimpiesTab.tsx`:
  - Made the `Reserved` table column cell a clickable action opening `AdjustDialog` with `initialField: 'RESERVED'`.

### Verification
- `backend/test/stock-deliveries.test.ts`:
  - 10/10 stock tests passing, including tests for `adjust reserved` and `set reserved`.
- `frontend/admin/test/stock-deliveries-customers.test.tsx`:
  - 22/22 tests passing, including new tests for reserved adjustment tabs, bounds validation, real-time preview, and body serialization.
- `npm run contract:check`: Passed with 135/135 matching routes and 0 undocumented endpoints.
- `npm run admin:build`: Succeeded with 0 errors.
- `npm run api:typecheck`: Succeeded with 0 errors.



## Production configuration preflight (5 October 2026)

Production startup/build configuration now rejects localhost/example public endpoints, insecure public URLs, local or test/dev databases, and Mailpit/local SMTP. Full required values and release checks are in [PRODUCTION-PREFLIGHT.md](PRODUCTION-PREFLIGHT.md). Validate with `npm test -w @stimpy/api -- test/config.test.ts`, `npm run test -w @stimpy/admin -- helpers-pure.test.ts`, and `npm run test -w @stimpy/web -- env.test.ts`. No live deployment target was available, so this is configuration hardening and a runbook, not production acceptance.
