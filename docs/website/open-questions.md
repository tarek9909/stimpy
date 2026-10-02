# Decision Log: Questions Raised and How They Were Settled

**Purpose and audience.** While the frontend documents were being written, their authors listed everything the [API contract](backend/api-reference.md) did not yet say. This log records, for every one of those questions, the decision taken and where it now lives. It exists so that no one has to guess which version of an answer is current: **the contract and backend documents are authoritative; where a frontend document still shows an older assumption, this log wins and the frontend document is to be corrected.**

Sources: `website-pages.md` (W), `checkout-and-order-flow.md` (C), `builder.md` (B), `state-and-errors.md` (S), `dashboard-pages.md` (D), `auth-and-sessions.md` (A), `design-system.md` (G). Numbers refer to each document's "Open questions for the API" table.

## Contents

1. [Settled by changing the contract](#1-settled-by-changing-the-contract)
2. [Settled by confirming a behaviour (no contract change)](#2-settled-by-confirming-a-behaviour-no-contract-change)
3. [Deliberately not in version 1](#3-deliberately-not-in-version-1)
4. [Values to enter in the dashboard](#4-values-to-enter-in-the-dashboard-not-decisions-not-blockers)

---

## 1. Settled by changing the contract

| Topic | Questions | Decision | Where recorded |
|---|---|---|---|
| What `expectedTotalCents` means | C1 | The **grand total including delivery**. The example is corrected to 5800 | [api §3.5](backend/api-reference.md#35-orders) |
| Identifying the failing item in `SOLD_OUT` / `NOT_PURCHASABLE` | C3, C10, S4, B13, D12 | Items carry `kind` (`HOODIE_VARIANT` or `STIMPIE`), the ids (`hoodieId`+`colorId`+`sizeId`, or `stimpieId`), `itemIndex` (position in the request's `items`), `requested` (total units needed) and `available` | [api §1 error codes](backend/api-reference.md#1-conventions) |
| Idempotency key reused with a different body | C4, S15 | `409 CONFLICT` with `details.field = "Idempotency-Key"`; same key and same body returns the original order with `200` | [api §3.5](backend/api-reference.md#35-orders), [business rules §3](backend/business-rules.md#3-placing-an-order) |
| Field length limits and phone formats | C5, D22 | A text-limits row in the conventions; phone/WhatsApp always normalised `+961XXXXXXXX` | [api §1](backend/api-reference.md#1-conventions) |
| UTM / attribution on orders | C6 | Optional `attribution: { utmSource, utmMedium, utmCampaign }` on `POST /orders`, stored on the order, shown in Insights as `byCampaign` | [api §3.5](backend/api-reference.md#35-orders), [data model](backend/data-model.md#5-orders-and-stock-tables) |
| Duplicate Stimpies in a pack | C7, B7 | **Not allowed** (a pack is N different designs). Limited Stimpies may be used while their drop is live | [api §3.5](backend/api-reference.md#35-orders) |
| Validating a cart without ordering | C8, S7 | New public `POST /cart/validate` | [api §3.5](backend/api-reference.md#35-orders) |
| Delivery estimate wording | C9 | The order response's `estimateText` is authoritative: `"<N> working days"` if the area has `estDays`, else the global text | [business rules §1](backend/business-rules.md#1-pricing-and-money) |
| Which hoodie the Builder sells | W1, B1 | `GET /builder/config` includes `hoodie: { id, slug, name }`, set in the dashboard (defaults to the first active hoodie) | [api §3.6](backend/api-reference.md#36-builder-config) |
| `placement2d` geometry | B2 | `x`,`y` = centre of the panel as fractions of image width/height; `width` = fraction of image width; height = width ÷ 0.64; `rotation` degrees clockwise | [api §3.6](backend/api-reference.md#36-builder-config) |
| Artwork and model sizes | B3, B4, B5 | `Stimpie.artworkWidth/Height`; `model3d.sizeBytes` and `model3d.panelAspect` (default 0.64) | [api §2](backend/api-reference.md#2-shared-types), [§3.6](backend/api-reference.md#36-builder-config) |
| Fabric shading in 2D | B10 | Optional `colors[].overlay2d` image | [api §3.6](backend/api-reference.md#36-builder-config) |
| Colour tint/texture stored twice | D14 | One source: `/admin/colors` (`builderTint`, `builderTexture`); the Builder config mirrors them read-only | [api §3.6](backend/api-reference.md#36-builder-config), [§5.11](backend/api-reference.md#511-content) |
| `PUT /admin/builder` body | D15 | The full object as returned by `GET`; writable fields listed; immediate publish, no draft | [api §5.11](backend/api-reference.md#511-content) |
| `assetsReady` coverage | B12 | Adds `overlays2d` and `stimpieTextures` counts | [api §5.11](backend/api-reference.md#511-content) |
| Which Stimpies the catalog returns | B14 | Default: `AVAILABLE`, `LOW`, `SOLD_OUT`. `includeUpcoming` / `includeEnded` opt in | [api §3.3](backend/api-reference.md#33-catalog) |
| `howToMeasure` in two places | W3, D16 | Canonical home is the size chart (`GET /size-chart`, `PUT /admin/size-chart`); removed from `policies` | [api §3.7](backend/api-reference.md#37-content) |
| Quality promises on How it works | W2 | New `howItWorks.promises: string[]` | [api §3.7](backend/api-reference.md#37-content) |
| FAQ grouping | W6 | New nullable `group` label on FAQs | [api §3.7](backend/api-reference.md#37-content), [data model](backend/data-model.md) |
| Colour swatches on shop cards | W7 | `HoodieSummary.colors` | [api §2](backend/api-reference.md#2-shared-types) |
| Drop start date on a Stimpie | W5 | `Stimpie.drop` includes `startsAt` and `endsAt` | [api §2](backend/api-reference.md#2-shared-types) |
| Image/file URL format | W8, S13 | Absolute URLs, random immutable file names, CORS `*` on `/uploads/*` | [api §1](backend/api-reference.md#1-conventions) |
| CORS headers | W9, S2, A5 | Explicit origins from `WEB_URL`/`ADMIN_URL` (comma-separated lists allowed); allowed `Idempotency-Key`; exposed `X-Request-Id`, `Retry-After`, `Date`; preflight handled | [wiring §5.3](wiring/README.md#53-cors-matrix-api-side) |
| Request ids | S3 | `X-Request-Id` header and `error.requestId` | [api §1](backend/api-reference.md#1-conventions) |
| `Retry-After` | S16, A12 | Sent on every `429` alongside `details.retryAfterSeconds`; login limited per IP and per email | [api §1](backend/api-reference.md#1-conventions), [security §2.4](backend/security-and-testing.md#24-abuse-controls-on-public-endpoints) |
| Clock authority for countdowns | S10, W12 | `GET /health` returns `time` in milliseconds, `no-store`, CORS-enabled. `GET /drops` is cached 10 s and `no-store` within 60 s of a drop start | [api §1, §3.1](backend/api-reference.md#31-health) |
| Upload errors and image limit | S9, D17, A9 | Images 10 MB; `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE` | [api §5.4](backend/api-reference.md#54-products) |
| Orders list: multi-status, sorting, new-order polling | D1, D2, D3 | `status` accepts a comma-separated list; sortable fields `placedAt`, `totalCents`, `number`, `status`; `afterId` returns orders newer than a known id | [api §5.3](backend/api-reference.md#53-orders) |
| Allowed transitions | D5 | Exactly the table in business rules §7. `OUT_FOR_DELIVERY` cannot be cancelled (it is *returned*); `DELIVERED → RETURNED` is allowed; no skipping | [api §5.3](backend/api-reference.md#53-orders), [business rules §7](backend/business-rules.md#7-status-machine) |
| Bulk "Mark delivered" | D9 | `bulk-status` accepts `DELIVERED` as well | [api §5.3](backend/api-reference.md#53-orders) |
| Export by selection and CSV safety | D8, A8 | Body may be `{ ids }`; `Content-Disposition` filename `orders-YYYY-MM-DD.csv`; cells starting `= + - @` are prefixed with `'` | [api §5.3](backend/api-reference.md#53-orders) |
| Reordering colours, sizes, packs, hoodies | D13 | `PUT /admin/{colors,sizes,packs,hoodies}/order` with `{ ids }` | [api §5.4](backend/api-reference.md#54-products) |
| Inactive rows in admin lists | D25 | Included, with `active` and an `?active=` filter | [api §5.4](backend/api-reference.md#54-products) |
| Global search | D4 | New `GET /admin/search?q=` (orders and customers, 5 each) | [api §5.4](backend/api-reference.md#54-products) |
| Email preview | D19 | New `POST /admin/email-templates/:key/preview`; layout fixed in v1 with `settings.email.footerText` as the only branding field | [api §5.11](backend/api-reference.md#511-content), [integrations §1](backend/integrations.md#1-email-delivery) |
| Email test and master switch | D20 | Test send ignores the master switch, returns `202` | [api §5.11](backend/api-reference.md#511-content) |
| Stock movement reasons | D26 | Full enum documented | [api §5.5](backend/api-reference.md#55-stock) |
| Manual orders and unsellable Stimpies | D28 | Same availability rules as customers (`NOT_PURCHASABLE` / `SOLD_OUT`); adjust stock or end the drop first | [api §5.3](backend/api-reference.md#53-orders) |
| Duplicate delivery numbers on single orders | found during reconciliation | Every order call returns `warnings` (`DUPLICATE_DELIVERY_NUMBER`), never blocking | [api §5.3](backend/api-reference.md#53-orders) |
| Reading the CSV file name from the browser | found during reconciliation | `Content-Disposition` is an exposed CORS header on admin routes | [api §1](backend/api-reference.md#1-conventions), [wiring §5.3](wiring/README.md#53-cors-matrix-api-side) |
| Catalog and content text limits | D22 | Added to the conventions table | [api §1](backend/api-reference.md#1-conventions) |
| `LOW_STOCK` attention values | D12 | `itemType` is `HOODIE_VARIANT` or `STIMPIE` | [api §5.2](backend/api-reference.md#52-overview) |
| Deliveries list envelope | D11 | A `Page<...>` | [api §5.8](backend/api-reference.md#58-deliveries) |
| Delivery-number correction and emails | D10 | Does **not** resend "On its way"; the founder uses Resend | [api §5.3](backend/api-reference.md#53-orders) |
| Session lifetime, refresh, password rules | S1, A1, A3, A7 | Sliding 7 days, absolute 30 days; no refresh endpoint; `GET /auth/me` returns `session.expiresAt`; passwords ≥ 12 characters | [api §4](backend/api-reference.md#4-authentication-endpoints) |
| Wrong current password | A2 | `400 VALIDATION_ERROR` on `fields.currentPassword`, never `401` | [api §4](backend/api-reference.md#4-authentication-endpoints) |
| Logout on an invalid session | A13 | Always `204` | [api §4](backend/api-reference.md#4-authentication-endpoints) |
| Allowed origins for phone testing | A4 | `ADMIN_URL`/`WEB_URL` accept comma-separated lists; cookies are host-only, so use one host name for the dashboard and API | [backend README §6](backend/README.md#6-configuration) |
| CSRF requirement | S2 | The `Origin` check only; no custom header | [security §2.2](backend/security-and-testing.md#22-browser-facing-protections) |
| Timezone | S14, D24, G5 | `business.timezone`, default `Asia/Beirut`; day boundaries and date-only ranges use it | [api §5.12](backend/api-reference.md#512-settings) |
| Insight units | S12, D23 | Ratios are fractions 0..1; `weekday` 0 = Sunday | [api §5.10](backend/api-reference.md#510-insights) |

---

## 2. Settled by confirming a behaviour (no contract change)

| Topic | Questions | Decision |
|---|---|---|
| Reloading the confirmation page | C2, S8 | There is no public order read. The page keeps the `POST /orders` response in `sessionStorage`; on another tab or device it falls back to **Track order** (order number from the URL, phone typed by the customer) |
| WhatsApp after ordering | C (design choice) | The site shows a one-tap **Confirm on WhatsApp** button rather than auto-opening WhatsApp (popup blockers); the order exists either way |
| UTM handling | C (design choice) | The site captures UTM values on landing and sends them as `attribution` (see §1); it never sends unknown fields |
| Business WhatsApp number format | W11 | Stored `+961XXXXXXXX`; the site strips non-digits to build `wa.me` links |
| Colour slugs for share links | B6 | Share links use `colorId`; acceptable for v1 |
| Responsive image sizes | B8 | No width parameter; `next/image` optimises remote images (the API host is in `remotePatterns`) |
| Analytics events | B11 | No analytics endpoint; a privacy-friendly third-party/self-hosted tool is used on the website only, with no personal data |
| `accentHex` | G1 | Always exactly the brand hex (`#FFE45C`, `#5CC8FF`, `#C9B6FF`) |
| Announcement bar style | G3 | Fixed black bar, white text; only `text` and `linkUrl` are configurable |
| New-order notifications | S6 | The dashboard polls `GET /admin/orders/counts` every 30 s and uses `afterId` to fetch what is new; no push channel in v1 |
| Revalidation after dashboard saves | W4, S11 | No on-demand revalidation in v1. Public catalog and content revalidate within 30–60 s; drop timing is handled by the countdown and the 10 s / `no-store` rules |
| `GET /orders/track` frequency | S17 | Limited to 20 requests per 10 minutes per IP; the Track page's Refresh button respects it |
| Upload cache headers | S13 | Random, never-changing file names with a one-year immutable cache |
| CSP / frame protection | A10 | API responses send `frame-ancestors 'none'`; the static host for the dashboard sets it at deployment |
| Cancel reason | D (design choice) | Optional in the API; required by the dashboard UI |

---

## 3. Deliberately not in version 1

| Item | Questions | Note |
|---|---|---|
| Print label / delivery sheet endpoints | D6 | The dashboard builds print views from order data |
| Create exchange | D7 | Handled as `RETURNED` plus a new manual order |
| Delete or replace uploaded files | D18 | Removing in the UI only removes the reference |
| Email branding editor (logo, layout) | D19 | Fixed layout; only the footer text is editable |
| Two-factor login, email change, "log out everywhere" | D21, A6, A11 | Planned later; the login flow is structured to take a second step |
| Draft / publish for the Builder | B9 | Saved settings are live; the dashboard previews before saving |
| "Notify me when back" for hoodies | W10 | Only drop notifications exist |
| Contract-wide push events (SSE/WebSocket) | S6 | Polling is enough at this scale |
| On-demand cache invalidation hook | W4, S11 | A later improvement |

---

## 4. Values to enter in the dashboard (not decisions, not blockers)

Everything below is **data the owner enters through the dashboard after the first run**, not something a developer needs before building. The seed ships placeholders, and the **Get ready to sell** checklist on the dashboard Overview ([api §5.2](backend/api-reference.md#52-overview)) lists each one with a link to where it is edited and marks it done once reviewed.

Nothing below blocks writing code; each has a safe default.

| Question | Default until decided | Who decides |
|---|---|---|
| The real hoodie colours, sizes and size-chart numbers | Placeholders in the seed, replaced in the dashboard | Owner |
| The default delivery fee and estimate text | $3 and "2-3 working days" placeholders | Owner |
| A hoodie 3D model (GLB) | 3D mode stays disabled (`effectiveMode` falls back to 2D) until one is uploaded | Owner/designer |
| Business WhatsApp number | Unset: the confirmation page hides the WhatsApp button | Owner |
| Hoodie-only price | Seeded at $25 | Owner |
| Whether to confirm a payment-phase for returns (refund tracking) | Out of scope: cash handling stays manual | Owner |

| Where each value is edited | Dashboard location |
|---|---|
| Colours, sizes | Products → Options |
| Size chart and how-to-measure text | Products → Size chart |
| Hoodie price, cost, photos; pack and Stimpie prices | Products → Hoodies / Packs / Stimpies |
| Delivery fee, per-area fees, estimate text | Deliveries → Fees |
| Business WhatsApp number, contact emails | Settings → Business |
| 3D model (GLB), 2D hoodie images, placement | Content → Builder |
| Policy texts, FAQs, announcement | Content |
| Email and WhatsApp wording | Content → Emails |

---

## How the frontend documents are kept in step

Each frontend document ends with an "Open questions for the API" section written before these decisions. Those sections now begin with a pointer to this log, and the document bodies have been reconciled with the decisions above (the original question tables are kept only where still open).
