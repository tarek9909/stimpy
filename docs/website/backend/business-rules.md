# Backend: Business Rules

**Purpose and audience.** The exact rules the backend must follow, written precisely enough to implement and to test. When the HTTP contract ([api-reference.md](api-reference.md)) says *what* is exchanged and the data model says *where* it is stored, this document says *what must happen*. Every rule here should map to at least one automated test (see [security and testing §3](security-and-testing.md#3-test-plan)).

## Contents

1. [Pricing and money](#1-pricing-and-money)
2. [Contact data and customers](#2-contact-data-and-customers)
3. [Placing an order](#3-placing-an-order)
4. [Order numbers](#4-order-numbers)
5. [Stock lifecycle](#5-stock-lifecycle)
6. [Drops](#6-drops)
7. [Status machine](#7-status-machine)
8. [Delivery number and cash](#8-delivery-number-and-cash)
9. [Stock holds on unconfirmed orders](#9-stock-holds-on-unconfirmed-orders)
10. [Tracking and the lost order number](#10-tracking-and-the-lost-order-number)
11. [Finance calculations](#11-finance-calculations)
12. [Builder mode resolution](#12-builder-mode-resolution)
13. [Duplicates and abuse](#13-duplicates-and-abuse)

---

## 1. Pricing and money

**All prices are decided by the server from the database.** The client may send `expectedTotalCents` as a safety check, never a price.

| Cart item kind | Unit price | Unit cost (snapshot) | Components reserved |
|---|---|---|---|
| `pack` | `packs.price_cents` | hoodie cost + each Stimpie's cost + `hardwareCostCents` | 1 hoodie variant + each of `stimpieIds` |
| `hoodie` | `hoodies.price_cents` | hoodie cost + `hardwareCostCents` | 1 hoodie variant |
| `stimpie` | `stimpies.price_cents` | Stimpie cost | 1 Stimpie |

- `subtotal = Σ unit price × qty`.
- `deliveryFee = area.fee_cents ?? settings.delivery.defaultFeeCents`. If no `areaId` is sent, the default fee applies. Delivery is not discounted in v1.
- `total = subtotal + deliveryFee`.
- Cost snapshots are stored on `order_items` so later price or cost edits never change history.
- If `expectedTotalCents` is present and differs from the computed total, reject with `PRICE_CHANGED` (and nothing is reserved).
- Allowed quantities: each cart item `qty` 1–10; at most 20 cart items; a pack's `stimpieIds.length` must equal the pack's `stimpie_count` and its ids must be **distinct**. Limited Stimpies may be used in packs while their drop is live.
- `expectedTotalCents`, when sent, is compared with the **grand total** (`subtotal + deliveryFee`).
- **Delivery estimate text** for an order: `"<N> working days"` if the chosen area has `est_days`, otherwise `settings.delivery.estimateText`. It is computed by the server and returned as `estimateText`.
- **Cart validation** (`POST /cart/validate`) runs steps 3–5 of [Placing an order](#3-placing-an-order) without a transaction and without reserving: it reports, per line, whether it is purchasable and in stock *at that moment*. It is advisory; only `POST /orders` is authoritative.

---

## 2. Contact data and customers

**Phone normalisation** (Lebanon): strip spaces, dashes, brackets; remove a leading `+961`, `00961` or `961`; remove one leading `0`; the remainder must be 7 or 8 digits and not start with `0`. Store as `+961` + remainder. Anything else is a `VALIDATION_ERROR` on that field. WhatsApp numbers use the same function; when `whatsappSameAsPhone` is true the WhatsApp number is copied from the phone.

**Email:** trimmed, must match a standard email shape and be at most 190 characters. Required for website orders; optional for manual dashboard orders.

**Customers have no accounts.** The identity key is the normalised phone number.
- On every order, upsert the `customers` row by `phone`. Update `name`, `email` and `whatsapp` to the values just entered (latest wins).
- The order keeps its own snapshot of name, email, phone and WhatsApp (`orders.contact_*`). Editing a customer later never rewrites old orders; correcting an order's contact (dashboard) never rewrites the customer.
- "Repeat customer" = a customer with two or more non-cancelled orders.

---

## 3. Placing an order

Used by `POST /orders` and, with relaxed rules, `POST /admin/orders`.

```
1. Validate input (shape, phone, email, quantities). Reject a non-empty honeypot `hp`.
2. If an Idempotency-Key was sent and an order with that key exists: if the request body hash matches, return that order (200) and stop; if it differs, return CONFLICT (details.field = "Idempotency-Key") and stop.
3. Load every referenced hoodie, colour, size, variant, pack, Stimpie. Missing or mismatched => VALIDATION_ERROR.
   Reject inactive items, inactive colour/size, and Stimpies whose drop is not LIVE-purchasable => NOT_PURCHASABLE.
4. Price the cart (section 1). Check expectedTotalCents if sent.
5. Build the list of stock needs: Map<(type, id), qty>, summing across cart items.
6. BEGIN TRANSACTION
     a. Increment the order-number counter (row lock) and read the new value.      <- serialises order creation
     b. For each stock need, in a fixed order (variants by id, then Stimpies by id):
          UPDATE ... SET reserved = reserved + :qty
           WHERE id = :id AND quantity - reserved >= :qty
        If 0 rows changed => ROLLBACK, return SOLD_OUT with every item that failed.
     c. Upsert the customer. Insert the order (status NEW, hold_expires_at = now + stockHoldHours),
        its items, its stock lines (state RESERVED), the first order event, and one stock movement
        per need (field RESERVED, +qty, reason ORDER_RESERVED).
     d. Insert the "order received" email_log row (and the founder alert row if enabled).
   COMMIT
7. Return the order, the whatsappUrl and the trackUrl.
```

Guarantees:
- **Atomic:** a failed reservation leaves no order, no number consumed, no email.
- **No oversell:** the conditional `UPDATE` plus the database `CHECK` constraints make over-reservation impossible even under concurrency.
- **No deadlocks:** every transaction takes the counter row first, then stock rows in a fixed order, so transactions queue instead of crossing.
- **Emails never block orders:** step 6d only writes a row; sending is the worker's job.

**Manual orders (`POST /admin/orders`)** follow the same algorithm with: no honeypot, no idempotency key, `source` taken from the request, email optional, and `initialStatus` of `NEW` or `CONFIRMED` (a `CONFIRMED` manual order also sets `confirmed_at` and queues the "confirmed" email instead of "received" if an email address exists and `sendEmail` is true).

---

## 4. Order numbers

- Format `PREFIX-N`, e.g. `STP-1042`. The prefix and first number come from `settings.orders`.
- `N` comes from the single `counters` row `order_number`, incremented **inside** the order transaction (step 3.6a). The row lock makes duplicates impossible.
- Numbers are **never reused**: a rolled-back transaction rolls back the increment (so no gap), and a cancelled order keeps its number (gaps can still appear if the founder raises the first number; that is fine).
- Changing the prefix affects new orders only. Raising `firstNumber` jumps the counter forward; it can never move it backwards (the settings call rejects a value below the current counter).
- Lookups accept the full number in any case (`stp-1042`) or the digits alone (`1042`, resolved to the current prefix, then to any order whose number ends in `-1042`; if more than one matches, require the full number).
- The **delivery number** is a different thing ([section 8](#8-delivery-number-and-cash)).

---

## 5. Stock lifecycle

Two counters per stocked thing: `quantity` (physically owned) and `reserved` (promised to open orders). **Available = quantity − reserved.** Something is "sold out" when available is 0.

Every change writes `stock_movements` rows and updates the `order_stock_lines.state` for order-driven changes.

| Event | `quantity` | `reserved` | Stock line state | Movement reason(s) |
|---|---|---|---|---|
| Order placed | 0 | +qty | `RESERVED` | `ORDER_RESERVED` |
| Order cancelled (from NEW / CONFIRMED / PACKED) | 0 | −qty | `RELEASED` | `ORDER_RELEASED` |
| Order **delivered** | −qty | −qty | `SOLD` | `ORDER_SOLD` (two movements) |
| Out-for-delivery order **returned** (failed delivery) | 0 | −qty | `RELEASED` | `ORDER_RELEASED` |
| Delivered order **returned**, `restock: true` | +qty | 0 | `RESTOCKED` | `ORDER_RETURNED` |
| Delivered order **returned**, `restock: false` | 0 | 0 | `WRITTEN_OFF` | `ORDER_WRITTEN_OFF` (zero-delta marker) |
| Manual `RESTOCK` | +delta | 0 | : | `RESTOCK` |
| Manual `CORRECTION` / `set` | ±delta | 0 | : | `CORRECTION` |
| Manual `DAMAGED` | −delta | 0 | : | `DAMAGED` |

Rules:
- A manual change may never push `quantity` below `reserved`; it is rejected with `CONFLICT` and a message saying how many units are reserved by open orders.
- Manual changes require a non-empty `note`.
- Stock is **never** changed by editing an order's items (items are immutable after placement in v1; to change an order, cancel it and create a new one).
- "Sold out" is derived, never stored. The public API hides exact numbers; it exposes `remaining` only when available ≤ `lowStockThreshold`.
- Core Stimpies are restocked manually; limited Stimpies are simply never restocked (no code enforces that, it is the founder's policy).
- Hoodie stock is per variant (colour × size). Packs and Stimpies sold with a pack consume the Stimpies' own stock.

---

## 6. Drops

A drop's state is derived at read time (no scheduler is needed to "start" or "end" it):

| State | Condition (evaluated against the server clock) |
|---|---|
| `UPCOMING` | `now < starts_at` |
| `LIVE` | `starts_at ≤ now`, not ended (`ended_at` null and `ends_at` null or in the future), and at least one of its Stimpies has available stock |
| `SOLD_OUT` | started, not ended, and every active Stimpie in the drop has zero available |
| `ENDED` | `ended_at` is set, or `ends_at` has passed |

- A Stimpie in a drop is **purchasable** only while its drop is `LIVE` and the Stimpie itself has stock and is active. Before the start, ordering it returns `NOT_PURCHASABLE` (`DROP_NOT_STARTED`); after the end, `DROP_ENDED`.
- `GET /drops`: `live` is the most recently started `LIVE` drop (the dashboard prevents overlapping live drops with a warning, not a block); `upcoming` is sorted by start time; `archive` holds `SOLD_OUT` and `ENDED`, newest first.
- A Stimpie's public `status`: `UPCOMING` (drop not started), `ENDED` (drop ended), `SOLD_OUT` (available 0), `LOW` (available ≤ threshold), otherwise `AVAILABLE`. Core Stimpies are never `UPCOMING` or `ENDED`.
- `unitsRemaining` on a live drop is the sum of available units across its active Stimpies.
- `POST /admin/drops/:id/end` sets `ended_at = now`. It does not cancel open orders.
- Subscribers (`POST /drops/:id/subscribe`) are stored only; announcing a drop is a manual action in v1 (the dashboard exports the list).

---

## 7. Status machine

```
NEW ──► CONFIRMED ──► PACKED ──► OUT_FOR_DELIVERY ──► DELIVERED ──► RETURNED
 │          │            │               │
 └──────────┴────────────┘               └──► RETURNED (failed delivery)
        └──► CANCELLED
```

| From | Allowed next | Notes |
|---|---|---|
| `NEW` | `CONFIRMED`, `CANCELLED` | The founder confirms in the dashboard (no WhatsApp message is required) |
| `CONFIRMED` | `PACKED`, `CANCELLED` | |
| `PACKED` | `OUT_FOR_DELIVERY`, `CANCELLED` | |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `RETURNED` | Cannot be "cancelled": the parcel is out, so it comes back as `RETURNED` |
| `DELIVERED` | `RETURNED` | Accepted return/exchange after delivery |
| `CANCELLED`, `RETURNED` | none | Terminal |

Skipping steps is not allowed (`INVALID_TRANSITION`), except through `POST /admin/orders` with `initialStatus: CONFIRMED`. The single bulk exception is `bulk-status` to `CONFIRMED` / `PACKED`, which still validates each order individually.

Side effects of each transition (all in one transaction with the status change):

| Transition to | Stock | Timestamps / flags | Email queued | Event row |
|---|---|---|---|---|
| `CONFIRMED` | none | `confirmed_at`; hold cleared (`hold_expires_at = null`) | `order_confirmed` | yes |
| `PACKED` | none | : | none | yes |
| `OUT_FOR_DELIVERY` | none | `out_for_delivery_at`; **requires `deliveryNumber`** | `order_out_for_delivery` | yes |
| `DELIVERED` | sell (section 5) | `delivered_at`; `cash_collected = true` | `order_delivered` | yes |
| `CANCELLED` | release | `cancelled_at`, `cancel_reason` | `order_cancelled` | yes |
| `RETURNED` | release or restock/write-off | `cancel_reason` optional note | none | yes |

- Every transition records `order_events` with the acting admin user (null for system actions such as hold expiry).
- Emails are queued only if the order has a `contact_email`, `settings.email.enabled` is true, and that template is `enabled`.
- `allowedTransitions` in the admin order response is computed from this table.

---

## 8. Delivery number and cash

- Going `OUT_FOR_DELIVERY` **requires** a non-empty `deliveryNumber` (1–60 characters, trimmed). Missing => `422 DELIVERY_NUMBER_REQUIRED`; the transition does not happen.
- The delivery number is stored on the order, shown to the customer from `OUT_FOR_DELIVERY` onward, and searchable by the founder.
- It is **not unique**: several orders can ride one delivery. When a number is entered that another open order already uses, the API still succeeds and returns the duplicate in `warnings`; the dashboard shows it as an informational notice.
- `POST /admin/orders/:id/delivery` on an order already out for delivery **corrects** the number and writes an event (`from_status = to_status`, note "Delivery number changed from X to Y").
- **Cash:** every order is cash on delivery. Marking `DELIVERED` sets `cash_collected = true` (the courier took the money). `cash_settled` becomes true when the founder confirms receipt, one order at a time (`POST /admin/orders/:id/cash`) or per delivery number (`POST /admin/deliveries/:deliveryNumber/settle`). The Finance cash view lists delivered, unsettled orders grouped by delivery number. A `RETURNED` order resets both flags to false.

---

## 9. Stock holds on unconfirmed orders

- A new order gets `hold_expires_at = placed_at + settings.orders.stockHoldHours` (default 12). Confirming it clears the hold.
- The `hold-expiry` job (every 5 minutes) finds `NEW` orders past their hold.
  - **Default (`autoExpireUnconfirmed = false`):** it changes nothing. The order list reports `holdExpired: true`, the Overview shows a `HOLD_EXPIRED` attention item, and the founder decides: confirm, cancel, or `extend-hold`.
  - **If the founder turns auto-expire on:** the job cancels the order with reason "Expired: not confirmed", releases stock, and queues the cancellation email.
- `POST /admin/orders/:id/extend-hold` sets `hold_expires_at = now + hours` (1–168).
- Only `NEW` orders have holds; confirmed orders keep their reservation until they leave the flow.

---

## 10. Tracking and the lost order number

**`POST /orders/track`**
- Resolve the order by number ([section 4](#4-order-numbers)). Normalise the supplied phone. Succeed only if it equals `orders.contact_phone`. Any failure (unknown number, wrong phone) returns the same `404 NOT_FOUND` with the same message and timing-neutral work (always do the phone comparison).
- The response is the public view: no costs, no internal notes, no event authors, no emails log.
- `timeline` lists each status the order has actually reached with its timestamp (from `order_events`), so a customer sees `NEW → CONFIRMED → …`. `CANCELLED` and `RETURNED` appear as terminal entries.
- `deliveryNumber` is included only when the status is `OUT_FOR_DELIVERY`, `DELIVERED`, or the order has `out_for_delivery_at` set.

**`POST /orders/find`**
- Always responds `202` with the same message and does the same amount of visible work.
- If one or more orders have `contact_email` equal to the supplied address (case-insensitive), queue one `orders_lookup` email listing them (order number, date, status, total; up to the 10 most recent), sent to that address.
- Rate limited per IP and per email (see [security](security-and-testing.md#2-security)).

---

## 11. Finance calculations

All figures are in cents. "In range" means the relevant date falls within `from`–`to` inclusive in the business timezone (`Asia/Beirut`).

| Figure | Definition |
|---|---|
| Revenue | Sum of `subtotal_cents` of orders with status `DELIVERED` and `delivered_at` in range (item revenue only) |
| Delivery fees | Sum of `delivery_fee_cents` on those orders (shown separately; the plan treats delivery as a pass-through cost, so it is not counted as profit unless the founder records a delivery expense) |
| Cost of goods | Sum of `cost_cents` on those orders |
| Expenses | Sum of `expenses.amount_cents` with `spent_on` in range |
| Ad spend | Sum of `ad_spend.amount_cents` in range |
| **Profit** | Revenue − cost of goods − expenses − ad spend |
| Cash outstanding | Sum of `total_cents` of `DELIVERED` orders where `cash_settled = false` |
| `planMargins` | Constants for comparison: $18 on the $35 pack and $22 on the $45 pack (from the master plan, before delivery, packaging and ads) |

- `RETURNED` orders that had been delivered are excluded from revenue for the period of their delivery date only if the return is recorded; the profit endpoint states that it is "based on current order statuses".
- Revenue is recognised on delivery, not on placement, because it is cash on delivery.

**Insights** use the same status rule (delivered orders) except funnel-style figures: `deliverySuccessRate = delivered ÷ (delivered + returned + cancelled-after-dispatch)`, `returnRate = returned ÷ delivered-or-returned`, `repeatRate = customers with ≥2 delivered orders ÷ customers with ≥1 delivered order`, `extraStimpieAttachRate = extra-Stimpie units ÷ hoodie units` over delivered orders.

---

## 12. Builder mode resolution

The dashboard stores `mode` (`2D`, `3D`, `BOTH`) and `defaultView`. The public `effectiveMode` is computed:

| Chosen `mode` | 3D model uploaded and a back-panel mesh named? | 2D image + placement exist for at least one active colour? | `effectiveMode` |
|---|---|---|---|
| `2D` | : | yes | `2D` |
| `2D` | : | no | `2D` (the frontend shows the Stimpie on a generic flat shape; the dashboard warns) |
| `3D` | yes | : | `3D` |
| `3D` | no | : | `2D` |
| `BOTH` | yes | : | `BOTH` |
| `BOTH` | no | : | `2D` |

`defaultView` is forced to `2D` whenever `effectiveMode` is `2D`. `GET /admin/builder` returns `assetsReady` so the dashboard shows exactly what is missing. Saving incomplete settings is allowed and returns `warnings`.

---

## 13. Duplicates and abuse

| Situation | Rule |
|---|---|
| Double tap / network retry on Place order | Same `Idempotency-Key` and same body returns the original order with `200` (same key with a different body is `409 CONFLICT`); without a key, an identical order (same phone, same items, same total) within 60 seconds is treated as a duplicate and returns the existing order |
| Honeypot filled | `400 VALIDATION_ERROR` with a generic message; nothing is stored |
| Order flood from one IP / phone | Rate limits (public order: 5 per 10 minutes per IP and 3 per hour per phone); beyond that `RATE_LIMITED` |
| A phone with repeated failed deliveries | The dashboard shows a warning badge on the customer and on new orders from that phone (3 or more `RETURNED` / failed orders). It informs the founder; it does not block ordering in v1 |
| Impossible quantities | `qty` > 10 or more than 20 cart items => `VALIDATION_ERROR` |
| Prank orders | Covered by the confirm-before-pack rule: nothing is packed until the founder confirms the order |
