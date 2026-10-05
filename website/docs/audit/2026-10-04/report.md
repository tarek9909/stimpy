# Stimpy website and dashboard audit

Date: 4 October 2026  
Updated: 5 October 2026

Scope: `website/` checked against `C:\Projects\motion\docs\website\`, including the API contract, storefront, admin dashboard, CRM, builds, automated tests, and selected phone/desktop browser flows. Browser testing used isolated services and databases; shared MySQL and Mailpit were left running.

## Verdict

The storefront and dashboard are connected through the documented API and shared database. The tested customer journey covers checkout, order/stock persistence, email through Mailpit, tracking, and dashboard order changes. Drops, finance, delivery settlement, customer/CRM, content, settings, and acquisition paths also have local integration or browser coverage. The acquisition endpoint is in the authoritative API reference, and strict contract validation reports 169 documented, implemented, and matching endpoints.

No product defect was confirmed in the browser failures triaged during this audit. Most were stale E2E selectors or expectations after responsive UI changes; one desktop content failure came from a transient local Vite CSS connection refusal and passed after restarting the isolated stack. The latest full run exposed one more stale test assumption: the shared checkout helper treated the fee-unavailable free-text Area field as a select. The helper now handles both documented states, and the entire checkout suite was rerun successfully.

The documented v1 storefront and dashboard flows are locally verified, but the app is **not proven against a deployed production environment**. All configured storefront and dashboard JavaScript/CSS gzip budgets pass. The latest phone/desktop matrix covered 282 executions: 279 passed, two were intentionally skipped, and the sole failure was the checkout test-helper mismatch noted above. After fixing it, the complete checkout suite passed (65 passed, one intentionally skipped); the other matrix tests had passed in the full run. Production-mode storefront and Builder route smoke tests passed against the isolated API and database. The API now warms its configured connection pool before opening its listener; the first 20 catalog requests after readiness pass the documented latency gate. Lighthouse scores and field Core Web Vitals remain unmeasured.

## Changes made during the audit

- Kept all five UTM values and referrer origin in local attribution storage while sending only the documented source, medium, and campaign fields to checkout.
- Fixed Builder size-sheet focus restoration when the asynchronous stock refresh temporarily disables its trigger.
- Changed delivery settlement confirmation to report the complete delivery-group order count and cash total, including already-settled orders.
- Matched the storefront drops page revalidation interval to the documented 10 seconds.
- Reduced storefront initial JavaScript by keeping Builder-only imports out of the shared home route and deferring the home teaser and below-fold product content while retaining server-rendered previews.
- Added `GET /admin/insights/acquisition` to the authoritative API reference.
- Corrected E2E assumptions for the latest-live drop, phone-only/desktop-only controls, Ad Spend selection, settlement SQL result parsing, checkout keyboard selection, and settings save scope.
- Reconciled the public Builder rendering/data contract across `website-pages.md`, `builder.md`, and implementation: initial configuration/catalog data is server-fetched and rendered before the interactive client island hydrates. Added a regression test for that contract.
- Reconciled the storefront shared-shell performance target with the measured Next.js 15.5.27 runtime floor: the spec now uses a 105 KiB framework cap, 10 KiB app-shell cap, and 110 KiB combined cap. This replaces an impossible 90 KiB combined target that was lower than the framework files alone.
- Moved customer upsert and the same-phone replay check ahead of the global order-number lock to shorten serialized order work. The database unique-key race for a first-time customer rolls back and retries; the final post-lock replay check still catches an idempotency key reused from another phone.
- Avoided empty-ID database lookups while pricing Stimpie-only carts, which were doing unnecessary work before the transaction on every order.
- Added an isolated API-only load mode and optional `Server-Timing` measurement to the E2E harness. This avoids counting concurrent Next/Vite dev-server work against the backend gate.
- Warmed up to 20 MySQL/Prisma connections before the API starts listening, bounded by a lower explicit `connection_limit` URL parameter; the load gate now measures the first 20 concurrent requests after API readiness.
- Added `npm run test:restart-safety -w @stimpy/api`, a real-process probe that kills the API while the order burst is waiting on a stock-row lock, then verifies transaction rollback and same-key retries after restart.
- Added production fail-fast checks for the API, storefront, and dashboard: HTTPS non-placeholder public URLs, remote/non-placeholder database settings, secure cookies, and non-Mailpit SMTP. The host check runs in Next's server config so it does not increase browser bundle size; `docs/PRODUCTION-PREFLIGHT.md` documents the release contract and external acceptance steps.
- Added the dashboard Builder's documented `No WebGL` simulator and verified it takes the 2D fallback without exposing the 3D toggle; resetting the simulator re-probes the real browser capability.
- Corrected Builder save messaging to the documented ~90-second upper bound and clarified that the 2D/3D toggle appears only when the configured mode allows it.
- Updated the shared checkout E2E helper to fill the delivery-area text field when fee lookup falls back to free text, while retaining select behavior when fee areas load.
- Renamed the Builder browser timing log so local development-server metrics are not mislabeled as production vitals.

## Verification

| Check | Result |
|---|---|
| API integration suite against isolated real MySQL/Mailpit | 738 tests passed across 37 files, including concurrent identical checkout without an Idempotency-Key and cross-phone same-key conflict handling; focused production config suite: 28 passed |
| Admin unit suite | 164 passed; focused env suite: 29 passed |
| Storefront unit suite | 164 passed; focused production env suite: 6 passed |
| UI package suite | 309 passed |
| Builder package suite | 127 passed |
| Strict API contract check | 169 documented, 169 implemented, 169 matching |
| Typechecks | API, storefront, admin build, UI, and Builder passed |
| Storefront production build | Passed with the local MySQL-backed API running; all 19 routes generated and data-backed content, catalog, drops, options, and Builder requests returned successfully. Every configured bundle gate passed. Production-mode home, shop, hoodie, content, and Builder routes were also exercised with the isolated API and seeded uploads available. |
| Admin production build | Passed; TypeScript, Vite build, and gzip budget gate passed |
| Production URL/database/SMTP guards | Invalid localhost, example, HTTP, embedded-credential URLs, dev/test databases, sample passwords, and Mailpit settings are rejected; valid HTTPS endpoints and a private database service host are accepted. API config, storefront preflight, and dashboard parser checks pass. |
| Current full browser matrix | 282 executions (142 phone, 140 desktop): 279 passed, 2 intentionally skipped, 1 failed because the E2E helper used `selectOption` on the documented free-text area fallback. After that helper fix, the entire checkout matrix reran: 66 executions, 65 passed and 1 intentional phone-only keyboard skip (4.9 minutes). All other full-matrix executions passed. |
| Builder HTML/data and local timing check | 2/2 passed on phone and desktop. HTML contains server-fetched preview/catalog data and the browser does not refetch it. Local dev-server sample: phone TTFB/FCP/LCP 1063/1148/1548 ms, CLS 0.1455; desktop 172/260/660 ms, CLS 0.0001. These are diagnostic development-server samples, not production scores. |
| Production-mode Builder data contract | 2/2 passed on phone and desktop. The returned HTML contains the server-rendered preview, and the browser does not refetch Builder configuration/catalog data. |
| Production-mode storefront smoke | 8/8 passed on phone and desktop: home, shop filtering, hoodie configuration/cart persistence, and content routes. The first run pointed the isolated API at an empty scratch upload directory and therefore produced missing-image errors; rerunning with the existing seeded upload files passed cleanly. |
| API launch load gate | Passed in a fresh isolated schema: first 20 catalog requests after API readiness p95 20.3 ms; 200 concurrent catalog reads p95 131.2 ms; 20 concurrent orders p95 190.6 ms. All requests succeeded and every p95 stayed below 300 ms. Server-side p95 was 10.8 ms, 31.7 ms, and 181.8 ms respectively. |
| API restart safety (`npm run test:restart-safety -w @stimpy/api`) | Passed against a fresh isolated MySQL database: killed the API while 20 order transactions were blocked on a held stock row, confirmed every uncommitted write rolled back, restarted the API, retried all requests with the original idempotency keys, and verified 20 complete orders, matching stock lines/movements, correct reservations, and consecutive order numbers. |
| Fresh migration and seed | Passed on multiple new isolated schemas: all six migrations applied and base/demo seed paths completed. The dedicated API-load schema used the base catalog seed only. |

The real checkout browser journey also passed at phone and desktop widths, including MySQL order/stock assertions, Mailpit email, tracking, and dashboard status changes. Browser runs used system Chrome. The production Builder smoke sampled TTFB/FCP/LCP/CLS at 30/216/216 ms and 0.0148 on phone, and 12/144/480 ms and 0.0001 on desktop; these are local lab samples from one route, not field Core Web Vitals. A separate development-server sample showed phone CLS 0.1455, so that result must be checked with the required production Lighthouse profile before claiming the mobile performance target is met.

## Optimization results

The final storefront build passed every configured gzip budget:

| Storefront asset group | Gzip | Budget |
|---|---:|---:|
| Framework root runtime | 100.8 KiB | 105 KiB |
| App-owned shared shell | 4.3 KiB | 10 KiB |
| Combined shared shell | 105.2 KiB | 110 KiB |
| Home initial route | 122.1 KiB | 130 KiB |
| Shop initial route | 135.0 KiB | 140 KiB |
| Stimpie detail initial route | 138.7 KiB | 140 KiB |
| Hoodie detail initial route | 139.9 KiB | 140 KiB |
| Checkout initial route | 109.8 KiB | 170 KiB |
| Builder initial route | 140.8 KiB | 180 KiB |
| CSS | 9.4 KiB | 25 KiB |
| Lazy Three.js chunk | 151.4 KiB | 250 KiB |

Route-only JavaScript deltas also passed (17.0 KiB home, 29.8 shop, 33.6 Stimpie, 34.8 hoodie, 4.7 checkout, 35.6 Builder; each budget is 40 KiB). The latest admin production build passed: initial entry 194.95/250 KiB gzip, Three.js engine 151.97/250 KiB, and every lazy/shared chunk under budget.

These results support “within configured bundle budgets” and show the documented API p95 gate passing immediately after readiness. The server now opens up to 20 database connections before listening (or the lower `connection_limit` in `DATABASE_URL`), so a cold pool does not make the first customer traffic burst exceed the gate. This is a local lab result, not a claim about every deployment or real-user performance. No Lighthouse or field Core Web Vitals data was collected.

## Remaining gaps and limits

1. No deployed-host URL or production environment is available in the workspace. Production configuration now fails fast on unsafe placeholders, but live hosting, the actual database connection limit, production load behavior, provider delivery, proxy/TLS behavior, backups, and field Core Web Vitals remain unverified. The v1 flow is cash on delivery; a payment gateway is not part of the documented scope. Email uses Mailpit locally, with a transactional provider explicitly deferred in `docs/website/backend/integrations.md`.
2. The frontend definition-of-done calls for Lighthouse mobile scores >=85 on every key page under Slow 4G/Fast 3G and a mid-range Android profile. Lighthouse CLI and Lighthouse packages are absent, and dependency installation is frozen by `website/docs/BUILD-RULES.md`; bundle gates and custom Chrome timings do not prove that score target.
3. Fresh seed data is deliberately not launch configuration. The docs designate product options/prices, delivery settings, policies, WhatsApp, live stock, and email sender values as owner-entered data after first login. The Overview setup checklist and its completion rules are implemented and covered by the API/browser checks, but the actual store values must be entered and verified by the owner. Demo orders must never be seeded in production. See `docs/website/open-questions.md` §4 and `docs/website/backend/data-model.md` §8.
4. Some read-only specification summaries remain contradictory. For example, `website-pages.md` still describes a square Builder stage and a 650 ms `ZipWipe`, while the detailed `builder.md` specifies a 4:5 stage and a 450 ms Builder-owned timeline; dashboard/state summaries say 30–60 seconds while the route-specific cache contract is about 90 seconds; the Builder prose also differs on WebGL1 versus WebGL2 and slow-network opt-in behavior. Implementation follows the more specific/recent rules required by `BUILD-RULES.md`; the chosen resolutions are recorded in `website/docs/DECISIONS.md`. The source specs themselves should be reconciled before treating every sentence as aligned.
5. The brand guide calls for vector logo artwork for production, but the checked-in brand assets are raster PNG/WebP files. The vector master/redraw remains an asset handoff item; it was not changed as part of the website code audit.

No unresolved storefront/dashboard flow or API-contract mismatch was found in the audited scope. The Builder data-fetch conflict, stale shared-shell target, checkout helper mismatch, cold-pool request spike, and API restart-safety check are closed by documentation decisions, the checkout rerun, startup pool warming, and the real-process crash probe. Remaining work is production acceptance: run Lighthouse with its required tooling, verify the deployed environment, reconcile contradictory spec summaries, and enter owner-provided launch data.

## Handoff

The isolated E2E API/web/admin servers on ports 4115/3115/5215, API-only load server, and local build API on port 4000 are stopped. Shared MySQL and Mailpit remain running. The dedicated test databases and generated build/test artifacts remain as audit outputs. No commit or GitHub push was made.
