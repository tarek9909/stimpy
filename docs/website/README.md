# Stimpy Website: Documentation Index

This folder is the **specification set** for the Stimpy website, dashboard and backend. The implementation lives in [`website/`](../../website/). Use the specification documents for intended behavior, then check the implementation handoff, decisions and audit under `website/docs/` for current delivery and verification status.

The business plan these documents implement is [stimpy_website_plan.md](../../stimpy_website_plan.md) (what the website and dashboard are for, their pages, and their behaviour). The brand source of truth is [identity/stimpy_brand_identity.md](../../content/identity/stimpy_brand_identity.md) and the [master plan](../../stimpy_master_plan.md).

## Reading order

| # | Document | What it answers |
|---|---|---|
| 1 | [stimpy_website_plan.md](../../stimpy_website_plan.md) | Why, what, and how the website and dashboard behave |
| 2 | [wiring/README.md](wiring/README.md) | How the database, API, website, dashboard, and email inbox connect locally |
| 3 | [backend/README.md](backend/README.md) | Backend technology, layout, modules, jobs, build order |
| 4 | [backend/data-model.md](backend/data-model.md) | Every table, column, constraint, and the seed data |
| 5 | [backend/business-rules.md](backend/business-rules.md) | Pricing, order placement, stock, drops, status machine, delivery number, finance |
| 6 | [backend/api-reference.md](backend/api-reference.md) | The exact HTTP contract both frontends build against |
| 7 | [backend/integrations.md](backend/integrations.md) | Email queue and templates, WhatsApp templates, file storage |
| 8 | [backend/security-and-testing.md](backend/security-and-testing.md) | Security controls, test plan, backups |
| 9 | [frontend/README.md](frontend/README.md) | Frontend decisions, folders, conventions, build order, definition of done |
| 10 | [frontend/design-system.md](frontend/design-system.md) | Tokens, typography, components, motion |
| 11 | [frontend/state-and-errors.md](frontend/state-and-errors.md) | Data fetching, errors, forms, performance, accessibility, analytics |
| 12 | [frontend/website-pages.md](frontend/website-pages.md) | The 15 public pages |
| 13 | [frontend/checkout-and-order-flow.md](frontend/checkout-and-order-flow.md) | Cart, checkout, confirmation, tracking |
| 14 | [frontend/builder.md](frontend/builder.md) | The 2D/3D Builder |
| 15 | [frontend/dashboard-pages.md](frontend/dashboard-pages.md) | The 12 dashboard pages |
| 16 | [frontend/auth-and-sessions.md](frontend/auth-and-sessions.md) | Login and session behaviour |

## Decisions that shape everything

| Decision | Outcome |
|---|---|
| Backend | Node.js + TypeScript + MySQL (Fastify, Prisma, Zod) |
| Frontends | Next.js website, Vite + React dashboard, shared tokens/components, generated typed API client |
| Customer accounts | None. Orders are found by order number + phone; email and WhatsApp number are collected at checkout |
| Payment | Cash on delivery only |
| Delivery | No courier integration: orders are marked *Out for delivery* with a **delivery number** entered by the founder |
| Order identity | Every order gets its own permanent **order number** (`STP-1042`), separate from the delivery number |
| Configurable from the dashboard | Hoodie colours, sizes, size chart, prices, packs, drops, delivery fee, Builder mode (2D / 3D / Both), FAQs, policies, announcement bar, email and WhatsApp texts |
| Builder | In version 1, with both 2D and 3D modes chosen from the dashboard |
| Environment | Local only: MySQL and Mailpit run from the portable binaries in `website/.infra/` on this workspace; no domain, hosting, or production deployment is configured |
| Sessions | Server-side opaque sessions in an HttpOnly cookie (replaces the "JWT" wording in the early plan) |

## How this documentation was produced and kept consistent

- The **API reference is the contract**. The backend documents implement it and the frontend documents consume it; every endpoint they mention must exist there.
- Where the frontend authors found something they needed that the contract lacks, they listed it under **"Open questions for the API"** at the end of their document. Those lists are collected in [open-questions.md](open-questions.md) so the contract can be amended deliberately.
- Where a later decision changed an earlier one (for example sessions instead of JWT, port 3317 for MySQL), the newer document wins and the earlier plan carries a pointer to it.

## Implementation status

The source documents below began as a build plan. They are not an implementation-status tracker. Current code, test results, unresolved gaps and verification dates are recorded in [`website/docs/audit/`](../../website/docs/audit/) and [`website/docs/HANDOFF.md`](../../website/docs/HANDOFF.md).

| Part | State |
|---|---|
| Business plan | Written |
| Backend documentation | Written |
| Wiring documentation | Written |
| Frontend documentation | Written |
| Backend code | Implemented in `website/backend/`; check the current audit and handoff for verified scope |
| Frontend code | Implemented in `website/frontend/web/` and `website/frontend/admin/`; check the current audit and handoff for verified scope |
| Local infrastructure | Portable MySQL and Mailpit binaries configured under `website/.infra/`; see `website/docs/BUILD-RULES.md` |
| Production deployment | Not configured; the source plan defines a local prototype |
