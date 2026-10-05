# Backend: Data Model

**Purpose and audience.** The complete MySQL schema the backend will implement with Prisma: every table, column, constraint, index and enum, plus the seed data. Business meaning of the values is in [business rules](business-rules.md); the plan's earlier summary table in [stimpy_website_plan.md §9](../../../stimpy_website_plan.md) is superseded by this document where they differ.

## Contents

1. [Conventions](#1-conventions)
2. [Enums](#2-enums)
3. [Entity overview](#3-entity-overview)
4. [Catalog and configuration tables](#4-catalog-and-configuration-tables)
5. [Orders and stock tables](#5-orders-and-stock-tables)
6. [People, money, communications, content](#6-people-money-communications-content)
7. [Indexes and constraints that matter](#7-indexes-and-constraints-that-matter)
8. [Seed data](#8-seed-data)
9. [Migration and backup rules](#9-migration-and-backup-rules)

---

## 1. Conventions

- Engine InnoDB, charset `utf8mb4`, collation `utf8mb4_unicode_ci` (case-insensitive matching on emails and names).
- Table names are `snake_case` plural; Prisma models are `PascalCase` singular with `@@map`.
- Primary key: `id INT UNSIGNED AUTO_INCREMENT`, except key/value tables whose key is the primary key.
- Money: `INT` cents (never `DECIMAL`/`FLOAT`). Maximum value is far above anything this business will see.
- Timestamps: `DATETIME(3)` stored in UTC. Every table has `created_at`; mutable tables also have `updated_at`.
- Booleans: `TINYINT(1)`. Free JSON: MySQL `JSON` columns, used only for lists of strings and small config objects.
- Soft delete: **none**. Things that must disappear from the shop use an `active` flag. Rows referenced by orders are never deleted.
- Slugs: lowercase `a-z0-9-`, unique per table.
- Phone numbers: stored normalised `+961XXXXXXXX`. Emails stored as typed, compared case-insensitively.
- Order, stock and money rows are append-only where possible (`order_events`, `stock_movements`).

---

## 2. Enums

| Enum | Values |
|---|---|
| `OrderStatus` | `NEW`, `CONFIRMED`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURNED` |
| `OrderSource` | `WEBSITE`, `INSTAGRAM`, `WHATSAPP`, `MANUAL` |
| `OrderItemKind` | `PACK`, `HOODIE`, `STIMPIE` |
| `StimpieType` | `CORE`, `LIMITED` |
| `AccentColor` | `BUTTER`, `SKY`, `LILAC` (hex values are fixed in code: `#FFE45C`, `#5CC8FF`, `#C9B6FF`) |
| `StockItemType` | `HOODIE_VARIANT`, `STIMPIE` |
| `StockField` | `QUANTITY`, `RESERVED` |
| `StockReason` | `INITIAL`, `RESTOCK`, `CORRECTION`, `DAMAGED`, `ORDER_RESERVED`, `ORDER_RELEASED`, `ORDER_SOLD`, `ORDER_RETURNED`, `ORDER_WRITTEN_OFF` |
| `StockLineState` | `RESERVED`, `SOLD`, `RELEASED`, `RESTOCKED`, `WRITTEN_OFF` |
| `EmailStatus` | `PENDING`, `SENT`, `FAILED` |
| `SubscriberType` | `EMAIL`, `WHATSAPP` |
| `UserRole` | `OWNER`, `PACKER` |

---

## 3. Entity overview

```
 AdminUser ──< AdminSession
     │
 Color ──┐                       Drop ──< Stimpie
 Size ───┼──< HoodieVariant >── Hoodie       │
         │          │                          │
 SizeChartColumn ─< SizeChartValue >─ Size     │
                    │                          │
 Customer ──< Order ──< OrderItem              │
                 │  ├─< OrderStockLine >───────┘ (points at a HoodieVariant or a Stimpie)
                 │  ├─< OrderEvent
                 │  ├─< OrderNote
                 │  └─< EmailLog
 Area ──< Order        StockMovement (points at variant/stimpie, optionally an order)
 Pack  (priced bundle)       Counter (order number)
 Expense, AdSpend, Subscriber, Faq, Review, ContentBlock, Setting, BuilderConfig,
 EmailTemplate, WhatsappTemplate, Upload
```

---

## 4. Catalog and configuration tables

### `admin_users`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| email | VARCHAR(190) UNIQUE | login |
| password_hash | VARCHAR(255) | Argon2id |
| name | VARCHAR(120) | |
| role | `UserRole` | default `OWNER` |
| created_at, updated_at | DATETIME(3) | |

### `admin_sessions`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| user_id | FK → admin_users | cascade delete |
| token_hash | CHAR(64) UNIQUE | SHA-256 of the cookie value; the raw token is never stored |
| expires_at | DATETIME(3) | sliding: now + 7 days on use |
| absolute_expires_at | DATETIME(3) | created + 30 days; never extended |
| last_used_at | DATETIME(3) | |
| user_agent | VARCHAR(255) NULL | |
| created_at | DATETIME(3) | |

### `colors`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| name | VARCHAR(60) UNIQUE | |
| hex | CHAR(7) | `#RRGGBB` |
| position | INT | display order |
| active | TINYINT(1) | default 1 |
| images | JSON | string URLs |
| builder_tint | CHAR(7) NULL | |
| builder_texture | VARCHAR(500) NULL | URL |

### `sizes`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| label | VARCHAR(20) UNIQUE | e.g. `M` |
| position | INT | |
| active | TINYINT(1) | |

### `size_chart_columns`
`id`, `label` VARCHAR(40), `unit` VARCHAR(10) (e.g. `cm`), `position` INT.

### `size_chart_values`
`id`, `size_id` FK, `column_id` FK, `value` VARCHAR(30). **Unique (`size_id`, `column_id`).** Stored as text so `"52"`, `"52-54"` and `"-"` all work.

### `hoodies`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| name | VARCHAR(120) | |
| slug | VARCHAR(140) UNIQUE | |
| description | TEXT | |
| details | JSON | bullet strings |
| price_cents | INT | price when sold alone |
| cost_cents | INT | default 1000 in the seed (the plan's $10) |
| images | JSON | |
| active | TINYINT(1) | |
| position | INT | |

### `hoodie_variants`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| hoodie_id, color_id, size_id | FK | **Unique (`hoodie_id`, `color_id`, `size_id`)** |
| sku | VARCHAR(60) UNIQUE | generated, e.g. `HOOD-1-C2-S3` |
| quantity | INT | physical units on hand; `CHECK (quantity >= 0)` |
| reserved | INT | held by open orders; `CHECK (reserved >= 0 AND reserved <= quantity)` |

Available = `quantity - reserved`. Variants are created automatically when a hoodie, active colour, or active size is added (zero stock). A variant is only offered publicly when its colour and size are active.

### `drops`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| name, slug (UNIQUE) | | |
| story | TEXT | |
| accent_color | `AccentColor` | |
| starts_at | DATETIME(3) | |
| ends_at | DATETIME(3) NULL | planned end |
| ended_at | DATETIME(3) NULL | set when the founder ends it early |
| teaser_image, teaser_video | VARCHAR(500) NULL | |

The drop's `state` is **derived**, never stored (see [business rules §6](business-rules.md#6-drops)).

### `stimpies`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| name, slug (UNIQUE) | | |
| type | `StimpieType` | |
| drop_id | FK NULL | core Stimpies have none |
| price_cents, cost_cents | INT | seed: price 1000, cost 600 |
| quantity, reserved | INT | same semantics and checks as variants |
| story | TEXT | |
| images | JSON | |
| artwork_url | VARCHAR(500) | back-panel art (aspect 0.64) |
| artwork_width, artwork_height | INT NULL | pixels, copied from the upload record when the artwork is set |
| active | TINYINT(1) | |
| position | INT | |

### `packs`
`id`, `name`, `slug` UNIQUE, `description` TEXT, `stimpie_count` INT (1–5), `price_cents` INT, `badge` VARCHAR(40) NULL, `active`, `position`.

### `areas`
`id`, `name` UNIQUE, `fee_cents` INT NULL (null = use the default fee), `est_days` INT NULL, `active`.

### `uploads`
`id`, `path` VARCHAR(300) UNIQUE, `url` VARCHAR(500), `mime` VARCHAR(80), `size_bytes` INT, `width` INT NULL, `height` INT NULL, `original_name` VARCHAR(200), `created_by` FK NULL, `created_at`.

---

## 5. Orders and stock tables

### `customers`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| phone | VARCHAR(20) **UNIQUE** | normalised; this is the identity key (no accounts) |
| whatsapp | VARCHAR(20) | normalised |
| name | VARCHAR(120) | latest used |
| email | VARCHAR(190) NULL | latest used |
| area_id | FK NULL | |
| notes | TEXT NULL | internal |

### `orders`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| number | VARCHAR(30) **UNIQUE** | e.g. `STP-1042`; immutable |
| customer_id | FK | |
| status | `OrderStatus` | |
| source | `OrderSource` | |
| customer_name | VARCHAR(120) | snapshot |
| contact_email | VARCHAR(190) NULL | snapshot (editable by the founder) |
| contact_phone | VARCHAR(20) | snapshot |
| contact_whatsapp | VARCHAR(20) | snapshot |
| area_id | FK NULL | |
| area_name | VARCHAR(120) | snapshot of what the customer entered/selected |
| address | TEXT | |
| notes | TEXT NULL | customer's delivery notes |
| subtotal_cents, delivery_fee_cents, total_cents | INT | computed server-side |
| cost_cents | INT | sum of item unit costs × qty at order time |
| cash_collected | TINYINT(1) | default 0 |
| cash_settled | TINYINT(1) | default 0 |
| delivery_number | VARCHAR(60) NULL | set when going out for delivery; not unique |
| placed_at | DATETIME(3) | |
| hold_expires_at | DATETIME(3) NULL | for NEW orders |
| confirmed_at, out_for_delivery_at, delivered_at, cancelled_at | DATETIME(3) NULL | |
| cancel_reason | VARCHAR(255) NULL | |
| idempotency_key | VARCHAR(80) UNIQUE NULL | |
| idempotency_hash | CHAR(64) NULL | SHA-256 of the canonical request body; a repeat key with a different hash is rejected with `CONFLICT` |
| request_fingerprint | VARCHAR(64) NULL | hash of IP + user agent for abuse review; never shown |
| utm_source, utm_medium, utm_campaign | VARCHAR(80) NULL | from the website's optional `attribution`; used by Insights "by campaign" |

### `order_items`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | FK cascade | |
| kind | `OrderItemKind` | |
| name | VARCHAR(160) | snapshot |
| qty | INT | |
| unit_price_cents, unit_cost_cents | INT | snapshots |
| detail | JSON | `{ hoodie, color, size, stimpies: [names] }` for display |

### `order_stock_lines`
The exact stock this order holds, one row per underlying physical thing. This is what makes cancel/return/sell exact regardless of how packs are composed.

| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | FK cascade | |
| order_item_id | FK | |
| item_type | `StockItemType` | |
| variant_id | FK NULL | when `HOODIE_VARIANT` |
| stimpie_id | FK NULL | when `STIMPIE` |
| qty | INT | |
| state | `StockLineState` | starts `RESERVED` |

### `order_events`
`id`, `order_id` FK cascade, `from_status` NULL, `to_status`, `user_id` FK NULL (null = system/customer), `note` VARCHAR(500) NULL, `created_at`. Also used for non-status audit entries (contact edited, delivery number corrected) with `from_status = to_status`.

### `order_notes`
`id`, `order_id` FK cascade, `user_id` FK, `body` TEXT, `created_at`. Internal only.

### `stock_movements`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| item_type | `StockItemType` | |
| variant_id / stimpie_id | FK NULL | |
| field | `StockField` | which counter changed |
| delta | INT | signed |
| reason | `StockReason` | |
| order_id | FK NULL | |
| user_id | FK NULL | |
| note | VARCHAR(255) NULL | required for manual reasons |
| created_at | DATETIME(3) | |

### `counters`
`name` VARCHAR(40) PK, `value` INT. One row, `order_number`. Incremented inside the order transaction.

---

## 6. People, money, communications, content

### `subscribers`
`id`, `contact` VARCHAR(190), `type` `SubscriberType`, `drop_id` FK NULL, `created_at`. Uniqueness (`contact`, `drop_id`) is enforced in the service, because MySQL treats `NULL` values as distinct in a unique index.

### `expenses`
`id`, `category` VARCHAR(60), `amount_cents` INT, `note` VARCHAR(255) NULL, `spent_on` DATE, `created_at`.

### `ad_spend`
`id`, `channel` VARCHAR(60), `amount_cents` INT, `note` NULL, `spent_on` DATE, `created_at`.

### `email_templates`
`key` VARCHAR(60) PK, `name` VARCHAR(100), `subject` VARCHAR(200), `body` TEXT, `enabled` TINYINT(1), `updated_at`.

### `whatsapp_templates`
`key` VARCHAR(60) PK, `name`, `body` TEXT, `updated_at`.

### `email_log`
| Column | Type | Notes |
|---|---|---|
| id | INT PK | |
| order_id | FK NULL | |
| to_email | VARCHAR(190) | |
| template_key | VARCHAR(60) | `custom` for free-form |
| subject | VARCHAR(250) | rendered |
| body_text | MEDIUMTEXT | rendered |
| body_html | MEDIUMTEXT | rendered |
| status | `EmailStatus` | |
| attempts | INT | |
| next_attempt_at | DATETIME(3) | |
| error | VARCHAR(500) NULL | |
| sent_at | DATETIME(3) NULL | |
| created_at | DATETIME(3) | |

The rendered content is stored at queue time so the log shows exactly what the customer received, even if the template is edited later.

### `faqs`
`id`, `question`, `answer` TEXT, `group` VARCHAR(60) NULL (free label such as "Ordering"), `show_on_home`, `position`.

### `reviews`
`id`, `name`, `text` TEXT, `media_url` NULL, `visible`, `created_at`.

### `content_blocks`
`key` VARCHAR(60) PK, `value` JSON, `updated_at`. Keys: `announcement`, `homepage`, `policies` (delivery & returns, care, terms, privacy), `about`, `how_it_works` (steps, promises, faqs). The "how to measure" text is stored with the size chart (key `size_chart_howto`), not in `policies`.

### `settings`
`key` VARCHAR(60) PK, `value` JSON, `updated_at`. Keys: `business` (includes `timezone`, default `Asia/Beirut`), `orders`, `email` (includes `footerText`), `notifications`, `delivery`, `setup` (`{ reviewed: string[] }`: the setup-checklist items the owner has marked reviewed). Each value validated by a Zod schema with defaults ([api-reference §5.12](api-reference.md#512-settings)).

### `builder_config`
`key` VARCHAR(40) PK, `value` JSON. Keys: `mode`, `defaultView`, `hoodieId` (the hoodie the Builder sells), `model3d` (url, sizeBytes, backPanelMesh, panelAspect, camera, lighting), `colors` (per colour: hoodieImage2d, overlay2d, placement2d), `stimpieTextures`. Colour tint/texture are not stored here: they are the `colors.builder_tint` / `builder_texture` columns.

---

## 7. Indexes and constraints that matter

| Index / constraint | Why |
|---|---|
| `orders.number` UNIQUE | Order numbers can never repeat |
| `orders (status, placed_at)` | Dashboard tabs and counts |
| `orders (customer_id)`, `orders (contact_phone)`, `orders (contact_email)` | Tracking, search, "lost number" |
| `orders (delivery_number)` | Deliveries page and search |
| `orders.idempotency_key` UNIQUE | Double-submit protection |
| `hoodie_variants (hoodie_id, color_id, size_id)` UNIQUE | No duplicate variants |
| `CHECK` constraints on `quantity`/`reserved` | The database itself refuses negative or over-reserved stock, as a last line of defence behind the atomic update |
| `order_stock_lines (order_id)`, `(variant_id)`, `(stimpie_id)` | Release/sell and stock history |
| `stock_movements (variant_id, created_at)`, `(stimpie_id, created_at)`, `(order_id)` | Movement log filters |
| `email_log (status, next_attempt_at)` | Worker polling |
| `customers.phone` UNIQUE | One customer per phone |
| Foreign keys everywhere with `ON DELETE RESTRICT`, except children noted as cascade | Rows used by orders cannot be deleted |

---

## 8. Seed data

The seed makes a fresh database usable immediately. **Everything seeded is editable in the dashboard**; seeded values that are guesses are marked.

| Data | Seeded value |
|---|---|
| Admin user | From `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Colours | Black `#111111`, Cream `#FFF4E6`, Coral `#FF7A59` *(placeholders, the founder decides the real range)* |
| Sizes | S, M, L, XL *(placeholder)* |
| Size chart | Columns Chest, Length, Sleeve (cm) with placeholder numbers, clearly marked "edit me" in the dashboard |
| Hoodie | "Stimpy Hoodie", price $25, cost $10; 20 units per variant in dev only |
| Packs | "Hoodie + 1 Stimpie" $35; "Hoodie + 2 Stimpies" $45 with badge "Most popular" (from the master plan) |
| Core Stimpies | THE VOID, AFTER DARK, THE CEDAR, THE DREAMER (from `content/stimpy-video/app/src/cards.ts`), price $10, cost $6, artwork copied from `content/stimpy-video/out/stimpies/stimpie-001…004.png` |
| Drop 001 (live) | THE SIGNAL, THE STATIC, limited, 30 units each, accent Butter |
| Drop 002 (upcoming, in 14 days) | THE MOTH, THE MAZE, accent Sky |
| Areas | Beirut, Mount Lebanon, North, South, Bekaa, Nabatieh *(names only, no fees)* |
| Delivery | Default fee $3 *(placeholder)*, estimate text "2-3 working days" *(placeholder)* |
| Orders settings | Prefix `STP`, first number 1001, hold 12 h, auto-expire off, low-stock threshold 10, hardware cost $1 |
| Email | Sender "Stimpy", sender address `orders@stimpy.local`, reply-to `hello@stimpy.local`, enabled |
| Email templates | The six in [integrations](integrations.md#3-email-templates) with default copy |
| WhatsApp templates | The four in [integrations](integrations.md#4-whatsapp-templates) |
| FAQs | Eight starter questions drawn from the master plan (how the swap works, washing, sizes, delivery, cash on delivery, exchanges, drops, no-Stimpie look) |
| Builder | Mode `BOTH`, default `3D`; no model uploaded, so `effectiveMode` is `2D` until one is |
| Content | Short placeholder copy for announcement (off), homepage, about, how-it-works, policies |
| Setup checklist | `settings.setup.reviewed` starts empty, so every placeholder above shows up as a `TODO` on the dashboard Overview until the owner replaces and marks it ([api §5.2](api-reference.md#52-overview)) |
| Test data | A separate `seed:demo` creates ~30 fake orders in every status so dashboard pages have something to show. Never run in production |

---

## 9. Migration and backup rules

- Every schema change is a Prisma migration committed to the repo; never edit the database by hand.
- Destructive migrations (dropping a column) take two releases: stop using it, then drop it.
- A migration that adds a `NOT NULL` column must give it a default or backfill it in the same migration.
- `npm run db:backup` writes a timestamped `mysqldump` to `backups/` (git-ignored); `npm run db:restore -- <file>` restores it. Both run through the Docker MySQL container so no local MySQL client is required.
- Before any migration on data that matters, run a backup.
