# State, Errors and Cross-cutting Frontend Behaviour

## Purpose and audience

This document defines behaviour that both frontends share or must agree on: how data is fetched and cached, how every API error is shown, how forms map server validation to fields, what loading/empty/offline states look like, how money, dates and countdowns are formatted, and the accessibility, performance, SEO, analytics, logging, configuration and browser-support baselines. It applies to the public website (`apps/web`, Next.js App Router) and the dashboard (`apps/admin`, Vite + React + TanStack Query).

Audience: developers building either app, and reviewers checking that screens behave consistently. The API shapes, endpoints, enums and error codes are those of the [API contract](../backend/api-reference.md); where the contract is silent, the gap is listed under [Open questions for the API](#21-open-questions-for-the-api) (the decision log for earlier questions is [../open-questions.md](../open-questions.md)). Visual details (skeletons, toasts, banners) are in [design-system.md](design-system.md). The Builder specifics are in [builder.md](builder.md).

Constraints that shape everything: English only, USD, cash on delivery, mobile first (most traffic comes from Instagram, often in its in-app browser), weak and unstable connections in Lebanon, local-only environment for now.

## Table of contents

1. [Principles](#1-principles)
2. [Data fetching and caching: website](#2-data-fetching-and-caching-website)
3. [Data fetching and caching: dashboard](#3-data-fetching-and-caching-dashboard)
4. [Cache invalidation map (dashboard mutations)](#4-cache-invalidation-map-dashboard-mutations)
5. [API errors and error-code mapping](#5-api-errors-and-error-code-mapping)
6. [Form handling and validation mapping](#6-form-handling-and-validation-mapping)
7. [Loading and skeleton rules](#7-loading-and-skeleton-rules)
8. [Empty states](#8-empty-states)
9. [Optimistic updates](#9-optimistic-updates)
10. [Offline and slow-network behaviour](#10-offline-and-slow-network-behaviour)
11. [Toasts vs inline errors](#11-toasts-vs-inline-errors)
12. [Formatting rules](#12-formatting-rules)
13. [Server clock offset and countdowns](#13-server-clock-offset-and-countdowns)
14. [Accessibility baseline](#14-accessibility-baseline)
15. [Performance budgets](#15-performance-budgets)
16. [SEO and link previews](#16-seo-and-link-previews)
17. [Analytics events catalogue](#17-analytics-events-catalogue)
18. [Logging and error reporting](#18-logging-and-error-reporting)
19. [Environment variables](#19-environment-variables)
20. [Browser support matrix](#20-browser-support-matrix)
21. [Open questions for the API](#21-open-questions-for-the-api)

---

## 1. Principles

| # | Principle |
|---|---|
| 1 | The server is the authority for prices, stock, drop state and time. The client displays and never decides. |
| 2 | One typed API client (`packages/api-client`, generated from the OpenAPI document) is the only way either app talks to the API. No ad-hoc `fetch` calls to the API in components. |
| 3 | Every API call can fail. Every screen that loads data has loading, empty and error states (sections 7-8). |
| 4 | Never lose what the customer typed. Failed submissions keep form values. |
| 5 | Never show a raw error. `error.message` from the API is safe to show; codes are for logic. Unknown failures show a generic friendly line. |
| 6 | Weak connections are normal, not exceptional (section 10). |
| 7 | Money is integer cents everywhere; no floating-point arithmetic on prices. |

---

## 2. Data fetching and caching: website

### 2.1 Approach

- **Server Components fetch public catalog data** with the generated client, using Next.js fetch caching: `fetch(url, { next: { revalidate: N, tags: [...] } })`. Pages are statically generated or ISR where possible; they are fast on weak connections and give link previews proper metadata.
- **Client Components** needing live data (cart validation, the drop countdown refresh, Builder state, checkout, tracking) call the same client with `cache: 'no-store'` through small hooks. TanStack Query is **not** used on the website (bundle size); a minimal `useFetch` hook with abort + retry suffices (< 2 KB).
- All `POST`s (`POST /orders`, `POST /cart/validate`, `POST /orders/track`, `POST /orders/find`, `POST /drops/:id/subscribe`) are never cached.
- The API sends `Cache-Control: public, max-age=30` on catalog `GET`s. Exceptions: `GET /drops` and `GET /drops/:slug` send `max-age=10` and switch to `no-store` while any drop starts within the next 60 seconds; `GET /health` is always `no-store`. Next's revalidate sits on top, so worst-case staleness is `revalidate + API max-age` (30 s for most catalog data, 10 s for drops).
- Image, video and GLB URLs in responses are absolute, with random immutable file names; `/uploads/*` sends `Access-Control-Allow-Origin: *`.
- In development (local), set `revalidate: 0` via env (`NEXT_PUBLIC_DEV_NO_CACHE=1`) so edits in the dashboard show immediately.

### 2.2 Revalidate times per endpoint group

| Endpoint | Next `revalidate` (s) | Tag | Why |
|---|---|---|---|
| `GET /content` | 60 | `content` | Text changes rarely. |
| `GET /options` | 60 | `options` | Colours/sizes change rarely but must follow the dashboard. |
| `GET /size-chart` | 300 | `size-chart` | Rarely changes. |
| `GET /delivery/fees` | 300 | `delivery` | Rarely changes; re-fetched fresh (no-store) on `/checkout`. |
| `GET /products/hoodies`, `/products/hoodies/:slug` | 60 | `catalog` | Per-variant stock (`inStock`) must not be stale for long; hoodie detail pages refetch on the client for stock (no-store) after hydration. |
| `GET /products/stimpies`, `/products/stimpies/:slug` | 30 | `catalog` | Limited stock (`status`, `remaining`) is time-sensitive. |
| `GET /packs` | 60 | `catalog` | |
| `GET /promotions` | 5 | `promotions` | Active promotion windows change on a schedule; homepage offers use current public catalog targets. |
| `GET /drops`, `GET /drops/:slug` | 15 (and `no-store` from the client while a drop starts within 60 s) | `drops` | Drop state and `unitsRemaining` change fast on drop day; the API itself caches for 10 s and sends `no-store` within 60 s of a drop start; the countdown page also refreshes on the client (section 13). |
| `GET /builder/config` | 60 | `builder` | Mode switch propagates in about 90 s. |
| `GET /health` | not cached (always `no-store` on the API) | n/a | Used for clock offset (section 13). |
| Order tracking, `POST /orders*`, `POST /cart/validate` | never | n/a | |

There is no on-demand revalidation hook in v1: dashboard saves reach the website within 30-60 s (revalidate plus API cache). If a hook (`revalidateTag`) is added later, the tags above are the contract.

### 2.3 Client-side freshness rules

| Surface | Rule |
|---|---|
| Cart | Stored in `localStorage` (`stimpy.cart.v1`, with a schema version; wrapped in try/catch; falls back to memory if storage is blocked, which happens in some in-app browsers). Contains ids, quantities and display snapshots only. |
| Opening the cart drawer | Call `POST /cart/validate` with the cart `items` (and `areaId` if known) in the background. Each `lines[]` entry says `ok`, the server's `unitPriceCents`/`lineTotalCents`, and `problems` (`StockProblem` / `PurchaseProblem`, matched to the cart line by `itemIndex`). Flag lines that are not `ok` or whose price changed. Nothing is reserved. |
| `/checkout` entry | Call `POST /cart/validate` with `items` and the chosen `areaId`, and fetch `GET /delivery/fees` and `GET /packs` fresh (no-store). The total shown and sent as `expectedTotalCents` is `validate.totalCents` (the grand total **including delivery**); re-validate when the area changes. `estimateText` from the response is the delivery estimate. |
| Hoodie detail / Builder size sheet | Refresh variant stock (`GET /products/hoodies/:slug`, no-store) when the size chooser opens. |
| Drops pages | Client re-poll every 30 s while visible and the drop is `LIVE` (stock), every 5 s during the final 60 s before `startsAt` (section 13). Pause when the tab is hidden. |
| Track page | Fetch on submit only; allow manual "Refresh" button (honours the 20-requests-per-10-minutes-per-IP limit via the `RATE_LIMITED` countdown); no polling. |
| Confirmation page | Reads the `POST /orders` response from `sessionStorage`; falls back to Track order when absent (section 10.3). |
| Everything else | Server-rendered; no client refetch. |

---

## 3. Data fetching and caching: dashboard

The dashboard is a single-page app: **TanStack Query v5** with the generated client. All requests use `credentials: "include"` (session cookie `stimpy_session`).

### 3.1 Global defaults

| Setting | Value |
|---|---|
| `staleTime` | 30 s default (overridden below) |
| `gcTime` | 10 min |
| `retry` | queries: 2 retries with exponential backoff (1 s, 2 s) for network errors and 5xx; **never** for 4xx. Mutations: 0 retries (except none are automatically retried; see section 10 for the order idempotency exception on the website). |
| `refetchOnWindowFocus` | `true` (the founder switches between phone apps; fresh data on return) |
| `refetchOnReconnect` | `true` |
| `networkMode` | `online` (queries pause offline and an offline banner shows) |
| Query key convention | `[group, resource, params]`, e.g. `['orders','list',{status,page}]` |

### 3.2 Stale times per endpoint group

| Group | Endpoints | `staleTime` | Refetch interval |
|---|---|---|---|
| Session | `GET /auth/me` (returns `user` and `session.expiresAt`) | 5 min | none |
| Overview | `GET /admin/overview` | 30 s | 60 s while tab visible |
| Orders list | `GET /admin/orders` (`status` accepts one value or a comma-separated list; sort by `placedAt`, `totalCents`, `number`, `status`) | 15 s | none |
| Global search | `GET /admin/search?q=` (5 orders + 5 customers) | 0 | none; debounce typing 250 ms |
| Order counts | `GET /admin/orders/counts` | 0 | **30 s while visible** (drives the New-order badge/sound; there is no push channel in v1). When the `NEW` count rises, fetch `GET /admin/orders?afterId=<highest id seen>` to get exactly the orders that arrived since the last poll. |
| Order detail | `GET /admin/orders/:id` | 0 (always refetch on mount/focus) | none |
| Stock | `GET /admin/stock/hoodies`, `/stimpies` | 15 s | none |
| Stock movements | `GET /admin/stock/movements` | 60 s | none |
| Products and options | `/admin/hoodies`, `/admin/stimpies`, `/admin/packs`, `/admin/colors`, `/admin/sizes`, `/admin/size-chart` | 5 min | none |
| Drops | `/admin/drops` | 30 s (LIVE tab 15 s with 30 s refetch interval) | LIVE tab only |
| Customers, subscribers | `/admin/customers*`, `/admin/subscribers` | 60 s | none |
| Finance | `/admin/finance/*`, `/admin/expenses`, `/admin/ad-spend` | 2 min | none |
| Insights | `/admin/insights/*` | 5 min | none |
| Content | `/admin/content/:key`, `/admin/faqs`, `/admin/reviews`, `/admin/builder` | 5 min | none |
| Templates and log | `/admin/email-templates`, `/admin/whatsapp-templates`, `/admin/email-log` | 5 min; email log 30 s | none |
| Deliveries | `/admin/deliveries`, `/admin/areas`, `/admin/settings/delivery` | 30 s; areas and settings 5 min | none |
| Settings | `GET /admin/settings` | 5 min | none |

Pagination uses `placeholderData: keepPreviousData` so tables do not flash empty between pages. Lists with filters keep the filter state in the URL query string (`?status=NEW&page=2`) so refresh and back work.

---

## 4. Cache invalidation map (dashboard mutations)

On success, a mutation invalidates the listed query-key groups (and the specific detail key). "Overview" always includes `GET /admin/overview`. Invalidate, do not hand-patch caches, except where section 9 allows optimistic updates.

| Mutation | Invalidate |
|---|---|
| `POST /admin/orders` (manual order) | orders list, orders counts, overview, stock (hoodies, stimpies, movements), customers (list, the matching detail), deliveries, insights |
| `PATCH /admin/orders/:id`, `PATCH /admin/orders/:id/contact` | order detail, orders list, customers detail |
| `POST /admin/orders/:id/status` | order detail, orders list, orders counts, overview, stock (all three), deliveries, finance (profit, cash), insights, customers detail; also email log (status emails are queued) |
| `POST /admin/orders/bulk-status` | orders list, orders counts, overview, stock, details of `updated` ids, email log |
| `POST /admin/orders/:id/delivery`, `POST /admin/deliveries/dispatch` | order detail(s), orders list, orders counts, overview, deliveries, finance cash, email log |
| `POST /admin/orders/:id/cash`, `POST /admin/deliveries/:deliveryNumber/settle` | order detail(s), orders list, deliveries, finance cash, overview |
| `POST /admin/orders/:id/notes` | order detail only |
| `POST /admin/orders/:id/extend-hold` | order detail, orders list, overview (attention) |
| `POST /admin/orders/:id/email` | order detail, email log, overview (attention) |
| `POST /admin/orders/export` | none |
| `POST /admin/stock/adjust`, `POST /admin/stock/set` | stock (hoodies, stimpies, movements), overview (attention), products lists (stock summary fields), drops (live panel) |
| `POST/PATCH/DELETE /admin/hoodies` | hoodies list/detail, stock hoodies, builder (colours per hoodie join) |
| `POST/PATCH/DELETE /admin/stimpies` | stimpies list/detail, stock stimpies, drops (lists and detail), builder, overview |
| `POST/PATCH/DELETE /admin/packs` | packs list |
| `PUT /admin/colors/order`, `/admin/sizes/order`, `/admin/packs/order`, `/admin/hoodies/order` (`{ ids }`, `204`) | the matching list; colours and sizes also invalidate options; colours also invalidate builder |
| `POST/PATCH/DELETE /admin/colors` | colours list, **options** (colours), stock hoodies (new variants), hoodies lists/detail, **builder** (new colour row, `assetsReady`) |
| `POST/PATCH/DELETE /admin/sizes` | sizes list, options (sizes), stock hoodies, hoodies lists/detail, size chart |
| `PUT /admin/size-chart` | size chart |
| `POST /admin/uploads` | none (the resulting URL is held in form state) |
| `POST/PATCH/DELETE /admin/drops`, `POST /admin/drops/:id/end` | drops (all tabs), stimpies list, stock stimpies, overview (live drop), insights |
| `PATCH /admin/customers/:id` | customers list, customer detail, order details for that customer |
| `POST/PATCH/DELETE /admin/areas`, `PATCH /admin/settings/delivery` | areas, delivery settings, deliveries |
| `POST/PATCH/DELETE /admin/expenses`, `/admin/ad-spend` | expenses/ad-spend list, finance profit, insights |
| `PUT /admin/content/:key`, FAQ, review mutations (`PUT /admin/faqs/order` included) | the matching content query, FAQ/review lists |
| `PUT /admin/builder` (saved = live; there is no draft step) | builder (admin), colours list (status), stimpies list (override flags) |
| `PUT /admin/email-templates/:key`, `PUT /admin/whatsapp-templates`, `POST /admin/email-templates/:key/test` (`202`; ignores the master email switch) | templates list; test: email log. `POST /admin/email-templates/:key/preview` changes nothing (no invalidation). |
| `POST /admin/email-log/:id/retry` | email log, overview (attention), order detail if open |
| `PATCH /admin/settings` | settings, overview (low-stock threshold affects attention), and a **full invalidate** of stock if `orders.lowStockThreshold` changed. If `business.timezone` changed, also content and every date-bearing query (orders, overview, finance, insights) and the timezone held by the formatters (section 12.2). |
| `POST /auth/login` | clear everything, then `auth/me` |
| `POST /auth/logout`, `POST /auth/change-password` | clear the entire query cache and navigate to `/login` (change-password: keep the session, show a toast; logout always returns `204`, even if the session was already invalid, so treat it as success) |

Website consistency note: the public site caches catalog data (section 2.2). A dashboard save is visible on the website after at most `revalidate + API max-age` (about 30-60 s). The dashboard shows a hint after catalog/builder/content saves: "Changes appear on the website within about a minute."

---

## 5. API errors and error-code mapping

### 5.1 Format and client handling

Every non-2xx response has `{ "error": { code, message, fields?, details, requestId } }`, and every response (success or error) carries an `X-Request-Id` header that error bodies repeat as `error.requestId`. The API client throws a typed `ApiError { status, code, message, fields, details, requestId, retryAfterSeconds? }`, filling `requestId` from the body (or the header) and `retryAfterSeconds` from `details.retryAfterSeconds` (or the `Retry-After` header). Both headers are exposed to browsers by CORS (`X-Request-Id`, `Retry-After`, `Date`). The only request headers the API allows are `Content-Type` and `Idempotency-Key`. Wrap all calls so that failures that are **not** this shape become a synthetic error:

| Synthetic `code` | When |
|---|---|
| `NETWORK` | `fetch` rejected (offline, DNS, CORS, connection reset) |
| `TIMEOUT` | The request exceeded its timeout (GET 15 s; `POST /orders` 30 s; uploads 120 s) |
| `BAD_RESPONSE` | Non-JSON body or an unexpected shape (e.g. 502/503/504 HTML from a proxy) |
| `UNKNOWN` | Anything else |

`message` is shown to the user only when the code is in the table below and the row says so; otherwise use the app's own copy. Never show `details` raw. Where a row says "offer support" (unexpected errors), show the short `requestId` ("Reference: 4c1f0a9e") so the founder can find it in the server logs; it is not sensitive and contains no personal data.

### 5.2 Mapping: every code, both apps

| HTTP | `code` | Website behaviour | Dashboard behaviour |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Map `fields` onto form fields (section 6). Inline message under each field, error summary at the top of the form, focus the first invalid field. Fields the UI does not know go in the summary using the API message. Duplicate Stimpies in a pack arrive as `items.N.stimpieIds.M` (the UI should already prevent them). A non-empty `hp` yields a generic validation error: show the generic summary line only ("Please check your details and try again."). | Same field mapping; plus a toast "Please check the highlighted fields." only if the form is long and the first error is off-screen. For `PUT/PATCH` forms keep dirty state. **Change password:** a wrong current password is `400 VALIDATION_ERROR` on `fields.currentPassword` (never `401`): show it under that field ("Current password is incorrect."), and do not treat it as a session expiry. A new password under 12 characters or on the common-password list is `fields.newPassword`. |
| 401 | `UNAUTHENTICATED` | Not expected on public routes. Treat as `INTERNAL` (generic error) and log. On `POST /auth/login` n/a (website has no login). | **Session ended.** Sessions slide (each use extends expiry to 7 days from now) up to an absolute 30 days after login; there is **no refresh endpoint**, so the only recovery is signing in again. `GET /auth/me` returns `session.expiresAt` (the earlier of the sliding and absolute expiry); the dashboard may show "Your session ends on {date}" in the account menu and a gentle warning in the last hour, but never refreshes silently. Clear cached user, keep unsaved form state in memory, show a "Sign in again" modal (not a redirect) that re-authenticates in place and then asks the user to repeat the action. If the modal is dismissed, navigate to `/login?next=<path>`. For `POST /auth/login` itself: show the API `message` inline above the form ("Incorrect email or password."), never revealing which part is wrong. |
| 403 | `FORBIDDEN` | Generic "Something went wrong. Please refresh and try again." + log (origin-check failures are developer problems). | Toast "You don't have permission to do that." If it happens on a normal action while logged in as OWNER, show "Please refresh the page and try again." and log (probable origin or CORS problem). |
| 404 | `NOT_FOUND` | Pages: render the 404 page (`notFound()`). **Track page / `POST /orders/track`:** show one message only, "We couldn't find an order with those details. Check the order number and phone number." (the API deliberately returns the same error for unknown order and phone mismatch; the UI must not hint which). Hidden product slug: 404 page with link to the shop. | Detail pages: "This item no longer exists" empty state with a back link and invalidate the list. Mutations on a vanished resource: toast "This item was removed" and invalidate. |
| 409 | `SOLD_OUT` | Checkout / `POST /orders`: nothing was reserved. `details.items[]` is `StockProblem[]`: each has `kind` (`HOODIE_VARIANT` with `hoodieId`+`colorId`+`sizeId`, or `STIMPIE` with `stimpieId`), `itemIndex` (index into the `items` array that was sent: the first line that needs it), `name`, `requested` (total units the whole order needs of that thing) and `available`. All failing things are reported in one response. Match them to cart lines with `itemIndex` (or the ids when the same thing appears in several lines; compare `requested` with the summed quantities). Show a banner "Sorry, {name} just sold out." (or "Only {available} left of {name}." when `available > 0`), mark the matching cart lines (set quantity to `available` if > 0 via a one-tap "Update cart", else "Remove"), refetch stimpies/hoodies stock, **keep all form values**, and offer alternatives (link to `/shop` filtered to available Stimpies). The Builder never shows this error. | Manual order form (`POST /admin/orders`): inline error on the affected line item with the available quantity; the form stays editable. Bulk/status actions that fail with it: toast with item names. |
| 409 | `NOT_PURCHASABLE` | `details.items[]` is `PurchaseProblem[]`: `kind` + ids as above, `itemIndex`, `name` and `reason`. Use `reason`: `INACTIVE` -> "{name} is no longer available."; `DROP_NOT_STARTED` -> "{name} isn't available yet. The drop starts soon." with a link to the drop page; `DROP_ENDED` -> "{name} is part of a drop that has ended." Remove or flag the lines, keep form values, refetch catalog. | Same wording on the manual order form (inline per line). Add: "You can still enter this order manually only after changing the drop or product." |
| 409 | `INVALID_TRANSITION` | n/a. | Toast "That status change isn't allowed from {from}." Immediately refetch the order and re-render buttons from `allowedTransitions` (use `details.allowed` for the message). Never retry. |
| 409 | `CONFLICT` | **Idempotency case:** `details.field === "Idempotency-Key"` on `POST /orders` means the same key was reused with a different request body. Nothing was ordered. Generate a **new** `Idempotency-Key` and resubmit the current cart (section 10.3). Any other `CONFLICT` on the website is generic. (A repeat with the same key **and** the same body is not an error: it returns the original order with `200`.) | Use `details.field`: inline error on that field ("That name or slug is already used."). For stock: "This would drop stock below reserved units." (adjust/set). For delete of a referenced item: modal "This is used by existing orders and can't be deleted. Hide it instead?" with a **Hide** button that sends `active: false`. |
| 422 | `DELIVERY_NUMBER_REQUIRED` | n/a. | Open/keep the dispatch dialog, focus the delivery number input, inline error "Enter the delivery number from the delivery slip." |
| 422 | `PRICE_CHANGED` | `POST /orders` with `expectedTotalCents` only. Nothing was ordered. Update the displayed total from `details.totalCents`, show a modal: "The total changed to {new total}." Buttons: **Review order** (focus the summary) and **Place order at {new total}** (re-submits with the new `expectedTotalCents` and a **new** `Idempotency-Key`). Refetch fees, packs and stock first. | Not sent from the dashboard (`expectedTotalCents` is omitted), but if present: same modal wording. |
| 429 | `RATE_LIMITED` | Read the wait from `details.retryAfterSeconds` (the same value is in the `Retry-After` header; prefer the body, fall back to the header). Disable the triggering button and show "Too many tries. Please wait {n} seconds." with a live countdown, then re-enable. `POST /orders/track` is limited to 20 requests per 10 minutes per IP, so the Track page's Refresh button must respect the countdown. On `POST /orders/find` the same neutral message applies. Never auto-retry. | Login (limited per IP **and** per email): lock the form with the countdown. Other actions: toast "Slow down a moment ({n}s)." and disable the button for `n` seconds. |
| 500 | `INTERNAL` | Generic: "Something went wrong on our side. Please try again." with a **Try again** button. For `POST /orders` use the retry rules in section 10.3 (the order may or may not exist: retry with the same idempotency key, never create a new key). Offer the WhatsApp contact link (from `GET /content` -> `business.whatsappNumber`) as an alternative. | Toast (persistent, with **Retry** if the action is safe to repeat) "Something went wrong on the server." Log to console and the error reporter. |
| any | `NETWORK` | Banner "You seem to be offline." (section 10); keep form values; **Try again**. | Offline banner; queries pause; mutation shows toast "Not sent. Check your connection and try again." |
| any | `TIMEOUT` | Same as network, wording "That's taking longer than usual." For `POST /orders` retry per 10.3. | Toast with Retry. |
| any | `BAD_RESPONSE`, `UNKNOWN`, other 5xx | As `INTERNAL`. | As `INTERNAL`. |
| 413 | `FILE_TOO_LARGE` | n/a (no uploads on the website). | `POST /admin/uploads` exceeded the limit for its type. Inline error under `FileUpload`: "That file is too large (maximum {maxBytes formatted as MB})." using `details.maxBytes`. Limits: images 10 MB (resized to 2000 px), video 100 MB, `.glb` 50 MB. The form keeps its other values. |
| 415 | `UNSUPPORTED_FILE_TYPE` | n/a. | Inline error under `FileUpload`: "That file type isn't supported. Use {allowed list}." using `details.allowed`. The type is judged by file content, not file name, so a renamed file is still rejected. |

### 5.3 Rules

- An error never clears user input.
- An unknown `code` is treated like `INTERNAL`.
- A `5xx` or `NETWORK` on a **GET** triggers the section's `ErrorState` with **Try again**, or a stale-data banner if cached data exists ("Showing saved data. Some information may be out of date.").
- Errors are logged (section 18) with `code`, HTTP status, method, path and `requestId` (never request bodies).
- Unexpected errors (`INTERNAL`, `BAD_RESPONSE`, `UNKNOWN`, unexpected `FORBIDDEN`) show the short `requestId` as a "Reference" under the message when one exists, and the dashboard's "Copy details" includes it.

---

## 6. Form handling and validation mapping

### 6.1 Principles

- Client validation is **for convenience only** and must be no stricter than the server. The server (`VALIDATION_ERROR` + `fields`) is the authority. Do not duplicate server rules like phone normalisation: accept what a person types.
- Validate on blur (after first touch) and on submit; never on every keystroke; never show an error on an untouched empty field before submit.
- Use `react-hook-form` (small, uncontrolled) in both apps; Zod schemas for client convenience may be shared via `packages/shared` if it matches the API; do not hand-write divergent rules.
- After a failed submit: focus the first invalid field, set `aria-invalid`, link errors with `aria-describedby`, announce the summary (`role="alert"`).
- Never disable the submit button because the form is invalid (people cannot tell why). Disable only while submitting.
- Double-submit protection: submit buttons go to `loading` and ignore further clicks; `POST /orders` also uses the `Idempotency-Key`.

### 6.2 Field path mapping

`error.fields` keys are dotted paths into the **request body**. Array indices are zero-based.

**Checkout (`POST /orders`) and the dashboard manual order (`POST /admin/orders`)**

| API path | UI field |
|---|---|
| `customer.name` | Full name |
| `customer.email` | Email (optional in the dashboard form) |
| `customer.phone` | Phone |
| `customer.whatsapp` | WhatsApp number (only shown when "same as my phone number" is unticked) |
| `customer.whatsappSameAsPhone` | Checkbox (error unlikely; show under the WhatsApp field) |
| `delivery.areaId` | Area select |
| `delivery.areaName` | Area/city (text, if the select is "other") |
| `delivery.address` | Address |
| `delivery.notes` | Notes |
| `items` (array-level) | Cart summary: "Your cart has a problem" banner at the top of the order summary |
| `items.N.kind` / `items.N.packId` / `items.N.hoodieId` / `items.N.colorId` / `items.N.sizeId` | The Nth cart line: inline note on that line ("Choose a size"); in the dashboard form, the matching select in line N |
| `items.N.stimpieIds` / `items.N.stimpieIds.M` | Nth line's Stimpie pickers ("Pick exactly {stimpieCount} Stimpies") |
| `items.N.stimpieId` | Nth line's Stimpie |
| `items.N.qty` | Nth line's quantity stepper (1 to 10) |
| `expectedTotalCents` | Not a user field: treat as `PRICE_CHANGED`-like; refetch totals and show the generic summary |
| `attribution.utmSource` / `utmMedium` / `utmCampaign` | Not user fields (captured from the landing URL, each at most 80 characters, letters/digits/`-_.` only). Sanitise before sending and never show an error for them; on a validation error here drop `attribution` and resubmit once. |
| `hp` | Not a field: generic summary line only |
| `source`, `initialStatus`, `sendEmail` (dashboard) | Matching selects/switches in the manual order form |

Mapping rule: resolve `items.N.*` by index N of the **array that was sent**, so keep the submitted item order stable until the response arrives. The same index convention applies to `itemIndex` in `SOLD_OUT` / `NOT_PURCHASABLE` details and in `POST /cart/validate` lines. Field paths use dots and numeric indices; a problem with an array as a whole (for example more than 20 items) is reported on the array's own path (`items`). Text limits: `customer.name` 2-80, `customer.email` up to 190, `delivery.areaName` up to 120, `delivery.address` 5-300, `delivery.notes` up to 300, admin notes up to 1000, delivery number 1-60, cancel reason up to 255; at most 20 items, `qty` 1-10.

**Other forms (dashboard)** use the same dotted-path rule against their request bodies:

| Form | Request | Path examples -> UI |
|---|---|---|
| Order status dialog | `POST /admin/orders/:id/status` | `deliveryNumber` -> delivery number input; `cancelReason` -> reason textarea; `note` -> note |
| Contact correction | `PATCH /admin/orders/:id/contact` | `email`, `phone`, `whatsapp` -> same-named inputs |
| Stock adjust | `POST /admin/stock/adjust` | `delta`, `reason`, `note` -> same-named controls |
| Product forms | `/admin/hoodies`, `/admin/stimpies`, `/admin/packs`, `/admin/colors`, `/admin/sizes` | Field names equal the writable field names in the contract (`priceCents` -> **Price** input, displayed in dollars, converted to cents on submit; `images.N` -> Nth image slot) |
| Size chart | `PUT /admin/size-chart` | `columns.N.label`, `rows.N.values.<columnId>` -> cell (row N, column) |
| Drop form | `/admin/drops` | `startsAt`, `endsAt` -> date-time inputs; `stimpieIds` -> picker |
| Builder settings | `PUT /admin/builder` | `model3d.camera.position.0` -> camera X field; `colors.N.placement2d.width` -> placement editor numeric field; `hoodieId` -> hoodie dropdown. `colors[].tint` / `texture3d` are read-only here (edited in `/admin/colors`) and not sent as writable. Saving 3D/BOTH without a model succeeds with `warnings: string[]`: show them verbatim, not as errors |
| Settings | `PATCH /admin/settings` | `orders.numberPrefix`, `orders.stockHoldHours`, `email.senderAddress` -> same-named inputs |
| Email templates | `PUT /admin/email-templates/:key` | `subject`, `body` |
| Login | `POST /auth/login` | `email`, `password`; auth failures are not field errors (see 5.2) |
| Subscribe | `POST /drops/:id/subscribe` | `contact` (validate by chosen `type`: `EMAIL` or `WHATSAPP`) |
| Track | `POST /orders/track` | `orderNumber`, `phone` (errors displayed under the form; `NOT_FOUND` is a form-level message) |
| Find order numbers | `POST /orders/find` | `email` |

If a path has no matching UI field, add its message to the error summary instead of dropping it.

### 6.3 Inputs, formatting and normalisation

| Field | Client behaviour |
|---|---|
| Phone / WhatsApp | `inputmode="tel"`, `autocomplete="tel"`. Accept spaces, dashes, `+961`, `00961`, leading `0`. Send **as typed**; the server normalises to `+961XXXXXXXX`. Client check: at least 7 digits. Display the normalised number returned by the API (e.g. on confirmation); `wa.me` links are built by stripping non-digits from it. |
| Email | `type="email"`, `autocomplete="email"`, basic shape check only. |
| Money inputs (dashboard) | User types dollars (`12.50`), stored/sent as integer cents via string parsing (not `parseFloat * 100`). |
| Names/address | `autocomplete="name"`, `street-address`, trim whitespace on submit. |
| Order number lookup | Uppercase automatically; accept `1042` or `STP-1042` (server accepts both). |
| Dates | Dashboard date-time inputs show local time in the business time zone (`business.timezone`, default `Asia/Beirut`) and convert to ISO-8601 UTC on submit. Date-only filters (`from`, `to`) are interpreted by the API in the same zone. |
| Honeypot `hp` | A visually hidden text input (`tabindex="-1"`, `autocomplete="off"`, `aria-hidden="true"`), always sent as `""`. |

### 6.4 Draft persistence

Checkout drafts (name, email, phone, area, address, notes) are kept in `sessionStorage` while typing and **cleared on successful order**. The WhatsApp same-as-phone checkbox state is stored too. This protects against Instagram's in-app browser reloading the page. Dashboard long forms (drop, content) warn on navigation with unsaved changes; no persistence to storage.

---

## 7. Loading and skeleton rules

| Rule | Detail |
|---|---|
| Skeletons, not spinners, for any region that will hold content (lists, cards, tables, detail pages). Spinners only inside buttons or tiny regions. |
| Delay | Show a skeleton only if loading exceeds **150 ms** (avoids flashes on fast loads); once shown, keep it at least 300 ms. |
| Shape | A skeleton mirrors the final layout (same heights, same aspect ratios, e.g. Stimpie cards at 0.64) to prevent layout shift (CLS target 0, section 15). |
| Server-rendered pages | The website's catalog pages render real content on the server; skeletons appear only for client-side refreshes (stock) and route transitions via `loading.tsx`. |
| Buttons | Show `loading` state on click; label stays; width fixed; `aria-busy="true"`; no double submit. |
| Tables | Keep the header, show 8 skeleton rows; on page change keep previous rows dimmed (`keepPreviousData`). |
| Long operations | Uploads show a progress bar; GLB loading shows progress (Builder). |
| Slow loading | After 8 seconds of loading, add a quiet line under the skeleton: "Still loading. Your connection may be slow." with a **Retry** button (website and dashboard). |
| Images | Reserve the box with the correct ratio; cream placeholder; no blur-up. |
| Reduced motion | Skeleton pulse disabled; static fill. |
| Route changes | Next: `loading.tsx` per route group; admin: top progress bar (2 px, black) for route-level fetches and suspense boundaries per page section so partial data can render. |
| Mutations | Show progress on the acting control, keep the rest interactive, except destructive flows (modal locked until finished). |

---

## 8. Empty states

Layout: icon (32 px), title (h3), one sentence, optional primary action. Tone: short and helpful; no blame; no emoji.

**Website**

| Place | Title | Text | Action |
|---|---|---|---|
| Shop, no products match filter | Nothing here yet | Try clearing a filter. | Clear filters |
| Stimpies, none available | New Stimpies are on the way | Follow the next drop. | Go to Drops |
| Drops, no live/upcoming | No drop right now | Next one is coming. Get notified. | Notify me (subscribe field) |
| Drops archive empty | The archive starts with Drop 01 | | none |
| Builder, nothing usable | See Stimpies in the shop | | Browse the shop (builder static fallback) |
| Customer swaps/reviews empty | (section hidden entirely) | | |
| FAQ empty | (section hidden) | | |
| Cart empty | Your cart is empty | Add a hoodie and a Stimpie or two. | Shop |
| Track, no result | We couldn't find an order with those details | Check the order number and phone. | Try again; WhatsApp contact |
| Size chart not configured | Size guide coming soon | | WhatsApp contact |
| Content missing (about/policies) | This page isn't ready yet | | Back home |

**Dashboard**

| Place | Title | Text | Action |
|---|---|---|---|
| Orders, no orders | No orders yet | Orders from the website and DMs appear here. | + New order |
| Orders, filter has no matches | No orders match | | Clear filters |
| Overview, no attention items | All clear | Nothing needs your attention. | none |
| Stock, no variants | No stock set up | Add colours and sizes first. | Go to Products -> Options |
| Drops, none upcoming | No upcoming drops | | Create a drop |
| Customers, none | No customers yet | | none |
| Subscribers, none | No subscribers yet | | none |
| Email log, none | No emails sent yet | | none |
| Finance, no data in range | No data for this period | | Change date range |
| Builder content, no GLB | No 3D model uploaded | The Builder runs in 2D until you add one. | Upload model |
| Search, no result | No results for "{q}" | | Clear search |

Distinguish **empty** (loaded successfully, zero items) from **error** (failed to load) from **filtered-empty** (filters exclude everything). Never show an empty state while loading.

---

## 9. Optimistic updates

Optimistic UI is used only for reversible, low-risk, non-financial changes. On failure it rolls back and shows an error toast.

| Allowed (dashboard) | Notes |
|---|---|
| Toggle `active` on hoodies, Stimpies, packs, colours, sizes, areas, FAQs, reviews (`visible`) | Roll back on error; `CONFLICT` shows the message. |
| Reorder FAQs (`PUT /admin/faqs/order`), colour/size `position` | Roll back on error. |
| Add an internal note (`POST /admin/orders/:id/notes`) | Show immediately in grey "Saving...", replace on success. |
| Mark notification/attention item as seen (client-only) | |
| Switch toggles in Settings -> Notifications | |
| Website: cart changes (client-only state), colour/Stimpie selection in the Builder, Notify-me checkbox | Client state; not API writes. |

| Forbidden | Why |
|---|---|
| **Stock**: `POST /admin/stock/adjust`, `/stock/set`, any displayed quantity change | Must show the real value (`quantity`, `reserved`, `available`) returned by the server; a wrong number could cause an oversell decision. |
| **Order status changes** (`POST /admin/orders/:id/status`, bulk status, dispatch, delivery number edits) | State machine enforced by the server (`INVALID_TRANSITION`, `DELIVERY_NUMBER_REQUIRED`). Show the pending state, then the server result. |
| **Cash collected / settled** | Money. |
| **Placing orders** (`POST /orders`, `POST /admin/orders`) | Never display success before the server confirms (and the order number is known). |
| **Creating/ending drops**, price changes, finance entries (expenses, ad spend) | Money/launch-critical. |
| **Deleting anything** | Wait for server (`CONFLICT` is common). |
| Email resend/retry, order contact edits | Show spinner; confirm on success. |

Implementation: use TanStack Query `onMutate` snapshot + `onError` rollback + `onSettled` invalidate only for the allowed list; everything else uses plain mutations that invalidate on success.

---

## 10. Offline and slow-network behaviour

Assume 3G/4G with drop-outs, high latency and in-app browsers that reload pages under memory pressure.

### 10.1 Detection and messaging

| Rule | Detail |
|---|---|
| Signal | `navigator.onLine` plus failed requests; `online`/`offline` events. A single failed request does not by itself mean offline. |
| Banner | When offline: sticky banner (below the header on the website; top of the page in the dashboard) "You're offline. We'll reconnect when you're back." Auto-dismisses on `online` with a quiet "Back online." Never a modal. |
| Slow connection | Use `navigator.connection` where available (`saveData`, `effectiveType`) to reduce prefetching, skip hero video autoplay on `saveData`/2g (show poster), and skip image preloading. No visible message. |
| Timeouts | GET 15 s, `POST /orders` 30 s, uploads 120 s; then `TIMEOUT` handling. |
| Retries | Website GETs: 2 automatic retries (1 s, 3 s) on `NETWORK`/5xx. Dashboard queries: section 3.1. POST retries: only as in 10.3. |

### 10.2 What works offline / on a flaky link

| Feature | Behaviour |
|---|---|
| Browsing visited pages | Browser cache; Next static assets are immutable and cached for a year. No service worker in v1; revisit after launch. |
| Cart | Persisted in `localStorage`; remains editable offline. Prices shown with a note on checkout if not revalidated. |
| Checkout | Form works offline; **Place order** while offline shows "You're offline. Connect to place your order." and keeps all values. The order is **never** queued silently for later (stock/price checks require the server). |
| Builder | Already-loaded colours/Stimpies keep working; unloaded images show the cream placeholder tile; a missing image does not break the swap (previous art stays). |
| Dashboard | Read cached data (marked "Showing saved data"); mutations are blocked offline with an inline reason. Nothing is queued. |
| Cart validation | `POST /cart/validate` is skipped offline; the drawer shows the stored snapshot with "Prices and stock will be checked when you're back online." |

### 10.3 Placing an order safely (idempotency)

1. On entering `/checkout` generate `Idempotency-Key` (UUID v4) and store it in `sessionStorage` with a hash of the current cart. Reuse it for every attempt of the **same** cart + same details.
2. On `NETWORK`, `TIMEOUT` or `5xx`: the order may already exist. Retry up to **3 times** (after 2 s, 5 s, 10 s) **with the same key**. A `200` response means the original order is returned: treat it exactly like `201`. During retries show "Sending your order... please don't close this page" with a progress indicator.
3. If retries fail: show "We couldn't confirm your order. It may have gone through. Please check before ordering again." with buttons **Try again** (same key) and **Contact us on WhatsApp**. Never offer a "start over" that creates a new key without the user confirming they want a new attempt.
4. Generate a **new** key when: the cart changes, the user chooses "Place order at {new total}" after `PRICE_CHANGED`, the previous attempt ended with a definitive 4xx (`SOLD_OUT`, `NOT_PURCHASABLE`, `VALIDATION_ERROR`), or the API answers `409 CONFLICT` with `details.field = "Idempotency-Key"` (the key was reused with a different body). A repeat with the same key and the same body is safe: it returns the original order with `200`.
5. On success clear the key, the draft (6.4) and the cart; store the whole `POST /orders` response (`order`, `whatsappUrl`, `trackUrl`) in `sessionStorage` so a reload of the confirmation page still renders. There is no public endpoint that re-reads an order: on another tab or device the page falls back to **Track order** (order number from the URL, phone typed by the customer).
6. The WhatsApp handoff uses `whatsappUrl` as a normal link/button the user taps ("Confirm on WhatsApp"); do not auto-open it with `window.open` (blocked in in-app browsers and unexpected). Never depend on it: the order is already saved.

### 10.4 Data saving

Defer non-critical requests (below-the-fold sections, hero video) until idle; do not autoplay video on `saveData` or 2g/3g; image `sizes` attributes must be exact so phones never download desktop-size images; serve fonts and JS with long-lived immutable caching.

---

## 11. Toasts vs inline errors

| Use a **toast** when | Use an **inline** message when |
|---|---|
| The action finished and nothing else on screen shows it ("Link copied", "Saved", "Resent") | A field is invalid (always inline, plus summary) |
| A background action fails and there is no obvious place for the message (dashboard: toggle failed, copy failed, status change rejected) | The error belongs to a specific region (cart line sold out, delivery number missing, upload error under `FileUpload`) |
| A transient system condition ("Back online.") | The user must act on it before continuing (checkout `SOLD_OUT`, `PRICE_CHANGED` modal) |
| `RATE_LIMITED` on non-form actions | The page failed to load (use `ErrorState` with Retry) |
| | Persistent states (offline banner, hold expired badge) |

Rules:
- Toasts: success/info auto-dismiss after 4 s; **error toasts in the dashboard persist** until dismissed (founder may look away); on the website errors are inline or banner, not toasts. Max 3 stacked; deduplicate identical messages; never the only place an actionable error appears (screen-reader users and people who miss it).
- Toast text: sentence case, one line, no codes, plain English.
- `role="status"` for success/info, `role="alert"` for errors.
- Do not use toasts for form validation.
- Position: bottom-centre on mobile above sticky bars; top-right on desktop.

---

## 12. Formatting rules

### 12.1 Money

| Rule | Detail |
|---|---|
| Source | API integer **cents** (`...Cents`). Convert with integer maths: `dollars = Math.trunc(c / 100)`, `rem = Math.abs(c % 100)`. Never `c / 100` then arithmetic. |
| Storefront display | `$45` when the amount is a whole number of dollars; `$12.50` otherwise. Thousands separator `,` (`$1,250`). |
| Dashboard display | Always two decimals (`$45.00`) in tables, finance and forms; tabular numerals; right-aligned in tables. |
| Negative values | `-$4.00` (dashboard finance); parentheses are not used. |
| Implementation | `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2 })` fed with `cents / 100` **only at the final formatting step**, never stored. |
| Delivery fee | `$3` or "Free delivery" when `deliveryFeeCents === 0`. |
| Inputs (dashboard) | Parse the typed string to cents without floats (`"12.5"` -> `1250`). Reject more than 2 decimals. |
| Never | Show currency codes ("USD") in the storefront; use LBP; show tax lines (none in v1). |

### 12.2 Dates and times

| Rule | Detail |
|---|---|
| Source | ISO-8601 UTC strings. Parse once at the API boundary into `Date` (or keep strings and format at render). |
| Time zone | **Dashboard: always the business time zone, `business.timezone`** from `GET /admin/settings` / `GET /content` (an IANA name, default `Asia/Beirut` when absent or invalid), never the device zone (avoids confusion when the founder travels). The same zone defines the API's day boundaries for "today", `from`/`to` and `weekday`. **Website: the visitor's device time zone** except drop start times, which also show "(Beirut time)" (use the business zone's name) when the device zone differs. Keep the zone in one shared formatter so a settings change updates every screen. |
| Locale | `en-GB` day-month order with 24-hour clock is the recommended default for Lebanon: e.g. `14 Oct 2026, 12:30`. Order placed today shows `Today, 12:30`. |
| Date only | `14 Oct 2026`. Month names are abbreviated in tables, full in headings. |
| Relative times | Dashboard lists show relative for under 24 h: under 1 min "just now"; "12 min ago"; "3 h ago"; yesterday "Yesterday, 18:05"; older: absolute date. Use `Intl.RelativeTimeFormat`; update every minute for visible items only. Always put the absolute time in `title`/tooltip. Needs-attention rules ("New for over 1 hour") use server flags, not client maths. |
| Ranges | `14-16 Oct 2026`. |
| Drop countdown | `2d 04:12:09` (days only if > 0), see section 13. |
| Server timestamps in forms | Convert local input to UTC ISO on submit; show the zone label next to date-time inputs. |
| Never | Display raw ISO strings; use `toLocaleString()` without explicit locale and zone options (differs by device); use US month/day ordering. |

### 12.3 Other formats

| Item | Format |
|---|---|
| Order number | As returned (`STP-1042`); never reformat. Search inputs uppercase it. |
| Phone | Show the normalised E.164 value from the API grouped for reading, e.g. `+961 3 123 456`; keep the raw API value for `tel:` and `wa.me` links. |
| Counts | `1,204`; abbreviations (`1.2k`) not used. |
| Percentages | `62%` (no decimals unless < 10%: `4.5%`). API ratios (`repeatRate`, `deliverySuccessRate`, `returnRate`, `extraStimpieAttachRate`) are fractions from 0 to 1 and are multiplied by 100 for display. `weekday` is `0` = Sunday ... `6` = Saturday, computed by the API in the business time zone. |
| CSV exports | `POST /admin/orders/export` (filters in the body, or `{ ids }` for a selection) and `GET /admin/subscribers?format=csv` return `text/csv`; the order export filename comes from `Content-Disposition` (`orders-YYYY-MM-DD.csv`). The API prefixes any cell starting with `=`, `+`, `-` or `@` with `'` so spreadsheets do not run it as a formula; the dashboard must not strip that prefix and should note it next to the Export button. |
| Stock | "Only 3 left" shown when `remaining` is non-null; no "0 left" (use Sold out). |
| Sizes | As `Size.label`. |
| Plurals | "1 item", "2 items". |
| Text | Long API text is rendered via the safe tiny-Markdown renderer only. |

---

## 13. Server clock offset and countdowns

A device clock can be minutes wrong. Drop countdowns must follow the **server**.

### 13.1 Computing the offset

The contract offers two clock sources: the `Date` HTTP header (second precision, exposed to browsers by CORS) and `GET /health` -> `{ ok, time }` (ISO with millisecond precision). `GET /health` is always `no-store` and CORS-enabled for the website and dashboard origins, so it is the primary source; use the `Date` header only as a fallback.

```ts
// one sample
const t0 = performance.now(), c0 = Date.now();
const res = await api.health();                       // no-store
const t1 = performance.now();
const rtt = t1 - t0;
const serverNow = Date.parse(res.time) + rtt / 2;     // assume symmetric latency
const offsetMs = serverNow - (c0 + rtt / 2);          // add to Date.now() to get server time
```

Procedure:
1. On first load of any page showing a countdown, take **3 samples** 300 ms apart and use the one with the **smallest RTT**.
2. Store `offsetMs` in memory (and `sessionStorage` `stimpy.clockOffset` for reloads) and use `serverNow() = Date.now() + offsetMs`.
3. Recompute every 5 minutes and whenever the tab becomes visible after > 60 s hidden. Ignore samples with RTT > 3000 ms (poor accuracy) unless there is no better one.
4. Fallback if `GET /health` fails: parse the `Date` header of the last `GET /drops` response (rounded to the second; accuracy +/- 1 s is acceptable for display, and the server still enforces the real start).
5. A countdown shows nothing wrong if the offset is unknown: it uses the device clock with a hidden `uncertain` flag, and the final transition is confirmed by the server (13.3).

### 13.2 Rendering

- Target time: `upcoming[0].startsAt` (countdown to start) or `live.endsAt` (countdown to end when present). Remaining = `target - serverNow()`.
- Update with `requestAnimationFrame` throttled to 1 Hz (`setInterval` corrected against `performance.now()` to avoid drift), and only while visible (`IntersectionObserver`, `visibilitychange`).
- Format: `2d 04:12:09`, `04:12:09`, `00:09`. Tabular numerals. No flip/animation under reduced motion.
- Accessibility: the timer element is `role="timer"` with `aria-live="off"`; a visually hidden polite region announces the remaining time at most once per minute, and at 10 s, 5 s... not every second.

### 13.3 When it reaches zero

The device must **never** decide that the drop is live.

1. At `remaining <= 0` show "Going live..." (not the live UI).
2. Refetch `GET /drops` (no-store) immediately and then with backoff 1 s, 2 s, 4 s, 4 s ... until `state === 'LIVE'` for that drop (up to 30 s). Meanwhile keep the Add-to-cart actions for that drop's Stimpies disabled.
3. When `LIVE` arrives, swap to the live UI and refetch the drop's Stimpies.
4. If the server still says `UPCOMING` after 30 s (device clock fast), show the countdown again using the server's data and a small note "Starting any moment".
5. If the device clock appears **slow**, the server will still reject early orders with `NOT_PURCHASABLE` (`DROP_NOT_STARTED`); mapped in 5.2.
6. For the final 60 s before start, poll `GET /drops` every 5 s to catch an early manual start by the founder. The API sends `no-store` on `GET /drops` while any drop starts within 60 s (otherwise `max-age=10`), so these polls are never served a stale cached copy; still request with `cache: 'no-store'`.

### 13.4 Elsewhere

Order timestamps and "hold expiry" in the dashboard use server-provided ISO values and server flags (`holdExpired`), not client clock comparisons, so a wrong laptop clock cannot mislead the founder.

---

## 14. Accessibility baseline

Target: **WCAG 2.1 AA** for both apps. The following are mandatory unless noted.

| Area | Requirement |
|---|---|
| Language and landmarks | `<html lang="en">`; one `<main>`; `header`, `nav`, `footer`; skip link as first focusable element. |
| Headings | One `h1` per page, logical order. |
| Contrast | Text >= 4.5:1 (large text >= 3:1); non-text UI boundaries >= 3:1. Use only the pairs in [design-system.md](design-system.md#3-text-and-background-pairs-and-colour-rules). |
| Keyboard | Every interaction works with keyboard only; visible 3 px focus ring; logical focus order; no keyboard traps except modals (which trap and release correctly). |
| Focus management | **Route changes:** on client navigation (Next and React Router) move focus to the page `h1` (tabindex -1) and announce the title via a polite live region. **Modals/drawers/sheets:** focus the first meaningful control (or the dialog), trap, close on Esc, return focus to the trigger. **After adding to cart:** focus moves to the cart drawer heading. **After a failed submit:** first invalid field. **After inline deletion:** the next/previous item or the list heading. |
| Target size | >= 44 x 44 px for all touch targets (stricter than WCAG 2.1 AA's absence of a rule and WCAG 2.2's 24 px; chosen for one-handed phone use). 8 px minimum spacing between adjacent targets. |
| Forms | Visible labels, not placeholder-only; `autocomplete` tokens; errors linked via `aria-describedby`; required fields marked in text ("required"), not colour alone; error summary with links. |
| Status and live regions | Cart count updates, toasts, loading complete and errors use `role="status"` / `role="alert"`; do not announce every countdown tick. |
| Colour independence | Status, stock (Low/Sold out), selected states always have text or icon, not colour alone. |
| Motion | `prefers-reduced-motion` honoured everywhere (zip wipe instant, no parallax, no auto-playing video - show poster + play). No flashing content (> 3 flashes per second). Animations that run > 5 s must be pausable. |
| Media | Videos have captions or are decorative and muted with no essential audio information; provide a text alternative in the page for the "how it works" steps. Audio never autoplays. |
| Images | Meaningful `alt`; decorative `alt=""`. Builder rules in [builder.md](builder.md#13-accessibility). |
| Zoom/reflow | Works at 200% text size and 320 px width without horizontal scrolling (data tables in the dashboard may scroll within their container). Do not disable pinch zoom (`user-scalable=no` is forbidden). |
| Dashboard tables | Proper `<table>` semantics, `scope`, `aria-sort`, selectable rows with accessible names. |
| Testing | `eslint-plugin-jsx-a11y`; axe-core in Playwright for each key page (zero serious/critical violations); manual keyboard run and a VoiceOver/TalkBack pass on checkout, Builder and Orders. |

---

## 15. Performance budgets

Reference device: **mid-range Android** (about 4 GB RAM, Snapdragon 6xx-class), Chrome, **throttled to "Slow 4G" and a "Fast 3G" check** (Lighthouse mobile profile), cold cache. Plan target: under 3 seconds to a usable page on a weak connection.

### 15.1 Core Web Vitals (field and lab targets for key pages: `/`, `/shop`, `/shop/stimpie/[slug]`, `/builder`, `/checkout`)

| Metric | Target (75th percentile, mobile) | Hard fail |
|---|---|---|
| LCP | <= 2.5 s on 4G; <= 3.5 s on Fast 3G | > 4.0 s on 4G |
| INP | <= 200 ms | > 500 ms |
| CLS | <= 0.05 (goal 0) | > 0.1 |
| TTFB (local/dev N/A; production target) | <= 0.8 s | |
| FCP | <= 1.8 s | |
| Total Blocking Time (lab) | <= 200 ms | > 400 ms |
| Lighthouse Performance (mobile, lab) | >= 85 on every key page | < 70 |

### 15.2 Bundles (gzip, initial route JS)

| Route / app | Budget |
|---|---|
| Website shared shell (framework + layout + header/cart) | <= 110 KiB total: framework runtime <= 105 KiB and app-owned shared code <= 10 KiB |
| `/` | <= 130 KB total first-load JS |
| `/shop`, detail pages | <= 140 KB |
| `/checkout` | <= 170 KB |
| `/builder` (2D mode) | <= 180 KB; **three.js chunk** (3D) <= 250 KB, loaded lazily only when 3D is chosen; **GLB** target <= 2.5 MB (hard 5 MB) |
| Per-route page code | <= 40 KB beyond the shell |
| Dashboard initial (login + shell) | <= 250 KB |
| Dashboard route chunks | <= 100 KB each; charts, rich editors and GLB parsing in separate lazy chunks |
| CSS | <= 25 KB gzip (Tailwind purged) for the website; <= 35 KB for the dashboard |
| Third-party scripts | Analytics script only (< 3 KB gzip, async); no other third-party JS in v1 |

CI check: `size-limit` (or Next's build output budget) fails the build when a budget is exceeded.

The shared-shell gate separates Next's mandatory App Router runtime from the application code the team can directly
reduce. On Next.js 15.5.27, the runtime files in `build-manifest.json`'s `rootMainFiles` measure 100.76 KiB gzip before
storefront shell code is included, so the earlier 90 KB combined target was below the framework floor. The build gate
keeps the runtime at <= 105 KiB, app-owned shared code at <= 10 KiB, and their combined total at <= 110 KiB; revisit
these limits when changing the framework version.

### 15.3 Images and media

| Rule | Detail |
|---|---|
| Formats | AVIF with WebP fallback via the image optimiser; JPEG only as the last fallback. |
| Sizes | Correct `sizes` for every responsive image; never serve desktop images to phones. Product images <= 120 KB at displayed size; hero poster <= 150 KB; hero video <= 1.5 MB for mobile (H.264/MP4 plus WebM, 720p max, muted, `playsinline`, poster set, `preload="none"` until visible; not loaded on `saveData` or 2g). |
| Dimensions | Always explicit `width/height` or `aspect-ratio`. |
| LCP | Exactly one `priority` image per page. |
| Lazy | All below-the-fold images/video `loading="lazy"`; Builder neighbours preload on idle only. |
| Caching | Immutable long-lived caching for hashed assets; uploads have random, never-changing file names and are served with a one-year immutable cache. URLs are absolute and `/uploads/*` sends CORS `*`; add the API host to `remotePatterns` for `next/image` (no width parameter exists: the optimiser resizes). |

### 15.4 Fonts

Poppins 400, 500, 700, Latin subset, `woff2`, self-hosted, `font-display: swap`, preload 400 and 700 only (about 25 KB total). `size-adjust` fallback metrics (via `next/font`) to avoid CLS. No icon fonts.

### 15.5 JavaScript and rendering

| Rule | Detail |
|---|---|
| Server Components first | Client Components only where interaction needs them (cart, Builder, checkout form, countdown). |
| No hydration of static content | Content/legal/FAQ pages ship no client JS beyond the shell. |
| Long tasks | Anything > 50 ms is chunked or moved off the main thread. |
| Lists | Dashboard tables over 100 rows are paginated server-side (API pages are <= 100); no client-side virtualisation needed in v1. |
| Prefetching | Primary navigation prefetches its destinations. Shared shopping links warm on hover, keyboard focus or touch; product grids do not eagerly prefetch every destination. Save Data and explicit opt-outs disable prefetching. Pending links show a loading indicator; URL tabs and filters update immediately while new results load. |
| Animations | `transform`/`opacity`/`clip-path` only. |
| Monitoring | Web Vitals sent to the analytics tool (anonymous, section 17) and checked at each release; Lighthouse CI on the key pages. |

---

## 16. SEO and link previews

Applies to the website only. The dashboard is `noindex` everywhere (`<meta name="robots" content="noindex,nofollow">`, `X-Robots-Tag: noindex`, and `robots.txt` Disallow when deployed).

| Topic | Rule |
|---|---|
| Titles | `<title>` per page, 50-60 characters: "{Page} - Stimpy"; home: "Stimpy - One hoodie. Multiple identities." Product pages: "{Stimpie name} Stimpie - Stimpy". |
| Descriptions | 120-155 characters from page content (Stimpie `story`, drop `story`, `homepage.heroSubheadline`). |
| Canonical | `rel="canonical"` absolute, built from `NEXT_PUBLIC_SITE_URL`; query params (`?color=`, `?stimpie=`, UTM) are excluded from the canonical except on `/builder` share links which canonicalise to `/builder`. |
| Indexing | Index: `/`, `/shop`, `/shop/hoodie/*`, `/shop/stimpie/*`, `/builder`, `/drops`, `/drops/*`, `/how-it-works`, `/delivery-returns`, `/help`, `/about`, `/legal`. `noindex`: `/checkout`, `/order/*`, `/track`, search/filter variants, 404. |
| Sitemap / robots | `app/sitemap.ts` lists the indexable URLs from `GET /products/*`, `GET /drops`; `app/robots.ts` references it. Local-only for now (placeholder host from env). |
| Structured data | JSON-LD: `Organization` (home), `Product` + `Offer` (hoodie/Stimpie pages: `price = priceCents/100`, `priceCurrency: "USD"`, `availability` from `status`: `InStock` for `AVAILABLE`/`LOW`, `OutOfStock` for `SOLD_OUT`, `PreOrder`-free: `UPCOMING` uses `InStock` only after start so use `OutOfStock`/omit offer until live), `FAQPage` (`/help`, home preview), `BreadcrumbList`. Only truthful data (no fake ratings). |
| Open Graph / Twitter | `og:title`, `og:description`, `og:type` (`website`/`product`), `og:url`, `og:site_name` = "Stimpy", `og:image` absolute, `twitter:card` = `summary_large_image`. |
| Preview images | 1200 x 630 JPEG/WebP, < 300 KB (WhatsApp truncates large images), logo clear-space respected, brand colours. Per product: the Stimpie art (0.64) centred on a cream or coral 1.91:1 canvas generated server-side (`opengraph-image.tsx`) so Instagram/WhatsApp previews look intentional; hoodie: the hero hoodie photo. `/builder?stimpie=...` uses that Stimpie's preview. A default brand image is the fallback. |
| Drop pages | `og:image` uses the drop's `teaserImage`; the accent colour is not used for text. |
| Instagram bio link | UTM parameters are accepted and ignored by canonical; analytics captures `utm_*` without storing PII. |
| Performance | SEO relies on the same speed budgets (section 15). |
| i18n | English only, no `hreflang`. |
| Errors | 404s return a real 404 status with the friendly 404 page. |

---

## 17. Analytics events catalogue

**Principles.** Privacy-friendly and cookieless: a tool such as Plausible or Umami (plan section 12.2), added when going live; locally events are logged to the console in dev. **No PII**: never send names, emails, phone numbers, addresses, order numbers, delivery numbers, free text or search queries. Never send IDs that identify a person; product ids/slugs are fine. No fingerprinting. Respect Do Not Track / Global Privacy Control (send nothing when set). Event names are `snake_case`; property values are enums, slugs, integers (cents) or booleans. The dashboard sends **no** analytics (only error reporting, section 18).

| Event | Properties | When |
|---|---|---|
| `page_view` | `path`, `utm_source`, `utm_medium`, `utm_campaign` (from URL), `referrer_host` | Every route view (automatic). Separately from analytics, the same UTM values are captured on landing and sent to the API as `attribution` on `POST /orders`. |
| `web_vitals` | `metric` (`LCP`/`INP`/`CLS`/`TTFB`), `value`, `rating`, `path` | Once per metric per page |
| `cta_click` | `id` (`hero_order`, `hero_builder`, `pack_45`, `pack_35`, `drop_enter`...), `path` | Primary CTA clicks |
| `nav_click` | `item` | Header/footer navigation |
| `product_view` | `kind` (`hoodie`/`stimpie`), `slug`, `type` (`CORE`/`LIMITED`) | Product detail view |
| `add_to_cart` | `kind` (`pack`/`hoodie`/`stimpie`), `pack_slug`?, `value_cents`, `source` (`builder`/`product`/`shop`) | Item added |
| `cart_open` | `items_count` | Cart drawer opened |
| `cart_remove` | `kind` | Line removed |
| `checkout_start` | `items_count`, `value_cents` | `/checkout` loaded with items |
| `checkout_field_error` | `field` (field name only) | A field fails validation on submit |
| `checkout_submit` | `items_count`, `value_cents`, `area_set` (bool) | Place order pressed |
| `order_placed` | `value_cents`, `delivery_fee_cents`, `items_count`, `has_pack` (bool), `retry_count` | `201` or `200` received (no order number) |
| `order_failed` | `code` (`SOLD_OUT`, `NOT_PURCHASABLE`, `PRICE_CHANGED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `INTERNAL`, `NETWORK`, `TIMEOUT`) | Place order fails |
| `whatsapp_click` | `place` (`confirmation`, `floating`, `track`, `footer`) | WhatsApp link pressed |
| `order_track` | `result` (`found`/`not_found`/`error`) | Track form submitted (no values) |
| `order_find_submit` | none | "Lost your order number?" submitted |
| `drop_view` | `drop_slug`, `state` (`UPCOMING`/`LIVE`/`SOLD_OUT`/`ENDED`) | Drop page view |
| `countdown_zero` | `drop_slug`, `server_confirmed_ms` (time from zero to `LIVE` confirmation) | Countdown reached zero |
| `drop_subscribe` | `type` (`EMAIL`/`WHATSAPP`), `drop_slug`? | `204` received |
| `faq_open` | `faq_id` | FAQ item opened |
| `size_guide_open` | `source` | Size guide opened |
| `error_shown` | `code`, `area` (`checkout`, `builder`, `shop`...) | User-visible API error shown (no messages) |
| `offline_shown` | none | Offline banner displayed |
| `builder_*` | see [builder.md](builder.md#14-analytics-events) | Builder interactions |

Rules: events sent via `navigator.sendBeacon` where possible; failures ignored silently; no events blocked on analytics load; sampling of high-frequency events (`builder_swap_done`) as specified; consent banner not required for cookieless, PII-free analytics, but the privacy page (`/legal`) must name the tool.

---

## 18. Logging and error reporting

| Aspect | Rule |
|---|---|
| Client errors | Capture `window.onerror`, `unhandledrejection`, React error boundaries (route-level and around the Builder 3D canvas), and `ApiError` of status >= 500 or code `BAD_RESPONSE`/`UNKNOWN`/`FORBIDDEN`. |
| Not reported | Expected API codes (`VALIDATION_ERROR`, `SOLD_OUT`, `NOT_PURCHASABLE`, `PRICE_CHANGED`, `NOT_FOUND`, `RATE_LIMITED`, `INVALID_TRANSITION`, `CONFLICT`, `DELIVERY_NUMBER_REQUIRED`, `UNAUTHENTICATED`) are product flow, not bugs. They are counted via analytics `error_shown`/`order_failed`, not reported as errors. |
| Payload | Error name/message, stack, app + version/build id, route path (no query string), browser/OS, `ApiError.code`, HTTP status, method + path pattern (e.g. `POST /orders`), a client-generated `session_id` (random, per tab session). **Never**: request/response bodies, form values, cookies, IPs added by us, order numbers, phone/email. Scrub URLs of query params and tokens. |
| Destination | Local v1: console in development plus an optional error-reporting DSN (Sentry-compatible; self-hosted GlitchTip is acceptable). With no DSN configured, errors only go to the console. |
| Sampling | 100% of errors, de-duplicated (same message + stack within 60 s counted once). Breadcrumbs limited to route changes and API call (method, path, status). |
| User-facing | Error boundary fallback: "Something went wrong. Reload the page." with a Reload button and the WhatsApp contact (website) or a "Copy details" button that copies a short id (dashboard). The Builder boundary falls back to 2D silently (builder.md). |
| Server correlation | Every API response carries `X-Request-Id` and error bodies repeat it as `error.requestId`. Include it in every error report and breadcrumb for failed API calls so a report can be matched to server logs. It is not personal data. |
| Dev | Console logs prefixed `[stimpy:web]` / `[stimpy:admin]`; API client logs failed requests at `warn`. No logging of response bodies in production builds. |
| Performance logs | Slow requests (> 5 s) logged as `warn` with path and duration. |
| Source maps | Uploaded to the error reporter only (not served publicly) when deployed later. |

---

## 19. Environment variables

No secrets in any frontend. Anything prefixed `NEXT_PUBLIC_` or `VITE_` is shipped to the browser and visible to everyone. Local values shown are defaults for development.

### 19.1 Website (`apps/web`, Next.js, port 3000)

| Variable | Public? | Meaning | Local default |
|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | yes | API base URL used in the browser (Client Components). Must end without a trailing slash. | `http://localhost:4000/api/v1` |
| `API_BASE_URL` | no (server only) | API base URL used by Server Components/route handlers (may differ in Docker/production, e.g. an internal hostname). Falls back to `NEXT_PUBLIC_API_BASE_URL`. | `http://localhost:4000/api/v1` |
| `NEXT_PUBLIC_SITE_URL` | yes | Canonical origin of the website for canonicals, sitemap, Open Graph, share links. | `http://localhost:3000` |
| `NEXT_PUBLIC_DEV_NO_CACHE` | yes | `1` sets all `revalidate` to 0 for development. | `1` in dev, unset in prod |
| `NEXT_PUBLIC_ANALYTICS_DOMAIN` | yes | Site identifier for the analytics tool. Empty disables analytics. | empty |
| `NEXT_PUBLIC_ANALYTICS_SRC` | yes | URL of the analytics script. Empty disables analytics. | empty |
| `NEXT_PUBLIC_ERROR_DSN` | yes | Error-reporting DSN. Empty = console only. | empty |
| `NEXT_PUBLIC_APP_ENV` | yes | `local`, `staging`, `production`; shown in error reports and used to disable analytics on non-production. | `local` |
| `NEXT_PUBLIC_BUILD_ID` | yes | Build/version string attached to error reports (set by CI; Next also exposes its build id). | `dev` |
| `NEXT_PUBLIC_BUILDER_FORCE_VIEW` | yes | Testing aid: `2d` or `3d` forces the Builder view in non-production builds (never overrides hard failures). | unset |
| `NEXT_IMAGE_REMOTE_HOSTS` | no | Comma-separated hosts allowed by the image optimiser (API/uploads origin). Read by `next.config`. | `localhost` |
| `PORT` | no | Dev server port. | `3000` |

### 19.2 Dashboard (`apps/admin`, Vite, port 5173)

| Variable | Meaning | Local default |
|---|---|---|
| `VITE_API_BASE_URL` | API base URL (must allow credentialed CORS from the dashboard origin). | `http://localhost:4000/api/v1` |
| `VITE_SITE_URL` | Public website origin, for "View on website" links and the Builder preview. | `http://localhost:3000` |
| `VITE_APP_ENV` | `local`, `staging`, `production`. | `local` |
| `VITE_ERROR_DSN` | Error-reporting DSN; empty = console only. | empty |
| `VITE_BUILD_ID` | Version string attached to error reports. | `dev` |
| `VITE_ORDER_POLL_INTERVAL_MS` | Interval for polling `GET /admin/orders/counts` for new-order alerts. | `30000` |
| `VITE_DEFAULT_TIMEZONE` | Fallback IANA zone used only until `business.timezone` has loaded (or if it is missing/invalid). The business setting wins. | `Asia/Beirut` |

Rules: a `.env.example` documents every variable; the apps validate their env at start-up with Zod and fail fast with a readable message; the API origin for cookie auth must be same-site with the dashboard (both on `localhost`) in development; CORS and cookie settings are an API concern, not frontend env.

---

## 20. Browser support matrix

### 20.1 Website

| Browser | Support level |
|---|---|
| Safari on iOS / iPadOS | Last 3 major versions (iOS 16+ minimum; target iOS 17/18). **Primary.** |
| Chrome on Android | Last 3 major versions; Android 9+ devices (WebView updates automatically). **Primary.** |
| **Instagram in-app browser** (iOS WKWebView, Android WebView) | **Primary, tested every release** (most traffic). Constraints: storage may be unavailable or cleared (wrap all `localStorage`/`sessionStorage`), `window.open` and popups may be blocked (use plain anchors for `wa.me`), file downloads limited, no install prompts, memory-constrained (reduces 3D viability), video autoplay requires muted/`playsinline`. Add a gentle "Open in browser" suggestion only if a feature actually fails. |
| Samsung Internet | Last 2 major versions. |
| Chrome / Edge desktop | Last 2 major versions. |
| Firefox desktop and Android | Last 2 major versions. |
| Safari desktop | Last 2 major versions. |
| Facebook / Messenger / WhatsApp in-app browsers | Best effort (same WebView constraints). |
| Not supported | Internet Explorer, Opera Mini, browsers without ES2020 / CSS custom properties. They get the server-rendered content and a "Please update your browser" notice at most. |

Required web features and fallbacks: CSS `clip-path`, `aspect-ratio`, `100svh` (fallback `100vh`), `IntersectionObserver`, `ResizeObserver`, `fetch`, `AbortController`, `crypto.randomUUID` (fallback to `crypto.getRandomValues`), `Intl` (en-US/en-GB), `navigator.share` (optional), WebGL2 for 3D (optional; fallback 2D), `prefers-reduced-motion`. Optional/progressive: `navigator.connection`, `navigator.deviceMemory`, `requestIdleCallback`.

Test devices: one recent iPhone, one mid-range Android (Samsung A-series class), one low-end Android (2 GB RAM), desktop Chrome and Safari.

### 20.2 Dashboard

| Browser | Support |
|---|---|
| Chrome, Edge, Firefox desktop | Last 2 major versions. **Primary on desktop.** |
| Safari desktop | Last 2 major versions. |
| Safari on iOS and Chrome on Android | Last 2 major versions; the founder uses a phone, so every dashboard screen is usable at 360 px wide. **Primary on mobile.** |
| Everything else | Unsupported. |

Features: cookies must be enabled (session cookie `stimpy_session`, `SameSite`, HttpOnly); Notifications API and `Audio` are optional (new-order sound requires one user interaction first; show an "Enable sound" toggle); clipboard API used for copy buttons with a fallback `execCommand`.

Build targets: `browserslist` = `iOS >= 16, Chrome >= 100, Edge >= 100, Firefox >= 100, Safari >= 16, Samsung >= 18, not dead`. Transpile to ES2020; no polyfill bundle unless a measured failure needs one.

---

## 21. Open questions for the API

The decisions for every earlier question (S1-S18) are recorded in [../open-questions.md](../open-questions.md), which is the decision log.

None open; every earlier question is settled in [../open-questions.md](../open-questions.md). Builder-specific points are in [builder.md](builder.md#16-open-questions-for-the-api).
