# Stimpy API Reference (the contract)

This is the single contract between the backend and both frontends (the public website and the dashboard). The frontends are built against **this document**; the backend is built to satisfy it. If either side needs a change, change this file first.

Related: [backend overview](README.md) · [data model](data-model.md) · [business rules](business-rules.md) · [frontend docs](../frontend/README.md)

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `http://localhost:4000/api/v1` locally |
| Format | JSON in, JSON out (`Content-Type: application/json`). The only exceptions are file upload (`multipart/form-data`) and CSV exports (`text/csv`) |
| Dates | ISO-8601 UTC strings, e.g. `"2026-10-14T09:30:00.000Z"`. The frontend formats them for display |
| Money | **Integer cents** in US dollars. `4500` means $45.00. Fields are named `...Cents`. Never send or receive decimals for money |
| IDs | Integers. The public website addresses products and drops by **slug**; the dashboard uses ids |
| Phone numbers | Sent as typed. The server normalizes to E.164 (`+961...`) and returns the normalized form |
| Pagination | `?page=1&pageSize=25` (default 25, max 100). Responses: `{ items, page, pageSize, total }` |
| Sorting | `?sort=field` or `?sort=-field` (descending) where listed |
| Search | `?q=text` where listed |
| Empty values | Absent optional fields are `null`, never omitted, in responses |
| Unknown request fields | Rejected with `VALIDATION_ERROR` |
| Caching | Public catalog `GET`s send `Cache-Control: public, max-age=30`. Exceptions: `GET /drops` and `GET /drops/:slug` use `max-age=10`, and `no-store` while any drop starts within the next 60 seconds; `GET /health` is always `no-store`. Everything under `/admin` and all `POST`s are never cached. The website's own revalidation windows are in [state-and-errors](../frontend/state-and-errors.md) |
| File URLs | Every uploaded file URL in a response (`images`, `artworkUrl`, `model3d.url`, `teaserVideo`, ...) is **absolute**, e.g. `http://localhost:4000/uploads/2026/10/ab12cd34ef56ab78.webp`. File names are random and never change, so they are cached as immutable. `/uploads/*` is served with `Access-Control-Allow-Origin: *` so WebGL can read textures |
| Request id | Every response carries `X-Request-Id`; error bodies repeat it as `error.requestId` |
| Rate-limit headers | A `429` response carries `Retry-After: <seconds>` as well as `details.retryAfterSeconds` |
| CORS exposed headers | `X-Request-Id`, `Retry-After`, `Date`, and (admin routes only) `Content-Disposition`, so the dashboard can read the CSV file name. Allowed request headers: `Content-Type`, `Idempotency-Key` |
| Phone and WhatsApp formats in responses | Always normalised `+961XXXXXXXX`. The frontend strips non-digits to build `wa.me` links |
| Text limits | `customer.name` 2–80 chars; `customer.email` ≤ 190; `delivery.areaName` ≤ 120; `delivery.address` 5–300; `delivery.notes` ≤ 300; admin notes ≤ 1000; delivery number 1–60; cancel reason ≤ 255. Catalog and content: names/titles ≤ 120; slugs ≤ 140 (`a-z0-9-`); `description`, `story`, `answer`, review `text` ≤ 2000; FAQ `question` ≤ 200; each policy/about text ≤ 20000; email template subject ≤ 200 and body ≤ 5000; password ≤ 200. Anything over a limit is a `VALIDATION_ERROR` on that field |

**`StockProblem` and `PurchaseProblem`** (the `details.items` of `SOLD_OUT` / `NOT_PURCHASABLE`) identify the offending thing and which request line caused it:

```ts
type ProblemRef =
  | { kind: 'HOODIE_VARIANT'; hoodieId: number; colorId: number; sizeId: number }
  | { kind: 'STIMPIE'; stimpieId: number };

type StockProblem = ProblemRef & {
  itemIndex: number;          // index into the request's `items` array of the first line that needs it
  name: string;               // e.g. "THE VOID" or "Stimpy Hoodie, Black, M"
  requested: number;          // total units of this thing the whole order needs
  available: number;          // units that can still be ordered right now (0 or more)
};
type PurchaseProblem = ProblemRef & {
  itemIndex: number;
  name: string;
  reason: 'INACTIVE' | 'DROP_NOT_STARTED' | 'DROP_ENDED';
};
```

When several things fail, all are reported in one response.

### Auth model in one paragraph

Public endpoints need nothing. Everything under `/admin` requires the dashboard session cookie set by `POST /auth/login`. Frontend calls must use `credentials: "include"`. See [security](security-and-testing.md#2-security) and the [frontend auth doc](../frontend/auth-and-sessions.md).

### Error format (every non-2xx response)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "fields": { "customer.email": "Enter a valid email address." },
    "details": null,
    "requestId": "4c1f0a9e-6d1b-4f6e-8a0e-0f5f2f2a9c11"
  }
}
```

Field paths use dots and numeric array indices: `items.0.sizeId`, `items.1.stimpieIds.0`. A problem with an array as a whole (for example "too many items") is reported on the array's own path: `items`.

- `code` is stable and machine-readable; the frontend switches on it.
- `message` is safe to show to a customer (plain English).
- `fields` is present only for `VALIDATION_ERROR`; keys are dotted paths into the request body (`items.0.sizeId`).
- `details` carries extra data for specific codes (see below).

| HTTP | `code` | Meaning | `details` |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body/query failed validation | none (see `fields`) |
| 401 | `UNAUTHENTICATED` | No/expired dashboard session | none |
| 403 | `FORBIDDEN` | Logged in but not allowed (role), or failed origin check | none |
| 404 | `NOT_FOUND` | Resource doesn't exist, or tracking lookup didn't match | none |
| 409 | `SOLD_OUT` | One or more items ran out while ordering | `{ items: StockProblem[] }` (below) |
| 409 | `NOT_PURCHASABLE` | Item is hidden, ended, or its drop hasn't started | `{ items: PurchaseProblem[] }` (below) |
| 409 | `INVALID_TRANSITION` | Status change not allowed from the current status | `{ from, to, allowed: [...] }` |
| 409 | `CONFLICT` | Generated-slug collision during concurrent writes, duplicate color/size name, a stock change that would reduce quantity below open order holds, an `Idempotency-Key` reused with a different request body, etc. | `{ field }` (for the idempotency case `field` is `"Idempotency-Key"`) |
| 413 | `FILE_TOO_LARGE` | Upload exceeds the size limit for its type | `{ maxBytes }` |
| 415 | `UNSUPPORTED_FILE_TYPE` | Upload type not allowed (judged by file content, not name) | `{ allowed: string[] }` |
| 422 | `DELIVERY_NUMBER_REQUIRED` | Tried to mark *Out for delivery* without a delivery number | none |
| 422 | `PRICE_CHANGED` | The total the customer saw no longer matches (only if the client sends `expectedTotalCents` and it differs) | `{ totalCents }` (the new grand total incl. delivery) |
| 429 | `RATE_LIMITED` | Too many requests | `{ retryAfterSeconds }` |
| 500 | `INTERNAL` | Unexpected server error (generic message, details logged server-side) | none |

---

## 2. Shared types

Written in TypeScript notation for clarity. These are the shapes used in responses below.

```ts
type Cents = number;            // integer, USD cents
type ISODate = string;          // ISO-8601 UTC
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };

// ---- Options (configured in the dashboard) ----
type Color = {
  id: number; name: string; hex: string; position: number; active: boolean;
  images: string[];                 // hoodie photos for this color
  builderTint: string | null;       // hex used by the Builder
  builderTexture: string | null;    // URL used by the Builder
};
type Size = { id: number; label: string; position: number; active: boolean };

