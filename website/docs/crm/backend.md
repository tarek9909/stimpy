# CRM backend plan (`backend`)

Part of [README.md](README.md). Layering rules from the existing API apply: thin routes, business logic in services, one error type, enforced response schemas. Schema changes always go in a **new** Prisma migration; never edit applied ones.

## Phase 1: Profile and stats (no schema change)

- `GET /customers/:id/profile`: customer fields, area, order count, lifetime value, average order value, first and last order dates, favourite Stimpie type and favourite colour (by order item count), 5 most recent orders.
- Compute with SQL aggregates, not by loading all orders. Exclude cancelled/refunded orders from LTV using the existing `OrderStatus` enum; record which statuses count in DECISIONS.md.
- `GET /customers/:id/timeline` (cursor-paginated): merges orders, `OrderEvent`s, `OrderNote`s on their orders, and `EmailLog` rows for that customer, newest first. Item shape: `type`, `at`, `title`, `detail`, `refId`.
- Tests: aggregates for mixed-status orders; customer with zero orders; timeline ordering and pagination.

## Phase 2: Tags, notes, follow-ups

Schema
- `CustomerTag` (id, name unique, color nullable); `CustomerTagLink` (customerId, tagId, unique pair, cascade on customer delete).
- `CustomerNote` (id, customerId, userId -> AdminUser, body, createdAt), same shape as `OrderNote`. Keep legacy `Customer.notes` readable; do not delete it.
- `CustomerFollowUp` (id, customerId, userId, dueAt, note, doneAt nullable, createdAt), index (doneAt, dueAt).

API
- Tag CRUD; attach/detach tag on a customer; add/list notes; create/complete/reopen/delete follow-ups.
- `GET /follow-ups?due=today|overdue|upcoming`.
- Add a `tag` filter to the existing customers list endpoint.
- Notes and follow-ups also appear in the Phase 1 timeline.
- Tests: tag uniqueness, cascades, follow-up due filters, timeline includes new item types.

## Phase 3: Subscriber link, consent, duplicates

Schema
- `Customer`: add `emailConsent` (bool, default false), `whatsappConsent` (bool, default false), `consentUpdatedAt`, `unsubscribedAt` nullable. Backfill: customers with a matching subscriber row get consent `true` for that channel; others stay `false` (record rule in DECISIONS.md).
- `Subscriber`: add nullable `customerId` (FK, set null on delete), indexed.

Logic
- One shared phone-normalisation helper (same format as `Customer.phone` uniqueness) used to match subscribers to customers by phone or email.
- Auto-link on new subscriber and on new customer. Idempotent backfill script `npm run db:link-subscribers -w @stimpy/api` with a dry-run flag.
- Consent changes are explicit and timestamped. Email unsubscribe endpoint plus link; WhatsApp opt-out set manually by the owner.
- Duplicates: `GET /customers/duplicates` (same normalised phone or same email) and a merge action that moves orders, notes, tags, follow-ups and subscribers to the surviving customer in one transaction, deletes the other, and writes an audit entry to the survivor's timeline.
- List filters: "subscribed, never bought" and "bought, not subscribed".
- Tests: phone normalisation edge cases, auto-link both directions, backfill idempotency, merge moves every relation atomically.

## Phase 4: Segments and bulk messaging

Schema
- `Segment` (id, name, filterJson, createdBy, createdAt). `filterJson` is validated by a zod schema and compiled to a Prisma `where`; never concatenate raw SQL.
- `CampaignSend` (id, segmentId nullable, channel EMAIL|WHATSAPP, templateId, status, createdBy, createdAt, sentCount, skippedCount) plus per-recipient rows (campaignId, customerId, status, error, sentAt).

Filters (AND-combined): order count min/max, lifetime value range, last order before/after, area, tags, subscribed to drop X, subscribed and never ordered, has email, has consent for channel.

Rules
- **Consent is enforced server-side.** Recipients without consent for the channel, or with `unsubscribedAt`, are skipped and counted in `skippedCount`. No client override.
- Preview endpoint returns recipient count, skipped count and a sample; sending requires an explicit confirm call.
- Email: through the existing email pipeline and `EmailLog`, throttled, via the job runner in `backend/src/jobs`, with an unsubscribe link.
- WhatsApp: no unofficial automated sending. The API generates `wa.me` click-to-chat links from the chosen `WhatsappTemplate` per recipient, and an endpoint to mark each as sent (written to the timeline).
- Per-send recipient cap as a setting (default 200).
- Tests: every filter compiles correctly, consent skipping, throttle/cap, partial failure recorded per recipient.

## Phase 5: Attribution

Schema
- `Customer`: `firstSource`, `firstUtmSource`, `firstUtmMedium`, `firstUtmCampaign`, `firstReferrer`, `firstTouchAt`, all nullable. Set once at creation, never overwritten.
- Order checkout endpoint accepts optional UTM/referrer fields, stores them on the order, and on the customer if new.

Reporting
- Insights endpoints: customers and revenue by source/campaign; join to `AdSpend` by channel and day range for cost per customer and ROAS. Document the UTM-to-`AdSpend` mapping in DECISIONS.md. Report "unknown" honestly rather than guessing.
- `GET /admin/insights/acquisition?from=&to=` returns `{ bySource: { source, customers, revenueCents, adSpendCents, costPerCustomerCents, roas }[], byCampaign: { source, campaign, customers, revenueCents }[], unmatchedAdSpendCents }`. New-customer counts use `firstTouchAt`; delivered revenue and ad spend use their event dates in the selected business-timezone range. Ad spend matches an exact trimmed source/channel name case-insensitively; unmatched spend remains separate. `costPerCustomerCents` and `roas` are `null` when their denominators are zero. Campaign-level ad spend is unavailable until `AdSpend` has a campaign key.
- Tests: first-touch immutability, UTM through checkout, cost-per-customer math with zero customers and zero spend.

## Privacy and security (all phases)

- All CRM endpoints require an authenticated admin session under the `customers` area.
- `GET /customers/:id/export` returns everything held about the person as JSON.
- `DELETE /customers/:id/personal-data` anonymises name/phone/email/notes but keeps order rows for accounting.
- Never log full phone numbers or emails.

## Contract and verification

- Update `openapi.json`; run `npm run client:generate` and `npm run contract:check`.
- Run `npm run api:typecheck` and `npm run api:test` against real MySQL (own `stimpy_<name>` databases per BUILD-RULES.md) and Mailpit.
