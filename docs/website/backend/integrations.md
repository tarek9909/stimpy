# Backend: Integrations (Email, WhatsApp, Storage)

**Purpose and audience.** How the backend talks to the outside world: sending email, producing WhatsApp links, storing uploaded files, and generating the OpenAPI contract. Each integration sits behind a small adapter so the local-only setup can be swapped for production services later without touching business code.

## Contents

1. [Email delivery](#1-email-delivery)
2. [Email queue behaviour](#2-email-queue-behaviour)
3. [Email templates](#3-email-templates)
4. [WhatsApp templates](#4-whatsapp-templates)
5. [Placeholders](#5-placeholders)
6. [File storage and uploads](#6-file-storage-and-uploads)
7. [What is deliberately not integrated](#7-what-is-deliberately-not-integrated)

---

## 1. Email delivery

| Aspect | Decision |
|---|---|
| Library | Nodemailer, behind an `EmailTransport` interface with one method: `send({ to, subject, text, html, replyTo, from })` |
| Local | SMTP to Mailpit (`localhost:1025`). Messages are read at `http://localhost:8025`. Nothing leaves the machine |
| Later | A transactional provider (Resend, Brevo, SES). Only the adapter and the SMTP/API credentials change |
| Sender | `settings.email.senderName <senderAddress>`; `Reply-To` is `settings.email.replyTo`, so customer replies reach the founder's inbox |
| Types | **Transactional only** (about an order the customer placed) plus the "lost order number" lookup. Marketing and drop announcements are not sent by the system in v1 |
| Master switch | `settings.email.enabled = false` stops all customer emails (orders still work); founder alerts are controlled separately under `notifications` |

Every message is sent as a multipart text + HTML email. The HTML is generated from the plain-text template body by a single branded layout (white background, coral header bar with the logo mark as text, Poppins-with-system-fallback font stack, black body text, electric-blue button for the tracking link, footer with the support address). Template authors write plain text; they never write HTML. The layout and logo are fixed in v1; the only branding setting is `settings.email.footerText`. `POST /admin/email-templates/:key/preview` renders any template (saved or unsaved edits) through this same layout so the dashboard preview is exact.

---

## 2. Email queue behaviour

1. An event (order placed, status changed, manual send, lookup) calls `enqueueEmail({ orderId?, to, templateKey | custom })`.
2. `enqueueEmail` loads the template (unless custom), fills the [placeholders](#5-placeholders), renders text and HTML, and inserts an `email_log` row with `status = PENDING`, `attempts = 0`, `next_attempt_at = now`. **The rendered subject and body are stored on the row.**
3. The `email-worker` (every 5 s) takes up to 20 due rows (`PENDING` and `next_attempt_at ≤ now`), sets them in-flight, and sends them one by one.
4. Success: `status = SENT`, `sent_at = now`. Failure: `attempts + 1`, store the error, schedule the next attempt (+1 min, +5 min, +30 min); after the 4th failed attempt `status = FAILED`.
5. `POST /admin/email-log/:id/retry` resets a `FAILED` row to `PENDING`.
6. A failed email never changes the order. The Overview shows an `EMAIL_FAILED` attention item.

Rules:
- **At most one email per (order, template) is queued automatically.** A status change that is repeated (for example a corrected delivery number) does not resend; the founder uses **Resend**.
- Skipped, not failed: no `contact_email`, master switch off, or template `enabled = false` => no row is created (the order's timeline still records the status change).
- The worker must be safe to run twice (two API instances): rows are claimed with a conditional update (`WHERE status = 'PENDING' AND id = ?` then check affected rows).
- Tests call the worker function directly with a fake transport; no test sleeps.

**Founder alerts.** On a new order, if `notifications.onNewOrder` and `founderEmail` are set, a plain `founder_new_order` email (number, customer, items, total, link to the order in the dashboard at `ADMIN_URL/orders/:id`) is queued the same way. Low-stock alerts (`onLowStock`) are queued once when an item first drops to the threshold after being above it.

---

## 3. Email templates

Six customer templates, stored in `email_templates`, editable in the dashboard (**Content → Emails**). Defaults (seed copy; tone: confident, clear, friendly, English only):

| Key | Sent when | Default subject | Default body |
|---|---|---|---|
| `order_received` | Order placed | `We got your order {order_number}` | `Hi {customer_name},\n\nThanks for your order. Here's what you asked for:\n\n{items}\n\nTotal to pay at the door: {total} (cash on delivery).\n\nWe'll confirm it shortly. You can follow it any time here: {tracking_url}\n\nKeep your order number: {order_number}.\n\nStimpy\nOne hoodie. Multiple identities.` |
| `order_confirmed` | → `CONFIRMED` | `Order {order_number} is confirmed` | `Hi {customer_name},\n\nYour order {order_number} is confirmed and we're getting it ready.\n\n{items}\n\nTotal: {total} (cash on delivery).\nTrack it: {tracking_url}` |
| `order_out_for_delivery` | → `OUT_FOR_DELIVERY` | `Order {order_number} is on its way` | `Hi {customer_name},\n\nYour order is out for delivery.\n\nDelivery number: {delivery_number}\nOrder number: {order_number}\nTotal to pay: {total}\n\nPlease keep your phone nearby. Track it: {tracking_url}` |
| `order_delivered` | → `DELIVERED` | `Your Stimpy has arrived` | `Hi {customer_name},\n\nYour order {order_number} was delivered. Enjoy it, and try swapping the back.\n\nWant another look? Extra Stimpies zip on in seconds.\n\nStimpy` |
| `order_cancelled` | → `CANCELLED` | `Order {order_number} was cancelled` | `Hi {customer_name},\n\nYour order {order_number} has been cancelled.{cancel_reason}\n\nIf this is a surprise, reply to this email and we'll help.\n\nStimpy` |
| `orders_lookup` | `POST /orders/find` matched | `Your Stimpy order numbers` | `Hi,\n\nHere are the orders linked to this email:\n\n{order_list}\n\nUse an order number and the phone number you ordered with to track it: {tracking_url}\n\nStimpy` |

Notes:
- `{cancel_reason}` renders as `" Reason: …"` when a reason exists, otherwise as an empty string, so the sentence stays clean.
- Subjects must not exceed 200 characters; saving a template that references an unknown placeholder is rejected with `VALIDATION_ERROR`.
- `POST /admin/email-templates/:key/test` renders with sample data (order `STP-1042`, three items, total `$45.00`) and sends to the address given.

---

## 4. WhatsApp templates

WhatsApp is never sent automatically in v1. These templates fill the text of a `wa.me` link that the founder opens from the dashboard (**Message customer on WhatsApp**), and the text that is pre-filled for the *customer* on the confirmation page.

| Key | Used by | Default body |
|---|---|---|
| `order_confirmation` | Dashboard button on a `NEW` / `CONFIRMED` order | `Hi {customer_name}, this is Stimpy. We received your order {order_number}: {items}. Total {total}, cash on delivery. Can you confirm your address and that you'd like us to prepare it?` |
| `ready_for_delivery` | Dashboard button on a `PACKED` order | `Hi {customer_name}, your Stimpy order {order_number} is packed and going out for delivery soon. Please keep your phone nearby.` |
| `out_for_delivery` | Dashboard button on an `OUT_FOR_DELIVERY` order | `Hi {customer_name}, your order {order_number} is out for delivery (delivery number {delivery_number}). Total to pay: {total}.` |
| `delivered` | Dashboard button on a `DELIVERED` order | `Hi {customer_name}, hope you love your Stimpy! If you try swapping the back, send us a photo. Order {order_number}.` |

**Link building** (`GET /admin/orders/:id/whatsapp`): `https://wa.me/<digits of orders.contact_whatsapp without +>?text=<URL-encoded rendered text>`. The response also returns `to` and `text` separately so the dashboard can show a preview and a copy button.

**Customer-side confirmation link** (returned by `POST /orders` as `whatsappUrl`): `https://wa.me/<business number digits>?text=` followed by `Hi Stimpy, I just placed order {order_number}: {items}. Total {total}. My name is {customer_name}.` (fixed text, not editable in v1). It is `null` until `settings.business.whatsappNumber` is set.

The WhatsApp message is a convenience. The order already exists whether or not the customer sends it.

---

## 5. Placeholders

| Placeholder | Value |
|---|---|
| `{customer_name}` | `orders.customer_name` |
| `{order_number}` | e.g. `STP-1042` |
| `{items}` | One line per item: `- Hoodie + 2 Stimpies (Black, M: THE VOID, THE CEDAR) x1` |
| `{total}` | `$58.00` (cents formatted as USD) |
| `{delivery_number}` | The delivery number, or an empty string if none |
| `{tracking_url}` | `WEB_URL/track?order=<number>` |
| `{cancel_reason}` | See §3 |
| `{order_list}` | One line per order: `STP-1042 - 14 Oct 2026 - Delivered - $58.00` |

Rendering rules: unknown placeholders are rejected at save time, never left in an outgoing message; values are inserted as plain text (the HTML layout escapes them); missing values render as empty strings.

---

## 6. File storage and uploads

| Aspect | Decision |
|---|---|
| Interface | `Storage` with `put(buffer, name, mime) → { path, url }`, `delete(path)`, `url(path)` |
| Local implementation | Files saved under `UPLOAD_DIR` (default `apps/api/uploads/`, git-ignored), served read-only at `API_PUBLIC_URL/uploads/<path>` with `Cache-Control: public, max-age=31536000, immutable` (file names are random so they never change) |
| Later implementation | S3-compatible / Cloudflare R2: only the adapter changes; stored `url` values are rebuilt from `path` |
| Allowed types | Images: JPEG, PNG, WebP, SVG. Video: MP4, WebM (max 100 MB). 3D: `.glb` (max 50 MB). Anything else is `VALIDATION_ERROR` |
| Validation | Check the real content type by file signature (magic bytes), not just the extension or header; reject SVGs containing scripts or external references (sanitise or refuse) |
| Image processing | Raster images are auto-rotated, stripped of EXIF metadata, and resized so the long side is at most 2000 px, saved as WebP at quality 85 (PNGs that need transparency stay PNG). Original aspect ratio is kept. Width and height are returned |
| Naming | `YYYY/MM/<random 16 hex>.<ext>`; the original name is kept only in the `uploads` table |
| Deleting | Files are never deleted automatically. A dashboard "unused files" cleanup is a later feature |
| Who may upload | Authenticated dashboard users only; body size limit 100 MB for the upload route, 100 KB for every other route |

---

## 7. What is deliberately not integrated

| Not in v1 | Why / when |
|---|---|
| WhatsApp Business API (automatic sending) | Costs money, needs Meta approval; the `wa.me` link covers the need. Revisit after launch |
| Courier / delivery partner APIs | The business marks orders out for delivery with a delivery number |
| Online card payments | Cash on delivery only |
| SMS | Not needed with email + WhatsApp |
| Analytics service | Added at go-live (privacy-friendly), outside the API |
| Marketing email platform | The subscribers export is enough until volume justifies one |