// ---- Catalog ----
type HoodieSummary = {
  id: number; slug: string; name: string; description: string;
  priceCents: Cents;                // current price of the hoodie on its own (promotion applied)
  compareAtPriceCents: Cents | null; // regular price while discounted; otherwise null
  images: string[];
  colors: { id: number; name: string; hex: string }[];   // active colors that have stock, for swatches on cards
  inStock: boolean;                 // any variant available
};
type HoodieDetail = HoodieSummary & {
  details: string[];                // bullet list (fabric, embroidery, ...)
  colors: Color[];                  // only colors that have at least one variant
  sizes: Size[];
  variants: { colorId: number; sizeId: number; inStock: boolean; remaining: number | null }[];
  // `remaining` is null unless stock is low (<= lowStockThreshold), to avoid leaking exact stock
};

type StimpieStatus = 'AVAILABLE' | 'LOW' | 'SOLD_OUT' | 'UPCOMING' | 'ENDED';
type Stimpie = {
  id: number; slug: string; name: string;
  type: 'CORE' | 'LIMITED';
  priceCents: Cents;
  compareAtPriceCents: Cents | null;
  story: string;
  images: string[];
  artworkUrl: string;               // the back-panel artwork, also used by the Builder
  artworkWidth: number | null;      // pixels; null if unknown (older uploads)
  artworkHeight: number | null;
  drop: { id: number; slug: string; name: string; accentColor: AccentColor; accentHex: string;
          startsAt: ISODate; endsAt: ISODate | null } | null;
  status: StimpieStatus;
  remaining: number | null;         // only when status is LOW
  purchasable: boolean;             // false when SOLD_OUT, UPCOMING, ENDED or hidden
};
type Pack = {
  id: number; slug: string; name: string; description: string;
  stimpieCount: number;             // 1 or 2 today
  priceCents: Cents;                // total price of hoodie + its Stimpies
  compareAtPriceCents: Cents | null;
  badge: string | null;             // e.g. "Most popular"
};

type AccentColor = 'BUTTER' | 'SKY' | 'LILAC';
type DropState = 'UPCOMING' | 'LIVE' | 'SOLD_OUT' | 'ENDED';
type Drop = {
  id: number; slug: string; name: string; story: string;
  accentColor: AccentColor; accentHex: string;
  startsAt: ISODate; endsAt: ISODate | null;
  state: DropState;
  teaserImage: string | null; teaserVideo: string | null;
  unitsRemaining: number | null;    // total across the drop; only when state is LIVE
  stimpies: Stimpie[];
};

// ---- Orders ----
type OrderStatus = 'NEW' | 'CONFIRMED' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED';
type OrderSource = 'WEBSITE' | 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL';

type CartItem =
  | { kind: 'pack'; packId: number; hoodieId: number; colorId: number; sizeId: number; stimpieIds: number[]; qty: number }
  | { kind: 'hoodie'; hoodieId: number; colorId: number; sizeId: number; qty: number }
  | { kind: 'stimpie'; stimpieId: number; qty: number };
// pack: stimpieIds.length must equal the pack's stimpieCount. qty is 1..10 for every kind.

