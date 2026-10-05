# Backend: Overview and Architecture

**Purpose and audience.** This is the build guide for the Stimpy backend: what it is made of, how the code is organised, how a request travels through it, and the order to build it in. It is written for the developer (or Claude) who will implement it. Product behaviour is defined in [stimpy_website_plan.md](../../../stimpy_website_plan.md); the exact HTTP contract is in [api-reference.md](api-reference.md).

> **Status: specification.** This document remains the backend design reference; the implemented API lives in [`website/backend/`](../../../website/backend/). Current verification results and known gaps are tracked in the [implementation audit](../../../website/docs/audit/2026-10-04/report.md).

## Contents

1. [What the backend does](#1-what-the-backend-does)
2. [Technology](#2-technology)
3. [Planned repository layout](#3-planned-repository-layout)
4. [Module map](#4-module-map)
5. [How a request travels](#5-how-a-request-travels)
6. [Configuration](#6-configuration)
7. [Background jobs](#7-background-jobs)
8. [Logging and observability](#8-logging-and-observability)
9. [Build order](#9-build-order)
10. [Definition of done](#10-definition-of-done)

Related documents: [data model](data-model.md) · [business rules](business-rules.md) · [integrations](integrations.md) · [security and testing](security-and-testing.md) · [wiring](../wiring/README.md)

---

## 1. What the backend does

One API serves two clients: the public website and the private dashboard. It is the **single source of truth** for products, stock, drops, orders, customers, money, and site content.

Its five jobs, in priority order:

1. **Record every order safely.** An order is saved in one database transaction that also reserves stock, issues the order number, and queues the confirmation email. Either all of it happens or none of it does.
2. **Never oversell.** Limited Stimpies are never restocked. Stock reservation is a conditional database update, not application-level arithmetic.
3. **Run the order lifecycle.** A strict status machine decides what can happen next and what each change does to stock, cash, and emails.
4. **Serve configuration, not constants.** Colours, sizes, the size chart, delivery fees, Builder mode, FAQs, email texts and prices all come from the database and are editable in the dashboard.
5. **Tell people what is happening.** Automatic customer emails, founder alerts, and ready-made WhatsApp links.

It deliberately does **not** do: online payments, accounts for customers, courier integration, or automatic WhatsApp sending (all deferred; see the plan's non-goals).

---

## 2. Technology

| Concern | Choice | Notes |
|---|---|---|
| Runtime / language | Node.js 24, TypeScript (strict) | One language across API and both frontends |
| HTTP framework | Fastify 5 | Schema-first, fast, good plugin model |
| Validation / typing | Zod 4 via `fastify-type-provider-zod` | One schema validates requests, types handlers, and generates OpenAPI |
| Database | MySQL 8 (InnoDB, `utf8mb4`) | Required by the owner; strong row-level locking for stock |
| ORM / migrations | Prisma 6 | Typed queries; `$executeRaw` only for the atomic stock updates and the order counter |
| Password hashing | Argon2id (`@node-rs/argon2`) | Prebuilt binaries, no compiler needed on Windows |
| Sessions | Opaque random token in an HttpOnly cookie, hash stored in MySQL | Revocable and simpler to secure than JWTs. This replaces the "JWT" wording in the early plan |
| Email | Nodemailer behind an adapter, SMTP to Mailpit locally | Database-backed queue, no Redis |
| Images | `sharp` for resizing uploads | Local disk behind a storage adapter |
| API docs | `@fastify/swagger` (+ UI) | Generated OpenAPI; see [wiring](../wiring/README.md#7-keeping-the-contract-honest) |
| Tests | Vitest against a real MySQL test database | Orders and stock are tested against the real engine, never mocked |
| Dev runner | `tsx watch` | No build step in development |

---

## 3. Planned repository layout

The monorepo is created when implementation starts. Names below are the plan, not existing folders.

```
website/                                 npm workspaces root
├── package.json
├── docker-compose.yml                   MySQL + Mailpit (local only)
├── docker/mysql-init/                   creates the test database
├── apps/
│   ├── api/                             THE BACKEND
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts                  see data-model.md#8-seed-data
│   │   ├── scripts/
│   │   │   ├── create-admin.ts
│   │   │   └── generate-api-docs.ts     OpenAPI -> docs/openapi.json
│   │   ├── src/
│   │   │   ├── server.ts                starts listening, starts jobs
│   │   │   ├── app.ts                   builds the Fastify instance (also used by tests)
│   │   │   ├── config.ts                validated environment
│   │   │   ├── plugins/                 prisma, auth-session, error-handler, rate-limit, cors, openapi
│   │   │   ├── lib/                     money, phone, slug, template, order-number, storage, email-transport
│   │   │   ├── services/                orders, stock, drops, pricing, email-queue, settings
│   │   │   ├── modules/                 one folder per area, see section 4
│   │   │   └── jobs/                    email-worker, hold-expiry
│   │   └── test/
│   ├── web/                             public site (see ../frontend)
│   └── admin/                           dashboard (see ../frontend)
├── packages/
│   ├── api-client/                      generated from the OpenAPI document
│   └── ui/                              brand tokens + shared components
└── docs/openapi.json                    generated; committed so reviewers can diff the contract
```

**Layering rule:** `modules/*` hold routes (HTTP in/out, validation, authorisation). Anything with business meaning (placing an order, changing status, moving stock) lives in `services/*` and is called by the routes and by tests. Routes never touch stock or order status directly.

---

## 4. Module map

Each module is a folder with `routes.ts` (endpoints), `schemas.ts` (Zod request/response), and where needed `service.ts`.

| Module | Public routes | Admin routes | Notes |
|---|---|---|---|
| `health` | `GET /health` | : | |
| `auth` | login, logout, me, change-password | : | Session plugin |
| `options` | `/options`, `/size-chart` | `/admin/colors`, `/admin/sizes`, `/admin/size-chart` | Adding a colour/size creates variants |
| `catalog` | `/products/*`, `/packs` | `/admin/hoodies`, `/admin/stimpies`, `/admin/packs` | |
| `uploads` | static `/uploads/*` | `/admin/uploads` | Resizes images |
| `drops` | `/drops*`, subscribe | `/admin/drops*` | State derived from time and stock |
| `orders` | `POST /orders`, track, find | `/admin/orders*` | Uses `services/orders` |
| `stock` | : | `/admin/stock/*` | Uses `services/stock` |
| `deliveries` | `/delivery/fees` | `/admin/deliveries*`, `/admin/areas`, `/admin/settings/delivery` | |
| `customers` | : | `/admin/customers*`, `/admin/subscribers` | |
| `finance` | : | `/admin/finance/*`, `/admin/expenses`, `/admin/ad-spend` | |
| `insights` | : | `/admin/insights/*` | Read-only aggregates |
| `content` | `/content`, `/builder/config` | `/admin/content/*`, `/admin/faqs`, `/admin/reviews`, `/admin/builder` | |
| `comms` | : | `/admin/email-templates`, `/admin/whatsapp-templates`, `/admin/email-log` | |
| `settings` | : | `/admin/settings` | Typed settings groups |
| `overview` | : | `/admin/overview` | Composes other services |

Services (shared logic):

| Service | Responsibility |
|---|---|
| `pricing` | Turns cart items into priced, validated lines; computes cost snapshot; looks up the delivery fee |
| `stock` | Atomic reserve / release / sell / restock operations and movement logging |
| `orders` | `placeOrder`, `changeStatus`, `setDeliveryNumber`, contact edits, search; owns the status machine |
| `drops` | Derives `UPCOMING/LIVE/SOLD_OUT/ENDED`; purchasability checks |
| `email-queue` | Renders templates, writes `email_log`, retries |
| `settings` | Typed read/write with defaults and a short in-memory cache |

---

## 5. How a request travels

```
Browser ──► CORS / rate limit ──► (admin only) session check + Origin check
        ──► Zod validation (body, query, params)
        ──► route handler ──► service (transaction if it changes data)
        ──► Zod response serialisation (drops unknown fields)
        ──► JSON ◄── error handler turns thrown AppErrors into the standard error body
```

Rules:

- **Response schemas are enforced.** The serialiser strips any field not in the schema, so internal columns (password hashes, cost figures on public routes) cannot leak by accident.
- **One error type.** Services throw `AppError(code, httpStatus, message, details)`; only the error handler writes error responses. Unexpected errors become `INTERNAL` with a request id; the stack goes to the log only.
- **Request id.** Every request gets an id, returned in the `x-request-id` header and included in log lines and `INTERNAL` errors.
- **Transactions.** Anything touching more than one table inside a business operation runs in one Prisma interactive transaction (see [business rules](business-rules.md)).

---

## 6. Configuration

All configuration is environment variables, validated at startup with Zod; the process refuses to start on a missing or invalid value. Nothing is hard-coded to localhost except the documented defaults.

| Variable | Default (dev) | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | Where the API listens |
| `DATABASE_URL` | `mysql://stimpy:stimpy@localhost:3317/stimpy` | MySQL connection |
| `WEB_URL` | `http://localhost:3000` | Public site origin: CORS and email links. May be a comma-separated list (first entry is used for email links); add a LAN address here to test the public site on a phone |
| `ADMIN_URL` | `http://localhost:5173` | Dashboard origin: CORS (with credentials) and the Origin check. May be a comma-separated list, e.g. `http://localhost:5173,http://192.168.1.20:5173` for phone testing; cookie `Domain` is left unset (host-only) so the same host name must be used for the dashboard and the API |
| `API_PUBLIC_URL` | `http://localhost:4000` | Used to build absolute URLs for uploaded files |
| `SMTP_HOST` / `SMTP_PORT` | `localhost` / `1025` | Mailpit locally |
| `SMTP_USER` / `SMTP_PASSWORD` | unset | For a real provider later |
| `UPLOAD_DIR` | `./uploads` | Local file storage |
| `COOKIE_SECURE` | `false` | Must be `true` when served over HTTPS |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | : | Used only by the seed / `admin:create` script |

Business settings (order prefix, hold hours, delivery fee, sender address, …) are **not** environment variables; they live in the database and are edited in the dashboard. See [api-reference §5.12](api-reference.md#512-settings).

---

## 7. Background jobs

No separate worker process: jobs run inside the API process on timers, using the database as the queue.

| Job | Interval | What it does |
|---|---|---|
| `email-worker` | every 5 s | Sends `PENDING` rows from `email_log`; on failure retries with backoff (1 min, 5 min, 30 min), then marks `FAILED` after 4 attempts |
| `hold-expiry` | every 5 min | Finds `NEW` orders past `holdExpiresAt`. If `autoExpireUnconfirmed` is on, cancels them (reason "Expired: not confirmed") and releases stock. If off (default), nothing is changed: the Overview and Orders list simply flag them |
| `session-cleanup` | hourly | Deletes expired dashboard sessions |

Jobs are written as plain functions that a test can call directly, so no test waits on a timer.

---

## 8. Logging and observability

- Structured JSON logs (Pino built into Fastify); pretty-printed in development.
- Logged for every request: method, path, status, duration, request id, admin user id if any. **Never logged:** request bodies for `/auth/*` and `/orders`, cookies, passwords, full phone numbers or emails (mask all but the last 3 digits / the domain).
- Business events logged at `info`: order placed, status changed, stock adjusted, email failed.
- `GET /health` checks the database with a trivial query and returns `ok`.

---

## 9. Build order

Mirrors the phases in the plan. Each step ends with its tests passing.

| Step | Deliverable |
|---|---|
| B0 | Monorepo, Docker (MySQL + Mailpit), config, Fastify app skeleton, error handler, OpenAPI generation, test harness with a clean database per test |
| B1 | Prisma schema + migrations + seed ([data model](data-model.md)); settings service; options (colours, sizes, size chart) |
| B2 | Auth (sessions, login rate limit, create-admin script) |
| B3 | Catalog (hoodies, stimpies, packs, uploads) with admin CRUD and public reads |
| B4 | **Orders core:** pricing, stock service, `placeOrder`, order number, status machine, delivery number, tracking, lost-number lookup, customer matching |
| B5 | Email queue + templates + worker; WhatsApp templates; founder alerts |
| B6 | Admin orders API (list, search, detail, bulk, contact edits, notes, export), stock API, deliveries API |
| B7 | Drops (state derivation, admin, subscribe), Builder config, content, FAQs, reviews |
| B8 | Customers, subscribers, overview |
| B9 | Finance and insights |
| B10 | Hardening: rate limits, load/concurrency tests, backup script, OpenAPI-vs-contract check, deployment guide |

Steps B0–B6 correspond to the plan's Phase 1; B7 to Phase 2; B9 to Phase 3; B10 to Phase 4.

---

## 10. Definition of done

- [ ] Every endpoint in [api-reference.md](api-reference.md) exists and its generated OpenAPI matches the document.
- [ ] The oversell test passes: 50 simultaneous orders for 5 units create exactly 5 orders; the other 45 get `SOLD_OUT`.
- [ ] 50 simultaneous orders get 50 distinct, never-reused order numbers.
- [ ] An order cannot reach `OUT_FOR_DELIVERY` without a delivery number.
- [ ] Every status path leaves stock and cash flags consistent (see the table in [business rules](business-rules.md#5-stock-lifecycle)).
- [ ] Placing an order queues exactly one "order received" email; each later status queues its matching email.
- [ ] No public response ever contains costs, other customers' data, exact stock above the low-stock threshold, or internal ids not listed in the contract.
- [ ] `npm run api:typecheck` and `npm run api:test` pass from a clean checkout after `npm run infra:up` and `npm run db:migrate`.
- [ ] A database backup and restore has been run once.
