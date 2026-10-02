# Backend: Security and Test Plan

**Purpose and audience.** What can go wrong and how the backend prevents it ([§1–2](#1-what-we-are-protecting)), and the automated tests that prove the important rules hold ([§3](#3-test-plan)). Written for the implementer and for whoever reviews the work.

## Contents

1. [What we are protecting](#1-what-we-are-protecting)
2. [Security](#2-security)
3. [Test plan](#3-test-plan)
4. [Manual verification checklist](#4-manual-verification-checklist)
5. [Operations: backups and recovery](#5-operations-backups-and-recovery)

---

## 1. What we are protecting

| Asset | Why it matters | Worst case |
|---|---|---|
| Stock integrity | Limited Stimpies are never restocked | Overselling destroys trust and the drop model |
| Orders and customer contact data | Names, phones, addresses, emails | Privacy breach; lost sales |
| Dashboard access | Controls prices, stock, orders, emails | Full takeover of the business |
| Email sending | Our domain's reputation | Spam abuse via the "lost order number" or any public email trigger |
| Cash records | Who owes what | Quiet loss of money |

Attackers realistically include: pranksters and bots hitting the order form (cash on delivery makes fake orders free), scrapers, password guessers, and anyone trying to read other customers' orders.

---

## 2. Security

### 2.1 Dashboard authentication

| Control | Rule |
|---|---|
| Passwords | Argon2id; minimum 12 characters; checked against a short list of common passwords; changing a password ends all other sessions; a wrong *current* password is reported as `400 VALIDATION_ERROR` (never `401`) so it can't be mistaken for an expired session |
| Session | Random 32-byte token in cookie `stimpy_session`; only the SHA-256 hash is stored. Cookie flags: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `COOKIE_SECURE=true` |
| Lifetime | Sliding 7 days of inactivity, absolute 30 days, then re-login. Logout deletes the session row |
| Login protection | 5 attempts per 15 minutes per IP **and** per email; failures return the same generic message whether the email exists or not, with equal timing (always run a hash comparison) |
| Two-factor (TOTP) | Planned, not in the first build. The `admin_users` table gets `totp_secret` when added; the login flow is structured so a second step can be inserted without changing clients |
| Roles | `OWNER` can do everything; `PACKER` is reserved. Authorisation is checked in one `requireRole()` hook per route, defaulting to `OWNER` |
| Account creation | No public registration. Users are created by the seed or `admin:create` script |

### 2.2 Browser-facing protections

| Control | Rule |
|---|---|
| CORS | Allow only `WEB_URL` and `ADMIN_URL`. `Access-Control-Allow-Credentials: true` only for `ADMIN_URL` on `/admin` and `/auth` routes. Public routes never accept credentials |
| CSRF | The session cookie is `SameSite=Lax`, **and** every non-GET request to `/admin` or `/auth` must carry an `Origin` header equal to one of the `ADMIN_URL` entries (no custom CSRF header is needed) (requests with no `Origin`, such as scripts and tests, are allowed because a browser always sends one on cross-site POSTs) |
| Security headers | Helmet defaults; `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on API responses; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`. Uploaded files are served with `Content-Disposition: inline` only for images/video/GLB and `nosniff` |
| HTTPS | Not used locally. When deployed: HSTS, `Secure` cookies, redirect HTTP→HTTPS |
| Request limits | JSON bodies max 100 KB; uploads per [integrations §6](integrations.md#6-file-storage-and-uploads); query string lengths bounded; page size max 100 |

### 2.3 Input and output safety

| Risk | Control |
|---|---|
| SQL injection | Prisma parameterised queries; the few raw SQL statements (stock update, counter) use bound parameters only |
| Mass assignment | Zod schemas list every accepted field; unknown fields are rejected. Responses are serialised through response schemas so unlisted columns (hashes, costs, fingerprints) cannot leak |
| Stored XSS | The API stores customer text as text and never renders HTML. Frontends render it as text (see the frontend docs). Email HTML escapes every inserted value |
| Header/email injection | Subjects and addresses are validated and stripped of CR/LF before sending |
| SVG/HTML uploads | SVGs are sanitised or refused; HTML files are not an allowed upload type |
| Path traversal | Uploaded files get generated names; the static route serves only from `UPLOAD_DIR` |
| Open redirects | The API never redirects to caller-supplied URLs |

### 2.4 Abuse controls on public endpoints

| Endpoint | Limit (per IP unless stated) | Extra |
|---|---|---|
| `POST /orders` | 5 per 10 min; 3 per hour per phone | Honeypot `hp`; idempotency; duplicate detection ([business rules §13](business-rules.md#13-duplicates-and-abuse)) |
| `POST /orders/track` | 20 per 10 min | Same `404` for wrong number and wrong phone |
| `POST /orders/find` | 3 per hour per IP and 3 per hour per email | Constant response; never reveals existence |
| `POST /drops/:id/subscribe` | 10 per hour | |
| `POST /auth/login` | see 2.1 | |
| All other public `GET`s | 300 per minute | Cached for 30 s |

Limits return `429 RATE_LIMITED` with `details.retryAfterSeconds`. Counters are in memory in v1 (single process); a shared store is a deployment-time concern.

### 2.5 Privacy

- Collected: name, email, phone, WhatsApp number, delivery address, order contents, and a hashed IP/user-agent fingerprint for abuse review. Nothing else.
- Used only for fulfilling and communicating about orders. Not shared, not sold, not used for marketing unless the customer subscribed to drop notifications.
- Public responses never include other customers' data; the tracking endpoint requires order number **and** phone.
- Logs mask phone numbers and email addresses; request bodies of orders and auth are never logged.
- A customer can ask for deletion: the dashboard's **Customers → customer → Anonymise** is a later feature; until then it is a documented manual SQL procedure that replaces name/phone/email/address with placeholders while keeping order totals for the books.
- Backups contain personal data and must be stored and handled accordingly.

### 2.6 Secrets and configuration

- No secrets in the repository; `.env` is git-ignored and `.env.example` documents every variable.
- The API refuses to start in `production` with the default admin password or `COOKIE_SECURE=false`.
- Dependencies are pinned by the lockfile; `npm audit` is run before each release.

---

## 3. Test plan

**Principles**
- Tests run against a **real MySQL** test database (`stimpy_test`, created by the Docker init script), never a mock: the stock and counter guarantees are database behaviour.
- Each test file starts from an empty database plus the minimum fixtures it needs (a `buildWorld()` helper creates colours, sizes, a hoodie with variants, packs, Stimpies, areas, settings, an admin user).
- The Fastify app is built by the same `app.ts` the server uses and exercised with `app.inject()` (no network).
- Time-dependent behaviour (drops, holds, sessions) uses an injectable clock; no test sleeps.
- Emails use a fake transport that records messages; the worker function is called directly.

**Tooling:** Vitest, one worker process per test file with serial execution inside a file for database tests.

### 3.1 Must-have tests (the launch gate)

| # | Test | Proves |
|---|---|---|
| 1 | **Oversell:** 50 simultaneous `POST /orders` for a Stimpie with 5 units create exactly 5 orders; 45 get `SOLD_OUT`; `reserved` = 5, `quantity` = 5 | No oversell under concurrency |
| 2 | **Order numbers:** 50 simultaneous successful orders produce 50 distinct numbers, strictly increasing from the counter, with no gaps | Unique numbering |
| 3 | A failed (sold-out) order consumes no number and reserves nothing | Atomic rollback |
| 4 | Multi-item cart where the second item is sold out: the first item's reservation is rolled back | Transaction integrity |
| 5 | Pack with 2 Stimpies reserves 1 variant + 2 Stimpies; cancelling releases exactly those | Stock lines |
| 6 | `OUT_FOR_DELIVERY` without a delivery number => `422 DELIVERY_NUMBER_REQUIRED`, status unchanged | Delivery number rule |
| 7 | Every legal transition succeeds and every illegal one returns `INVALID_TRANSITION` (table-driven from the status machine) | State machine |
| 8 | Stock table in [business rules §5](business-rules.md#5-stock-lifecycle): a table-driven test walks each event and asserts `quantity`, `reserved`, line state and movements | Stock lifecycle |
| 9 | Tracking: correct number+phone returns the public view; wrong phone and unknown number return identical `404`s | No order leakage |
| 10 | `POST /orders/find` returns the same `202` for known and unknown emails, and queues an email only for known ones | No account enumeration |
| 11 | Public responses contain no cost fields and no exact stock above the threshold (deep key scan) | No data leaks |
| 12 | Every `/admin/**` route returns `401` without a session; sample routes return `403` for a wrong `Origin` on `POST` | Auth and CSRF |
| 13 | Idempotency: same key twice => one order; second call `200` with the same number | Double submit |
| 14 | Prices ignored from the client; changed `expectedTotalCents` => `PRICE_CHANGED`, nothing reserved | Server-side pricing |
| 15 | Drop not started => `NOT_PURCHASABLE` / `DROP_NOT_STARTED`; after end => `DROP_ENDED`; derived states for all four drop states | Drops |

### 3.2 Further coverage by area

| Area | Tests |
|---|---|
| Validation | Phone formats (`03 123 456`, `+961 71 123 456`, `71123456`, invalid lengths, letters); email shapes; WhatsApp same-as-phone; honeypot; quantity bounds; unknown fields rejected |
| Customers | Upsert by phone updates name/email; order snapshot keeps the old contact after the customer changes; contact edit on an order logs an event |
| Delivery fee | Area fee vs default fee; no area given; fee changes do not affect old orders |
| Emails | Each status queues its email once; no email without an address; master switch and per-template switch; failed send retries then `FAILED`; resend works; placeholders rendered; unknown placeholder rejected at save |
| WhatsApp links | `GET /admin/orders/:id/whatsapp` builds the right number and encoded text per template |
| Holds | Expired `NEW` orders are flagged; extend works; auto-expire cancels and releases when enabled |
| Stock admin | Adjust below reserved rejected; note required; set vs adjust; movements recorded; variant auto-creation when adding a colour or size |
| Options | Duplicate colour/size name => `CONFLICT`; hiding a size hides its variants publicly; size-chart `PUT` replaces atomically |
| Setup checklist | Fresh seed: required items are `TODO` and `complete` is false; setting the WhatsApp number flips `business_whatsapp` to `DONE`; marking a `REVIEW` item persists and can be undone; marking an `AUTO` key is rejected; uploading a 2D image + placement flips `builder_2d`; `complete` becomes true only when every required item is `DONE` |
| Builder | `effectiveMode` table in [business rules §12](business-rules.md#12-builder-mode-resolution); saving without assets returns warnings |
| Search | Order search by number, bare digits, delivery number, phone, email, name |
| Finance | Profit/cash figures on a fixed fixture of delivered, returned and cancelled orders; settle by delivery number |
| Insights | Rate calculations on a fixture |
| Uploads | Type sniffing, size limits, resize, EXIF stripped, SVG with script refused, traversal attempt |
| Rate limits | Limits trigger and reset using the injectable clock |
| Auth | Login success/failure timing-neutral message, lockout, logout invalidates, password change ends other sessions, session expiry (sliding and absolute) |
| OpenAPI | Generated document contains every route in [api-reference.md](api-reference.md) (a script compares the two path lists) |

### 3.3 Non-functional checks (before declaring the backend done)

- **Load:** 200 concurrent catalog reads and 20 concurrent orders complete without errors and with p95 under 300 ms on the dev machine.
- **Restart safety:** kill the API mid-burst of orders, restart, and verify no order is half-written (every order has items, stock lines, and a matching reservation).
- **Migration:** a fresh `migrate deploy` + seed works from nothing; `migrate reset` is repeatable.

---

## 4. Manual verification checklist

Run once before handing the backend to the frontends, using the generated Swagger UI or a REST client:

- [ ] Log in, call `GET /auth/me`, log out, confirm `GET /admin/overview` now returns `401`.
- [ ] Place an order with a wrong email shape and a wrong phone: both field errors appear in `fields`.
- [ ] Place a valid order; open Mailpit and see the "order received" email with the right number and link.
- [ ] Confirm → pack → out for delivery (first without a number, see the error; then with one) → delivered; one email per step in Mailpit.
- [ ] Track the order with the right and the wrong phone.
- [ ] Use "lost order number" with a known and an unknown email; compare responses.
- [ ] Sell out a limited Stimpie and confirm the public catalog flips it to `SOLD_OUT`.
- [ ] Change Builder mode to `3D` with no model and confirm `effectiveMode` is `2D`.
- [ ] Add a colour and a size in the options and confirm zero-stock variants appear in the stock grid.

---

## 5. Operations: backups and recovery

| Item | Rule |
|---|---|
| Backup | `npm run db:backup` → timestamped `mysqldump` (`--single-transaction --routines`) in `backups/` via the Docker container |
| Restore | `npm run db:restore -- <file>` into an empty database; verified once during the hardening phase |
| What to back up | The database and the `uploads/` directory (they belong together) |
| Retention (when deployed) | Nightly, keep 14 days; a copy off the machine |
| Disaster check | Quarterly: restore into a scratch database and open the dashboard against it |