type OrderItem = {
  id: number; kind: 'PACK' | 'HOODIE' | 'STIMPIE';
  name: string;                     // snapshot, e.g. "Hoodie + 2 Stimpies"
  qty: number; unitPriceCents: Cents; lineTotalCents: Cents;
  details: { hoodie: string | null; color: string | null; size: string | null; stimpies: string[] };
};
type TimelineEntry = { status: OrderStatus; at: ISODate };
```

---

## 3. Public endpoints (website)

No authentication. Rate limited. All under `/api/v1`.

### 3.1 Health

| | |
|---|---|
| `GET /health` | `200 { "ok": true, "time": ISODate }`. `time` has millisecond precision, the response is `no-store`, and CORS allows `WEB_URL` and `ADMIN_URL`. The frontends use it to measure the offset between the device clock and the server clock for countdowns (the `Date` header is only second-precise) |

### 3.2 Configuration the shop is built from

| Endpoint | Response |
|---|---|
| `GET /options` | `{ colors: Color[], sizes: Size[] }` (active only, ordered by `position`) |
| `GET /size-chart` | `{ columns: { id, label, unit }[], rows: { sizeId, label, values: Record<columnId, string> }[], howToMeasure: string }` |
| `GET /delivery/fees` | `{ defaultFeeCents: Cents, areas: { id, name, feeCents: Cents \| null, estDays: number \| null }[], estimateText: string }`. A `null` `feeCents` means "use the default". `areas` is the complete active-area option list |
| `GET /content` | see 3.7 |
| `GET /builder/config` | see 3.6 |

### 3.3 Catalog

| Endpoint | Query | Response |
|---|---|---|
| `GET /products/hoodies` | `page`, `pageSize` | `Page<HoodieSummary>` |
| `GET /products/hoodies/:slug` | none | `HoodieDetail` (404 if hidden) |
| `GET /products/stimpies` | `page`, `pageSize`, `type=CORE\|LIMITED`, `drop=<slug>`, `includeSoldOut=true\|false` (default `true`), `includeUpcoming=false` (default), `includeEnded=false` (default) | `Page<Stimpie>`. By default only `AVAILABLE`, `LOW` and `SOLD_OUT` are returned; `UPCOMING` and `ENDED` need their flags. The Builder uses the default |
| `GET /products/stimpies/:slug` | none | `Stimpie` |
| `GET /packs` | `page`, `pageSize` | `Page<Pack>` (active, ordered) |
| `GET /promotions` | none | `PublicPromotion[]` (enabled offers within their current start/end window, cached for 5 s) |

Extra Stimpies are sold by their own `priceCents`; hoodie-only uses the hoodie's `priceCents`; a pack uses the pack's `priceCents`.

### 3.4 Drops

| Endpoint | Query / body | Response |
|---|---|---|
| `GET /drops` | Query `page`, `pageSize` | `{ live: Drop \| null, upcoming: Page<Drop>, archive: Page<Drop> }`. Each list is paged independently; `archive` holds `SOLD_OUT` and `ENDED` drops, newest first |
| `GET /drops/:slug` | none | `Drop` |
| `POST /drops/:id/subscribe` | Body `{ contact: string, type: 'EMAIL' \| 'WHATSAPP' }` | `204`. Idempotent: subscribing twice is not an error |

Use `GET /drops` to drive the countdown: `live.endsAt`/`upcoming[0].startsAt`. The server is the clock authority: the response includes the `Date` header, and the frontend should compute the offset against it rather than trusting the device clock.

### 3.5 Orders

#### `POST /orders` : place an order

Headers: `Idempotency-Key: <uuid>` (recommended; a retry with the same key returns the original result with `200` instead of creating a second order).

Request:

```json
{
  "customer": {
    "name": "Rami Haddad",
    "email": "rami@example.com",
    "phone": "03 123 456",
    "whatsapp": null,
    "whatsappSameAsPhone": true
  },
  "delivery": {
    "areaId": 3,
    "areaName": "Jounieh",
    "address": "Main street, building 5, 2nd floor",
    "notes": "Call before arriving"
  },
  "items": [
    { "kind": "pack", "packId": 2, "hoodieId": 1, "colorId": 1, "sizeId": 3,
      "stimpieIds": [4, 7], "qty": 1 },
    { "kind": "stimpie", "stimpieId": 9, "qty": 1 }
  ],
  "expectedTotalCents": 5800,
  "attribution": { "utmSource": "instagram", "utmMedium": "story", "utmCampaign": "drop-002-teaser" },
  "hp": ""
}
```

Rules:
- `customer.email`, `phone`, `name` required. `whatsapp` is required unless `whatsappSameAsPhone` is `true`.
- `delivery.areaId` optional; `areaName` and `address` required. Length limits are in the conventions table.
- `expectedTotalCents` is an optional safety check and is the **grand total including the delivery fee** (here items $55.00 + delivery $3.00 = 5800). If it differs from the server's total, the order is rejected with `PRICE_CHANGED` and nothing is reserved.
- `attribution` is optional and stores the current checkout touch on this order. `firstTouch` is a separate optional first-party session snapshot used only to initialize the customer's immutable first-touch fields. Both accept `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm` (each up to 80 characters, letters/digits/`-_.` only) and `referrer` (HTTP(S), at most 500 characters). Repeated orders may update their own `attribution`, but never replace a customer's first-touch values.
- `hp` is a hidden honeypot field; it must be `""`. Real users never fill it. A non-empty value gets a generic `VALIDATION_ERROR`.
- Prices in the request are never accepted; the server prices everything.
- A `pack` item's `stimpieIds` must be **distinct** (a pack is N different designs). A duplicate id is a `VALIDATION_ERROR` on `items.N.stimpieIds.M`. `LIMITED` Stimpies may be used in packs while their drop is live. Across the whole order, the same Stimpie may appear in several lines (stock is summed).
- At most 20 items in the array, `qty` 1–10 per item.
- **Idempotency:** the first request with a given `Idempotency-Key` creates the order. A repeat with the same key and the **same body** returns that order with `200` (no second order). A repeat with the same key and a **different body** is rejected with `409 CONFLICT` (`details.field = "Idempotency-Key"`); the client must then generate a new key.

Response `201`:

```json
{
  "order": {
    "number": "STP-1042",
    "status": "NEW",
    "placedAt": "2026-10-14T09:30:00.000Z",
    "customerName": "Rami Haddad",
    "contactEmail": "rami@example.com",
    "items": [ /* OrderItem[] */ ],
    "subtotalCents": 5500,
    "deliveryFeeCents": 300,
    "totalCents": 5800,
    "estimateText": "2-3 working days"
  },
  "whatsappUrl": "https://wa.me/9613123456?text=Hi%2C%20I%20just%20placed%20order%20STP-1042...",
  "trackUrl": "http://localhost:3000/track?order=STP-1042"
}
```

`whatsappUrl` is `null` if the business WhatsApp number isn't configured yet. `estimateText` is the authoritative delivery estimate for this order: `"<N> working days"` when the chosen area has `estDays`, otherwise the global `estimateText` from Settings. There is **no public endpoint that re-reads a placed order**: the confirmation page keeps this response in `sessionStorage`; after a reload on another tab or device it falls back to the Track page (order number from the URL, phone typed by the customer). Errors: `VALIDATION_ERROR`, `SOLD_OUT`, `NOT_PURCHASABLE`, `PRICE_CHANGED`, `RATE_LIMITED`. On `SOLD_OUT` nothing is reserved; the frontend should update the cart and show the alternatives.

#### `POST /cart/validate` : check a cart without ordering

Reads the same `items` array as `POST /orders` plus an optional `areaId`. Reserves nothing and creates nothing. Used when the cart drawer opens and when the checkout page loads. Rate limited like the catalog.

Request `{ "items": CartItem[], "areaId": 3 }`. Response `200`:

```ts
{
  ok: boolean;                        // true only if every line is purchasable and in stock
  lines: {
    itemIndex: number;
    ok: boolean;
    unitPriceCents: Cents; lineTotalCents: Cents;
    problems: (StockProblem | PurchaseProblem)[];     // empty when ok
  }[];
  subtotalCents: Cents;               // of the lines that are ok
  deliveryFeeCents: Cents;            // for areaId, or the default fee
  totalCents: Cents;                  // subtotal + delivery: the value to send as expectedTotalCents
  estimateText: string;
}
```

Malformed carts (unknown ids, wrong `stimpieIds` count) still return `400 VALIDATION_ERROR`; "can't buy it right now" is reported per line, never as an HTTP error.

#### `POST /orders/track`

Request `{ "orderNumber": "STP-1042", "phone": "03 123 456" }`. `orderNumber` also accepts the bare number (`1042`) and any letter case. The phone must match the order's phone; a mismatch returns the same `404 NOT_FOUND` as an unknown order.

Response `200`:

```ts
{
  number: string; status: OrderStatus; placedAt: ISODate;
  customerName: string;
  items: OrderItem[];
  subtotalCents: Cents; deliveryFeeCents: Cents; totalCents: Cents;
  deliveryNumber: string | null;       // present only from OUT_FOR_DELIVERY onward
  timeline: TimelineEntry[];           // the statuses reached, in order, with times
  estimateText: string;
  whatsappNumber: string | null;       // the business number, for the contact button
}
```

#### `POST /orders/find` : "Lost your order number?"

Request `{ "email": "rami@example.com" }`. Always `202 { "message": "If we found orders for this email, we've emailed you the order numbers." }`, whether or not any exist. Strictly rate limited.

### 3.6 Builder config

`GET /builder/config` returns what the `/builder` page needs. `mode` is what the founder chose; `effectiveMode` is what the page should actually use (it falls back to `2D` if the 3D assets aren't uploaded).

```ts
{
  mode: '2D' | '3D' | 'BOTH';
  effectiveMode: '2D' | '3D' | 'BOTH';
  defaultView: '2D' | '3D';            // used when effectiveMode is BOTH
  hoodie: { id: number; slug: string; name: string };   // the hoodie the Builder sells (chosen in the dashboard; defaults to the first active hoodie)
  model3d: {
    url: string;                       // absolute URL of the .glb
    sizeBytes: number;                 // for "Load 3D (about N MB)" and the data-saver gate
    backPanelMesh: string;             // mesh name that receives the Stimpie texture
    panelAspect: number;               // width / height of the back panel; default 0.64
    camera: { position: [number, number, number]; target: [number, number, number]; fov: number };
    lighting: 'STUDIO' | 'SOFT' | 'NIGHT';
  } | null;
  colors: {
    colorId: number;
    tint: string | null;               // hex applied to the 3D hoodie (mirrors /admin/colors builderTint)
    texture3d: string | null;          // optional fabric texture URL (mirrors /admin/colors builderTexture)
    hoodieImage2d: string | null;      // flat back-view image for 2D
    overlay2d: string | null;          // optional transparent shading/shadow image drawn over the panel in 2D
    placement2d: { x: number; y: number; width: number; rotation: number } | null;
  }[];
  stimpieTextures: { stimpieId: number; textureUrl: string }[];   // optional per-Stimpie overrides
}
```

**`placement2d` geometry.** `x` and `y` are the **centre** of the Stimpie panel as fractions (0..1) of the hoodie image's width and height. `width` is the panel width as a fraction of the image width; the panel height is derived in pixels as `panelWidthPx / 0.64` (the Stimpie aspect). `rotation` is degrees clockwise about the centre.

**Colours' tint and texture** are edited in one place only: `/admin/colors` (`builderTint`, `builderTexture`). The Builder config repeats them for convenience; `PUT /admin/builder` ignores them.

The Stimpies themselves (names, art, prices, availability, artwork size) come from `GET /products/stimpies`; the Builder joins the two by `stimpieId`. Saving in the dashboard is immediate; there is no draft/publish step in v1 (the dashboard's preview is client-side before saving).

### 3.7 Content

`GET /content`:

```ts
{
  business: { name: string; whatsappNumber: string | null; supportEmail: string | null; instagramUrl: string | null; timezone: string };
                                       // timezone is an IANA name, default "Asia/Beirut"; the frontends format all dates in it
  announcement: { text: string; linkUrl: string | null } | null;   // null when switched off. The bar is always black with white text
  homepage: {
    heroHeadline: string; heroSubheadline: string;
    heroVideoUrl: string | null; heroImageUrl: string | null;
    featuredDropSlug: string | null;
  };
  policies: {
    deliveryReturns: string; care: string; terms: string; privacy: string;
  };                                   // the "how to measure" text lives with the size chart (GET /size-chart), not here
  about: string;
  howItWorks: {
    steps: { title: string; text: string; mediaUrl: string | null }[];
    promises: string[];                // quality promises (tested zip cycles, washing, drape), shown as a list
    faqs: { question: string; answer: string }[];
  };
  faqs: Page<{ id: number; question: string; answer: string; group: string | null; showOnHome: boolean }>;
                                       // `group` is a free label such as "Ordering" or "Sizing"; null = ungrouped; ordered by position
  reviews: Page<{ id: number; name: string; text: string; mediaUrl: string | null }>;
}
```

Long text fields are **plain text with blank-line paragraph breaks and `**bold**` / `- ` list markers** (a tiny Markdown subset). The frontend renders them with a small, safe renderer; never as raw HTML.

---

### 3.8 Email unsubscribe

| Endpoint | Response |
|---|---|
| `GET /unsubscribe/:token` | `{ valid: true }` when the token exists; this validates the link without changing consent |
| `POST /unsubscribe/:token/confirm` | `204`; idempotently revokes email consent and records the unsubscribe time. WhatsApp consent is unchanged |

## 4. Authentication endpoints

| Endpoint | Request | Response |
|---|---|---|
| `POST /auth/login` | `{ email, password }` | `200 { user: { id, email, name, role: 'OWNER' \| 'PACKER' } }` and sets the `stimpy_session` cookie. Errors: `401 UNAUTHENTICATED` with a generic message, `429 RATE_LIMITED` |
| `POST /auth/logout` | none | `204` always (also when the session was already invalid), clears the cookie, ends the session |
| `GET /auth/me` | none | `200 { user, session: { expiresAt: ISODate } }` or `401`. `expiresAt` is the earlier of the sliding and the absolute expiry |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `204`. Ends all other sessions. A wrong current password is `400 VALIDATION_ERROR` with `fields.currentPassword` (never `401`, so it can't be confused with an expired session). Password rules: at least 12 characters, not on the common-password list |

Sessions slide: each use extends expiry to 7 days from now, up to an absolute 30 days after login. There is no refresh endpoint; when a session ends the next request returns `401 UNAUTHENTICATED` and the dashboard asks the user to sign in again. Login is rate limited per IP **and** per email. Two-factor login and "log out everywhere" are not in v1.

---

## 5. Dashboard endpoints (`/admin/...`)

Everything below requires the session cookie (`401 UNAUTHENTICATED` otherwise). Only role `OWNER` exists in v1; `PACKER` is reserved for later.

Standard list query parameters are `page`, `pageSize`, `q`, `sort` unless stated. Unless noted, `POST` creates (`201` + the resource), `PATCH`/`PUT` updates (`200` + the resource), `DELETE` returns `204`. Deleting something referenced by orders is refused with `409 CONFLICT`; use the `active: false` flag to hide it instead.

### 5.1 Admin shared types

```ts
type AdminOrderSummary = {
  id: number; number: string; placedAt: ISODate; status: OrderStatus; source: OrderSource;
  customerName: string; contactPhone: string; areaName: string;
  itemsSummary: string;               // e.g. "Hoodie + 2 Stimpies, 1 Stimpie"
  totalCents: Cents;
  deliveryNumber: string | null;
  cashCollected: boolean; cashSettled: boolean;
  holdExpired: boolean;               // NEW and past the stock hold time
};

