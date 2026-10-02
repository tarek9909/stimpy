# Stimpy Dashboard: Pages Specification

## Purpose and audience

This document specifies every screen of the Stimpy dashboard (the private admin app in `apps/admin`) so a developer who has never seen the project can build it. It covers the shell, then each page and tab: route, API calls, layout on desktop and phone, fields, validation, actions, confirmation steps and all UI states. It is written against the API contract in [backend/api-reference.md](../backend/api-reference.md) and the business rules in [stimpy_website_plan.md](../../../stimpy_website_plan.md) (sections 5 and 6). Authentication details live in [auth-and-sessions.md](auth-and-sessions.md).

Fixed decisions: Vite + React + TypeScript + React Router + TanStack Query in `apps/admin` (dev port 5173); API at `http://localhost:4000/api/v1` with a typed client generated from its OpenAPI document into `packages/api-client`; shared tokens and components in `packages/ui`; English only; USD; cash on delivery; no courier integration; local only. The founder uses the dashboard on a phone as much as on a desktop, so **every page must work at phone width**.

## Table of contents

1. [Cross-cutting rules](#1-cross-cutting-rules)
2. [Shell and layout](#2-shell-and-layout)
3. [Login](#3-login)
4. [Overview](#4-overview)
5. [Orders](#5-orders)
6. [Order detail](#6-order-detail)
7. [Products](#7-products)
8. [Stock](#8-stock)
9. [Drops](#9-drops)
10. [Customers](#10-customers)
11. [Finance](#11-finance)
12. [Insights](#12-insights)
13. [Content](#13-content)
14. [Deliveries](#14-deliveries)
15. [Settings](#15-settings)
16. [Route map](#16-route-map)
17. [Build checklist by phase](#17-build-checklist-by-phase)
18. [Open questions for the API](#18-open-questions-for-the-api)

---

## 1. Cross-cutting rules

### 1.1 Data and formatting

| Topic | Rule |
|---|---|
| Money | The API sends integer cents. Display with one helper, `formatMoney(cents)` giving `$45.00`. Form inputs take dollars (`45` or `45.50`), validated `^\d+(\.\d{1,2})?$`, and convert to cents with `Math.round(parseFloat * 100)` at the form boundary only. Never use floats elsewhere |
| Dates | ISO UTC from the API; format in the **business timezone** (`business.timezone` from `GET /admin/settings`, default `Asia/Beirut`), not the browser's, so "today" and day boundaries agree with the server. Date-only ranges (`from`, `to`) are interpreted by the server in that timezone. List rows show relative time for the last 24 h ("2 h ago") with the full timestamp in a tooltip/long-press title; older rows show `14 Oct, 09:30`. Date-only fields (`spentOn`, `from`, `to`) are `YYYY-MM-DD` |
| Phones | Show exactly what the API returns (E.164). In forms accept as typed; the server normalizes. Show a server-returned normalized value after save |
| Order number | Always shown as `STP-1042`, monospace, with a copy button wherever there is room. Never editable |
| Delivery number | Free text, trimmed, 1..60 chars (the contract limit). Shown in its own column/field, never merged with the order number |
| Customer-supplied text | Names, addresses, notes, delivery numbers render as plain text only (React escapes). See the security checklist in auth-and-sessions.md |
| Long text (policies, FAQ answers) | Plain text with the tiny Markdown subset (blank-line paragraphs, `**bold**`, `- ` lists). Edit in a textarea with a hint line; preview with the same safe renderer used by the public site. Never raw HTML |

### 1.2 Status presentation

Colour must never be the only signal: every status badge is a pill with a **text label** and a small icon/dot.

| Status (`OrderStatus`) | Label | Pill colour | Text colour |
|---|---|---|---|
| `NEW` | New | Coral `#FF7A59` | Black |
| `CONFIRMED` | Confirmed | Electric blue `#2E63FF` | White |
| `PACKED` | Packed | Butter `#FFE45C` | Black |
| `OUT_FOR_DELIVERY` | Out for delivery | Sky `#5CC8FF` | Black |
| `DELIVERED` | Delivered | Green (token `--status-ok`) | White |
| `CANCELLED` | Cancelled | Grey (token `--status-muted`) | White |
| `RETURNED` | Returned | Red (token `--status-bad`) | White |

Other badges: **Hold expired** (red outline, text "Hold expired"), **Cash collected** / **Cash settled** (green check + text), **Email failed** (red + text).

### 1.3 URL, tabs and deep links

- Tabs are expressed in the URL so a refresh, back button or shared link restores the view. Default tab omits the parameter. Pages other than Orders use `?tab=<slug>`; Orders uses `?status=` (see section 5).
- Filters, search text, sort and page live in the URL query string too (`/orders?status=NEW&q=1042&page=2`). Changing a filter resets `page` to 1. Use `replace` (not `push`) while typing in a search box.
- Unknown tab values fall back to the default tab (no error page).
- Every record page is deep-linkable by id (`/orders/123`). A 404 from the API shows the in-page "Not found" state (section 1.6), not the app 404.

### 1.4 Query keys and cache policy (TanStack Query)

Keys are arrays starting with the resource so invalidation is predictable. Define them in one `queryKeys.ts`.

| Resource | Key | Notes |
|---|---|---|
| Session | `['session']` | `GET /auth/me`, `staleTime: Infinity`, `retry: false` |
| Order list | `['orders','list', filters]` | `filters` = normalised object from the URL |
| Order counts | `['orders','counts']` | refetch every 30 s while the tab is visible (see 2.5) |
| Search | `['search', q]` | `GET /admin/search?q=`, `staleTime: 0` |
| Order | `['orders','detail', id]` | |
| WhatsApp link | `['orders','whatsapp', id, template]` | `staleTime: 0`, never cached across opens |
| Catalog admin | `['hoodies']`, `['stimpies']`, `['packs']`, `['colors']`, `['sizes']`, `['size-chart']` | |
| Stock | `['stock','hoodies']`, `['stock','stimpies']`, `['stock','movements', filters]` | |
| Others | `['drops', state]`, `['customers', filters]`, `['subscribers', filters]`, `['deliveries', tab, q]`, `['finance','profit', range]`, `['finance','cash']`, `['expenses', filters]`, `['ad-spend', filters]`, `['insights', name, range]`, `['content', key]`, `['faqs']`, `['reviews']`, `['builder']`, `['email-templates']`, `['whatsapp-templates']`, `['email-log', filters]`, `['settings']`, `['settings','delivery']`, `['areas']` | |

Defaults: `staleTime` 15 s for lists, 0 for order detail and stock, `refetchOnWindowFocus: true`, `retry: 1` for GET, **no retry for mutations**. After any order status change, invalidate `['orders']` (all), `['stock']`, `['deliveries']`, `['finance']` and `['overview']`. After any stock change invalidate `['stock']`, `['hoodies']`, `['stimpies']` and `['overview']`.

### 1.5 Mutation policy: pessimistic vs optimistic

| Kind | Policy | Why |
|---|---|---|
| Order status changes (single and bulk), delivery number, cash collected/settled, cancel/return | **Pessimistic.** Disable the control, show a spinner on it, update the UI only from the server response (`AdminOrder`). Never flip the badge first | Status drives stock, emails and cash. The server may refuse (`INVALID_TRANSITION`) |
| Stock adjust / set | **Pessimistic.** Show the new numbers only from the response | Stock must never display a number the server did not confirm |
| Creating anything (order, product, drop, expense...) | Pessimistic; navigate or close the form after success | |
| Reordering lists (colors, sizes, packs, hoodies, FAQs) | Optimistic with rollback on error and a toast "Couldn't save the new order. Restored." | Cosmetic, easily reverted |
| Toggling `active`/`visible`/`showOnHome` switches | Optimistic with rollback | Reversible |
| Internal notes | Pessimistic (append only after the server returns the note) | Audit trail |

Every mutation sends one request per user action; a button is disabled while its mutation is pending so a double tap cannot send twice. After a mutation that returns a resource, write it into the cache with `setQueryData` and invalidate lists.

### 1.6 State patterns (all pages)

| State | Pattern |
|---|---|
| Loading | Skeleton rows/cards matching the final layout (not a lone spinner). Buttons that depend on data are disabled until it loads. Show skeleton only after 200 ms to avoid flicker |
| Empty | Illustration-free short message and a primary action where one exists, e.g. "No orders yet. Orders from the website appear here. [+ New order]". Filtered-empty says "No orders match these filters. [Clear filters]" |
| Error (GET) | Inline panel: plain message from `error.message` (safe per contract), **Try again** button. Keep the previous data visible if any (stale banner "Showing saved data. Couldn't refresh.") |
| Error (mutation) | Toast for general failures. `VALIDATION_ERROR` maps `error.fields` onto inputs by dotted path and focuses the first invalid one. `CONFLICT` shows the field named in `details.field` as taken |
| Not found | In-page "Not found" with a link back to the list |
| Forbidden | `403 FORBIDDEN`: in-page "You don't have access to this." (no redirect). A 403 on non-GET may also be the Origin check; the message is the same |
| Unauthenticated | Any `401 UNAUTHENTICATED` outside `/auth/login` triggers the global handler (redirect to `/login`, return afterwards). See auth-and-sessions.md |
| Rate limited | `429 RATE_LIMITED`: toast "Too many requests. Try again in N seconds." using `details.retryAfterSeconds` (also sent as the `Retry-After` header); the triggering button stays disabled for N seconds |
| Server error | `500 INTERNAL`: toast "Something went wrong on our side. Try again." Every error body carries `error.requestId` (also the `X-Request-Id` header): show it in small text in the toast/panel ("Reference: 4c1f0a9e") so the founder can quote it |
| Offline | `navigator.onLine === false`: persistent top banner "You're offline. Changes can't be saved." and all mutation buttons disabled |
| Partial failure | Bulk operations return per-item results; show a result dialog (see 5.5), never just a toast |

### 1.7 Confirmation policy

| Action class | Confirmation |
|---|---|
| Moves forward with no side effect the customer sees twice (Confirm, Pack) | Inline confirm: the button opens a small dialog "Mark STP-1042 as Confirmed?" with **Confirm** / **Cancel**. Bulk uses one dialog for all |
| Sends an email or has cash/stock consequence (Out for delivery, Delivered, Returned, Cancelled) | Dialog that states the consequence, plus required inputs where listed |
| Destructive and irreversible (delete a record, end a drop early) | Dialog with a red **Delete ...** button; for ending a drop, typing the drop name |
| Reversible toggles (active, visible, cash settled) | No dialog; a toast with **Undo** for 6 s where the API allows the inverse call |

Undoable: cash collected/settled (inverse boolean), active/visible switches, reorders. **Not undoable** (say so in the dialog): any status change (except by a further allowed transition), delete, end drop, stock adjustments (corrected only by another adjustment).

### 1.8 Responsive rule

| Width | Behaviour |
|---|---|
| >= 1024 px (desktop) | Sidebar (240 px), tables, side-by-side panels |
| 640-1023 px (tablet) | Collapsed icon sidebar; tables may scroll horizontally only for wide secondary tables; prefer card lists |
| < 640 px (phone) | Bottom bar, **tables become card lists** (one card per row, key fields first, actions in a "..." menu or as full-width buttons), forms are single column, dialogs become bottom sheets, tap targets at least 44 x 44 px, no horizontal page scroll |

A shared `<DataList>` component renders a table on desktop and cards on phone from the same column definitions (each column declares `priority: 'primary' | 'secondary' | 'hidden-on-phone'`).

### 1.9 Brand application

Poppins everywhere (Bold headings, Medium subheads, Regular body). White page, black text, cream (`#FFF4E6`) panels. Coral for the active sidebar item and highlights; electric blue (`#2E63FF`) for primary buttons (white text); red/green only for status meaning. Text on coral/butter/sky/lilac/cream is black. Dark mode is not required in v1. Icon-only logo in the collapsed sidebar and favicon; full logo "on white" in the expanded sidebar and on Login.

---

## 2. Shell and layout

### 2.1 Structure

```
+--------+----------------------------------------------+
| Logo   |  [ Search...        ]  [+ New order] (bell) (user) |  top bar
| Side-  +----------------------------------------------+
| bar    |  Page title + tabs                           |
|        |  Page content                                |
+--------+----------------------------------------------+
Phone: top bar (compact) + content + bottom bar
```

### 2.2 Sidebar and bottom bar

| Item | Route | Icon label (text always shown on desktop) |
|---|---|---|
| Overview | `/` | Overview |
| Orders | `/orders` | Orders (badge: New count) |
| Products | `/products` | Products |
| Stock | `/stock` | Stock (badge: low-stock count if provided by Overview `attention`) |
| Drops | `/drops` | Drops |
| Customers | `/customers` | Customers |
| Finance | `/finance` | Finance |
| Insights | `/insights` | Insights |
| Content | `/content` | Content |
| Deliveries | `/deliveries` | Deliveries |
| Settings | `/settings` | Settings |

- Active item: coral background with black text and a left bar; `aria-current="page"`. Active matching is by prefix (`/orders/123` highlights Orders).
- Desktop: expanded by default; a collapse toggle reduces it to icons (preference remembered in `localStorage`, key `stimpy.sidebar`, wrapped in try/catch; this is a per-viewer convenience only).
- Phone bottom bar (fixed, safe-area aware) shows five slots: **Overview, Orders, Deliveries, Stock, More**. **More** opens a bottom sheet listing Products, Drops, Customers, Finance, Insights, Content, Settings. Orders keeps its New badge. The bar hides when the on-screen keyboard is open.

### 2.3 Top bar

| Element | Behaviour |
|---|---|
| Global search | Placeholder "Search order, delivery no., phone, email, name". Debounce 300 ms. Calls `GET /admin/search?q=<text>` -> `{ orders: AdminOrderSummary[], customers: { id, name, phone, email }[] }` (at most 5 of each). The dropdown has two groups: **Orders** (order number, customer, status pill, total) and **Customers** (name, phone). Enter or "See all orders" navigates to `/orders?q=<text>`; "See all customers" to `/customers?q=<text>`. Typing `1042` finds `STP-1042` (the API handles bare digits). Selecting an order opens `/orders/:id`; selecting a customer opens `/customers/:id`. If the whole result is exactly one row and the user pressed Enter, open it directly. Escape closes. On phone the search is an icon that expands to a full-width bar |
| + New order | Button (electric blue, text "+ New order") opens the New order flow (section 5.6) at `/orders/new`. On phone it is a floating action button bottom-right above the bar, and also in the top bar as "+" |
| Notification bell | Badge with the count of new orders since the founder last opened the bell (see 2.5). Click opens a popover listing recent new orders (number, name, total, time) linking to the order. Footer: "View all new orders" -> `/orders?status=NEW`; toggles for **Sound** and **Browser notifications** |
| User menu | Avatar initial + name/email. Items: **Settings** (`/settings`), **Change password** (`/settings?tab=account`), **Log out** (`POST /auth/logout`, see auth doc). Shows role label ("Owner") |

### 2.4 Route guard, 404 and error boundary

- All routes except `/login` sit under a `<RequireAuth>` layout route that waits for `GET /auth/me` before rendering anything (no flash of protected content). Details in auth-and-sessions.md.
- Unknown paths render the **404 page** inside the shell (so navigation still works): heading "Page not found", text "That page doesn't exist or has moved.", button **Go to Overview**. Unknown paths while logged out go to `/login` first (the guard runs before the 404).
- A top-level React error boundary shows "Something broke. Reload the page." with a **Reload** button and logs the error to the console only (no third-party reporting in v1).

### 2.5 New-order polling and alerts

| Setting | Value |
|---|---|
| Interval | **30 seconds** (constant `NEW_ORDER_POLL_MS = 30_000`), only while the document is visible; pauses when hidden and fires once immediately on becoming visible |
| Call | `GET /admin/orders/counts`, key `['orders','counts']`. Also drives the tab badges on the Orders page, so one poll serves both |
| Detection | Keep `lastKnownOrderId` in memory (set from the first order list or `recentOrders` loaded after login: the highest `id` seen). On each poll, when `counts.ALL` is greater than the previous value, fetch `GET /admin/orders?afterId=<lastKnownOrderId>&sort=-placedAt&pageSize=20` to get exactly the newcomers (independent of orders that left NEW in the meantime), advance `lastKnownOrderId` to the highest returned `id`, then for each newcomer (or one summary toast "3 new orders" if more than one) show a toast "New order STP-1042 from Rami Haddad ($58.00)" with **Open**, increment the bell badge, play the sound (if on) and raise a browser `Notification` (if permitted) |
| Sound | Off until the user turns it on (browsers block autoplay). The toggle click doubles as the user gesture that unlocks audio. Short clip in `apps/admin/public/` |
| Browser notifications | Ask permission only when the user switches the toggle on, never on load |
| Failure | On a failed poll, back off to 60 s and show nothing; after 3 failures show the offline/error banner. 401 follows the global handler |
| Tab title | `(3) Stimpy Dashboard` while unread new orders exist |

`afterId` makes detection exact: the count (`ALL`) only signals that something changed, and the `afterId` query names the newcomers, so an order that leaves NEW in the same interval cannot mask a new one. Manual orders the founder creates in the dashboard are also returned by `afterId`; skip the toast for ids the dashboard itself created.

### 2.6 Global keyboard shortcuts

Active only when focus is not in an input, textarea, select or contenteditable (except `Esc` and `Ctrl/Cmd+K`). Shown in a help dialog opened by `?`.

| Keys | Action |
|---|---|
| `/` or `Ctrl/Cmd+K` | Focus global search |
| `n` | New order |
| `g` then `o` | Go to Orders |
| `g` then `h` | Go to Overview |
| `g` then `p` | Go to Products |
| `g` then `s` | Go to Stock |
| `g` then `d` | Go to Deliveries |
| `g` then `c` | Go to Customers |
| `?` | Open shortcut help |
| `Esc` | Close dialog/popover/search; on Order detail, back to the list |
| `j` / `k` | On list pages, move selection down/up; `Enter` opens the selected row |

Shortcuts must never fire a state-changing action (no "press c to confirm").

### 2.7 Page chrome

Each page has a title (`h1`), optional tabs (`role="tablist"`, keyboard arrow navigation, horizontally scrollable on phone with the active tab scrolled into view), and an optional right-aligned primary action. Document title is `<Page> - Stimpy Dashboard`. The app sends `<meta name="robots" content="noindex">`.

---

## 3. Login

| | |
|---|---|
| Route | `/login` (public). Accepts `?returnTo=/orders?status=NEW` (must start with `/` and not `//`; otherwise ignored) |
| API | `POST /auth/login` `{ email, password }` -> `{ user }`. On success set `['session']` to `user`, then navigate to `returnTo` or `/` |
| If already logged in | `GET /auth/me` succeeds on load -> redirect to `returnTo` or `/` |
| Layout | Centered card on cream, max 400 px, full logo (on white) above the form. Same on phone with 16 px gutters |
| Fields | **Email** (`type=email`, required, `autocomplete="username"`), **Password** (required, `autocomplete="current-password"`, show/hide toggle) |
| Button | **Log in** (electric blue, full width). Disabled while pending; label becomes "Logging in..." |
| Errors | `401`: "Email or password is incorrect." (always generic). `429`: "Too many attempts. Try again in M:SS." with a live countdown from `details.retryAfterSeconds`; button disabled until it reaches 0. `400 VALIDATION_ERROR`: field messages. Network: "Can't reach the server. Is the API running on port 4000?" |
| States | Loading while checking existing session shows a blank branded splash, not the form |

Full behaviour (copy, countdown, password manager, session expiry message) is in [auth-and-sessions.md](auth-and-sessions.md). There is no "forgot password" or registration in v1; a line under the button reads "Access is by invitation only."

---

## 4. Overview

| | |
|---|---|
| Route | `/` (no tabs) |
| API | `GET /admin/overview` (key `['overview']`, refetch every 60 s while visible, refetch on focus), `POST /admin/setup/:key/done` |
| Desktop | Row of 5 "Today" cards; below, two columns: left **Needs attention** and **Recent orders**, right **Live drop** and **Last 7 days** chart |
| Phone | Single column in the same order, Today cards in a 2-column grid (last card spans 2) |

**Get ready to sell** (`setup`): the first block on the page, shown only while `setup.complete` is `false`. A card titled "Get ready to sell" with a progress bar ("6 of 11 required steps done", counting only `required` items) and the list of `setup.items`. Each row shows a status icon **and** the words "To do" / "Done" (never colour alone), the `label`, the `hint`, a tag "Optional" when `required` is false, and a button **Open** that goes to `link`. `REVIEW` rows also have a **Mark as done** checkbox (`POST /admin/setup/:key/done`, pessimistic: the row updates when the call succeeds) and can be un-marked; `AUTO` rows tick themselves when their data is saved elsewhere (the Overview query is invalidated after any save that could change them: settings, options, size chart, hoodies, packs, delivery, content, builder, stock). The card can be collapsed (the choice is remembered per browser) and disappears for good once `complete` is `true`; the owner can still reach each page from the sidebar. It never blocks any action: the shop works with the placeholder data. On first login the owner lands on the Overview with the card expanded.

**Today cards** (`today`): New orders (`newOrders`, links `/orders?status=NEW`), To pack (`toPack`, links `/orders?status=TO_PACK`), Out for delivery (`outForDelivery`, links `/orders?status=OUT_FOR_DELIVERY`), Cash to collect (`cashToCollectCents`, links `/finance?tab=cash`), Today's revenue (`revenueCents`). Each card is a link with a text label.

**Needs attention** (`attention[]`): one row per item with an icon and the server `label`. Row link by `type`:

| `type` | Link |
|---|---|
| `NEW_TOO_LONG` | `/orders/:orderId` |
| `OUT_TOO_LONG` | `/orders/:orderId` |
| `HOLD_EXPIRED` | `/orders/:orderId` |
| `EMAIL_FAILED` | `/orders/:orderId` if `orderId` set, else `/content?tab=emails` |
| `LOW_STOCK` | `itemType` is `STIMPIE`: `/stock?tab=stimpies&highlight=<itemId>` (the row with that `stimpieId` is scrolled into view and highlighted). `itemType` is `HOODIE_VARIANT`: `/stock?highlight=<itemId>` (hoodies grid; the cell with that `variantId` is highlighted). `itemType`/`itemId` are `null` for every other `type` |

The row link uses the ids the API returns (`orderId`, `itemId`); the `label` is shown verbatim and never parsed.

Empty: "All clear. Nothing needs your attention."

**Live drop** (`liveDrop`): name, progress bar `unitsSold / unitsTotal` with the numbers as text, and a time-remaining label from `endsAt` (or "No end date"). Links to `/drops?tab=live`. When null: "No drop is live." with a link **Plan a drop** to `/drops`.

**Last 7 days** (`sales7d`): bar chart of revenue per day with orders count in the tooltip; below the chart a text table is available through a "Show data" toggle (accessibility). Brand colours: bars coral on white.

**Recent orders** (`recentOrders`, 10): number, customer, items summary, total, status pill; row opens the order.

States: skeletons for each block; error shows one retry panel for the whole page; individual blocks never partial-render on error.

---

## 5. Orders

### 5.1 Route, tabs and deep links

| | |
|---|---|
| Route | `/orders` |
| Tab param | `status` (default omitted = All) |
| Other URL params | `q`, `source`, `areaId`, `dropId`, `from`, `to` (dates in the business timezone), `deliveryNumber`, `holdExpired=true`, `sort`, `page`, `pageSize`. (`afterId` is used only by the poller, never in the URL) |

| Tab label | `status` value in URL | API `status` query | Badge source (`GET /admin/orders/counts`) |
|---|---|---|---|
| All | (omitted) | (none) | `ALL` |
| New | `NEW` | `NEW` | `NEW` |
| To pack | `TO_PACK` | `CONFIRMED,PACKED` | `CONFIRMED + PACKED` |
| Out for delivery | `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| Delivered | `DELIVERED` | `DELIVERED` | `DELIVERED` |
| Returned & cancelled | `CLOSED` | `CANCELLED,RETURNED` | `CANCELLED + RETURNED` |

`TO_PACK` and `CLOSED` are UI aliases for URLs. The API's `status` parameter accepts one value **or a comma-separated list**, so the To pack and Returned & cancelled tabs send `status=CONFIRMED,PACKED` and `status=CANCELLED,RETURNED` in a single paginated request; no per-status requests or merging. The tab badge for those two tabs is the sum of the corresponding `counts` entries.

### 5.2 API calls

| Purpose | Call | Key |
|---|---|---|
| List | `GET /admin/orders?status&source&areaId&dropId&from&to&deliveryNumber&q&holdExpired&sort=-placedAt&page&pageSize=25` | `['orders','list', filters]` |
| Tab badges | `GET /admin/orders/counts` | `['orders','counts']` (30 s poll) |
| Area filter options | `GET /admin/areas` | `['areas']` |
| Drop filter options | `GET /admin/drops` | `['drops','all']` |
| Bulk status | `POST /admin/orders/bulk-status` `{ ids, to }` | mutation |
| Export CSV | `POST /admin/orders/export` (current filters in the body, or `{ ids }` for a selection) | mutation |
| New-order poll | `GET /admin/orders?afterId=<lastKnownOrderId>` (see 2.5) | not cached |
| WhatsApp from row | `GET /admin/orders/:id/whatsapp?template=...` | on click |

### 5.3 Layout

**Desktop:** page title, tabs with count badges, filter bar (search box, Source, Area, Drop, date range, "Hold expired only" toggle, **Clear filters**), then the table. A sticky bulk-action bar appears when rows are selected.

**Phone:** tabs scroll horizontally; filters collapse behind a **Filters** button (bottom sheet, with an active-filter count); each order is a card. Selection mode: long-press a card (or tap **Select**) to show checkboxes and the bulk bar.

### 5.4 Columns / card fields

| Column | Source | Notes | Card position |
|---|---|---|---|
| Select | | checkbox | top-left in select mode |
| Order no. | `number` | monospace, link to `/orders/:id` | card title |
| Date | `placedAt` | | card subtitle |
| Customer | `customerName` | plain text | line 1 |
| Phone | `contactPhone` | `tel:` link | line 2 |
| Area | `areaName` | | line 2 |
| Items | `itemsSummary` | truncate with title tooltip | line 3 |
| Total | `totalCents` | right-aligned | top-right |
| Status | `status` (+ `holdExpired` badge) | pill with text | under title |
| Delivery no. | `deliveryNumber` | blank until out; "-" shown as empty cell | line 4 if set |
| Payment | `cashCollected`, `cashSettled` | "Cash collected" / "Settled" / "To collect" text | line 4 |
| WhatsApp | button | opens chat (5.7) | action row |

Default sort `-placedAt`. Sortable headers (click toggles ascending/descending, stored in `sort`): Date (`placedAt`), Total (`totalCents`), Order no. (`number`) and Status (`status`); no other column is sortable. On phone the same four options appear in a **Sort** select inside the Filters sheet. Rows with `holdExpired` get a red left border and the "Hold expired" badge.

### 5.5 Bulk actions and partial failure

| Action | Available when | Behaviour |
|---|---|---|
| Mark confirmed | selection all `NEW` | `POST /admin/orders/bulk-status` `{ ids, to: 'CONFIRMED' }` |
| Mark packed | selection all `CONFIRMED` | `... to: 'PACKED'` |
| Mark delivered | selection all `OUT_FOR_DELIVERY` | `... to: 'DELIVERED'` (each order validated on its own; cash flags and stock follow the single-order rules) |
| Export CSV | always. With a selection the button reads "Export selected (N)" and sends `{ ids }`; with no selection it reads "Export CSV" and sends the current filters in the body | `POST /admin/orders/export`; response is `text/csv`, filename from `Content-Disposition` (`orders-YYYY-MM-DD.csv`); download as in the auth doc. Cells starting `= + - @` arrive prefixed with `'` (server-side formula protection): show the CSV as-is, never strip it |
| Print delivery sheet | selection of `PACKED`/`OUT_FOR_DELIVERY` orders | Client-side print view (`/orders/print?ids=...`) using fetched `AdminOrder` data; the API has no print endpoint by design |

- Buttons for actions not valid for the whole selection are disabled with a tooltip "Select only New orders" (or Confirmed / Out for delivery to match the action). `bulk-status` accepts only `CONFIRMED`, `PACKED` and `DELIVERED`.
- Bulk uses a confirm dialog: "Mark 5 orders as Packed? This can't be undone." **Mark 5 as Packed** / **Cancel**. The Delivered variant says "Mark 5 orders as Delivered? Customers with an email are emailed 'Delivered' and cash is now expected."
- **Partial failure:** the response `{ updated, failed: [{id, code}] }`. If `failed` is empty, toast "5 orders marked Packed." Otherwise a result dialog: "4 updated, 1 failed" listing failed orders by number with plain reasons (`INVALID_TRANSITION` -> "Not in the right status", `NOT_FOUND` -> "Order no longer exists"), a **Select failed orders** button that reselects them, and **Close**. The list is invalidated either way. Selection is cleared except for failed ids.
- Sending orders out for delivery is not a bulk-status action (it needs numbers); use Deliveries (section 14.1). Cancelling and returning are likewise single-order actions (they need a reason or restock choice).

### 5.6 New order (manual order)

| | |
|---|---|
| Route | `/orders/new` (full page on phone, centered form on desktop). Deep link `?customerId=` pre-fills from a customer |
| API | `POST /admin/orders`. Reads: `GET /products/hoodies`, `GET /products/hoodies/:slug`, `GET /products/stimpies`, `GET /packs`, `GET /options`, `GET /delivery/fees`, `GET /admin/customers?q=` |

Sections and fields (names match the request body):

| Section | Field | Validation |
|---|---|---|
| Source | `source` radio: Instagram DM (`INSTAGRAM`), WhatsApp (`WHATSAPP`), Manual (`MANUAL`) | required; default `WHATSAPP` |
| Customer | Find existing: search `GET /admin/customers?q=`, choosing one fills the fields (the customer is matched by phone on the server; editing fields does not edit the customer record) | optional |
| | `customer.name` | required |
| | `customer.email` | optional here; valid email if given |
| | `customer.phone` | required; Lebanese format hint "03 123 456 or +961 3 123 456"; server errors shown inline |
| | `customer.whatsappSameAsPhone` checkbox (checked) + `customer.whatsapp` | `whatsapp` required when unchecked |
| Delivery | `delivery.areaId` (select from `GET /admin/areas`, optional), `delivery.areaName` (required; auto-filled from the area, editable), `delivery.address` (required), `delivery.notes` | |
| Items | Line editor: choose kind **Pack / Hoodie only / Extra Stimpie**. Pack: `packId`, `hoodieId`, `colorId`, `sizeId`, `stimpieIds` (exactly `stimpieCount`). Hoodie: `hoodieId`, `colorId`, `sizeId`. Stimpie: `stimpieId`. `qty` 1..10. Sold-out sizes/Stimpies are disabled with text "Sold out" | at least one item |
| Order | `initialStatus`: Confirmed (default) / New. `sendEmail` checkbox "Email the customer" (default on if an email is entered, disabled otherwise) | |
| Summary | Live subtotal, delivery fee (from `GET /delivery/fees`: area `feeCents` or `defaultFeeCents`), total. Labelled "Estimate: the server sets final prices" | prices are never sent |

Button: **Create order** (electric blue). Success: navigate to `/orders/:id` with toast "Order STP-1043 created." Errors: `SOLD_OUT` shows a dialog listing `details.items` (name, requested, available) and returns to the form with those lines flagged; `NOT_PURCHASABLE` lists items with the `reason` in words (`INACTIVE` "Hidden", `DROP_NOT_STARTED` "Drop hasn't started", `DROP_ENDED` "Drop has ended"); `VALIDATION_ERROR` maps `fields` (e.g. `items.0.sizeId`). Unsaved-changes guard on navigation away.

### 5.7 WhatsApp button (list and detail)

`GET /admin/orders/:id/whatsapp?template=<key>` returns `{ to, text, url }`. Open `url` with `window.open(url, '_blank', 'noopener,noreferrer')` called **synchronously in the click handler's promise result** is blocked by popup rules on some browsers; therefore open a blank tab on click first (`const w = window.open('', '_blank')`), then set `w.location = url` (and `w.opener = null`) when the response arrives; if the request fails close the tab and toast. Only `https://wa.me/` URLs are opened (validate the host before navigating). Default template on the list is chosen from the status: `NEW`/`CONFIRMED` -> `order_confirmation`, `PACKED` -> `ready_for_delivery`, `OUT_FOR_DELIVERY` -> `out_for_delivery`, `DELIVERED` -> `delivered`; other statuses show no WhatsApp button in the list.

### 5.8 Status actions (Orders list)

The list offers no per-row status buttons except through bulk (5.5). The row menu ("...") has: Open, Message on WhatsApp, Copy order number. Status changes happen on the detail page or in Deliveries.

### 5.9 States

| State | Behaviour |
|---|---|
| Loading | 8 skeleton rows/cards; tab badges show "-" until counts load |
| Empty (no orders at all) | "No orders yet. Orders from the website appear here within seconds. [+ New order]" |
| Empty (filtered) | "No orders match these filters." + **Clear filters** |
| Error | Retry panel; counts failure leaves tabs unbadged |
| Stale | New-order toast from polling includes **Refresh list** that invalidates `['orders']`; the list never reorders itself under the founder's finger |
| Export error | Toast "Export failed. Try again." |

---

## 6. Order detail

### 6.1 Route and API

| | |
|---|---|
| Route | `/orders/:id`, tabs via `?tab=` : `summary` (default), `timeline`, `notes` |
| API | `GET /admin/orders/:id` (key `['orders','detail',id]`, `staleTime: 0`) |
| Mutations | `POST /admin/orders/:id/status`, `POST /admin/orders/:id/delivery`, `PATCH /admin/orders/:id`, `PATCH /admin/orders/:id/contact`, `POST /admin/orders/:id/cash`, `POST /admin/orders/:id/notes`, `POST /admin/orders/:id/extend-hold`, `POST /admin/orders/:id/email`, `GET /admin/orders/:id/whatsapp` |

Header (always visible, sticky on phone): order number with copy button, status pill, "Hold expired" badge when `holdExpired`, placed date, source, total. Below it the **action bar** (6.3). `Esc` returns to the list preserving its previous query string (store it in router state on entry).

### 6.2 Summary tab

Desktop: two columns (left: Customer + Contact block + Delivery; right: Items + Totals + Cash + Emails). Phone: one column in this order: status/actions, Contact, Delivery, Items, Totals, Cash, Emails.

| Block | Content |
|---|---|
| **Items** | One row per `items[]`: `name`, `details` (hoodie, color, size, Stimpie names), `qty`, `unitPriceCents`, `lineTotalCents` |
| **Totals** | `subtotalCents`, `deliveryFeeCents`, `totalCents`; internal-only line `costCents` labelled "Cost (internal)" |
| **Contact block** | Three rows from `contact`: **Email**, **Phone**, **WhatsApp**. Each has a **Copy** button (toast "Copied") and a direct action: Email -> `mailto:`; Phone -> `tel:`; WhatsApp -> opens chat (see Message customer below). A missing email shows "No email on file" and disables Email actions. **Edit contact** opens a dialog (see below) |
| **Customer** | `customer.name` as plain text with a link **View customer** to `/customers/:id` using `customer.id` from `AdminOrder` |
| **Delivery** | `delivery.areaName`, `address`, `notes`; **Copy address** button; **Edit delivery** dialog (`PATCH /admin/orders/:id` `{ delivery }`, fields `areaId`, `areaName`, `address`, `notes`; not allowed after `DELIVERED`: button hidden). Shows `deliveryNumber` (when set) as a separate labelled field "Delivery number" with **Edit** (see 6.4) |
| **Cash** | "Cash to collect: $58.00" and two switches: **Cash collected** and **Cash settled** (`POST /admin/orders/:id/cash`). Switches are enabled only when status is `DELIVERED` (collected) and `cashCollected` (settled); otherwise disabled with the reason as helper text. Marking an order delivered sets **Cash collected** automatically (the courier took the money); **Cash settled** is the founder confirming receipt. Returning an order resets both flags to false. Pessimistic; toast with **Undo** |
| **Hold** | When `holdExpiresAt` is set and status `NEW`: "Stock held until 14 Oct, 21:30". When `holdExpired`: red banner "Hold expired. The stock hold has run out and these items may be sold to someone else if the setting auto-expires." with **Extend hold** (dialog: hours 1..168, `POST /admin/orders/:id/extend-hold`; the hold becomes now + hours), **Confirm order**, **Cancel order** |
| **Emails sent** | Table from `emails[]`: template (human name), `to`, status badge (**Sent** / **Pending** / **Failed**, text label) and time. **Resend** per row (`POST /admin/orders/:id/email` `{ template }`; confirm dialog "Resend 'Order received' to rami@example.com?"). Failed rows are highlighted. **Send email** button opens a free-form dialog (Subject required <= 200, Body required, plain text) -> `POST ... { subject, body }`; disabled with a hint if no email. Pessimistic; after success the new entry appears in the list |
| **Source** | `source` as a label |

**Edit contact dialog:** fields Email (optional, valid), Phone (required), WhatsApp (required). Sends only the changed fields to `PATCH /admin/orders/:id/contact`. Helper text: "This change is logged on the timeline." Server-normalized values replace the form after save. Allowed in every status.

**Message customer on WhatsApp:** button **Message customer on WhatsApp** with a template dropdown (Order confirmation, Ready for delivery, Out for delivery, Delivered; default from status as in 5.7). On click it calls `GET /admin/orders/:id/whatsapp?template=<key>` and opens the returned `url` (never construct `wa.me` links in the browser). Disabled with a hint when the contact has no WhatsApp number (should not occur).

**Other buttons** (all in an overflow menu on phone): **Call** (`tel:`), **Print label** (client-side print view of the order: order number large, name, phone, address, delivery number if set, cash to collect; the API has no print endpoint), **Exchange** (there is no exchange feature in v1; the menu item **How to handle an exchange** opens a short dialog documenting the workflow: "1. Mark this order as Returned (choose whether to restock). 2. Create a new manual order for the replacement." with two buttons, **Mark returned** (opens the Mark returned dialog, offered only when `RETURNED` is in `allowedTransitions`) and **New order for this customer** (`/orders/new?customerId=<customer.id>`). It is not a disabled button).

### 6.3 Status actions

Rules:

- Buttons come **only** from `allowedTransitions`. Never compute them on the client. The table below equals the server's table (business rules section 7), so the UI is built and tested against it; if the server's list ever differs, the server wins.
- The primary forward action is a solid electric-blue button; **Cancel order** is an outlined red button; **Mark returned** is outlined. Phone: the forward action is a full-width button above the fold, others in a "More" menu.
- All changes are pessimistic. While pending, the whole action bar is disabled.
- Every change sends `POST /admin/orders/:id/status` with `{ to, ... }` (or the delivery endpoint when editing the number). Success replaces the cache with the returned `AdminOrder`, toasts "Order STP-1042 is now Packed.", and the Timeline tab shows the new event.
- `INVALID_TRANSITION` (409, someone/another tab changed it): dialog "This order is now <current status>" using `details.from`, refetch the order, close the dialog.

Expected buttons by current status:

| Current | Expected `allowedTransitions` | Buttons shown (label -> `to`) |
|---|---|---|
| `NEW` | `CONFIRMED`, `CANCELLED` | **Confirm order** -> `CONFIRMED`; **Cancel order** |
| `CONFIRMED` | `PACKED`, `CANCELLED` | **Mark as packed** -> `PACKED`; **Cancel order** |
| `PACKED` | `OUT_FOR_DELIVERY`, `CANCELLED` | **Send out for delivery** -> `OUT_FOR_DELIVERY`; **Cancel order** |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `RETURNED` | **Mark delivered** -> `DELIVERED`; **Mark returned** -> `RETURNED`. There is no Cancel: a parcel that is out comes back as Returned |
| `DELIVERED` | `RETURNED` | **Mark returned** -> `RETURNED` (accepted return or exchange after delivery); show "Delivered on 16 Oct" |
| `CANCELLED` | none | No buttons. Show reason (`cancelReason`) and date |
| `RETURNED` | none | No buttons |

Label map for any status the server returns: `CONFIRMED` "Confirm order", `PACKED` "Mark as packed", `OUT_FOR_DELIVERY` "Send out for delivery", `DELIVERED` "Mark delivered", `RETURNED` "Mark returned", `CANCELLED` "Cancel order", `NEW` (never offered: no transition leads back to New). If a status has no label, hide it and log to console. Steps cannot be skipped (e.g. New cannot go straight to Packed), so the bar never shows more than the next step plus Cancel or Return.

What each asks for:

| Action | Dialog title and copy | Inputs | Request | Result |
|---|---|---|---|---|
| Confirm order | "Confirm STP-1042?" body "Only confirm once the customer has confirmed on WhatsApp or by phone. The customer is emailed 'Order confirmed'." (the email line is omitted when the order has no email or emails are off) | optional note (<= 500) | `{ to:'CONFIRMED', note? }` | Pill -> Confirmed |
| Mark as packed | "Mark STP-1042 as packed?" body "The parcel is ready for delivery." | optional note | `{ to:'PACKED' }` | Pill -> Packed |
| Send out for delivery | "Send STP-1042 out for delivery?" body "Enter the delivery number from the delivery slip. The customer is emailed 'On its way' with this number." | **Delivery number** (required, trimmed, 1..60). Below: duplicate check | `{ to:'OUT_FOR_DELIVERY', deliveryNumber }` | Pill -> Out for delivery, delivery number appears in header |
| Mark delivered | "Mark STP-1042 as delivered?" body "The customer received the order. $58.00 cash is now expected." | none | `{ to:'DELIVERED' }` | Pill -> Delivered, Cash switches become active |
| Mark returned | "Mark STP-1042 as returned?" body "Failed delivery or accepted return." | **Restock choice** (radio, required): "Put the items back in stock" (default, `restock: true`) / "Write off as damaged (don't restock)" (`restock: false`); optional note. The choice matters only for orders that were already delivered; for a failed delivery (from Out for delivery) the reserved items are always released, so the radio is hidden and the dialog says "The items go back on the shelf." Copy also notes "Cash collected and settled flags are reset." | `{ to:'RETURNED', restock, note? }` | Pill -> Returned; stock movement written server-side |
| Cancel order | "Cancel STP-1042?" body "Reserved items go back in stock. This can't be undone." + if the order has an email "The customer is emailed 'Order cancelled' with your reason." | **Reason** (required in the UI, 3..255 chars, the contract maximum; quick-pick chips: "Customer changed mind", "Couldn't reach customer", "Out of stock", "Duplicate order", plus free text), sent as `cancelReason` | `{ to:'CANCELLED', cancelReason }` | Pill -> Cancelled; reason displayed |

The contract makes `cancelReason` optional; requiring it in the UI is a deliberate, settled product choice for audit quality.

**Delivery number input behaviour**

- Empty submit shows "Enter the delivery number to continue." and does not call the API. If the API still returns `422 DELIVERY_NUMBER_REQUIRED` (e.g. whitespace-only), show the same message on the field.
- **Duplicate warning (does not block):** on blur and before submit, call `GET /admin/orders?deliveryNumber=<value>&pageSize=5`. If other orders (excluding this one) come back, show an amber inline notice "D-88231 is already on 2 other orders (STP-1040, STP-1041). That's fine if they travel on the same run." with the button label unchanged; submission proceeds. This lookup is advisory: if it fails, skip it silently. (A duplicate number is always allowed by the server; `POST /admin/deliveries/dispatch` also reports it in `warnings`.)
- The input uses `autocomplete="off"`, `inputmode="text"`, and on phone opens the normal keyboard (delivery numbers may contain letters).

### 6.4 Editing the delivery number

Shown when status is `OUT_FOR_DELIVERY` (and for later statuses, read-only). **Edit** opens a small dialog with the same field and duplicate warning, calling `POST /admin/orders/:id/delivery` `{ deliveryNumber }`. Copy: "Correct the delivery number. The customer's tracking page updates; no new email is sent. Use **Resend** in Emails sent if the customer needs the new number." The correction is recorded on the timeline (note "Delivery number changed from X to Y"). From `PACKED`, the status dialog may call this endpoint instead of the status endpoint; both are equivalent per the contract and the UI uses the status endpoint for consistency.

### 6.5 Timeline tab

`events[]` newest first: status pill for `to` (and "from -> to" text), `at`, `by` (or "System" when null), and `note`. The first event has `from: null` and reads "Order placed". Contact edits and notes appear here when the API records them as events. Read-only. Empty is impossible; if `events` is empty show "No history yet."

### 6.6 Notes tab

Internal notes, never shown to customers (banner: "Internal only. Customers never see these."). List `notes[]` newest first: body (plain text, preserved line breaks), author, time. Add form: textarea (required, 1..1000), **Add note** button (`POST /admin/orders/:id/notes`). Pessimistic. No editing or deleting (the contract has no endpoints for them). Empty: "No notes yet."

### 6.7 States

| State | Behaviour |
|---|---|
| Loading | Skeleton header + blocks |
| 404 | "Order not found." with link to `/orders` |
| Error | Retry panel |
| Concurrent change | On window focus the order refetches; if `status` changed while a dialog is open, the dialog closes with the `INVALID_TRANSITION` notice |
| Hold expired | Banner and flagged badge (6.2) |
| Cancelled/returned | Read-only except notes and Resend/Send email |
| Email failed | Row highlighted red with **Resend**; also appears on Overview |

---

## 7. Products

Route `/products`, tabs via `?tab=` : `hoodies` (default), `stimpies`, `packs`, `options`, `size-chart`.

Common to Hoodies / Stimpies / Packs: a list with a **+ New <thing>** button, row click opens an edit panel (right drawer on desktop, full page on phone at `/products/<tab>/:id` and `/products/<tab>/new`). Delete is allowed only when unreferenced; otherwise `409 CONFLICT` shows "This is used by past orders. Hide it instead." with a button that sets `active: false`. Hiding is the normal path and needs no confirmation (toggle, Undo toast).

Image fields use the shared `<ImageUploader>` (section 7.7).

**Inactive rows and filter.** Every admin list (hoodies, Stimpies, packs, colours, sizes) includes inactive rows, each with an `active` flag, and accepts `?active=true|false`. Lists show all rows by default (inactive ones dimmed with the text "Hidden"); a **Show: All / Active / Hidden** control maps to omitting `active`, `active=true`, `active=false`.

**Reordering.** Hoodies, packs, colours and sizes are reordered with one call each: `PUT /admin/hoodies/order`, `PUT /admin/packs/order`, `PUT /admin/colors/order`, `PUT /admin/sizes/order`, body `{ ids }` (the full list of ids in the new order), response `204`. Optimistic with rollback (1.5). There is no per-row `position` patching.

### 7.1 Hoodies tab

| | |
|---|---|
| API | `GET /admin/hoodies`, `GET /admin/hoodies/:id`, `POST /admin/hoodies`, `PATCH /admin/hoodies/:id`, `DELETE /admin/hoodies/:id`; `POST /admin/uploads` |
| Keys | `['hoodies']`, `['hoodies', id]` |
| Columns / cards | Image thumb, name, price, available (read-only `available` from list), active toggle |

Form fields:

| Field | API | Validation |
|---|---|---|
| Name | `name` | required, 1..120 |
| Slug | `slug` | required, `^[a-z0-9]+(-[a-z0-9]+)*$`; auto-generated from name until edited; `CONFLICT` -> "That slug is taken." |
| Description | `description` | plain text |
| Details | `details: string[]` | list editor (add/remove/reorder bullets) |
| Price | `priceCents` | required, >= 0, dollars input |
| Cost | `costCents` | required, >= 0; helper "Default $10. Hardware cost is added separately in Settings." |
| Images | `images: string[]` | upload, reorder, remove; first is the cover |
| Active | `active` | switch |

Notes: colors and sizes are not edited here (see Options). After creating a hoodie, show a notice: "Variants for every active color and size were created with zero stock. Set quantities in Stock." with a **Go to Stock** button (`/stock`). The hoodies list gets drag handles (or Move up / Move down) to reorder via `PUT /admin/hoodies/order`. Inactive hoodies are listed and dimmed with the text "Hidden". The Builder's hoodie is chosen under Content -> Builder (13.5); hiding that hoodie warns "The Builder sells this hoodie."

### 7.2 Stimpies tab

| | |
|---|---|
| API | `GET/POST /admin/stimpies`, `GET/PATCH/DELETE /admin/stimpies/:id`, `GET /admin/drops` (for the drop select), `POST /admin/uploads` |
| Columns / cards | Artwork thumb, name, type pill (**Core** / **Limited**), drop name, price, cost, available / reserved, active toggle |
| Filters | Type (Core/Limited), Drop, Hidden shown toggle, `q` |

Form fields:

| Field | API | Validation |
|---|---|---|
| Name | `name` | required |
| Slug | `slug` | as above |
| Type | `type` | `CORE` or `LIMITED` radio; **Core** = always available, **Limited** = never restocked (helper text) |
| Drop | `dropId` | optional select; a Limited Stimpie without a drop shows a hint |
| Price | `priceCents` | required; defaults to $10 |
| Cost | `costCents` | required; default $6 |
| Initial quantity | `quantity` | **creation only** (integer >= 0); on edit this field is replaced by text "Stock changes go through Stock -> Adjust" with a link |
| Story line | `story` | plain text |
| Images | `images[]` | uploader |
| Artwork | `artworkUrl` | uploader; required for the Builder; helper "Used as the back panel in the Builder" |
| Active | `active` | switch |

### 7.3 Packs tab

`GET/POST /admin/packs`, `GET/PATCH/DELETE /admin/packs/:id`. Cards show name, Stimpie count, price, badge, active. Fields: `name`, `slug`, `description`, `stimpieCount` (integer 1..5 in UI; today 1 or 2), `priceCents`, `badge` (e.g. "Most popular", optional, <= 30), `active`. Order is changed with the drag handle and saved with `PUT /admin/packs/order` `{ ids }` (no per-pack `position` writes from the UI). Helper under the price: "Total price of the hoodie plus its Stimpies." For the $45 pack the UI shows the effective second-Stimpie price if both pack prices are known (price difference), as information only. Prices change here, not in code. A warning appears when `priceCents` changes: "New orders use the new price. Existing orders keep theirs."

### 7.4 Options tab

Master lists the whole shop uses. Two sections on one page (desktop side by side, phone stacked): **Colors** and **Sizes**.

| | |
|---|---|
| API | `GET/POST /admin/colors`, `PATCH/DELETE /admin/colors/:id`, `PUT /admin/colors/order`, `GET/POST /admin/sizes`, `PATCH/DELETE /admin/sizes/:id`, `PUT /admin/sizes/order`, `POST /admin/uploads` (lists accept `?active=`) |
| Keys | `['colors']`, `['sizes']` |

**Colors list** (ordered by `position`): drag handle, swatch (filled with `hex` plus the hex as text), name, hoodie photo count, Builder look status (tint/texture set or "Not set"), active toggle, edit.

**Color form fields:** `name` (required, unique; `CONFLICT` -> "A color with this name already exists."), `hex` (required, `^#[0-9A-Fa-f]{6}$`, with a colour picker and text input kept in sync), `images[]` (hoodie photos, uploader), `builderTint` (optional hex), `builderTexture` (optional image upload), `active`. **This is the only place tint and texture are edited**; the Content -> Builder tab shows them read-only and links here (`PUT /admin/builder` ignores them).

**Sizes list** (ordered by `position`): drag handle, label, active toggle, edit. **Size form:** `label` (required, 1..10, unique), `active`.

**Reorder:** drag handle (mouse and touch, with keyboard alternative: focus the handle and press Space then arrows, or use **Move up / Move down** buttons in the row menu). On drop, send the complete id list in its new order with `PUT /admin/colors/order` or `PUT /admin/sizes/order` `{ ids }` (`204`). The UI is optimistic with rollback (section 1.5); there are no parallel per-row `PATCH` requests.

**Auto-created variants (must tell the founder):** after a successful `POST` of a color or a size, show a persistent (not auto-dismissing) notice dialog:

> "Color 'Sage' added. Zero-stock variants were created for every hoodie in every active size. They show as Sold out on the website until you add stock. [Go to Stock] [Later]"

For a size the text reads "...for every hoodie in every active color." **Go to Stock** opens `/stock` (Hoodies tab). The Options page also shows a persistent yellow strip "N variants have zero stock" when the stock summary (`GET /admin/stock/hoodies`, fetched lazily) shows cells with `available === 0` for the newly added item, so the reminder survives a closed dialog. Making a color/size `active: false` hides it from the shop; it does not delete variants. Deleting a color/size used by past orders gives `409 CONFLICT` -> "Used by past orders. Hide it instead."

States: empty colors -> "No colors yet. Add your first color so hoodies can be sold." (same for sizes). Loading skeletons. Both lists are independent: one failing shows its own retry.

### 7.5 Size chart tab

| | |
|---|---|
| API | `GET /admin/size-chart`, `PUT /admin/size-chart`; sizes come from the same response (`rows`) and `GET /admin/sizes` |
| Key | `['size-chart']` |

Layout: a table editor. Header row = measurement columns; first column = size label (read-only, from Options); one row per size.

| Control | Behaviour |
|---|---|
| Column header | Editable text `label` (e.g. "Chest", required, unique) and a unit select `unit` (cm / in; free text allowed if the API accepts it, default cm) |
| **Add column** | Appends a column with a temporary client id (no `id` sent on save, so the server creates it) |
| **Remove column** (x in header) | Removes the column and its values; confirm if any cell has a value: "Remove 'Sleeve' and its 5 values?" |
| Rows | One per size from Options, ordered as Options. **Add row** is not offered here (rows come from sizes). If a size has no row yet, a row with empty cells appears. **Remove row** = hide the size via Options; the editor shows a hint "To remove a size, hide it in Options." Because rows are sizes in the contract, an **Add size** shortcut opens the Options size form and returns here |
| Cell | Text input (`values[columnId]` is a string, e.g. "56" or "56-58"); `inputmode="decimal"`; max 20 chars |
| Column reorder | Arrow buttons in the header menu; order is array order on save |
| How to measure | Textarea `howToMeasure` (plain text with the Markdown subset), with a preview toggle. This is the **only** place it is edited (it is not part of Policies) |
| Save | **Save size chart** button (sticky on phone). Sends the whole chart with `PUT /admin/size-chart`. Pessimistic; success toast "Size chart saved. It's live on the website." |
| Dirty state | "Unsaved changes" indicator and a leave-page guard; **Discard changes** resets |

On phone the table scrolls horizontally inside its own container (the only permitted horizontal scroll), with the size column sticky at the left. Alternatively, an expandable card per size listing "Chest [ ] Length [ ]" fields; the card layout is the default below 640 px.

Validation: at least one column; column labels non-empty and unique; no duplicate column ids; a toast if the server returns `VALIDATION_ERROR` with `fields` mapped to cells by path.

### 7.6 States (Products)

Standard patterns. Extra: creating with an existing slug -> inline `CONFLICT` message. Leaving a dirty form -> confirm "Discard changes?".

### 7.7 Image uploader (shared)

`POST /admin/uploads` as `multipart/form-data` field `file` (optional `purpose`). Client checks before sending (mirroring the server): type in JPG, PNG, WebP, SVG for images, MP4/WebM for video, `.glb` for models; size limits images 10 MB, video 100 MB, GLB 50 MB. Images are resized by the server to at most 2000 px on the long side. One file at a time with progress; thumbnails after upload; remove only drops the reference (there is no delete endpoint in v1, so orphan files stay on the server). Displays the returned `width x height` (null for video/GLB). Server errors: `413 FILE_TOO_LARGE` -> "That file is too large (max N MB)." using `details.maxBytes`; `415 UNSUPPORTED_FILE_TYPE` -> "That file type isn't supported." listing `details.allowed`. SVG is only ever shown through `<img>`, never inlined.

---

## 8. Stock

Route `/stock`, tabs via `?tab=` : `hoodies` (default), `stimpies`, `movements`. All adjustments are **pessimistic**.

### 8.1 Hoodies tab

| | |
|---|---|
| API | `GET /admin/stock/hoodies` -> `{ colors, sizes, hoodies: [{ hoodieId, name, cells }] }` |
| Key | `['stock','hoodies']` |
| Layout (desktop) | One grid per hoodie: rows = colors (swatch + name), columns = sizes. Each cell shows **Available** large and "qty / reserved" small |
| Layout (phone) | One card per hoodie; inside, an accordion per color listing sizes as rows: "M   Available 4   (qty 5, reserved 1)" with an **Adjust** button |
| Cell states | `available === 0` -> red cell with the text "Sold out"; `available <= lowStockThreshold` -> amber with "Low" (threshold from `GET /admin/settings` `orders.lowStockThreshold`); inactive colors/sizes are not in the response |

Click/tap a cell to open the **Adjust stock** dialog (8.4).

### 8.2 Stimpies tab

| | |
|---|---|
| API | `GET /admin/stock/stimpies` -> `items[]` |
| Columns / cards | Name, type pill, drop name, Quantity, Reserved, Available, low flag (`low` -> "Low stock" badge with text), **Adjust** |
| Sort | Low first, then name |

### 8.3 Movements tab

| | |
|---|---|
| API | `GET /admin/stock/movements?itemType&itemId&reason&orderId&from&to&page&pageSize` |
| Key | `['stock','movements', filters]` |
| Columns / cards | Date (`at`), Item (`itemName`), Field (`QUANTITY`/`RESERVED` as "On hand"/"Reserved"), Change (`delta`, signed, green/red with +/- text), Reason (`reason`), Order (`orderNumber` linking to the order when present), Note, By |
| Filters | Item type, Reason (full enum: `INITIAL` Initial stock, `RESTOCK` Restock, `CORRECTION` Correction, `DAMAGED` Damaged, `ORDER_RESERVED` Order placed, `ORDER_RELEASED` Order released, `ORDER_SOLD` Order delivered, `ORDER_RETURNED` Order returned (restocked), `ORDER_WRITTEN_OFF` Order returned (written off)), date range (business timezone), `orderId` via deep link `?orderId=` |
| Read-only | No editing or deleting movements |

### 8.4 Adjust stock dialog

Two modes via tabs in the dialog: **Add / remove** and **Set total**.

| Mode | Fields | Request |
|---|---|---|
| Add / remove | `delta` (integer, non-zero; negative allowed; +/- stepper), `reason` (select: Restock `RESTOCK`, Correction `CORRECTION`, Damaged `DAMAGED`; required), `note` (**required**, 3..300) | `POST /admin/stock/adjust` `{ itemType, itemId, delta, reason, note }` |
| Set total | `quantity` (integer >= 0), `note` (**required**) | `POST /admin/stock/set` `{ itemType, itemId, quantity, note }` |

`itemType` is `HOODIE_VARIANT` (itemId = `variantId`) or `STIMPIE` (itemId = `stimpieId`). Preview line: "On hand 5 -> 8. Reserved 1. Available 7." computed locally for information; the real numbers shown afterwards come from the response `{ quantity, reserved, available }`.

Rules and errors:

- A note is mandatory; an empty note blocks submit with "Add a note so we know why the stock changed."
- If the result would be below `reserved`, the server returns `CONFLICT`: show "You can't go below what's reserved for open orders (reserved: 2)."; keep the dialog open.
- Not undoable: the dialog footer says "Stock changes are logged and can only be corrected with another adjustment."
- Large deltas (|delta| > 50) ask "Add 200 units?" in a second confirmation step to prevent typos.
- Button **Save adjustment**. After success: cell updates from the response, toast "Stock updated.", and the Movements query is invalidated.

### 8.5 States

Empty hoodies ("No hoodies yet. Create one in Products."), empty Stimpies likewise. Error retry panel per tab. Setting any available quantity to 0 makes the website show Sold out: the dialog shows an info line "This will show as Sold out on the website." when the new available is 0.

---

## 9. Drops

Route `/drops`, tabs via `?tab=` : `upcoming` (default), `live`, `archive`. Drop create/edit at `/drops/new` and `/drops/:id` (form page).

| | |
|---|---|
| API | `GET /admin/drops?state=UPCOMING\|LIVE\|ARCHIVE`, `GET /admin/drops/:id`, `POST /admin/drops`, `PATCH /admin/drops/:id`, `DELETE /admin/drops/:id`, `POST /admin/drops/:id/end`, `GET /admin/stimpies` (to assign), `POST /admin/uploads` |
| Keys | `['drops', state]`, `['drops', 'detail', id]` |

### 9.1 Upcoming tab

Cards/rows: name, accent colour chip with its name (Butter/Sky/Lilac in text), launch date/time, Stimpies count, total units, **Edit**. Button **+ New drop**.

**Drop form fields:**

| Field | API | Validation |
|---|---|---|
| Name | `name` | required |
| Slug | `slug` | auto from name; `CONFLICT` -> "That slug is taken." |
| Story | `story` | plain text |
| Accent colour | `accentColor` | radio chips `BUTTER` `SKY` `LILAC` showing the swatch and the name |
| Launch | `startsAt` | required; date + time inputs, interpreted in the business timezone (shown next to the field, e.g. "Asia/Beirut time"), sent as ISO UTC; must be in the future when creating (UI check; the server is authoritative) |
| End (optional) | `endsAt` | must be after `startsAt` |
| Stimpies | `stimpieIds` | multi-select list with search; each row shows stock quantity (read-only here). New Stimpies are created in Products; a link **Create a Stimpie** goes there. Quantities are set on the Stimpie (initial `quantity`) or in Stock |
| Teaser image / video | `teaserImage`, `teaserVideo` | uploaders (video MP4/WebM up to 100 MB) |

Info line: "Before the launch time the website shows only the countdown. Stock can't be bought early." Save button **Save drop**; on create navigate to the list with toast. Deleting is allowed only for drops without orders on their Stimpies (`409 CONFLICT` -> "This drop has orders. You can't delete it."); confirm dialog with red **Delete drop**.

### 9.2 Live tab

For the live drop (`state: LIVE`): header with name, accent chip, countdown to `endsAt` (or "No end date"), total sold / total units with progress bar and text; per-Stimpie table: name, quantity, sold, remaining (`stimpies[].quantity/sold/remaining`), a **Sold out** badge when remaining is 0. "Sell-through speed" is shown as units per hour computed on the client from `startsAt` and `unitsSold` (labelled "avg since launch"; no finer data exists). Auto-refresh every 30 s.

**End early:** button **End drop now** (red outline). Dialog: "End 'Drop 02' now? The website stops selling its Stimpies immediately. This can't be undone." The user must type the drop name to enable **End drop now**. Request `POST /admin/drops/:id/end`. Pessimistic. After success the drop moves to Archive.

Empty: "No drop is live right now." with link to Upcoming.

### 9.3 Archive tab

Rows: name, state label (**Sold out - won't return** for `SOLD_OUT`; **Ended** for `ENDED`), units sold / total, `revenueCents`, `sellOutAt` (and time-to-sell-out computed from `startsAt`), dates. Card layout on phone. Row opens a read-only detail view (`/drops/:id`) with per-Stimpie results. A helper note at the top: "Fast sell-outs are a signal to raise prices on the next drop." Pagination applies.

### 9.4 States

Standard. If the form is dirty, guard navigation. A `LIVE` drop's `startsAt` is read-only in the form (UI choice; server rules apply).

---

## 10. Customers

Route `/customers`, tabs via `?tab=` : `all` (default), `repeat`, `subscribers`. Customer record view at `/customers/:id`.

| | |
|---|---|
| API | `GET /admin/customers?filter=all\|repeat&q&page&pageSize`, `GET /admin/customers/:id`, `PATCH /admin/customers/:id`, `GET /admin/subscribers?page&pageSize` and `?format=csv` |
| Keys | `['customers', filters]`, `['customers','detail',id]`, `['subscribers', filters]` |

### 10.1 All and Repeat tabs

Columns / cards: Name, Email, Phone, WhatsApp, Orders (`ordersCount`), Total spent (`totalSpentCents`), Last order (`lastOrderAt`). Search `q` matches name, phone, email and WhatsApp (placeholder "Search name, phone, email or WhatsApp"). **Repeat** uses `filter=repeat` (2+ orders). Rows link to `/customers/:id`. Phone and WhatsApp are `tel:` and WhatsApp actions; WhatsApp on this page opens `https://wa.me/<digits>` built from the E.164 number (digits only) because the order-specific endpoint needs an order; this is the one place a link is built client-side and it must pass the `wa.me` safety check in the auth doc. Email is a `mailto:` link.

Empty: "No customers yet. Customers are created automatically when they order." Repeat empty: "No repeat customers yet."

### 10.2 Customer view

Header: name, contact rows with copy buttons, **Edit** (`PATCH /admin/customers/:id` `{ name?, email?, whatsapp?, notes? }`; phone is not editable because customers are matched by phone). Fields: Name (required), Email (optional valid), WhatsApp (valid), Notes (textarea <= 2000, plain text). Below: orders table (`orders: AdminOrderSummary[]`) linking to order detail, totals (orders count, total spent), and a **New order for this customer** button (`/orders/new?customerId=`). Notes here are internal.

### 10.3 Subscribers tab

Columns / cards: Contact (`contact`), Type (`EMAIL` / `WHATSAPP` as text), Drop (`dropName` or "Any drop"), Signed up (`createdAt`). Button **Export CSV** (`GET /admin/subscribers?format=csv`; download handling in the auth doc; filename `subscribers-YYYY-MM-DD.csv`). Helper text: "Use this list for WhatsApp broadcasts about drops. Only people who asked to be notified are listed." No delete (no endpoint). Empty: "No subscribers yet. 'Notify me' sign-ups appear here."

---

## 11. Finance

Route `/finance`, tabs via `?tab=` : `profit` (default), `cash`, `costs`.

### 11.1 Profit

| | |
|---|---|
| API | `GET /admin/finance/profit?from&to` |
| Key | `['finance','profit', {from,to}]` |
| Range | Preset chips: This month (default), Last 30 days, Last month, All time, Custom (two date inputs). URL: `?from=2026-10-01&to=2026-10-31`. Presets are computed in the business timezone and the server applies the same timezone to the date-only values |

Content: summary cards `revenueCents`, `deliveryFeesCents`, `costOfGoodsCents`, `expensesCents`, `adSpendCents`, and highlighted `profitCents` (labelled "Profit", green when >= 0, red with a minus sign and the text "Loss" when < 0). Line "Revenue counts delivered orders in this range." A **Plan margins** panel compares the average profit per order for the $35 and $45 packs (`planMargins.pack35`, `pack45`) with the plan's targets ($18 / $22); the comparison of actuals per pack is not provided by the contract, so the panel shows the targets and the overall `profitCents / ordersCount` (average profit per order) with the labels "Plan: $18 on the $35 pack", "Plan: $22 on the $45 pack". **By order** table from `byOrder`: order number (link), date, revenue, cost, profit (sortable client-side). Phone: cards. Empty range: "No delivered orders in this range."

### 11.2 Cash collection

| | |
|---|---|
| API | `GET /admin/finance/cash`; settle: `POST /admin/deliveries/:deliveryNumber/settle` `{ settled }` (for a group) or `POST /admin/orders/:id/cash` `{ settled }` (single order) |
| Key | `['finance','cash']` |

Top: **Outstanding** `outstandingCents` as a large figure. Then groups by delivery number: header "Delivery D-88231 - 3 orders - $174.00 due" (group `deliveryNumber` null is shown as "No delivery number"), rows with order number (link), `cashDueCents`, a Settled badge/switch. Actions: **Mark delivery settled** (group; dialog "Mark all 3 orders on D-88231 as settled? You received $174.00." -> `POST /admin/deliveries/:deliveryNumber/settle {settled:true}`) and per-order switch (`POST /admin/orders/:id/cash {settled}`). Groups with null delivery number have only per-order switches. Pessimistic, with Undo toast calling the inverse. Settled groups collapse under "Settled" (collapsed by default). Empty: "Nothing to collect. Delivered orders with cash due appear here."

### 11.3 Costs

| | |
|---|---|
| API | `GET /admin/expenses?from&to&category`, `POST /admin/expenses`, `PATCH /admin/expenses/:id`, `DELETE /admin/expenses/:id`; `GET /admin/ad-spend?from&to`, `POST`, `PATCH /:id`, `DELETE /:id` |
| Keys | `['expenses', filters]`, `['ad-spend', filters]` |

Two sections (or sub-toggle **Expenses / Ad spend** via `?kind=`): lists with date, category (or channel), amount, note, edit/delete. Add form fields: Expenses: `category` (combo box with suggestions: Printing, Packaging, Ads, Shipping supplies, Shoots, Other; free text allowed), `amountCents` (dollars, > 0), `note` (optional), `spentOn` (date, default today, not in the future). Ad spend: `channel` (suggestions: Instagram, Meta Ads, TikTok, Other), `amountCents`, `note`, `spentOn`. Totals row for the filtered range. Delete asks "Delete this expense? This changes your profit figures." Range selector identical to Profit. Empty: "No expenses recorded for this range."

---

## 12. Insights

Route `/insights`, tabs via `?tab=` : `sales` (default), `products`, `customers`. All three accept the same range selector as Finance (`from`, `to`; default Last 30 days), persisted in the URL. Every chart has a "Show data" toggle that reveals its table; chart colours: coral, black, electric blue, sky, with labels directly on or beside bars (not colour-only).

| Tab | API | Content |
|---|---|---|
| Sales | `GET /admin/insights/sales` | Line/bar chart of `series` (orders, revenue); bar charts `byDrop`, `bySource` (Website / Instagram / WhatsApp / Manual labels from the `source` values), `byWeekday` (`weekday` 0 = Sunday ... 6 = Saturday, computed in the business timezone; label Sun..Sat, show in that order); and a **By campaign** table from `byCampaign` (columns Source `utmSource`, Campaign `utmCampaign`, Orders, Revenue; a `null` value is shown as "(none)" or "Direct / unknown"; sortable client-side by orders or revenue; phone: cards). It lists the UTM values the website captured on landing and stored on orders |
| Products | `GET /admin/insights/products` | Ranked list `stimpies` (units, revenue), `packMix` (donut with text percentages, or bars), `extraStimpieAttachRate` (a fraction 0..1, shown as a percentage) with the caption "share of orders with extra Stimpies", `sizes` and `colors` bar charts |
| Customers | `GET /admin/insights/customers` | KPI cards `repeatRate`, `deliverySuccessRate`, `returnRate` (all fractions 0..1, never percentages: multiply by 100 for display, e.g. `0.285` -> "28.5%"), `byArea` bar chart |

States: skeleton charts; empty "Not enough data yet for this range."; error retry per tab. Phone: single column, charts full width with horizontal scroll disabled (labels truncate, full values in the data table).

---

## 13. Content

Route `/content`, tabs via `?tab=` : `announcement` (default), `faq`, `policies`, `homepage`, `builder`, `emails`. Each tab has its own **Save** button and dirty-guard.

### 13.1 Announcement bar

| | |
|---|---|
| API | `GET /admin/content/announcement`, `PUT /admin/content/announcement` |
| Key | `['content','announcement']` |
| Fields | `enabled` (switch "Show on the website"), `text` (required when enabled, <= 120), `linkUrl` (optional, must be `https://...` or a site-relative path starting with `/`; `javascript:` and other schemes are rejected) |
| Preview | A strip rendered with brand styling below the form, updating live |
| Save | **Save announcement** (pessimistic) |

When disabled the contract returns `announcement: null` publicly; the admin response still carries `enabled: false`.

### 13.2 FAQ

| | |
|---|---|
| API | `GET /admin/faqs`, `POST /admin/faqs`, `PATCH /admin/faqs/:id`, `DELETE /admin/faqs/:id`, `PUT /admin/faqs/order` `{ ids }` |
| Key | `['faqs']` |

List of questions with drag handle (or Move up/down), "Shown on home" switch (`showOnHome`), edit, delete. Form: `question` (required <= 200), `answer` (required, Markdown subset, with preview), `group` (optional free label such as "Ordering" or "Sizing"; combo box suggesting the existing groups; blank saves `null` = ungrouped), `showOnHome`. The list shows the group as a small label on each row and can be filtered by group client-side. Reorder (one global order; the website groups by label) is optimistic with rollback via `PUT /admin/faqs/order` `{ ids }`. Delete confirm: "Delete this question?" Empty: "No questions yet."

### 13.3 Policies

| | |
|---|---|
| API | `GET/PUT /admin/content/policies`, `GET/PUT /admin/content/about`, `GET/PUT /admin/content/how-it-works` |
| Keys | `['content','policies']`, `['content','about']`, `['content','how-it-works']` |

Accordion sections, each a textarea with preview and its own **Save**: Delivery & returns (`deliveryReturns`), Care (`care`), Terms (`terms`), Privacy (`privacy`). There is no "How to measure" section here: that text belongs to the size chart and is edited only in Products -> Size chart (a link "How to measure is edited with the size chart" points there). The Policies tab also hosts **About** (`about`) and **How it works** (`howItWorks.steps`: a list editor of title, text, optional media upload; `howItWorks.promises`: a list editor of short quality-promise strings, add/remove/reorder, shown as a list on the website; and `howItWorks.faqs`: question/answer list), because the contract has these content keys but the plan gives them no tab of their own. Helper text on each: "Plain text. Leave a blank line between paragraphs. **bold** and '- ' lists are supported."

### 13.4 Homepage

| | |
|---|---|
| API | `GET/PUT /admin/content/homepage`; reviews: `GET /admin/reviews`, `POST`, `PATCH /:id`, `DELETE /:id`; `GET /admin/drops` (featured drop select); `POST /admin/uploads` |
| Keys | `['content','homepage']`, `['reviews']` |

Hero fields: `heroHeadline` (required, <= 80), `heroSubheadline`, `heroVideoUrl` (upload MP4/WebM <= 100 MB, optional), `heroImageUrl` (upload, optional; shown as the fallback/poster), `featuredDropSlug` (select from drops, or "Automatic: current live drop"). **Customer swaps and reviews**: list with `name`, `text`, `mediaUrl`, `visible` switch (hide without deleting), add/edit form, delete with confirm. Empty reviews: "No reviews yet. Hidden on the website until you add some."

### 13.5 Builder

Controls the public `/builder` page. This is the most complex tab.

| | |
|---|---|
| API | `GET /admin/builder`, `PUT /admin/builder`, `POST /admin/uploads` (the plan names `POST /admin/builder/assets`; the contract defines uploads at `POST /admin/uploads`, which is what the UI uses), `GET /admin/colors`, `GET /admin/stimpies`, `GET /admin/hoodies` (for the hoodie selector) |
| Key | `['builder']` |

`GET /admin/builder` has the shape of the public builder config (with `mode` as set, not `effectiveMode`) plus `assetsReady: { model3d: boolean; colors2d: { colorId, ready }[]; overlays2d: number; stimpieTextures: number }`. `PUT /admin/builder` takes the **full object** as returned by `GET` (it replaces the stored config) and returns it with `warnings: string[]`. Writable fields: `mode`, `defaultView`, `hoodieId`, `model3d` (`url`, `backPanelMesh`, `panelAspect`, `camera`, `lighting`; `sizeBytes` is filled in by the server from the upload), `colors[].hoodieImage2d`, `colors[].overlay2d`, `colors[].placement2d` and `stimpieTextures`. `colors[].tint` and `colors[].texture3d` are read-only here: they mirror `/admin/colors` and `PUT` ignores them. The form holds the full object in local state (React Hook Form or reducer) and sends it as a whole on **Save Builder settings**. Saved changes are live immediately (no draft or publish step); the dashboard's own live preview (below) is the only pre-save check.

Layout (desktop): left column = settings accordions; right column = sticky live preview. Phone: settings first, **Preview** as a full-width panel at the top that collapses; a floating **Preview** button scrolls to it.

**1. Mode**

| Control | Field | Notes |
|---|---|---|
| Mode selector (segmented, text labels) | `mode`: **2D only** (`2D`) / **3D only** (`3D`) / **Both** (`BOTH`) | |
| Default view (shown only when Both) | `defaultView`: **2D** / **3D** | |
| Hoodie | `hoodieId` | **Hoodie sold in the Builder**: a select of hoodies from `GET /admin/hoodies` (name, with inactive ones marked "Hidden" and disabled). Helper: "The Builder sells this hoodie. Defaults to the first active hoodie." The saved value is returned as `hoodie: { id, slug, name }` |
| Readiness hints | `assetsReady` | Beside the mode: a chip "3D model: ready/missing", "2D images: 3 of 4 colours ready" (from `colors2d`), "2D shading overlays: N" (`overlays2d`) and "Stimpie textures: N" (`stimpieTextures`). Choosing 3D or Both while `assetsReady.model3d` is false shows an amber note "No 3D model uploaded yet. The website will fall back to 2D until you upload one." |

**2. 3D model**

| Control | Field | Validation |
|---|---|---|
| GLB upload | `model3d.url` via `POST /admin/uploads` | `.glb` only, <= 50 MB (client check mirrors the server; `413 FILE_TOO_LARGE` / `415 UNSUPPORTED_FILE_TYPE` shown as in 7.7); progress bar; after upload shows file name and size (from the upload response; the server stores `sizeBytes`), **Replace** and **Remove** (sets `model3d` to null) |
| Panel aspect | `model3d.panelAspect` | number > 0, default 0.64 (width / height of the back panel); advanced field with helper "Leave at 0.64 unless the model's back panel has a different shape." |
| Back panel mesh name | `model3d.backPanelMesh` | required if a model is set; text input. If the GLB is parsed client-side (optional enhancement using the three.js loader in the preview), offer a dropdown of mesh names found in the file; otherwise free text. Helper: "The exact name of the mesh that receives the Stimpie artwork." A mismatch can't be detected by the server; the live preview shows the artwork missing, with a red note "Mesh 'Back' not found in this model" when the preview loader cannot find it |
| Camera | `model3d.camera.position` (x,y,z numbers), `target` (x,y,z), `fov` (10..100) | numeric inputs, defaults from the server; **Use current preview angle** button reads the preview camera |
| Lighting | `model3d.lighting` | select **Studio** (`STUDIO`) / **Soft** (`SOFT`) / **Night** (`NIGHT`) |

**3. Per-colour look (one row/card per active colour from `GET /admin/colors`; inactive colours are listed collapsed as "Hidden")**

Each colour card shows swatch + name, an **assets status chip** from `assetsReady.colors2d` ("2D ready" / "2D image missing") and contains:

| Control | Field | Validation |
|---|---|---|
| Flat back-view image (2D) | `colors[].hoodieImage2d` via upload | JPG/PNG/WebP/SVG; shows thumbnail; **Replace**/**Remove** |
| **Placement editor** | `colors[].placement2d` `{ x, y, width, rotation }` | See below |
| 2D shading overlay | `colors[].overlay2d` via upload | optional transparent image (PNG/WebP) drawn over the Stimpie panel in 2D to fake fabric shading; shows thumbnail; **Replace**/**Remove** (null) |
| Tint | `colors[].tint` | **Read-only** swatch + hex (or "Not set"), mirroring Options. Link **Edit in Options** -> `/products?tab=options` |
| Fabric texture | `colors[].texture3d` | **Read-only** thumbnail (or "Not set"), mirroring Options, with the same link |

**Placement editor (visual):** shows the colour's flat image with a draggable, resizable, rotatable rectangle representing the Stimpie artwork (uses the first Stimpie's `artworkUrl` as the sample, switchable from a small selector). Interactions:

- Drag to move; corner handles to resize keeping the artwork aspect ratio; a rotation handle (or numeric field).
- Numeric fields beside it: X, Y (the **centre** of the panel as a 0..1 fraction of the image width and height respectively), Width (panel width as a 0..1 fraction of the image width; the panel height is derived as `width / panelAspect`, 0.64 by default, so the editor never stores a height), Rotation (degrees clockwise about the centre, -180..180). The editor and the public Builder component use this same convention.
- Values are stored as fractions, never pixels, so they are resolution independent. Fields show percentages (e.g. "42.5%") but save fractions.
- Keyboard: arrow keys nudge by 0.5% (Shift = 2%); `+`/`-` resize.
- Touch: one finger drags, two-finger pinch resizes on phone; plus numeric fields as the accessible fallback.
- **Copy placement to all colours** button (confirm "Overwrite the placement of 3 other colours?") since the flat images usually align.
- Validation: x, y, width within 0..1 and the rectangle at least 50% inside the image; rotation numeric. The panel's aspect (height = width / 0.64) is fixed by the artwork convention, so resizing keeps it.
- If the image is missing the editor is disabled with "Upload the flat image first."

**4. Per-Stimpie texture overrides**

Collapsed section "Stimpie textures (advanced)". Table of Stimpies (name, thumbnail of `artworkUrl` as the default). Each row has **Upload override** (image) writing `stimpieTextures[]` `{ stimpieId, textureUrl }`, a preview, and **Use artwork** (removes the override). Helper: "By default the Stimpie's artwork is used on the 3D back panel. Upload a different image only if the print needs adjusting for 3D."

**5. Live preview (reuses the public Builder)**

- Rendered by importing the same `<Builder>` component from the shared package (`packages/ui` or `packages/builder`) that `apps/web` uses, fed with the **unsaved form state** in the shape of `GET /builder/config` (the form object is mapped to that shape, with `effectiveMode` computed client-side using the same rule: fall back to 2D when the 3D model is missing; `hoodie` comes from the selected `hoodieId`; `tint`/`texture3d` come from the read-only colour values) instead of fetching the public endpoint. Stimpies come from `GET /admin/stimpies` mapped to the public `Stimpie` shape (including `artworkWidth`/`artworkHeight`).
- Controls above the preview: **2D / 3D** toggle (when the mode allows), colour select, Stimpie select, and **Simulate: no WebGL** to test the 2D fallback.
- A "Preview only" label is shown. Changes in the form update the preview within 300 ms (debounced); heavy 3D model reloads only when the file URL changes.
- The preview mounts in an isolated container and error boundary; a failing GLB shows "Couldn't load the 3D model" in the preview only, not a page error.
- The preview is lazy-loaded (code-split) so Three.js is not in the main dashboard bundle.

**6. Save and warnings**

Button **Save Builder settings** (electric blue, sticky on phone). Behaviour:

1. Client validation as per above (blocking errors highlighted).
2. `PUT /admin/builder`, pessimistic.
3. On `200`, show a result panel. If `warnings[]` is non-empty (e.g. saving `3D`/`BOTH` without a model), display each as an amber list item under the header "Saved, with warnings" (text, with an icon), not as an error. Example copy: "Saved. The website will use 2D until a 3D model is uploaded." The raw warning strings from the API are shown verbatim.
4. Refresh `['builder']` so `assetsReady` updates the chips.
5. Info line after save: "Saved and live. The website picks it up within about 30-60 seconds (public caching)." The Builder has no draft or publish step.

Adding a new colour in Products -> Options means it appears in this list with "2D image missing" until its 2D image and placement are set here (its tint and texture are set in Options); the exit test from the plan ("it appears in the Builder after its look is set") depends on this chip.

States: loading skeleton; GET error retry; upload failure per control; dirty guard; `VALIDATION_ERROR` maps to fields by dotted path.

### 13.6 Emails

| | |
|---|---|
| API | `GET /admin/email-templates`, `PUT /admin/email-templates/:key`, `POST /admin/email-templates/:key/preview`, `POST /admin/email-templates/:key/test`, `GET /admin/whatsapp-templates`, `PUT /admin/whatsapp-templates`, `GET /admin/email-log`, `POST /admin/email-log/:id/retry` |
| Keys | `['email-templates']`, `['whatsapp-templates']`, `['email-log', filters]` |

Sub-sections via `?section=` : `email` (default), `whatsapp`, `log`. (Branding: the email layout and logo are fixed in v1; the only editable branding is `settings.email.footerText`, edited in Settings -> Customer email, see 15.4. A link under the editor says so.)

**Email templates (`?section=email`)**

Left list (top on phone) of templates by `name` with an on/off switch (`enabled`; switching saves via `PUT` of the template: optimistic off/on with rollback) and the key in small text. Selecting one opens the editor:

| Field | Validation |
|---|---|
| `subject` | required, <= 200; placeholders allowed |
| `body` | required, plain text; textarea (monospace) |
| `enabled` | switch |

**Placeholder chips:** one chip per entry of the template's `placeholders` array (e.g. `{customer_name}`, `{order_number}`, `{items}`, `{total}`, `{delivery_number}`, `{tracking_url}`, `{cancel_reason}`, `{order_list}`). Click/tap inserts the placeholder at the cursor position of the last focused field (subject or body). Unknown placeholders typed by hand (`{foo}`) are flagged amber "Not a known placeholder" before save; the server is authoritative. Chips not valid for the current template are never shown.

**Preview:** the **Preview** panel is rendered by the server. On opening a template and (debounced 600 ms) on edits, call `POST /admin/email-templates/:key/preview` with `{ subject, body }` of the **unsaved** form (omit both to preview the saved template). The response `{ subject, text, html }` uses the server's sample data and the real branded layout. Show `subject` as the heading and let the founder toggle **Formatted** / **Plain text**: Formatted renders `html` inside a sandboxed `<iframe sandbox srcdoc=...>` (no scripts, no same-origin access; never `dangerouslySetInnerHTML`), Plain text shows `text` in a `<pre>`. No client-side placeholder substitution exists. The panel is labelled "Sample preview. The real email uses real order data." A failed preview shows an inline retry and does not block editing or saving.

**Test send:** **Send test email** opens a field "Send to" (default: the logged-in user's email, valid email required), calls `POST /admin/email-templates/:key/test` `{ to }`. `202` -> toast "Test email queued to media@example.com. It appears in the email log." The test ignores the master "Send automatic emails" switch, so it works even when emails are turned off (say so in the dialog helper), but it still goes through the queue and appears in the log. Pessimistic, button disabled during the request; `RATE_LIMITED` handled. Unsaved edits: the test sends the **saved** template; if the form is dirty the button label is **Save and send test** (saves first).

**Save:** **Save template**; success toast; dirty guard.

**WhatsApp templates (`?section=whatsapp`)**

List of the four templates (`order_confirmation`, `ready_for_delivery`, `out_for_delivery`, `delivered`) each with name, a textarea `body`, placeholder chips (same behaviour), and a sample preview. One **Save WhatsApp templates** button sends the whole array (`PUT /admin/whatsapp-templates`). Helper: "Used by 'Message customer on WhatsApp'. Nothing is sent automatically." A **Try it** button is not offered (needs an order).

**Email log (`?section=log`)**

`GET /admin/email-log?status&orderId&template&page&pageSize`. Columns / cards: time (`at`), To, Template (`template`), Subject, Order (`orderNumber` link), Status badge (**Pending** / **Sent** / **Failed**, text label), Attempts, Error (`error`, shown as plain text in an expandable row). Filters: status, template, order number via `orderId` deep link. **Failed** rows are highlighted red and have a **Retry** button (`POST /admin/email-log/:id/retry`, `202`, pessimistic; toast "Retry queued." then the row refetches after 3 s and again after 10 s). A banner on top when any failed rows exist: "N emails failed. [Show failed]". Empty: "No emails sent yet."

---

## 14. Deliveries

Route `/deliveries`, tabs via `?tab=` : `out` (default), `delivered`, `fees`. There is no courier integration: delivery means marking orders out with a delivery number.

| | |
|---|---|
| API | `GET /admin/deliveries?tab=OUT\|DELIVERED&q&page&pageSize` (returns a `Page`), `POST /admin/deliveries/dispatch`, `POST /admin/orders/bulk-status`, `POST /admin/orders/:id/status`, `POST /admin/orders/:id/delivery`, `POST /admin/deliveries/:deliveryNumber/settle`, `GET /admin/orders?status=PACKED` (to pick packed orders), `GET/POST/PATCH/DELETE /admin/areas`, `GET/PATCH /admin/settings/delivery` |
| Keys | `['deliveries','OUT', q]`, `['deliveries','DELIVERED', q]`, `['orders','list',{status:'PACKED'}]`, `['areas']`, `['settings','delivery']` |

### 14.1 Out for delivery tab

Rows (`GET /admin/deliveries?tab=OUT`, a `Page` of `{ orderId, orderNumber, deliveryNumber, customerName, phone, areaName, address, cashDueCents, status, cashSettled }`): order number (link), delivery number, customer, phone, area, address, cash due (`cashDueCents`). Search `q`; paginated (`page`, `pageSize`). Grouping by delivery number is applied client-side to the loaded page. Group-by-delivery-number toggle (default on desktop): header "D-88231 - 3 orders - $174.00".

Actions:

| Action | Behaviour |
|---|---|
| **Send out packed orders** (primary button) | Opens a full-screen dialog/page listing `PACKED` orders (`GET /admin/orders?status=PACKED&pageSize=100`) with a checkbox each and a **Delivery number** input per selected row, plus **Apply one number to all selected** (for shared runs). Submit **Send out N orders** calls `POST /admin/deliveries/dispatch` `{ orders: [{ orderId, deliveryNumber }] }`. Every selected row needs a number; empty rows block submit with "Enter a delivery number for each selected order." Duplicates of numbers (within the selection or against existing orders via `deliveryNumber` lookups) show an amber warning but do not block. The response `warnings: [{ deliveryNumber, orderIds }]` is also shown. Result dialog handles `failed: [{ orderId, code }]` like bulk status (5.5). Confirm text: "Send 4 orders out for delivery? Customers with an email are emailed 'On its way'. This can't be undone." |
| **Mark delivered** (row) | Dialog as in 6.3 -> `POST /admin/orders/:id/status` `{ to:'DELIVERED' }` |
| **Mark delivered** (selection) | Rows have checkboxes (select mode on phone). With one or more selected, the bulk bar offers **Mark N delivered** -> `POST /admin/orders/bulk-status` `{ ids, to:'DELIVERED' }` after the confirm dialog "Mark 4 orders as Delivered? Customers with an email are emailed 'Delivered' and cash is now expected." Partial failure uses the same result dialog as 5.5 (`{ updated, failed: [{id, code}] }`); failed rows stay selected |
| **Mark failed / returned** (row) | Dialog with restock choice, as in 6.3 -> `{ to:'RETURNED', restock }` |
| **Edit delivery number** (row) | Dialog as in 6.4 -> `POST /admin/orders/:id/delivery` |
| **Print delivery sheet** | Client-side print view of the selected rows (or all in the current group): delivery number, order numbers, customers, phones, addresses, cash due, with a total; uses browser print with print CSS |

Phone: each delivery row is a card with the cash due prominent and **Mark delivered** as the full-width primary button; other actions in the menu.

Empty: "Nothing is out for delivery." with **Send out packed orders**. If there are no packed orders the dialog says "No packed orders. Pack orders from the Orders page first."

### 14.2 Delivered tab

Rows (`tab=DELIVERED`): order number, delivery number, customer, area, cash due, cash state (**Collected** until settled, then **Settled**, from `cashSettled`; delivering an order marks cash collected automatically, so "To collect" applies only on the Out tab). Group by delivery number with **Mark delivery settled** per group (`POST /admin/deliveries/:deliveryNumber/settle`). Same confirmation and Undo as in Finance -> Cash collection. Filter chips: All / Not settled / Settled (client-side on the loaded page). Search `q`. Paginated with `page` / `pageSize` (a `Page` response: `items`, `page`, `pageSize`, `total`).

### 14.3 Fees tab

| | |
|---|---|
| API | `GET/PATCH /admin/settings/delivery` -> `{ defaultFeeCents, estimateText }`; `GET /admin/areas`, `POST`, `PATCH /:id`, `DELETE /:id` |

Section 1 **Default delivery**: `defaultFeeCents` (dollars, >= 0, required) and `estimateText` (<= 120, e.g. "2-3 working days"). **Save** -> `PATCH /admin/settings/delivery`. Section 2 **Area fees**: table of areas: `name` (required, unique), `feeCents` (optional; blank = "Uses default fee"), `estDays` (optional integer 0..30; blank = default estimate; the customer then sees "<N> working days" for that area), `active` switch, edit/delete (lists include inactive areas). Inline "add row" at the top. Placeholder text on blank values reads "Default ($3.00)" with the current default. Delete area: `409 CONFLICT` if used by orders -> "Used by past orders. Hide it instead." Changing fees affects new orders only (info line).

---

## 15. Settings

Route `/settings`, tabs via `?tab=` : `account` (default), `business`, `notifications`, `customer-email`. **Users** tab is shown disabled with the badge "Later" (not routable; `GET /admin/users` returns only the owner and is unused in v1).

`GET /admin/settings` (key `['settings']`) feeds Business, Notifications and Customer email tabs; each tab saves only its part with `PATCH /admin/settings` `{ business }` / `{ orders }` / `{ notifications }` / `{ email }` (partial update).

### 15.1 Account

| Field | Validation | API |
|---|---|---|
| Email (read-only text) | | from `GET /auth/me` |
| Role | "Owner" | |
| Current password | required | `POST /auth/change-password` |
| New password | required, at least 12 characters (strength hint shown live), not on the common-password list (server-checked; its message shows on the field), must differ from current | |
| Confirm new password | must match | client only |

Button **Change password**. Success: toast "Password changed. Other devices were logged out." and the form clears; the current session stays. Errors: a wrong current password is `400 VALIDATION_ERROR` with `fields.currentPassword` and shows "Current password is incorrect." on that field; a weak new password shows its `fields.newPassword` message. A `401 UNAUTHENTICATED` here always means the session has ended, so the normal global handler applies (redirect to login). Two-factor, email change and "log out everywhere" are not in v1: render a disabled section "Two-factor authentication - coming later"; no email-change or log-out-everywhere controls are shown.

### 15.2 Business

Fields (`business`): `name` (required), `whatsappNumber` (optional; helper "Customers' WhatsApp confirmation opens a chat with this number"; stored as `+961XXXXXXXX`), `supportEmail` (valid email), `instagramUrl` (must start `https://`), `timezone` (IANA name, default `Asia/Beirut`; a searchable select of IANA zones; helper "Dates, 'today' and date ranges in the dashboard and website use this timezone"; after saving, refetch `['settings']` so all formatting updates). Fields (`orders`): `numberPrefix` (1..8, `^[A-Za-z0-9]+$`, uppercased; helper "Applies to new orders only. Existing orders keep their numbers"), `firstNumber` (integer >= 1; helper "Can't go below the current counter"; `VALIDATION_ERROR` shown inline), `stockHoldHours` (integer 1..168), `autoExpireUnconfirmed` (switch; helper "Off: expired New orders are only flagged. On: they are cancelled automatically"), `lowStockThreshold` (integer 0..1000), `hardwareCostCents` (dollars, >= 0; helper "Zippers and velcro added to each hoodie's cost"). Button **Save business settings**. Changing `numberPrefix` or `firstNumber` asks a confirm dialog: "New orders will start at STP-1200. This can't be undone."

### 15.3 Notifications

`notifications`: `founderEmail` (valid email, required if any switch is on), `onNewOrder` (switch "Email me for each new order"), `onLowStock` (switch "Email me when stock is low"). Button **Save notifications**. A note: "WhatsApp alerts are not available yet." The in-dashboard bell, sound and browser notifications (section 2.5) are per-browser and are configured from the bell popover, not here.

### 15.4 Customer email

`email`: `enabled` (master switch "Send automatic emails to customers"; turning it off needs confirm "Customers will stop receiving order updates by email."), `senderName` (required), `senderAddress` (valid email, required), `replyTo` (valid email, required), `footerText` (textarea, plain text; helper "Shown at the bottom of every customer email. The email layout and logo are fixed."). Helper: "Replies to automatic emails go to the reply-to inbox." Link "Edit email templates" -> `/content?tab=emails`. Button **Save email settings**.

### 15.5 Users (later)

Placeholder only. When built: staff accounts with roles `OWNER` / `PACKER`; the route guard already supports a role map (see auth doc).

### 15.6 States

Loading skeletons; error retry; dirty guard per tab; `VALIDATION_ERROR` mapped to fields.

---

## 16. Route map

| Route | Tabs / params | API calls |
|---|---|---|
| `/login` | `returnTo` | `POST /auth/login`, `GET /auth/me` |
| (shell, every page) | | `GET /admin/search?q=` (top bar), `GET /admin/orders/counts` and `GET /admin/orders?afterId=` (30 s poll), `GET /admin/settings` (timezone) |
| `/` | | `GET /admin/overview` |
| `/orders` | `status` = (all) `NEW` `TO_PACK` `OUT_FOR_DELIVERY` `DELIVERED` `CLOSED`; `q`, `source`, `areaId`, `dropId`, `from`, `to`, `deliveryNumber`, `holdExpired`, `sort`, `page` | `GET /admin/orders`, `GET /admin/orders/counts`, `POST /admin/orders/bulk-status`, `POST /admin/orders/export`, `GET /admin/orders/:id/whatsapp`, `GET /admin/areas`, `GET /admin/drops` |
| `/orders/new` | `customerId` | `POST /admin/orders`, `GET /products/hoodies`, `GET /products/hoodies/:slug`, `GET /products/stimpies`, `GET /packs`, `GET /options`, `GET /delivery/fees`, `GET /admin/customers`, `GET /admin/areas` |
| `/orders/:id` | `tab` = `summary` `timeline` `notes` | `GET /admin/orders/:id`, `POST /admin/orders/:id/status`, `POST .../delivery`, `PATCH /admin/orders/:id`, `PATCH .../contact`, `POST .../cash`, `POST .../notes`, `POST .../extend-hold`, `POST .../email`, `GET .../whatsapp` |
| `/products` | `tab` = `hoodies` `stimpies` `packs` `options` `size-chart`; `active` | `/admin/hoodies`, `/admin/stimpies`, `/admin/packs`, `/admin/colors`, `/admin/sizes`, `PUT /admin/{hoodies,packs,colors,sizes}/order`, `/admin/size-chart`, `POST /admin/uploads`, `GET /admin/drops` |
| `/products/<tab>/:id`, `/products/<tab>/new` | | the tab's resource endpoints |
| `/stock` | `tab` = `hoodies` `stimpies` `movements` | `GET /admin/stock/hoodies`, `GET /admin/stock/stimpies`, `GET /admin/stock/movements`, `POST /admin/stock/adjust`, `POST /admin/stock/set`, `GET /admin/settings` |
| `/drops` | `tab` = `upcoming` `live` `archive` | `GET /admin/drops`, `POST /admin/drops/:id/end` |
| `/drops/new`, `/drops/:id` | | `GET/POST/PATCH/DELETE /admin/drops`, `GET /admin/stimpies`, `POST /admin/uploads` |
| `/customers` | `tab` = `all` `repeat` `subscribers`; `q` | `GET /admin/customers`, `GET /admin/subscribers` |
| `/customers/:id` | | `GET /admin/customers/:id`, `PATCH /admin/customers/:id` |
| `/finance` | `tab` = `profit` `cash` `costs`; `from`, `to`, `kind` | `GET /admin/finance/profit`, `GET /admin/finance/cash`, `/admin/expenses`, `/admin/ad-spend`, `POST /admin/deliveries/:deliveryNumber/settle`, `POST /admin/orders/:id/cash` |
| `/insights` | `tab` = `sales` `products` `customers`; `from`, `to` | `GET /admin/insights/sales`, `/products`, `/customers` |
| `/content` | `tab` = `announcement` `faq` `policies` `homepage` `builder` `emails`; emails `section` = `email` `whatsapp` `log` | `/admin/content/:key`, `/admin/faqs`, `PUT /admin/faqs/order`, `/admin/reviews`, `GET/PUT /admin/builder`, `GET /admin/hoodies`, `/admin/email-templates` (+ `/:key/preview`, `/:key/test`), `/admin/whatsapp-templates`, `/admin/email-log`, `POST /admin/uploads` |
| `/deliveries` | `tab` = `out` `delivered` `fees`; `q`, `page` | `GET /admin/deliveries` (Page), `POST /admin/deliveries/dispatch`, `POST /admin/orders/bulk-status`, `POST /admin/deliveries/:deliveryNumber/settle`, `/admin/areas`, `GET/PATCH /admin/settings/delivery` |
| `/settings` | `tab` = `account` `business` `notifications` `customer-email` | `GET/PATCH /admin/settings`, `POST /auth/change-password`, `GET /auth/me` |
| `*` | | none (404 page) |

---

## 17. Build checklist by phase

Phases follow section 13 of the plan. Shell, shared components and auth are built first inside Phase 1.

### Phase 1: core shop and orders

- [ ] Monorepo wiring: `apps/admin` on port 5173, `packages/api-client` generated from OpenAPI, `packages/ui` tokens (colours, Poppins) and base components
- [ ] API client wrapper: `credentials: "include"`, error envelope parsing, global 401 handler, `RATE_LIMITED` helper
- [ ] Shell: sidebar, phone bottom bar with More sheet, top bar, user menu, 404, error boundary, page chrome
- [ ] Global search (`GET /admin/search`, orders and customers groups), **+ New order**, shortcuts, notification bell with 30 s `counts` polling plus `afterId` newcomer fetch, sound and browser-notification toggles
- [ ] Business-timezone formatting helper fed by `business.timezone`
- [ ] Shared components: `DataList` (table/cards), `StatusPill`, `Money`, `CopyButton`, `ConfirmDialog`, `BottomSheet`, `ImageUploader`, `Tabs` (URL-synced), `EmptyState`, `ErrorPanel`
- [ ] Login (with rate-limit countdown) and route guard (see auth doc)
- [ ] Overview
- [ ] Orders list: tabs with counts (To pack and Closed use comma-separated `status`), filters, sortable columns (`placedAt`, `totalCents`, `number`, `status`), bulk Confirm/Pack/Deliver with partial-failure dialog, CSV export (filters or `{ ids }`, server filename), WhatsApp button
- [ ] New order form
- [ ] Order detail: Summary (contact block, emails sent, hold banner, cash), Timeline, Notes
- [ ] Status actions: all dialogs, delivery number with duplicate warning, cancel reason, return restock choice (hidden for failed deliveries), `INVALID_TRANSITION` handling; buttons exactly follow the business-rules table (no Cancel from Out for delivery, Return allowed after Delivered); exchange workflow dialog (RETURNED + new manual order)
- [ ] Products: Hoodies, Stimpies, Packs, Options (colours and sizes with `PUT .../order` reorder, `?active=` filter and zero-stock notice), Size chart editor (owns `howToMeasure`)
- [ ] Stock: Hoodies grid, Stimpies, Movements (full reason enum), adjust/set dialog with required note
- [ ] Deliveries: Out for delivery (dispatch dialog, mark delivered/returned, bulk Mark delivered, edit number without email resend, print sheet), Delivered (paginated Page), Fees
- [ ] Settings: Account (change password: 12-character minimum, wrong current password on the field), Business (incl. timezone), Notifications, Customer email (incl. `footerText`)
- [ ] Content: Announcement bar, FAQ (with `group`), Policies (no How to measure; + About, How it works incl. `promises`), Homepage, Emails (templates with server-rendered preview, test send, WhatsApp templates, log with retry) as Phase 1 content needs for the storefront and customer emails
- [ ] Exit test: order placed on the website appears in the dashboard, moves to Out for delivery (with a delivery number) and Delivered, stock correct throughout, phone layout checked on a real phone over the LAN (dashboard origin must be a hostname the API allows; see auth doc)

### Phase 2: Builder and drops

- [ ] Content -> Builder: mode selector, default view, hoodie selector (`hoodieId`), GLB upload, mesh name, panel aspect, camera, lighting, per-colour 2D image, `overlay2d` and placement editor (centre-based geometry), read-only tint/texture with link to Options, per-Stimpie overrides, readiness chips (incl. `overlays2d`, `stimpieTextures`), warnings display, full-object `PUT`, live preview using the shared Builder component
- [ ] Drops: Upcoming (create/edit), Live (progress, end early), Archive
- [ ] Customers: All, Repeat, customer view, Subscribers with CSV export
- [ ] Exit test: switching the mode between 2D only / 3D only / Both changes the website's Builder; a new colour shows "2D image missing" until its look is set

### Phase 3: money and insight

- [ ] Finance: Profit (range, plan margins), Cash collection (group settle), Costs (expenses and ad spend)
- [ ] Insights: Sales (incl. By campaign table), Products, Customers with data-table toggles; ratios are fractions 0..1, weekday 0 = Sunday
- [ ] Overview polish: attention links for all types

### Cross-phase quality gates

- [ ] Every page usable at 360 px width without horizontal page scroll; tables become cards
- [ ] Status never colour-only; all dialogs keyboard operable with focus trap and focus return
- [ ] Order and stock mutations pessimistic; double-tap cannot send twice
- [ ] No `dangerouslySetInnerHTML`; customer text rendered as plain text
- [ ] Every list has loading, empty, error states

---

## 18. Open questions for the API

The decision log is [../open-questions.md](../open-questions.md): every earlier question (D1-D28) is answered there and the body of this document has been reconciled with those answers. Only the items below are still open. Each has a safe default and does not block the build.

| # | Question / gap | Needed for | Default until decided |
|---|---|---|---|
| 1 | May a manual order (`POST /admin/orders`) include a Stimpie the public site cannot sell yet (for example `UPCOMING`, or a `LIMITED` Stimpie outside its live drop)? The contract says only "same body as the public `POST /orders`" | New order form | Same rules as public: `NOT_PURCHASABLE` is shown with the reason |
| 2 | Do single-order calls that set a delivery number (`/status`, `/delivery`) report a duplicate number in the response? The contract documents `warnings` only for `POST /admin/deliveries/dispatch`; business rules say duplicates are returned in `warnings` | Duplicate notice after saving | The advisory `GET /admin/orders?deliveryNumber=` lookup before submit (6.3) is the only duplicate hint on single orders |
| 3 | Length limits not in the contract's text-limits row: stock-adjustment `note`, customer `notes`, email-template `subject`/`body`, the phone format accepted by `PATCH .../contact` | Form validation | The UI limits stated in this document; server `fields` errors always win |
| 4 | Owner-supplied values (real colours, sizes, size-chart numbers, default delivery fee and estimate text, business WhatsApp number, hoodie-only price, GLB model) are placeholders until entered in the dashboard | Seed data | Placeholders; the Builder falls back to 2D until a GLB is uploaded; the website hides the WhatsApp button until a number is set (see open-questions.md section 4) |
| 5 | `Content-Disposition` is not in the contract's exposed CORS headers, so the dashboard cannot read the CSV filename sent by `POST /admin/orders/export` (see [auth-and-sessions.md](auth-and-sessions.md#8-open-questions-for-the-api)) | CSV download naming | The client generates `orders-YYYY-MM-DD.csv` itself |
