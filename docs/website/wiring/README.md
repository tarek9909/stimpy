# Wiring: How Everything Connects

**Purpose and audience.** This document defines how the pieces of the Stimpy system are connected to each other on a developer machine: which process runs where, which ports, how the apps call the API, how cookies and CORS work, how configuration flows, how the typed API client is produced, and the exact order to start things. It is the document to read before creating any project folders. Everything is **local-only**; production deployment is deliberately out of scope for now (see the [plan](../../../stimpy_website_plan.md)).

> **Status: documentation only.** Nothing described here exists yet.

## Contents

1. [The system at a glance](#1-the-system-at-a-glance)
2. [Processes, ports and URLs](#2-processes-ports-and-urls)
3. [Local infrastructure (Docker)](#3-local-infrastructure-docker)
4. [Configuration and environment files](#4-configuration-and-environment-files)
5. [Browser ↔ API wiring](#5-browser--api-wiring)
6. [Shared packages and the typed client](#6-shared-packages-and-the-typed-client)
7. [Keeping the contract honest](#7-keeping-the-contract-honest)
8. [Data flows end to end](#8-data-flows-end-to-end)
9. [Day-one setup, in order](#9-day-one-setup-in-order)
10. [Scripts reference](#10-scripts-reference)
11. [Common problems](#11-common-problems)
12. [Moving to production later](#12-moving-to-production-later)

---

## 1. The system at a glance

```
                          ┌────────────────────────────────────────────┐
  Customer's phone ─────► │  apps/web   Next.js   http://localhost:3000  │
  (Instagram link)        │  server-side fetch + browser fetch            │
                          └──────────────────────┬─────────────────────┘
                                                 │ HTTPS-less JSON (local)
  Founder's phone/PC ───► ┌──────────────────────┐│
                          │ apps/admin  Vite SPA ││   cookies: credentials: "include"
                          │ http://localhost:5173││
                          └──────────┬───────────┘│
                                     ▼            ▼
                          ┌────────────────────────────────────────────┐
                          │  apps/api   Fastify   http://localhost:4000  │
                          │  /api/v1/**   /uploads/**   /docs            │
                          └───────┬───────────────┬───────────┬────────┘
                                  │ SQL           │ SMTP      │ files
                                  ▼               ▼           ▼
                       MySQL 8 (Docker)   Mailpit (Docker)   apps/api/uploads/
                       localhost:3317     smtp 1025, web 8025

                packages/ui  ── brand tokens + components used by web and admin
                packages/api-client ── generated from the API's OpenAPI document
```

Three ideas to keep in mind:

1. **One API, two clients.** Neither frontend touches the database. All business rules live in the API.
2. **The contract is the boundary.** [api-reference.md](../backend/api-reference.md) is written first; the OpenAPI document generated from the running API is checked against it ([§7](#7-keeping-the-contract-honest)); the typed client is generated from the OpenAPI document ([§6](#6-shared-packages-and-the-typed-client)).
3. **Configuration is data.** Anything the founder may want to change (colours, sizes, size chart, fees, Builder mode, FAQs, email copy, prices) is in the database and edited in the dashboard, so frontends fetch it instead of hard-coding it.

---

## 2. Processes, ports and URLs

| Process | Folder | Command (planned) | Local URL | Notes |
|---|---|---|---|---|
| MySQL 8 | Docker | `npm run infra:up` | `localhost:3317` (container port 3306) | 3317 avoids clashing with other local MySQL instances (3307 is already used on this machine by another project) |
| Mailpit | Docker | `npm run infra:up` | SMTP `localhost:1025`, inbox `http://localhost:8025` | Catches every outgoing email |
| API | `apps/api` | `npm run api:dev` | `http://localhost:4000` | `/api/v1/*`, `/uploads/*`, `/docs` (Swagger UI), `/docs/json` |
| Website | `apps/web` | `npm run web:dev` | `http://localhost:3000` | Public storefront |
| Dashboard | `apps/admin` | `npm run admin:dev` | `http://localhost:5173` | Private admin |

**Always use `localhost`, not `127.0.0.1`,** in the browser for both the dashboard and the API. Cookies and CORS are tied to the host name; mixing the two breaks login ([§11](#11-common-problems)).

**Testing on a real phone (same Wi-Fi):** the apps can be opened at `http://<your-pc-ip>:3000` and `:5173`, but then the API URL the browser calls must also use the PC's IP, `WEB_URL`/`ADMIN_URL` in the API's `.env` must list those origins, and cookies for the dashboard will not be shared across different IP/host combinations. Prefer testing the public site this way and the dashboard on the PC; see [§11](#11-common-problems).

---

## 3. Local infrastructure (Docker)

A single `docker-compose.yml` at the workspace root defines two services. Project name `stimpy-site` keeps its containers, network and volume separate from anything else on the machine.

| Service | Image | Host port → container | Purpose |
|---|---|---|---|
| `mysql` | `mysql:8.0` | `3317 → 3306` | App database `stimpy` (user `stimpy`, password `stimpy`) and test database `stimpy_test` |
| `mailpit` | `axllent/mailpit` | `1025 → 1025`, `8025 → 8025` | Fake SMTP server with a web inbox |

Details the file must honour:
- `utf8mb4` / `utf8mb4_unicode_ci` server defaults.
- A named volume for MySQL data, so `infra:down` keeps data and `infra:reset` (down with volumes, then up) wipes it.
- A health check on MySQL so `docker compose up --wait` returns only when the database accepts connections.
- An init script in `docker/mysql-init/` that creates `stimpy_test` and grants the app user the privileges Prisma's shadow database needs. Development credentials only; never reused anywhere else.
- Only these two containers are managed. Other containers on the machine are never touched.

---

## 4. Configuration and environment files

| File | Read by | Contains |
|---|---|---|
| `apps/api/.env` | API, seed, scripts | See [backend README §6](../backend/README.md#6-configuration): database URL, public URLs, SMTP, upload dir, seed admin |
| `apps/web/.env.local` | Next.js | `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` (browser calls), `API_URL_INTERNAL=http://localhost:4000/api/v1` (server-side calls), `NEXT_PUBLIC_SITE_URL=http://localhost:3000` |
| `apps/admin/.env.local` | Vite | `VITE_API_URL=http://localhost:4000/api/v1`, `VITE_SITE_URL=http://localhost:3000` (for "view on site" links) |
| `.env.example` files | Humans | Committed; every variable documented; real `.env*` files are git-ignored |

Rules:
- Only variables prefixed `NEXT_PUBLIC_` or `VITE_` reach the browser. **No secret ever uses those prefixes.**
- The API validates its environment at startup and refuses to run on a mistake.
- The only business value in the environment is the URLs; business settings live in the database.

---

## 5. Browser ↔ API wiring

### 5.1 Public website

- **Server components** (Next.js) fetch catalog, drops, content, options and size chart with `API_URL_INTERNAL`, using `fetch` with `next: { revalidate: N }` (seconds per endpoint group in the [state-and-errors doc](../frontend/state-and-errors.md)). This keeps pages fast and gives social link previews real content.
- **Client components** (cart, checkout, builder, countdown, tracking) call `NEXT_PUBLIC_API_URL` from the browser. The browser needs CORS access to the API.
- The public site **sends no cookies** to the API (`credentials: "omit"`). There are no customer sessions.
- Product images and 3D models come from `API_PUBLIC_URL/uploads/...` URLs returned by the API; Next.js `images.remotePatterns` must allow that host.

### 5.2 Dashboard

- A Vite single-page app calls the API directly at `VITE_API_URL` with `credentials: "include"`.
- Login sets the `stimpy_session` cookie on host `localhost`. Browsers treat `localhost:5173` and `localhost:4000` as the **same site** (cookies ignore ports), so a `SameSite=Lax` cookie is sent on these calls.
- The API requires an `Origin` header equal to `ADMIN_URL` on non-GET admin requests and replies with `Access-Control-Allow-Origin: <ADMIN_URL>` and `Access-Control-Allow-Credentials: true`.
- The app never stores tokens; on load it calls `GET /auth/me` to learn whether a session exists ([auth doc](../frontend/auth-and-sessions.md)).

### 5.3 CORS matrix (API side)

| Route group | Allowed origin | Credentials | Methods | Notes |
|---|---|---|---|---|
| `/api/v1/*` public | Every `WEB_URL` entry (and every `ADMIN_URL` entry for the live Builder preview) | No | `GET`, `POST` | Preflight cached 10 minutes. Allowed headers: `Content-Type`, `Idempotency-Key`. Exposed headers: `X-Request-Id`, `Retry-After`, `Date` |
| `/api/v1/auth/*`, `/api/v1/admin/*` | Every `ADMIN_URL` entry (an explicit origin, never `*`) | Yes | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` (and `OPTIONS` preflight) | Same allowed and exposed headers, plus `Content-Disposition` exposed (CSV file names) |
| `/uploads/*` | `*` (read-only static files) | No | `GET`, `HEAD` | Needed so the 3D Builder (WebGL textures) can load images cross-origin: files are served with CORS headers |

> WebGL textures from another origin require the response to carry `Access-Control-Allow-Origin` and the `<img>`/loader to use `crossOrigin = "anonymous"`. This is the most common reason a cross-origin 3D texture goes black; it is why `/uploads/*` sends CORS headers.

---

## 6. Shared packages and the typed client

### 6.1 `packages/api-client`

- Generated, not hand-written: `openapi-typescript` turns `docs/openapi.json` into `schema.d.ts`; a thin wrapper around `openapi-fetch` exposes `createPublicClient()` (no credentials) and `createAdminClient()` (`credentials: "include"`, converts error bodies into a typed `ApiError`).
- Regenerate with `npm run docs:api` (writes `docs/openapi.json`) then `npm run client:generate`. Both are committed so a reviewer sees the contract change in a diff.
- Both frontends import types and clients from `@stimpy/api-client`; neither defines API types by hand.

### 6.2 `packages/ui`

- Holds the Tailwind preset (brand colour tokens, Poppins, spacing, radii), the shared React components, and the zip-wipe animation ([design system doc](../frontend/design-system.md)).
- Consumed by `apps/web` and `apps/admin`. It has no API knowledge.

### 6.3 What is *not* shared

- Business logic is never duplicated in the frontends. Prices, totals, availability, order numbers, and status transitions come from the API. The frontend may show a *client-side estimate* of a cart total but the server's number wins.
- Money formatting and date formatting helpers live in `packages/ui` (cents → `$45`, ISO → local).

---

## 7. Keeping the contract honest

Three artefacts describe the API: the written contract (`api-reference.md`), the generated OpenAPI (`docs/openapi.json`), and the generated client. They can drift apart unless a process holds them together.

| Rule | How it is enforced |
|---|---|
| The written contract changes **first** | Changes to endpoints start as a pull request touching `api-reference.md` |
| The implementation matches it | A script (`npm run contract:check`) compares the list of method+path pairs in the generated OpenAPI with those in `api-reference.md` and fails on any difference |
| Request/response shapes are not hand-synchronised | Zod schemas in the API are the source for validation, TypeScript types and OpenAPI; the client is generated from OpenAPI |
| Breaking changes are visible | `docs/openapi.json` is committed; a diff on it is reviewed like code |
| The frontend docs follow | Each frontend doc cites endpoints as `METHOD /path`; a search for any path not in the contract is part of the review checklist |

Versioning: all routes are under `/api/v1`. A breaking change after launch means adding `/api/v2` alongside, not editing v1.

---

## 8. Data flows end to end

### 8.1 A customer places an order

```
Browser (apps/web)                API                                  MySQL        Mailpit
  │ POST /orders  (Idempotency-Key)│                                     │             │
  ├───────────────────────────────►│ validate, price, then TRANSACTION   │             │
  │                                ├────────────────────────────────────►│ counter++   │
  │                                │                                     │ reserve stock (conditional UPDATE)
  │                                │                                     │ insert customer/order/items/lines/events
  │                                │                                     │ insert email_log (PENDING)
  │◄───────────────────────────────┤ 201 {order, whatsappUrl, trackUrl}  │             │
  │ show confirmation (number)     │                                     │             │
  │                                │ ...5 s later, worker:               │             │
  │                                ├──────────────────── SMTP ──────────────────────►│ "We got your order"
  │ tap "Confirm on WhatsApp" → wa.me opens the customer's WhatsApp (optional)
```

### 8.2 The founder processes the order

```
Dashboard (apps/admin)              API                         MySQL / Mailpit
  │ polls GET /admin/orders/counts   │
  │◄ NEW badge increments ───────────┤
  │ open order, "Confirm"            │
  ├ POST /admin/orders/:id/status ──►│ transition + email_log      → "Order confirmed" email
  │ "Pack", then "Out for delivery" with a delivery number  → "On its way" email (includes delivery number)
  │ "Delivered"                      │ stock: reserved→sold, cash flagged → "Delivered" email
  │ "Settle cash" (per delivery number) later
```

### 8.3 The founder changes something the site shows

```
Dashboard: Content → Builder → mode = 3D, upload hoodie.glb ─► PUT /admin/builder ─► stored in builder_config
Website:   GET /builder/config (revalidates within seconds)    ─► effectiveMode flips; the page loads the 3D bundle
```

No redeploy and no code change is needed for: colours, sizes, size chart, prices, packs, drops, fees, FAQs, announcement bar, email texts, Builder mode.

---

## 9. Day-one setup, in order

These are the steps the first implementer follows (each is a planned command; nothing exists yet):

1. Install prerequisites: Node.js 24+, npm 11+, Docker Desktop.
2. Create the workspace per the [backend README §3](../backend/README.md#3-planned-repository-layout) and copy each `.env.example` to its real name.
3. `npm run infra:up` (starts MySQL and Mailpit; waits until healthy).
4. `npm run db:migrate` (creates the schema) then `npm run db:seed` (admin user + starter data).
5. `npm run api:dev`; open `http://localhost:4000/docs` to see the live API.
6. `npm run docs:api` and `npm run client:generate` to create the typed client.
7. `npm run web:dev` and `npm run admin:dev`; log in to the dashboard with the seeded admin.
8. Place a test order on the website; watch it arrive in the dashboard and the email arrive in Mailpit.

**Reset to a clean slate:** `npm run infra:reset` then repeat steps 4 and 8.

---

## 10. Scripts reference

| Script (workspace root) | Does |
|---|---|
| `infra:up` / `infra:down` / `infra:reset` | Start, stop, or wipe MySQL + Mailpit |
| `db:migrate` / `db:deploy` | Create/apply migrations (dev / non-interactive) |
| `db:seed` / `db:seed:demo` | Starter data / fake orders for dashboard development |
| `db:backup` / `db:restore` | Dump and restore the database through the container |
| `api:dev` / `api:test` / `api:typecheck` | API development server, tests, type check |
| `web:dev` / `admin:dev` | Frontend development servers |
| `docs:api` | Write `docs/openapi.json` from the API |
| `client:generate` | Generate `packages/api-client` types from the OpenAPI |
| `contract:check` | Compare OpenAPI paths with `api-reference.md` |
| `dev` | Run API, web and admin together |

---

## 11. Common problems

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard login "works" but the next call is `401` | Page opened at `127.0.0.1` while `ADMIN_URL` is `localhost` (cookie host mismatch) | Always open `http://localhost:5173` |
| `CORS` error in the browser console on admin calls | `ADMIN_URL` in `apps/api/.env` doesn't exactly match the browser's origin (scheme, host, port) | Fix the env value and restart the API |
| Admin `POST` returns `403 FORBIDDEN` | The `Origin` check failed (wrong origin or proxy stripping it) | Same fix as above |
| 3D hoodie renders black or untextured | Texture served without CORS headers, or loaded without `crossOrigin` | Ensure `/uploads/*` sends CORS headers and the loader sets `crossOrigin = "anonymous"` |
| Images from the API don't render in Next.js | API host missing from `images.remotePatterns` | Add `localhost:4000` |
| "Port already allocated" starting Docker | Another project already uses the port (3307 is taken by another MySQL on this machine) | Our compose file uses 3317; change it only if that is also taken |
| Emails don't arrive | Worker not running, or Mailpit not up | Check `/admin/email-log` status and `http://localhost:8025` |
| Prisma can't create the shadow database | App user lacks privileges | Recreate the container via `infra:reset` so the init script runs |
| Phone can load the public site but not the API | API URL points to `localhost`, which on the phone is the phone itself | Set `NEXT_PUBLIC_API_URL` to the PC's LAN IP and add that origin to `WEB_URL` handling |

---

## 12. Moving to production later

When the owner decides to deploy, these are the *only* wiring changes (no code rewrites):

| Concern | Change |
|---|---|
| Hosting | A small VPS running the same Docker setup (API + MySQL) behind Caddy/Nginx with automatic HTTPS; the web app on the same server or a static/Node host; the dashboard as static files |
| Domain | `stimpy.<domain>` (web), `admin.stimpy.<domain>` (dashboard), `api.stimpy.<domain>` (API). The three share the registrable domain, so `SameSite=Lax` cookies keep working. Set `Domain` accordingly |
| Environment | `NODE_ENV=production`, `COOKIE_SECURE=true`, real `WEB_URL`/`ADMIN_URL`/`API_PUBLIC_URL`, strong admin password |
| Email | Replace the Mailpit SMTP settings with a provider's; verify the sending domain (SPF/DKIM) |
| Storage | Swap the local storage adapter for object storage; `url` values are rebuilt from stored paths |
| Backups | Nightly dump to off-machine storage ([security doc §5](../backend/security-and-testing.md#5-operations-backups-and-recovery)) |
| Monitoring | Uptime check on `/health`; error reporting |
| Analytics | Privacy-friendly script on the public site only |

A deployment guide is written during the hardening phase but not executed.