type AdminOrder = AdminOrderSummary & {
  customer: { id: number; name: string; email: string | null; phone: string; whatsapp: string };
  contact: { email: string | null; phone: string; whatsapp: string };   // snapshot on the order (editable)
  delivery: { areaId: number | null; areaName: string; address: string; notes: string | null };
  items: OrderItem[];
  subtotalCents: Cents; deliveryFeeCents: Cents;
  costCents: Cents;                   // sum of unit costs, for the profit view
  holdExpiresAt: ISODate | null;
  outForDeliveryAt: ISODate | null; deliveredAt: ISODate | null; cancelledAt: ISODate | null;
  cancelReason: string | null;
  events: { id: number; from: OrderStatus | null; to: OrderStatus; at: ISODate; by: string | null; note: string | null }[];
  notes: { id: number; body: string; at: ISODate; by: string }[];        // internal only
  emails: { id: number; template: string; to: string; status: 'PENDING' | 'SENT' | 'FAILED'; at: ISODate }[];
  allowedTransitions: OrderStatus[];  // what the status buttons may offer right now
};
```

### 5.2 Overview

`GET /admin/overview`:

```ts
{
  today: { newOrders: number; toPack: number; outForDelivery: number; cashToCollectCents: Cents; revenueCents: Cents };
  attention: { type: 'NEW_TOO_LONG' | 'OUT_TOO_LONG' | 'LOW_STOCK' | 'HOLD_EXPIRED' | 'EMAIL_FAILED';
               label: string; orderId: number | null;
               itemType: 'HOODIE_VARIANT' | 'STIMPIE' | null; itemId: number | null }[];
  liveDrop: { id: number; name: string; unitsTotal: number; unitsSold: number; endsAt: ISODate | null } | null;
  sales7d: { date: string; orders: number; revenueCents: Cents }[];     // date = YYYY-MM-DD, 7 entries
  recentOrders: AdminOrderSummary[];                                      // last 10
  setup: {                                                                // the first-run "Get ready to sell" checklist
    complete: boolean;                                                    // true when every `required` item is DONE
    items: {
      key: string;                                                        // see the table below
      label: string; hint: string;
      kind: 'AUTO' | 'REVIEW';                                            // AUTO: computed from data. REVIEW: done when the owner marks it
      required: boolean;
      status: 'TODO' | 'DONE';
      link: string;                                                       // dashboard route where it is edited, e.g. "/products?tab=options"
    }[];
  };
}
```

**Setup checklist items.** Nothing here is a hard-coded business decision: each item points at a dashboard page where the owner enters the real value. The seed leaves every `REVIEW` item as `TODO` and the placeholder data in place, so a fresh dashboard shows exactly what to replace.

| `key` | `kind` | `required` | Done when | `link` |
|---|---|---|---|---|
| `business_whatsapp` | AUTO | yes | `settings.business.whatsappNumber` is set | `/settings?tab=business` |
| `contact_emails` | AUTO | yes | `supportEmail`, `email.senderAddress`, `email.replyTo` are set and not the seeded `@stimpy.local` addresses | `/settings?tab=business` |
| `founder_alerts` | AUTO | no | `notifications.founderEmail` is set | `/settings?tab=notifications` |
| `colors` | REVIEW | yes | Owner marks the colour list reviewed | `/products?tab=options` |
| `sizes` | REVIEW | yes | Owner marks the size list reviewed | `/products?tab=options` |
| `size_chart` | REVIEW | yes | Owner marks the size chart reviewed | `/products?tab=size-chart` |
| `hoodie_price` | REVIEW | yes | Owner marks the hoodie price, cost and photos reviewed | `/products?tab=hoodies` |
| `packs_prices` | REVIEW | yes | Owner marks the packs and Stimpie prices reviewed | `/products?tab=packs` |
| `delivery_fee` | REVIEW | yes | Owner marks the delivery fee and estimate text reviewed | `/deliveries?tab=fees` |
| `policies` | REVIEW | yes | Owner marks the delivery/returns, care, terms and privacy texts reviewed | `/content?tab=policies` |
| `email_texts` | REVIEW | no | Owner marks the email and WhatsApp templates reviewed | `/content?tab=emails` |
| `first_stock` | AUTO | yes | At least one hoodie variant and one Stimpie have available stock above zero | `/stock` |
| `builder_2d` | AUTO | no | At least one active colour has a 2D hoodie image and a placement | `/content?tab=builder` |
| `builder_3d` | AUTO | no | A 3D model is uploaded and its back-panel mesh is named | `/content?tab=builder` |

`POST /admin/setup/:key/done` with `{ "done": true | false }` marks (or un-marks) a `REVIEW` item; `204`. It is `400 VALIDATION_ERROR` for an `AUTO` key. The marks are stored in `settings.setup.reviewed`. The checklist never blocks anything: the shop works with placeholder data, and the dashboard shows a banner while `complete` is false.

### 5.3 Orders

| Endpoint | Request | Response |
|---|---|---|
| `GET /admin/orders` | Query: `status` (one value **or a comma-separated list**, e.g. `CONFIRMED,PACKED`), `source`, `areaId`, `dropId`, `from`, `to` (dates, in the business timezone), `deliveryNumber`, `q` (matches order number incl. bare digits, delivery number, phone, email, name), `holdExpired=true`, `afterId` (only orders with `id` greater than this: used to find orders that arrived since the last poll), `sort` (one of `placedAt`, `totalCents`, `number`, `status`; prefix `-` for descending; default `-placedAt`) | `Page<AdminOrderSummary>` |
| `GET /admin/orders/counts` | none | `{ ALL: n, NEW: n, CONFIRMED: n, PACKED: n, OUT_FOR_DELIVERY: n, DELIVERED: n, CANCELLED: n, RETURNED: n }` (drives the tab badges) |
| `GET /admin/orders/:id` | none | `AdminOrder` |
| `POST /admin/orders` | Same body as the public `POST /orders`, plus `source: 'INSTAGRAM'\|'WHATSAPP'\|'MANUAL'`, `initialStatus?: 'NEW'\|'CONFIRMED'` (default `CONFIRMED`), `sendEmail?: boolean`. `customer.email` is optional here; `hp`, `Idempotency-Key` not needed. The same availability rules apply as for customers: a Stimpie whose drop has not started or has ended is `NOT_PURCHASABLE`, and sold-out items are `SOLD_OUT` (to sell such a unit anyway the founder first adjusts stock or ends the drop) | `201 AdminOrder` |
| `PATCH /admin/orders/:id` | `{ delivery?: { areaId?, areaName?, address?, notes? } }` | `AdminOrder` |
| `PATCH /admin/orders/:id/contact` | `{ email?, phone?, whatsapp? }` (logged on the timeline) | `AdminOrder` |
| `POST /admin/orders/:id/status` | `{ to: OrderStatus, note?, cancelReason?, deliveryNumber?, restock?: boolean }`. `deliveryNumber` is **required** when `to` is `OUT_FOR_DELIVERY`. `restock` (default `true`) matters only for `RETURNED` | `AdminOrder`. Errors: `INVALID_TRANSITION`, `DELIVERY_NUMBER_REQUIRED` |
| `POST /admin/orders/bulk-status` | `{ ids: number[], to: 'CONFIRMED' \| 'PACKED' \| 'DELIVERED' }` (each order is validated on its own; moving to `OUT_FOR_DELIVERY` is done through `/admin/deliveries/dispatch` because it needs delivery numbers) | `{ updated: number[], failed: { id, code }[] }` |
| `POST /admin/orders/:id/delivery` | `{ deliveryNumber }`. From `PACKED`: marks the order *Out for delivery* (same as the status call). If already out for delivery: corrects the number | `AdminOrder` |
| `POST /admin/orders/:id/cash` | `{ collected?: boolean, settled?: boolean }` | `AdminOrder` |
| `POST /admin/orders/:id/notes` | `{ body }` | `AdminOrder` |
| `POST /admin/orders/:id/extend-hold` | `{ hours }` | `AdminOrder` |
| `POST /admin/orders/:id/email` | `{ template: string }` to (re)send a templated email, or `{ subject, body }` for a free-form message | `AdminOrder` (the new entry appears in `emails`) |
| `GET /admin/orders/:id/whatsapp` | Query `template=order_confirmation\|ready_for_delivery\|out_for_delivery\|delivered` | `{ to: string, text: string, url: string }`. `url` is a ready `wa.me` link with the text filled in; open it in a new tab |
| `POST /admin/orders/export` | The same filters as the list, in the body, **or** `{ ids: number[] }` to export a selection | `text/csv` with `Content-Disposition: attachment; filename="orders-YYYY-MM-DD.csv"`. Any cell starting with `=`, `+`, `-` or `@` is prefixed with `'` so spreadsheets don't run it as a formula |

