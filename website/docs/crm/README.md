# CRM plan (inside the Stimpy website)

Status: **implemented and locally verified on 4 October 2026.** The real-MySQL API suite, dashboard/storefront unit suites, strict contract check, builds, and selected browser flows pass as recorded in `audit/2026-10-04/report.md`. This is not a production-readiness claim.

Files:
- [backend.md](backend.md): schema, services, API endpoints, jobs, tests (`backend`).
- [frontend.md](frontend.md): admin pages, components, storefront capture (`frontend/admin`, `frontend/web`, `packages/*`).

## Goal

Turn the existing `Customer`, `Order`, `Subscriber`, `EmailLog` and template data into a usable CRM: one profile per person, a combined activity timeline, tags/notes/follow-ups, segments with bulk messaging, and acquisition attribution. Not a separate system, not a B2B pipeline.

## What already exists (do not rebuild)

- Prisma models: `Customer` (phone unique, whatsapp, name, email, areaId, notes), `Order`, `OrderItem`, `OrderEvent`, `OrderNote`, `Subscriber` (contact, type, dropId), `EmailLog`, `EmailTemplate`, `WhatsappTemplate`, `AdSpend`, `Area`, `Drop`.
- API modules: `backend/src/modules/customers`, `comms`, `insights`, `finance`.
- Admin: `/customers` route (area `customers`), `DataTable`, `FilterBar`, `Timeline`, `Pagination`, `Combobox`.
- Roles: only `OWNER` exists (full access); `PACKER` is reserved. The CRM lives under the existing `customers` area. Do not add roles.

## Out of scope

Sales pipeline/deal stages, inbound inbox or chat integration, lead scoring, automation builders, new third-party services.

## Phases (backend and frontend work for each)

Each phase is independently shippable. Backend first, then frontend, then verify together before starting the next phase.

| Phase | Theme | Schema change |
|---|---|---|
| 1 | Customer profile, stats, timeline | none |
| 2 | Tags, notes, follow-ups | yes (small) |
| 3 | Subscriber-customer link, consent, duplicate merge | yes |
| 4 | Segments and bulk messaging | yes |
| 5 | Attribution (UTM, cost per customer) | yes |

Current implementation includes the customer profile, timeline, tags, notes, follow-ups, channel consent and unsubscribe flow, subscriber linking, duplicate merge, privacy export/anonymisation, saved segments, consent-gated campaign drafts and delivery, immutable first-touch attribution, and acquisition insights. Verification covers the real-MySQL API integration suite, storefront/admin/UI/Builder unit suites, desktop and phone browser flows, strict API contract check, production builds, and configured bundle budgets. The authoritative API reference now includes `GET /admin/insights/acquisition`; all configured storefront and dashboard gzip budgets pass. This is local verification, not a production-readiness claim. See [the audit report](../audit/2026-10-04/report.md) for exact results and remaining limits.

## Cross-cutting requirements

- **Contract:** the backend updates `openapi.json`; then run `npm run client:generate` and `npm run contract:check`. The frontend consumes only the generated `packages/api-client`.
- **Privacy:** phone, email and address are personal data; see backend.md (export/anonymise) and frontend.md (where they are exposed).
- **No new dependencies** unless unavoidable; use `node scripts/add-dep.mjs` and record the reason.
- **Docs:** decisions in `DECISIONS.md` (`- [crm] decision, reason`), handoffs in `HANDOFF.md`.

## Definition of done (per phase)

1. Migration applies cleanly on a fresh database and on existing dev data.
2. API tests pass against real MySQL (and Mailpit where email is involved).
3. Admin UI exercised in a real browser (system Chrome) at desktop and phone width.
4. `contract:check`, API typecheck and admin build all pass.
5. Final report in the `BUILD-RULES.md` format: what was verified, what was not, known gaps.