**Warnings on single-order calls.** `POST /admin/orders/:id/status` (to `OUT_FOR_DELIVERY`) and `POST /admin/orders/:id/delivery` return the `AdminOrder` plus `warnings: { code: 'DUPLICATE_DELIVERY_NUMBER'; deliveryNumber: string; orderIds: number[] }[]` (empty array when none). A duplicate never blocks the call; it is shown as an informational notice. Other order calls return `warnings: []` too, so the shape is uniform.

**Allowed transitions** (what `allowedTransitions` contains) are exactly the table in [business rules §7](business-rules.md#7-status-machine): `NEW → CONFIRMED / CANCELLED`, `CONFIRMED → PACKED / CANCELLED`, `PACKED → OUT_FOR_DELIVERY / CANCELLED`, `OUT_FOR_DELIVERY → DELIVERED / RETURNED`, `DELIVERED → RETURNED`, and nothing from `CANCELLED` or `RETURNED`. An order that is out for delivery cannot be cancelled; it is returned. `Create exchange` is not in v1 (an exchange is handled as `RETURNED` plus a new manual order). Print labels and delivery sheets are produced by the dashboard from `AdminOrder` data; there is no print endpoint.

**Cancel reason:** optional in the API (≤ 255 characters); the dashboard UI requires one for cancellations. Correcting a delivery number through `POST /admin/orders/:id/delivery` does **not** resend the "On its way" email (the founder can use **Resend**).

### 5.4 Products

Resources (all with `GET` list, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`):

| Resource | Fields (writable) |
|---|---|
| `/admin/hoodies` | `name`, `description`, `details: string[]`, `priceCents`, `costCents`, `images: string[]`, `active`, `colorIds: number[]`, `sizeIds: number[]`. Each hoodie selects its own colours and sizes; every selected colour × size pair has its own stock quantity. The product editor shows and sets those selections; quantities are managed in Stock. |
| `/admin/stimpies` | `name`, `type`, `dropId`, `priceCents`, `costCents`, `quantity` (initial stock, creation only; later changes go through stock adjustments), `story`, `images: string[]`, `artworkUrl`, `active` |
| `/admin/packs` | `name`, `description`, `stimpieCount`, `priceCents`, `badge`, `active`, `position` |
| `/admin/colors` | `name`, `hex`, `position`, `active`, `images: string[]`, `builderTint`, `builderTexture`. A colour is a shared definition and must be selected on each hoodie that offers it |
| `/admin/sizes` | `label`, `position`, `active`. A size is a shared definition and must be selected on each hoodie that offers it |

`GET /products/hoodies`, `/products/hoodies/:slug`, `/products/stimpies`, `/products/stimpies/:slug`, and `/packs` return the current promotional `priceCents` plus `compareAtPriceCents` (the regular price, or null). The server recalculates discounts during cart validation and order creation. Percentage and fixed USD discounts are supported; when promotions overlap, the lowest price is used.

### 5.4.1 Promotions

`GET /promotions` is public and returns enabled promotions whose start/end window includes the current time. Each `PublicPromotion` includes its name, discount, `allProducts`, and target product IDs; the storefront joins those IDs to the public catalog. `GET /admin/promotions?page&pageSize`, `GET /admin/promotions/:id`, `POST /admin/promotions`, `PATCH /admin/promotions/:id`, and `DELETE /admin/promotions/:id` manage promotions. Create/update fields: `name`, `discountType: 'PERCENTAGE'|'FIXED'`, `discountValue` (whole percent 1–100, or USD cents), `allProducts`, `targets: { productType: 'HOODIE'|'STIMPIE'|'PACK', productId }[]`, `enabled`, `startsAt`, and `endsAt`. Empty `startsAt` starts immediately; empty `endsAt` leaves it running until paused. `allProducts` applies to current and future catalog items; otherwise select one or more products and packs. `PATCH { enabled: false }` pauses immediately. Responses include derived `state: ACTIVE|SCHEDULED|ENDED|PAUSED`.

All `GET` lists accept `page` and `pageSize` and return `Page<...>`. List responses include `available` stock summaries, read-only. **Admin lists include inactive rows**; each has `active`, and `?active=true|false` filters.

Public slugs are derived from names on create and rename. Spaces and punctuation become dashes; duplicate names receive a numeric suffix. Admin write requests do not accept a `slug` field.

**Reordering:** `PUT /admin/colors/order`, `PUT /admin/sizes/order`, `PUT /admin/packs/order`, `PUT /admin/hoodies/order` and `PUT /admin/faqs/order` each take `{ ids: number[] }` (the full list in the new order, up to 5,000 ids) and return `204`.

**Global search:** `GET /admin/search?q=` returns `{ orders: AdminOrderSummary[], customers: { id, name, phone, email }[] }` with at most 5 of each, for the dashboard's top-bar search.

`/admin/size-chart`:
- `GET` → `{ columns: { id, label, unit, position }[], rows: { sizeId, label, values: Record<columnId, string> }[], howToMeasure: string }`
- `PUT` replaces the whole chart in one call with the same shape (columns may omit `id` to create new ones). `200` + the saved chart.

`POST /admin/uploads` (`multipart/form-data`, field `file`, optional field `purpose`): accepts JPG, PNG, WebP, SVG (images up to **10 MB**, resized to at most 2000 px on the long side), MP4/WebM video up to 100 MB, and `.glb` models up to 50 MB. Too large => `413 FILE_TOO_LARGE`; wrong type => `415 UNSUPPORTED_FILE_TYPE`. There is no delete endpoint in v1: removing a file in the dashboard only removes the reference. Response `201 { id, url, mime, sizeBytes, width: number \| null, height: number \| null }`. Use the returned `url` in any `images`/`...Url` field.

### 5.5 Stock

| Endpoint | Response / request |
|---|---|
| `GET /admin/stock/hoodies` | Query `page`, `pageSize`. `Page<{ hoodieId, name, colors: Color[], sizes: Size[], cells: { variantId, colorId, sizeId, quantity, available }[] }>`; each hoodie includes only its selected options and stock combinations |
| `GET /admin/stock/stimpies` | Query `page`, `pageSize`. `Page<{ stimpieId, name, type, dropName: string \| null, quantity, available, low: boolean }>` |
| `POST /admin/stock/adjust` | `{ itemType: 'HOODIE_VARIANT' \| 'STIMPIE', itemId, delta: number, reason: 'RESTOCK' \| 'CORRECTION' \| 'DAMAGED', note: string }`. `delta` may be negative. `note` required. Rejects adjustments that would lower stock below what open orders need (`CONFLICT`). Response `{ quantity, available }` |
| `POST /admin/stock/set` | `{ itemType, itemId, quantity, note }` : sets the on-hand quantity (recorded as a `CORRECTION` movement for the difference); order holds are managed by order transitions and are not a stock adjustment option |
| `GET /admin/stock/movements` | Query: `itemType`, `itemId`, `reason`, `orderId`, `from`, `to`, paged. Items: `{ id, at, itemType, itemId, itemName, field: 'QUANTITY' \| 'RESERVED', delta, reason, orderNumber: string \| null, note, by: string \| null }`. `reason` is one of `INITIAL`, `RESTOCK`, `CORRECTION`, `DAMAGED`, `ORDER_RESERVED`, `ORDER_RELEASED`, `ORDER_SOLD`, `ORDER_RETURNED`, `ORDER_WRITTEN_OFF`; the manual adjust call accepts only `RESTOCK`, `CORRECTION`, `DAMAGED` |

### 5.6 Drops

`/admin/drops` : `GET` list (`page`, `pageSize`, optional `state=UPCOMING\|LIVE\|ARCHIVE`, `q`, `sort`) returns `Page<AdminDrop>`; `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` (only if no orders reference its Stimpies), and `POST /admin/drops/:id/end` (ends immediately).

Writable: `name`, `story`, `accentHex: '#RRGGBB'` (picked storefront accent), `startsAt`, `endsAt`, `teaserImage`, `teaserVideo`, `stimpieIds: number[]` (assigns/unassigns Stimpies to the drop). Create requires either `accentHex` or legacy `accentColor`; when both are supplied, `accentHex` wins. Responses include the exact `accentHex` and nearest legacy `accentColor` value.

Read adds: `state`, `unitsTotal`, `unitsSold`, `unitsRemaining`, `revenueCents`, `sellOutAt: ISODate | null`, and `stimpies: { ...Stimpie, quantity, sold, remaining }[]`.

### 5.7 Customers and subscribers

| Endpoint | Response |
|---|---|
| `GET /admin/customers` | Query `filter=all\|repeat`, `q` (name, phone, email, WhatsApp), `areaId`, `tagId`, `ordersMin`, `ordersMax`, `spentMinCents`, `spentMaxCents`, `lastOrderBefore`, `lastOrderAfter` (`YYYY-MM-DD`), `hasEmail`, `returned`, `optedOut` (`yes\|no`), `relationship=SUBSCRIBED_NEVER_BOUGHT\|BOUGHT_NOT_SUBSCRIBED`; all filters are AND-combined. Paginated SQL query returns `Page<CustomerRow>` with consent status, unsubscribe time, and page-scoped `tags[]` |
| `POST /admin/customers/bulk/preview` | `{ target, channel: 'EMAIL'\|'WHATSAPP' }` where `target` is `{ ids }` or `{ filters }` (the list filters). `{ matched, eligible, skipped: { noContact, noConsent, optedOut }, cap, overCap, sample }`; consent and opt-out are enforced by the server |
| `POST /admin/customers/bulk/email` | `{ target, subject, body }`. Queues one email per customer with email consent (`{name}`, `{full_name}` filled in, unsubscribe link appended), at most the configured campaign recipient cap (default 200). `{ queued, skipped, overCap }`; 409 when nobody is eligible or customer emails are switched off |
| `POST /admin/customers/bulk/whatsapp` | `{ target, text }`. Returns per-customer `wa.me` links only for customers with WhatsApp consent; no messages are sent automatically |
| `GET/POST /admin/segments`, `PATCH/DELETE /admin/segments/:id` | List, save, edit or delete named segments with validated AND-combined filters |
| `POST /admin/segments/preview` | `{ filters, channel }` -> eligible count, skipped by reason, cap and sample; channel consent is required |
| `GET/POST /admin/campaigns`, `GET /admin/campaigns/:id` | Campaign history, create a draft from a saved segment or filters, and read recipient status |
| `POST /admin/campaigns/preview` | Preview recipient counts and a sample before creating/confirming a campaign |
| `POST /admin/campaigns/:id/confirm` | Explicitly confirm a campaign; email is queued through the email worker, WhatsApp creates manual chat links only |
| `POST /admin/campaigns/:id/recipients/:customerId/sent` | Mark a WhatsApp chat as sent; the action appears in the customer timeline |
| `GET /admin/customers/:id` | The above plus `notes` and `orders: AdminOrderSummary[]` |
| `GET /admin/customers/:id/profile` | Customer aggregates plus consent state/timestamp and immutable first-touch fields: `firstSource`, `firstUtmSource`, `firstUtmMedium`, `firstUtmCampaign`, `firstUtmContent`, `firstUtmTerm`, `firstReferrer`, `firstTouchAt` |
| `PATCH /admin/customers/:id` | `{ name?, email?, whatsapp?, notes?, marketingOptOut?, emailConsent?, whatsappConsent? }`; explicit channel consent updates are recorded with a consent timestamp |
| `GET /admin/customers/duplicates` | Query `page`, `pageSize`. `Page<{ match: 'EMAIL' \| 'PHONE', value: string, customers: CustomerRow[] }>`; groups are exact case-insensitive e-mail matches or equal normalized phone numbers, newest customer ids first |
| `GET /admin/customers/:id/export` | JSON containing the customer's profile, all order rows with items, stock lines, events, notes and e-mail logs, plus matching drop subscribers |
| `DELETE /admin/customers/:id/personal-data` | Anonymizes customer and order contact fields, free-text notes and matching subscriber/e-mail personal data while preserving order accounting/status rows; `204` |
| `POST /admin/customers/:id/merge` | `{ duplicateCustomerId }` atomically merges orders, notes, follow-ups, tags and subscribers into the path customer, deletes the duplicate, and returns the surviving customer detail |
| `GET /admin/customer-tags` | Paginated `Page<CustomerTag>` |
| `POST /admin/customer-tags` | `{ name, color? }` -> `201 CustomerTag`; names are unique |
| `PATCH /admin/customer-tags/:id` | `{ name?, color? }` -> `CustomerTag` |
| `DELETE /admin/customer-tags/:id` | Deletes the tag and its customer links; `204` |
| `GET /admin/customers/:id/tags` | `CustomerTag[]` currently attached to the customer |
| `POST /admin/customers/:id/tags/:tagId` | Idempotently attaches the tag; returns the customer's `CustomerTag[]` |
| `DELETE /admin/customers/:id/tags/:tagId` | Detaches the tag; `204` |
| `GET /admin/customers/:id/notes` | Paginated `Page<CustomerNote>` in newest-first order |
| `POST /admin/customers/:id/notes` | `{ body }` (1–2000 characters) -> `201 CustomerNote`, attributed to the authenticated admin |
| `GET /admin/follow-ups` | Query `due=today\|overdue\|upcoming`, optional `customerId`, `page`, `pageSize`. `Page<CustomerFollowUp>`; `today` uses `business.timezone`, `overdue` means before today, and `upcoming` means after today; completed rows are excluded |
| `POST /admin/follow-ups` | `{ customerId, dueAt, note }` -> `201 CustomerFollowUp` |
| `PATCH /admin/follow-ups/:id` | `{ dueAt?, note?, done? }`; `done` completes or reopens a follow-up -> `CustomerFollowUp` |
| `DELETE /admin/follow-ups/:id` | Deletes the follow-up; `204` |
| `GET /admin/subscribers` | Query `customerId` to scope the result to one CRM profile (also supports `q`, `type`, `dropId`, paging); `Page<{ id, contact, type, customerId: number \| null, dropName: string \| null, createdAt }>`; `?format=csv` returns a CSV |

### 5.8 Deliveries

| Endpoint | Request / response |
|---|---|
| `GET /admin/deliveries` | Query `tab=OUT\|DELIVERED`, `q`, `page`, `pageSize`. Response is a `Page<...>` whose items are: `{ orderId, orderNumber, deliveryNumber, customerName, phone, areaName, address, cashDueCents, status, cashSettled }` |
| `POST /admin/deliveries/dispatch` | `{ orders: [{ orderId, deliveryNumber }] }` : sends several `PACKED` orders out at once. Response `{ dispatched: number[], failed: { orderId, code }[] }`. A duplicate delivery number is allowed but listed in `warnings: [{ deliveryNumber, orderIds }]` |
| `POST /admin/deliveries/:deliveryNumber/settle` | `{ settled: boolean }` : marks cash settled for every order on that delivery number. Response `{ orderIds: number[] }` |
| `/admin/areas` | `GET` query `page`, `pageSize` (default 100), optional `active=true\|false`; returns `Page<Area>`. `POST`, `PATCH /:id`, `DELETE /:id`. Fields: `name`, `feeCents` (nullable), `estDays` (nullable), `active` |
| `GET` / `PATCH /admin/settings/delivery` | `{ defaultFeeCents: Cents, estimateText: string }` |

### 5.9 Finance

| Endpoint | Response |
|---|---|
| `GET /admin/finance/profit` | Query `from`, `to`, `page`, `pageSize`. `{ range, revenueCents, deliveryFeesCents, costOfGoodsCents, expensesCents, adSpendCents, profitCents, ordersCount, byOrder: Page<{ orderNumber, date, revenueCents, costCents, profitCents }>, planMargins: { pack35: Cents, pack45: Cents } }`. Revenue counts **delivered** orders in the range; summary totals cover the full range |
| `GET /admin/finance/cash` | Query `page`, `pageSize`. `{ outstandingCents, groups: Page<{ deliveryNumber: string \| null, orders: { orderId, orderNumber, cashDueCents, settled }[], totalDueCents }> }` |
| `/admin/expenses` | `GET` (query `from`, `to`, `category`, `page`, `pageSize`) returns `Page<Expense>` plus `totalCents` for the full filtered range; `POST`, `PATCH /:id`, `DELETE /:id`. Fields: `category`, `amountCents`, `note`, `spentOn` (date) |
| `/admin/ad-spend` | Same, with `channel` instead of `category`; `GET` returns `Page<AdSpend>` plus full-range `totalCents` |

### 5.10 Insights

All accept `from`, `to`. **All ratios are fractions from 0 to 1** (not percentages). `weekday` is `0` = Sunday … `6` = Saturday, computed in the business timezone, as are the day boundaries of "today", `from` and `to`.

| Endpoint | Response |
|---|---|
| `GET /admin/insights/sales` | `{ series: { date, orders, revenueCents }[], byDrop: { dropName, orders, revenueCents }[], bySource: { source, orders, revenueCents }[], byCampaign: { utmSource: string \| null, utmCampaign: string \| null, orders, revenueCents }[], byWeekday: { weekday: 0..6, orders }[] }` |
| `GET /admin/insights/products` | `{ stimpies: { name, unitsSold, revenueCents }[], packMix: { packName, orders }[], extraStimpieAttachRate: number, sizes: { label, units }[], colors: { name, units }[] }` |
| `GET /admin/insights/customers` | `{ repeatRate: number, byArea: { areaName, orders }[], deliverySuccessRate: number, returnRate: number }` |
| `GET /admin/insights/acquisition` | Query `from`, `to` (optional real `YYYY-MM-DD` dates; inclusive business-timezone calendar days; either bound may be omitted). Response `{ bySource: { source, customers, revenueCents, adSpendCents, costPerCustomerCents: number \| null, roas: number \| null }[], byCampaign: { source, campaign, customers, revenueCents }[], unmatchedAdSpendCents }` (money fields are integer cents). New customers are counted by `firstTouchAt`; delivered revenue is the delivered order `subtotalCents` dated by `deliveredAt`; ad spend is dated by `spentOn`. `source` is trimmed `firstUtmSource`, falling back to trimmed `firstSource`, then `Unknown`; `campaign` is trimmed `firstUtmCampaign`, falling back to `Unknown`. Source/campaign rows are created from new-customer or delivered-order attribution. `AdSpend.channel` matches a source row by trimmed, case-insensitive exact equality; spend without a matching source row contributes to `unmatchedAdSpendCents`. `costPerCustomerCents` is rounded spend/customer and is `null` when there are no customers; `roas` is revenue/spend and is `null` when spend is zero. Campaign rows report customers and delivered revenue only; ad spend cannot be attributed to campaigns because `AdSpend` has no campaign key. Invalid dates, impossible calendar dates, or `from` after `to` return `400`. |

### 5.11 Content

| Endpoint | Request / response |
|---|---|
| `GET` / `PUT /admin/content/:key` | `key` is one of `announcement`, `homepage`, `policies`, `about`, `how-it-works`. Body/response is the matching part of the public `GET /content` (plus `enabled: boolean` for `announcement`) |
| `/admin/faqs` | `GET` query `page`, `pageSize`, optional `group`, `showOnHome`; returns `Page<Faq>`. Also `POST`, `PATCH /:id`, `DELETE /:id`, and `PUT /admin/faqs/order` with `{ ids: number[] }`. Fields: `question`, `answer`, `group` (nullable label), `showOnHome` |
| `/admin/reviews` | `GET` query `page`, `pageSize`, optional `visible`; returns `Page<Review>`. Also `POST`, `PATCH /:id`, `DELETE /:id`. Fields: `name`, `text`, `mediaUrl`, `visible` |
| `GET` / `PUT /admin/builder` | Same shape as the public builder config, but `mode` is returned/accepted as set (not `effectiveMode`), plus read-only `assetsReady: { model3d: boolean; colors2d: { colorId: number; ready: boolean }[]; overlays2d: number; stimpieTextures: number }` so the dashboard can show what's missing. `PUT` takes the **full object** as returned by `GET` (it replaces the stored config); writable are `mode`, `defaultView`, `hoodieId`, `model3d` (url, backPanelMesh, panelAspect, camera, lighting; `sizeBytes` is filled in by the server from the upload), `colors[].hoodieImage2d`, `colors[].overlay2d`, `colors[].placement2d` and `stimpieTextures`. `colors[].tint` / `texture3d` are read-only here (edited via `/admin/colors`). Saving `3D`/`BOTH` without a model is allowed and returns `warnings: string[]`. Readiness counts and public colours use the selected hoodie's active colour/size assignments. Saved changes follow the public consumers' cache windows |
| `POST /admin/email-templates/:key/preview` | `{ subject?, body? }` (unsaved edits optional) → `{ subject, text, html }` rendered by the server with sample data and the real branded layout |
| `GET /admin/email-templates` | `{ key, name, subject, body, enabled, placeholders: string[] }[]` |
| `PUT /admin/email-templates/:key` | `{ subject, body, enabled }` |
| `POST /admin/email-templates/:key/test` | `{ to: string }` : sends a sample using placeholder sample data. `202`. Ignores the master email switch (it is a test) but still goes through the queue and appears in the log |
| `GET` / `PUT /admin/whatsapp-templates` | `{ key, name, body, placeholders: string[] }[]` / the same array back |
| `GET /admin/email-log` | Query `status`, `orderId`, `template`. `Page<{ id, at, to, template, subject, status, attempts, error: string \| null, orderNumber: string \| null }>` |
| `POST /admin/email-log/:id/retry` | `202` |

Email template keys: `order_received`, `order_confirmed`, `order_out_for_delivery`, `order_delivered`, `order_cancelled`, `orders_lookup`. WhatsApp template keys: `order_confirmation`, `ready_for_delivery`, `out_for_delivery`, `delivered`. Placeholders: `{customer_name}`, `{order_number}`, `{items}`, `{total}`, `{delivery_number}`, `{tracking_url}`, `{cancel_reason}`, `{order_list}`.

### 5.12 Settings

`GET /admin/settings` and `PATCH /admin/settings` (partial update):

```ts
{
  business: { name: string; whatsappNumber: string | null; supportEmail: string | null; instagramUrl: string | null;
              timezone: string };   // IANA name, default "Asia/Beirut"
  orders: {
    numberPrefix: string;            // e.g. "STP"
    firstNumber: number;             // applies to new orders only; cannot go below the current counter
    stockHoldHours: number;          // default 12
    autoExpireUnconfirmed: boolean;  // default false: expired NEW orders are flagged, not cancelled
    lowStockThreshold: number;       // default 10 (public "last few" label and dashboard alerts)
    hardwareCostCents: Cents;        // default 100: zippers/velcro added to each hoodie's cost
  };
  email: { enabled: boolean; senderName: string; senderAddress: string; replyTo: string;
           footerText: string; campaignRecipientCap: number }; // campaign cap 1..5000; default 200
  notifications: { founderEmail: string | null; onNewOrder: boolean; onLowStock: boolean };
}
```

Delivery fee and estimate text live under `/admin/settings/delivery` (5.8). Users management (roles, staff accounts) is out of scope for v1; the placeholder route `GET /admin/users` returns the single owner.

---

## 6. Endpoint index

| Area | Public | Admin |
|---|---|---|
| Health | `GET /health` | : |
| Config | `/options`, `/size-chart`, `/delivery/fees`, `/content`, `/builder/config` | `/admin/colors`, `/admin/sizes`, `/admin/size-chart`, `/admin/content/:key`, `/admin/builder`, `/admin/settings`, `/admin/settings/delivery` |
| Catalog | `/products/hoodies`, `/products/stimpies`, `/packs` | `/admin/hoodies`, `/admin/stimpies`, `/admin/packs`, `/admin/promotions`, `/admin/uploads` |
| Drops | `/drops`, `/drops/:slug`, `POST /drops/:id/subscribe` | `/admin/drops` |
| Orders | `POST /orders`, `POST /cart/validate`, `POST /orders/track`, `POST /orders/find` | `/admin/orders` (+ status, delivery, cash, notes, email, whatsapp, export) |
| Stock | : | `/admin/stock/*` |
| Deliveries | : | `/admin/deliveries`, `/admin/areas` |
| People | : | `/admin/customers`, `/admin/subscribers` |
| Money | : | `/admin/finance/*`, `/admin/expenses`, `/admin/ad-spend`, `/admin/insights/*` |
| Comms | : | `/admin/email-templates`, `/admin/whatsapp-templates`, `/admin/email-log`, `/admin/faqs`, `/admin/reviews` |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | : |
| Setup | : | `GET /admin/overview` (includes `setup`), `POST /admin/setup/:key/done` |

An OpenAPI (Swagger) document is generated from the implemented routes and published at `/docs` and `/docs/json` in development; it must always agree with this file. See [wiring](../wiring/README.md#7-keeping-the-contract-honest).
