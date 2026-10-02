# Stimpy — Website & Dashboard Plan

**One hoodie. Multiple identities.**

This document defines the Stimpy website: what it is, what it is for, how it works, how it looks, and how it is built. It covers two connected products:

- **The Website** (public storefront): where customers learn, build their look, and order.
- **The Dashboard** (private admin): where the founder runs orders, stock, drops, and money.

Both share one backend and one database.

> **Detailed documentation lives in [docs/website/](docs/website/README.md)**: the backend (data model, business rules, API contract), the wiring between all parts, and the frontend plan. Where they differ from this overview, the detailed documents win. Two decisions changed since this plan was first written: dashboard login uses **server-side sessions in an HttpOnly cookie** instead of JWT, and local MySQL uses **host port 3317**.

> Source of truth for brand, pricing, and market: [stimpy_master_plan.md](stimpy_master_plan.md) and [identity/stimpy_brand_identity.md](identity/stimpy_brand_identity.md). Where this document makes an assumption the master plan does not cover, it is marked **(assumption)** and collected in [section 14](#14-open-decisions).

---

## Table of Contents

1. [Purpose and Business Goals](#1-purpose-and-business-goals)
2. [How the Two Products Work Together](#2-how-the-two-products-work-together)
3. [The Customer Journey](#3-the-customer-journey)
4. [The Website: Structure and Pages](#4-the-website-structure-and-pages)
5. [The Dashboard: Structure and Tabs](#5-the-dashboard-structure-and-tabs)
6. [Order, Stock and Drop Logic](#6-order-stock-and-drop-logic)
7. [Look and Feel](#7-look-and-feel)
8. [Technical Architecture](#8-technical-architecture)
9. [Database Design](#9-database-design)
10. [API Overview](#10-api-overview)
11. [Security, Abuse and Privacy](#11-security-abuse-and-privacy)
12. [Costs, Metrics and Risks](#12-costs-metrics-and-risks)
13. [Build Phases and Timeline](#13-build-phases-and-timeline)
14. [Open Decisions](#14-open-decisions)

---

## 1. Purpose and Business Goals

### What the website is for

Instagram is where Stimpy is discovered and WhatsApp is where Lebanese customers prefer to order. The website does not replace either. It does the three jobs they do badly:

1. **Explain the system in five seconds.** The zip-swap is the whole product; a feed post cannot let you try it.
2. **Build trust.** Lebanese buyers are burned by products that look different in person and sellers who refuse returns. The site shows real footage, a clear exchange policy, and plain delivery terms.
3. **Turn interest into a recorded order.** Every order is saved the moment it is placed, then confirmed on WhatsApp. No order is lost in a chat.

### What the dashboard is for

Stimpy sells limited, never-restocked drops with cash on delivery. That creates three operational risks the dashboard exists to remove:

- **Overselling** a limited Stimpie.
- **Lost or forgotten orders** buried in WhatsApp threads.
- **Unclear cash:** who owes what, and what the courier has collected.

### Business goals (first 90 days after launch)

| Goal | Target (assumption, adjust after first drop) |
|---|---|
| Orders recorded through the site | 100% of orders, including those started from Instagram DMs (entered manually in the dashboard) |
| Share of orders choosing the $45 two-Stimpie pack | 60%+ (the plan's main product) |
| Extra Stimpie sales per hoodie sold | 0.5+ (the recurring-revenue signal) |
| Order-to-delivered rate | 85%+ (cash on delivery returns are the main leak) |
| Oversold units | 0 |
| Mobile page load on a weak connection | Under 3 seconds to a usable page |

### Non-goals for version 1

- Online card payments (cash on delivery is the norm; revisit later).
- Customer accounts and logins.
- Custom Stimpies (the master plan postpones these).
- A blog.
- Multiple languages (brand rule: English only).
- **Production deployment, hosting, and a domain** (deferred by decision; v1 runs locally, see [section 8.3](#83-environment-local-only-for-now)).
- Courier integrations (delivery is handled by marking an order *Out for delivery* and entering a delivery number).

---

## 2. How the Two Products Work Together

```
                    ┌───────────────────────────┐
  Instagram ──────► │   WEBSITE (public)        │
  (traffic)         │   Next.js storefront      │
                    └─────────────┬─────────────┘
                                  │  REST (JSON)
                    ┌─────────────▼─────────────┐
                    │   API  (Node.js + TS)     │──► WhatsApp (click-to-chat link)
                    │   Fastify, Zod, JWT       │──► Email (order alerts)
                    └─────────────┬─────────────┘
                                  │  SQL
                    ┌─────────────▼─────────────┐
                    │   MySQL                   │
                    └─────────────▲─────────────┘
                                  │  REST (JSON, authenticated)
                    ┌─────────────┴─────────────┐
  Founder ────────► │   DASHBOARD (private)     │
                    │   React single-page app   │
                    └───────────────────────────┘
```

**Rules of the system**

- The **database is the single source of truth.** The website never shows a product, price, stock level, or drop that is not in the database.
- The **dashboard edits what the website shows.** Create a drop, set its quantity and date, and the website's countdown, drop page, and sold-out state follow. No code change, no redeploy.
- The **website writes orders; the dashboard manages them.** A customer places an order on the site; it appears in the dashboard within seconds with status *New*.
- **WhatsApp is the confirmation channel, not the record.** After checkout, the site opens WhatsApp with the order summary pre-filled. If the customer never sends it, the order still exists, and the founder can message them from the dashboard.

---

## 3. The Customer Journey

1. **Discover.** Instagram reel, story, or bio link opens the site on a phone.
2. **Understand.** Hero video shows a real hand zipping a Stimpie on. "How it works" repeats it in three steps.
3. **Play.** The Builder lets them pick a hoodie color and click through Stimpies to see the back change.
4. **Choose.** They pick a pack: hoodie + 2 Stimpies ($45), hoodie + 1 Stimpie ($35), or extra Stimpies ($10–12).
5. **Order.** A single-page checkout asks name, email, phone, WhatsApp number, area, address, and notes. Payment: cash on delivery.
6. **Confirm.** The order is saved, the confirmation page shows the order number, and WhatsApp opens with the order pre-filled.
7. **Track.** The order status page shows where it is, using order number and phone.
8. **Return.** The customer comes back for extra Stimpies and the next drop. The dashboard tracks repeat customers.

**Fallback path:** a customer who DMs on Instagram or WhatsApp instead of using the site is entered manually in the dashboard (*New order* button), so every sale lives in one system.

---

## 4. The Website: Structure and Pages

**Total: 15 public pages**, plus a persistent header, footer, announcement bar, and cart drawer.

### 4.1 Global elements (on every page)

| Element | Contents |
|---|---|
| **Announcement bar** | Controlled from the dashboard. Examples: "Drop 02 live — 48 left", "Cash on delivery across Lebanon". Hidden when empty. |
| **Header** | Full logo (on white), navigation (Shop, Builder, Drops, How it works), cart icon with item count. On mobile: logo, cart, hamburger. |
| **Cart drawer** | Slides in from the right. Line items, quantities, subtotal, delivery estimate, "Checkout" button (electric blue). |
| **Footer** | Navigation, Delivery & Returns, FAQ, Contact, Instagram and WhatsApp links, small icon-only logo. |
| **Floating WhatsApp button** | Bottom-right on mobile and desktop, opens a general chat. |

### 4.2 Page inventory

| # | Page | Route | Purpose |
|---|---|---|---|
| 1 | Home | `/` | Convert and explain |
| 2 | Shop | `/shop` | Browse all hoodies and Stimpies |
| 3 | Hoodie detail | `/shop/hoodie/[slug]` | Hoodie product page |
| 4 | Stimpie detail | `/shop/stimpie/[slug]` | Single Stimpie product page |
| 5 | Builder | `/builder` | Interactive hoodie + Stimpie preview |
| 6 | Drops | `/drops` | Current drop, upcoming, and archive |
| 7 | Drop detail | `/drops/[slug]` | One drop's Stimpies and story |
| 8 | How it works | `/how-it-works` | The zip system in detail |
| 9 | Checkout | `/checkout` | Place the order |
| 10 | Order confirmation | `/order/[number]/thanks` | Success and WhatsApp handoff |
| 11 | Track order | `/track` | Status lookup by order number + phone |
| 12 | Delivery & Returns | `/delivery-returns` | Trust: fees, areas, timing, exchanges |
| 13 | Size guide & FAQ | `/help` | Sizes, care, durability, common questions |
| 14 | About | `/about` | Founder story and brand idea |
| 15 | Legal | `/legal` | Privacy and terms (one page, two sections) |

(A 404 page and a generic error page also exist but are not counted.)

### 4.3 Page details

#### 1. Home `/`
Sections in order:
1. **Hero.** Headline "One hoodie. Multiple identities." over a looping muted video of a real swap. Primary button: **Order now** (electric blue). Secondary: **Try the Builder**. If a drop is live, a countdown strip sits under the hero.
2. **The idea in three steps.** Wear it plain → Zip on a Stimpie → Swap tomorrow. Uses the zip-wipe transition into the next section.
3. **Builder teaser.** A compact version of the Builder, with a "Open full Builder" link.
4. **Packs.** Two cards. The $45 pack is marked **Most popular** and shows "second Stimpie effectively $10". The $35 entry pack sits beside it. A smaller "Extra Stimpies from $10" card follows.
5. **Current drop.** Name, color, remaining units, countdown, button to the drop page.
6. **Core collection.** 3–4 always-available Stimpies.
7. **Trust strip.** Real footage, cash on delivery, delivery across Lebanon, clear exchange policy.
8. **Customer swaps.** Short real videos and reviews (empty-state hidden until content exists).
9. **FAQ preview** with five questions and a link to the full page.

#### 2. Shop `/shop`
- Two tabs: **Hoodies** and **Stimpies**.
- Stimpies tab filters: Core / Limited, Drop, Sold out hidden/shown.
- Product cards: image, name, price, tag (*Core*, *Limited*, *Last few*, *Sold out*).
- Limited Stimpies show remaining units only when under a threshold (e.g. 10), to create urgency honestly.

#### 3. Hoodie detail `/shop/hoodie/[slug]`
- Image gallery (front, bare back, on body).
- Color and size selectors, with stock state per size. The colors and sizes shown are whatever is configured in the dashboard (Products → Options); nothing is hard-coded.
- "Pack" selector: hoodie only / + 1 Stimpie / + 2 Stimpies, with the chosen Stimpies picked inline.
- Price, delivery note, add to cart.
- Details: heavyweight fabric, embroidered chest mark, coral hood-inside detail, one-way zipper system, care.
- Link to size guide.

#### 4. Stimpie detail `/shop/stimpie/[slug]`
- Large image of the Stimpie flat and on a hoodie.
- Name, story line, drop (if any), core or limited label, price, remaining units.
- "Preview on my hoodie" opens the Builder with this Stimpie selected.
- Add to cart (compatible with any hoodie).

#### 5. Builder `/builder`
Included in version 1, with **both a 2D and a 3D mode**. Which mode customers get is chosen in the dashboard (Content → Builder).
- Hoodie color selector (colors come from the dashboard's configured colors).
- A hoodie preview with a carousel of Stimpies. Selecting one plays the zip wipe and swaps the back panel.
- **2D mode:** a flat back-view hoodie with the Stimpie image layered on it. Lightweight, works on any phone.
- **3D mode:** a rotatable 3D hoodie (Three.js) with the Stimpie applied as a texture on the back panel. Drag to spin, tap to swap.
- **Mode setting (dashboard):** *2D only*, *3D only*, or *Both* with a toggle for the customer and a chosen default.
- **Automatic fallback:** if a device can't run WebGL or is on a slow connection, the page falls back to 2D and says nothing alarming about it.
- Shows the running price of the chosen pack and an **Add to cart** button.
- Previews are labeled as previews; real photos are always one tap away.

#### 6. Drops `/drops`
- **Current drop** block: name, drop color as the page accent, countdown, remaining stock, button to enter.
- **Upcoming** block: teaser and date, with a "Notify me" field (WhatsApp number or email) that stores a subscriber.
- **Archive** grid of past drops with a "Sold out — won't return" badge. This supports collectability.

#### 7. Drop detail `/drops/[slug]`
- Drop name and story, using the drop's secondary color (Butter, Sky or Lilac) as accent.
- Grid of that drop's Stimpies with live stock.
- Countdown while upcoming; sold-out state when finished.

#### 8. How it works `/how-it-works`
- Step-by-step with real footage: attach, remove, swap, wear plain.
- Answers to "Does it stay on?", "Can I wash it?", "What does it look like without one?"
- Quality promises from the master plan (tested zip cycles, washing, drape).

#### 9. Checkout `/checkout`
One page, no account.
- **Order summary** (editable quantities).
- **Customer fields:** full name, **email** (required, validated), **phone** (Lebanese format validated, +961), **WhatsApp number** (pre-filled from the phone, with a "same as my phone number" checkbox ticked by default; untick it to enter a different number), area/city, address, optional notes. No account or password is created; the contact details are stored with the order only.
- **Contact consent line:** a short note under the fields: "We'll email you updates about this order and may contact you on WhatsApp about it."
- **Delivery:** the delivery fee comes from the dashboard (a default flat fee, with optional per-area overrides) and is shown before submitting. No courier is chosen by the customer.
- **Payment:** cash on delivery (the only option in v1), stated plainly.
- **Submit button** "Place order" (electric blue). Shows the total including delivery.
- Protection: honeypot field, rate limit, phone validation, and server-side re-check of stock and prices (see [section 6](#6-order-stock-and-drop-logic)).

#### 10. Order confirmation `/order/[number]/thanks`
- **Order number** (e.g. `STP-1042`) shown large with a copy button and the line "Keep this number: it's how you refer back to your order", plus items, total, delivery estimate. See [section 6.7](#67-order-number-vs-delivery-number).
- **"Confirm on WhatsApp"** button opening WhatsApp Business with the order pre-filled.
- Plain-language next steps: we will message you, delivery in X days, pay at the door.
- A line confirming the email address the order confirmation was sent to, with a "wrong email? contact us" link.
- Link to track the order.

#### 11. Track order `/track`
- Inputs: order number and phone number.
- **"Lost your order number?"** link: enter your email and the order numbers on file are emailed to you. The response is identical whether or not the email exists.
- Result: status timeline (Received → Confirmed → Packed → Out for delivery → Delivered), items, and a WhatsApp contact button. Once the order is out for delivery, the **delivery number** is shown.
- Exposes nothing without both values matching.

#### 12. Delivery & Returns `/delivery-returns`
- Delivery fee, timing, and cash on delivery explained, using the values and text set in the dashboard (Content → Policies, Settings).
- Exchange policy in plain terms (sizes, defects, what is and is not accepted).
- This page exists mainly to answer the trust problem described in the master plan.

#### 13. Size guide & FAQ `/help`
- **Tab 1: Size guide.** The size chart table, built entirely from the dashboard (Products → Size chart), plus how to measure.
- **Tab 2: Care.** Washing, zipping, durability.
- **Tab 3: FAQ.** Grouped questions, editable from the dashboard.

#### 14. About `/about`
- The founder telling the story (per the master plan: founder-led feels more real).
- The "split S" logo idea: the hoodie stays, the Stimpie changes.
- Brand personality: confident, clever, playful, clean.

#### 15. Legal `/legal`
- Privacy policy (what is collected: name, phone, address; used only for delivery and order updates).
- Terms of sale.

---

## 5. The Dashboard: Structure and Tabs

**Private, single-user in v1 (the founder), with an architecture that allows adding staff later.**
Runs locally at `http://localhost:5173` for now (a separate app from the website). Protected by login. Never indexed when deployed later.

**Total: 12 pages** in a left sidebar, plus Login. Mobile-friendly, because the founder will check it from a phone.

### 5.1 Layout

- **Left sidebar** (collapses to a bottom bar on mobile): Overview, Orders, Products, Stock, Drops, Customers, Finance, Insights, Content, Deliveries, Settings.
- **Top bar:** global search (order number, delivery number, phone, email, name), a **+ New order** button, notification bell (new orders), user menu.
- **New order sound/badge** while the dashboard is open.

### 5.2 Page inventory

| # | Page | Route | Tabs |
|---|---|---|---|
| 0 | Login | `/login` | — |
| 1 | Overview | `/` | — |
| 2 | Orders | `/orders` | All / New / To pack / Out for delivery / Delivered / Returned & cancelled |
| 3 | Order detail | `/orders/:id` | Summary / Timeline / Notes |
| 4 | Products | `/products` | Hoodies / Stimpies / Packs / Options / Size chart |
| 5 | Stock | `/stock` | Hoodies / Stimpies / Movements |
| 6 | Drops | `/drops` | Upcoming / Live / Archive |
| 7 | Customers | `/customers` | All / Repeat / Subscribers |
| 8 | Finance | `/finance` | Profit / Cash collection / Costs |
| 9 | Insights | `/insights` | Sales / Products / Customers |
| 10 | Content | `/content` | Announcement bar / FAQ / Policies / Homepage / Builder / Emails |
| 11 | Deliveries | `/deliveries` | Out for delivery / Delivered / Fees |
| 12 | Settings | `/settings` | Account / Business / Notifications / Users (later) |

### 5.3 Page details

#### 0. Login
Email and password, with rate limiting and optional two-factor code (see [section 11](#11-security-abuse-and-privacy)). No public registration.

#### 1. Overview
The "open it every morning" page.
- **Get ready to sell (first-run checklist).** Shown at the top until finished. Lists everything the owner must replace or confirm before launch, each with a link to where it is edited in the dashboard: business WhatsApp number, contact emails, hoodie colours, sizes, the size chart, hoodie and Stimpie prices, the delivery fee and estimate text, the policy texts, first stock, and (optional) the 2D and 3D Builder assets. Nothing is hard-coded and nothing needs to be supplied to the developer: the seeded values are placeholders that this checklist flags until they are replaced.
- **Today cards:** new orders, orders to pack, out for delivery, cash to collect, today's revenue.
- **Needs attention:** orders *New* for over 1 hour, orders out for delivery over 3 days, Stimpies under 5 units, failed deliveries.
- **Live drop panel:** units sold vs. total, time remaining.
- **7-day sales** mini chart.
- **Recent orders** list (last 10).

#### 2. Orders
- Table: **order number**, date, customer, phone, area, items, total, status, **delivery number** (blank until out for delivery), payment (cash collected yes/no).
- Search, filters (status, drop, area, date range), and bulk actions (mark packed, export CSV, print delivery sheet).
- **Status tabs** with counts so unconfirmed orders are never missed.
- **WhatsApp** button on each row opens the customer's chat.
- **+ New order** form for DM/WhatsApp orders, pre-filling from existing customers.

#### 3. Order detail
- **Summary tab:** customer, address, items (with Stimpie and size), prices, delivery fee, total, source (Website / Instagram DM / WhatsApp / Manual).
- **Contact block:** the customer's **email, phone, and WhatsApp number**, each with a copy button and a direct action (send email, call, open WhatsApp). The contact details can be corrected here if the customer typed them wrong; the change is logged.
- **Emails sent:** a small list of the automatic emails already sent for this order (type, time, delivered/failed), with a **Resend** button for each.
- Editable status with a confirmation step; changes are logged.
- **Delivery number:** when the status is set to *Out for delivery*, the dashboard asks for a delivery number (free text, e.g. the number on the courier's slip or waybill). The number is saved on the order, shown in the Orders list, searchable, and visible to the customer on the tracking page. It is separate from the order number, which every order already has from the moment it is placed and which never changes ([section 6.7](#67-order-number-vs-delivery-number)).
- Buttons: **Message customer on WhatsApp** (opens the customer's WhatsApp number with a confirmation text pre-filled from a template), **Send email** (free-form message to the customer's email), call, copy address, print label, mark cash collected, cancel (returns stock), create exchange.
- **Timeline tab:** every status change with time and user.
- **Notes tab:** internal notes, never shown to customers.

#### 4. Products
- **Hoodies tab:** name, colors, sizes, price, images, active/hidden.
- **Stimpies tab:** name, slug, images, story line, type (Core or Limited), drop, price, cost, active/hidden.
- **Packs tab:** the bundles ($35 and $45 packs, extra Stimpie price) and their rules. Prices change here, not in code.
- **Options tab:** the master lists the whole shop uses, all editable here.
  - **Colors:** name, swatch (hex), optional hoodie photos, and the tint/texture used by the Builder. Add, reorder, hide.
  - **Sizes:** the list of sizes (for example S, M, L, XL; whatever you define), their order, and visibility.
  - A hoodie's variants (color × size) are generated from these lists. Adding a color or size creates the new variants with zero stock, ready to fill in on the Stock page.
- **Size chart tab:** a table editor. Define the measurement columns (for example Chest, Length, Sleeve) and a row per size with values in cm and optionally inches. The "how to measure" text and diagram are edited here too. The website's Size guide renders directly from this.
- Image upload with automatic resizing.

#### 5. Stock
- **Hoodies tab:** a grid of color × size (using the colors and sizes defined in Products → Options) with quantity, reserved, and available.
- **Stimpies tab:** quantity per Stimpie, reserved, available, with low-stock highlighting.
- **Movements tab:** every stock change (order placed, cancelled, manual adjustment, restock, damaged) with reason and date. Manual adjustments require a reason.
- Setting any available quantity to 0 makes the website show *Sold out* automatically.

#### 6. Drops
- **Upcoming:** create a drop: name, slug, story, accent color (Butter, Sky or Lilac), launch date and time, end date (optional), Stimpies in the drop with quantities, teaser image/video.
- **Live:** units sold vs. total per Stimpie, sell-through speed, ability to end early.
- **Archive:** results per drop (units sold, revenue, sell-out time). Useful for deciding later pricing: the master plan suggests raising prices if a drop sells out quickly.
- Before the launch time, the website shows the countdown only; stock cannot be purchased early.

#### 7. Customers
- **All:** name, email, phone, WhatsApp number, area, orders count, total spent, last order. Searchable by any of the three contact fields. Customers are matched by phone number, so a returning customer's earlier orders are linked automatically even though no account exists.
- **Repeat:** customers with 2+ orders (extra-Stimpie buyers).
- **Subscribers:** people who asked to be notified of drops, with an export for sending WhatsApp broadcasts.
- Customer page shows order history and notes.

#### 8. Finance
- **Profit tab:** revenue, cost of goods (hoodie $10, Stimpie $6, hardware $1 as defaults, editable per product), delivery cost, and ad spend (entered manually) → profit per order and per period. Compared against the margins in the master plan ($18 on the $35 pack, $22 on the $45 pack).
- **Cash collection tab:** cash owed per delivered order, listed by **delivery number**, marked as settled when the money is received. Shows total outstanding.
- **Costs tab:** manual expenses (printing, packaging, ads, shipping supplies, shoots) with category and date.

#### 9. Insights
- **Sales:** revenue and orders over time, by drop, by source (Instagram vs. website), by day of week.
- **Products:** best-selling Stimpies, pack mix ($35 vs $45), extra-Stimpie attach rate, sizes and colors that sell.
- **Customers:** repeat rate, orders by area, delivery success and return rate.

#### 10. Content
Everything the website shows that is text, not product.
- **Announcement bar:** text, link, on/off.
- **FAQ:** add, edit, order, show on home.
- **Policies:** delivery & returns text, size guide, care text, legal pages.
- **Homepage:** hero video/image, current featured drop, customer swap videos and reviews (add, hide).
- **Builder:** controls the website's Builder page.
  - **Mode:** *2D only* / *3D only* / *Both*, and the default shown when both are on.
  - **3D assets:** upload the hoodie 3D model (glTF/GLB) and set which mesh is the back panel; set the lighting preset and default camera angle.
  - **2D assets:** upload the flat back-view hoodie image per color and set where the Stimpie sits on it (position and size, with a live preview).
  - **Per-color look:** choose the tint or texture used for each configured hoodie color in both modes.
  - **Stimpie previews:** each Stimpie's artwork image is reused as the back-panel texture; a per-Stimpie override can be uploaded if the print needs adjusting for 3D.
  - **Preview and publish:** a live preview of the Builder with the chosen settings before saving.
- **Emails:** the automatic emails and WhatsApp message texts sent to customers.
  - **Email templates:** one per event (see [section 6.6](#66-automatic-customer-emails)), each with subject and body, editable with placeholders such as `{customer_name}`, `{order_number}`, `{items}`, `{total}`, `{delivery_number}`. Each can be switched on or off.
  - **WhatsApp message templates:** the pre-filled texts used by "Message customer on WhatsApp" (order confirmation, ready for delivery, out for delivery, delivered), same placeholders.
  - **Branding:** logo and footer text used in all emails, following the brand identity.
  - **Preview and test:** preview each template with sample data and send a test email to yourself.
  - **Email log:** every email sent (to, type, order, time, status). Failed emails are highlighted with a retry button.

#### 11. Deliveries
There is no delivery-partner integration. Delivery is tracked by marking orders and assigning a delivery number.
- **Out for delivery tab:** every order currently with delivery, with its delivery number, customer, area, address, and cash to collect. Select several packed orders and send them out together, entering a delivery number for each. Actions: mark delivered, mark failed/returned, edit the delivery number, print a delivery sheet.
- **Delivered tab:** delivered orders by delivery number with whether the cash has been collected and settled.
- **Fees tab:** the default flat delivery fee, plus optional per-area fees and estimated days (leave empty to use the flat fee). All values are editable, so there is nothing to decide before launch.

#### 12. Settings
- **Account:** email, password, two-factor.
- **Business:** business name, WhatsApp number, support email, Instagram link, order number prefix and first number (applies to new orders only), stock hold time for unconfirmed orders.
- **Notifications:** email and/or WhatsApp alerts to the founder for new orders and low stock.
- **Customer email:** sender name, sender address, reply-to address (customers who reply to an automatic email reach this inbox), and a master on/off switch for all automatic customer emails.
- **Users (later):** staff accounts with roles (owner, packer).

---

## 6. Order, Stock and Drop Logic

### 6.1 Order statuses

```
 New ──► Confirmed ──► Packed ──► Out for delivery ──► Delivered
  │          │            │               │
  └──────────┴────────────┴───────────────┴──► Cancelled
                                              Returned (after dispatch)
```

| Status | Meaning | Stock effect |
|---|---|---|
| New | Placed on the site or entered manually | Reserved |
| Confirmed | Customer confirmed on WhatsApp/phone | Reserved |
| Packed | Ready for the courier | Reserved |
| Out for delivery | Handed to delivery; a **delivery number** is entered | Reserved |
| Delivered | Customer received, cash expected | Sold (reservation becomes a sale) |
| Cancelled | Cancelled before dispatch | Released back |
| Returned | Failed delivery or accepted return | Released back, or written off if damaged |

**Delivery number rule:** an order cannot move to *Out for delivery* without a delivery number. Delivery numbers are saved on the order and are unique per delivery, but several orders can share a number if they travel on the same run (the dashboard warns, not blocks, on duplicates).

### 6.2 Preventing oversell (critical)

Limited Stimpies are never restocked, so overselling is not acceptable.

1. On **Place order**, the API runs one database transaction that, for each item, does a conditional decrement of available stock (`UPDATE ... SET reserved = reserved + :qty WHERE quantity - reserved >= :qty`).
2. If any item fails the condition, the whole transaction rolls back and the customer sees "Sorry, X just sold out" with alternatives.
3. Prices are **never** read from the browser. The server recalculates totals from the database.
4. Unconfirmed orders hold stock for a limited time (**assumption**: 12 hours). The dashboard flags them; the founder can release or extend. Automatic expiry only applies to *New* orders with no response.
5. Cancelling or returning an order writes a stock movement that restores availability.

### 6.3 Drops

- A drop has a **start**, optional **end**, accent color, and Stimpies with quantities.
- Before **start**: the website shows teaser and countdown; checkout rejects those Stimpies.
- At **start** the drop goes live with no redeploy (the server compares against the database time).
- At **zero stock** a Stimpie shows *Sold out*; when all Stimpies in a drop reach zero, the drop moves to the archive as *Sold out — won't return*.
- Core Stimpies have no end date and are expected to be restocked through manual stock adjustments.

### 6.4 WhatsApp handoff

The confirmation page builds a link like:

```
https://wa.me/<number>?text=<URL-encoded order summary>
```

The summary includes order number, items, total, and name. No payment data is involved. It is a convenience link, not a dependency: the order is already saved.

### 6.5 Notifications to the founder (v1)

- Email on each new order with a link to the dashboard order.
- Browser notification and sound while the dashboard is open.
- WhatsApp Business API automation is a later optional upgrade (it costs money and needs approval).

### 6.6 Automatic customer emails

Because the checkout collects the customer's email, the system emails them automatically at each step. No account is needed. Every email carries the order number, an items summary, and a link to the tracking page, and replies go to the reply-to address set in Settings.

| Event | Email | Sent when |
|---|---|---|
| Order placed | **Order received**: summary, total, "pay cash at the door", next steps | Immediately after Place order |
| Confirmed | **Order confirmed**: we've confirmed your order and are preparing it | Status → *Confirmed* |
| Out for delivery | **On its way**: includes the **delivery number** and estimated timing | Status → *Out for delivery* |
| Delivered | **Delivered**: thank-you and a nudge toward extra Stimpies and the next drop | Status → *Delivered* |
| Cancelled | **Order cancelled**: reason if provided | Status → *Cancelled* |

Rules:
- Emails are sent in the background by a queue, so a slow or failing email provider never blocks an order. Failures are retried, then flagged in the email log.
- Each template is editable and can be switched off in Content → Emails.
- Manual **Send email** and **Resend** actions use the same log.
- Emails are transactional (about an order the customer placed), not marketing. Drop announcements go only to people who opted in through "Notify me".
- Locally, outgoing emails are caught by a local mail catcher (such as Mailpit) so they can be read without sending anything real.

**Contact on WhatsApp:** the stored WhatsApp number is used only for the "Message customer on WhatsApp" button, which opens a pre-filled chat from the dashboard. Nothing is sent automatically through WhatsApp in v1.

### 6.7 Order number vs. delivery number

Every order carries two different numbers that serve different people and are created at different times. They are never interchangeable.

| | **Order number** | **Delivery number** |
|---|---|---|
| Purpose | The customer's reference for the order; how anyone refers back to it | Identifies the shipment with delivery |
| Example | `STP-1042` | Whatever is on the delivery slip, e.g. `D-88231` |
| Created | Automatically, the instant the order is placed (website or manual) | By you, when the order is marked *Out for delivery* |
| Created by | The system | You, in the dashboard |
| Can change? | **Never.** Immutable once issued | Yes, it can be corrected |
| Unique? | **Always unique**, one order only | Not necessarily; several orders on one delivery run may share it (warns, doesn't block) |
| Exists for every order? | Yes, from the start | Only once the order has gone out for delivery |
| Customer sees it | Confirmation page, every email, the WhatsApp message, the tracking page | Tracking page and the "On its way" email, once assigned |

**Format and generation**
- Format: a configurable prefix plus a number, e.g. `STP-1042`. The prefix and the first number are set in Settings → Business (default prefix `STP`, first number `1001`).
- Numbers come from a single database counter incremented inside the same transaction that creates the order. Two orders can never get the same number, even if placed at the same instant.
- Numbers are **never reused**. A cancelled or returned order keeps its number, and the next order simply gets the next one. Gaps are normal and harmless.
- Orders entered manually in the dashboard (Instagram DM, WhatsApp) get a number from the same counter, so there is one sequence for all orders.
- Changing the prefix later affects new orders only. Old orders keep the number they were issued.

**Where the order number appears**
- Order confirmation page, with a copy button.
- Every automatic customer email (subject line and body), so the customer can find it by searching their inbox.
- The pre-filled WhatsApp message, so any chat with you starts with the number.
- The tracking page, as the lookup key.
- The printed label and delivery sheet, so the packed parcel matches the dashboard record.
- Everywhere in the dashboard: Orders list, order detail, Overview, Deliveries, Finance, and the global search.

**Looking an order up**
- **Customer:** Track order page, using the order number **and** the phone number from the order. Both must match.
- **Customer who lost the number:** a "Lost your order number?" form on the Track page takes the email address and sends the list of order numbers to the email on file. The page always shows the same message ("If we found orders, we've emailed you") so it cannot be used to check whether an email exists.
- **You:** the dashboard search accepts the order number, the delivery number, a phone number, an email, or a name, and finds the order from whichever the customer quotes. Typing just `1042` finds `STP-1042`.

---

## 7. Look and Feel

Follows [identity/stimpy_brand_identity.md](identity/stimpy_brand_identity.md) exactly. The brand rule is: **the hoodie stays calm, the Stimpies bring the noise.**

### 7.1 Website

| Aspect | Decision |
|---|---|
| Base | White and cream backgrounds for clarity; the full logo "on white" in the header |
| Signature | Coral for key sections, badges, and moments that should feel like Stimpy |
| Premium moments | Black sections (drop teasers, countdown, footer), logo "on black" |
| Calls to action | **Electric blue only** (Order, Place order, Checkout), so the color keeps its impact |
| Drop pages | The drop's secondary color (Butter, Sky or Lilac) as an accent, one at a time |
| Typography | Poppins: Bold for headlines, Medium for subheads, Regular for body |
| Imagery | Real photos and video of the actual product. The hoodie and Stimpie are the hero |
| Motion | The **zip wipe** is the signature transition between sections and in the Builder |
| Sound | Optional zip sound on the Builder swap, muted by default and never autoplaying |
| Tone | Short, punchy English. "Wear it plain. Zip on a Stimpie. Switch it tomorrow." |
| Layout | **Mobile-first**, since nearly all traffic comes from Instagram. Large tap targets, one column |
| Logo rules | No effects, no recolouring, clear space of one solid-half-of-the-S, icon only for favicon |

Text contrast follows the brand table: black on coral, white on black and electric blue, black on butter, sky, lilac and cream.

### 7.2 Dashboard

The dashboard is a work tool, so it is quieter than the storefront but unmistakably Stimpy.

| Aspect | Decision |
|---|---|
| Base | White background, black text, cream for panels |
| Accent | Coral for the active sidebar item and primary highlights |
| Actions | Electric blue for primary buttons; red/green reserved for status meaning only |
| Status colors | New (coral), Confirmed (electric blue), Packed (butter), Out for delivery (sky), Delivered (green), Cancelled/Returned (grey/red). Never rely on color alone; each status also has a text label |
| Typography | Poppins throughout |
| Density | Comfortable tables, large touch targets so the founder can use it one-handed on a phone |
| Dark mode | Optional, using black and coral. Not required for v1 |

---

## 8. Technical Architecture

### 8.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language, shared types between API and frontends |
| Backend | **Node.js + Fastify** | Fast, typed, simple to structure |
| Validation | **Zod** | Same schemas validate requests and generate types |
| Database | **MySQL 8** | Requested; strong transactions for stock control |
| ORM / migrations | **Prisma** | Typed queries and tracked migrations (alternative: Drizzle) |
| Auth | **JWT in HttpOnly cookies** + refresh, `argon2` password hashing | Safer than tokens in local storage |
| Website | **Next.js (React, TypeScript)** | Server-rendered pages give fast loads and proper link previews when shared on Instagram/WhatsApp |
| Dashboard | **Vite + React + TypeScript** (single-page app) | No SEO needs, quick to build; consistent with the Vite already used in this repo |
| UI | **Tailwind CSS** with brand tokens | Colors and Poppins defined once |
| Images | Upload to object storage (Cloudflare R2 or similar), resized via a worker/`sharp` | Fast mobile images |
| Email | Nodemailer behind an adapter: Mailpit locally, a transactional provider (Resend or Brevo) later; sent through a background queue | Automatic customer emails and founder alerts |
| Jobs | A small scheduler (`node-cron` or BullMQ if Redis is added later) | Drop start, reservation expiry, daily summaries |
| Builder | **Three.js** (3D, glTF/GLB model) and layered images (2D), mode chosen at runtime from dashboard settings | Reuses the Three.js work already in `stimpy-video` and `second_video` |
| Testing | Vitest (unit), Playwright (checkout and swap flows) | Orders and stock are the highest-risk code |

### 8.2 Repository layout (monorepo, npm/pnpm workspaces)

```
stimpy-site/
├── apps/
│   ├── api/                 # Fastify API
│   │   ├── src/
│   │   │   ├── modules/     # orders, products, stock, drops, customers, finance, content, auth
│   │   │   ├── plugins/     # db, auth, rate-limit, errors
│   │   │   └── jobs/        # drop scheduler, reservation expiry
│   │   └── prisma/          # schema.prisma + migrations + seed
│   ├── web/                 # Next.js storefront
│   └── admin/               # Vite + React dashboard
├── packages/
│   ├── shared/              # Zod schemas, types, constants (statuses, prices)
│   └── ui/                  # Brand tokens, shared components
├── docker-compose.yml       # MySQL + API for local development
└── README.md
```

### 8.3 Environment: local only, for now

Production deployment, hosting, and a domain are **deliberately out of scope for now**. Version 1 runs entirely on the founder's machine.

| Piece | How it runs locally |
|---|---|
| MySQL | Docker container via `docker-compose.yml` (data kept in a named volume) |
| API | `npm run dev` in `apps/api` (default `http://localhost:4000`) |
| Website | `npm run dev` in `apps/web` (default `http://localhost:3000`) |
| Dashboard | `npm run dev` in `apps/admin` (default `http://localhost:5173`) |
| Images and 3D assets | Saved to a local `uploads/` folder behind a storage interface |
| Email | Logged to the console (or a local mail catcher such as Mailpit) instead of sent |
| Backups | A script that dumps the MySQL database to a local file on demand |
| Secrets | `.env` files, never committed |

**Built to deploy later without rewrites:**
- All configuration (URLs, database, storage, email) comes from environment variables.
- File storage and email sit behind small interfaces, so switching to cloud storage or a real email provider later is a config change plus one adapter.
- The same Docker setup can become the production setup (a small VPS with Docker and HTTPS) when the time comes.

Because nothing is public yet, phone testing happens on the local network (for example `http://<your-pc-ip>:3000`), which is enough to check the mobile layout and the full order flow.

---

## 9. Database Design

Main tables (MySQL, InnoDB, `utf8mb4`). Money is stored as integer **cents** to avoid rounding errors. All tables have `created_at` and `updated_at`.

| Table | Key columns | Notes |
|---|---|---|
| `users` | id, email, password_hash, role, totp_secret | Dashboard users |
| `hoodies` | id, name, slug, base_price_cents, cost_cents, active, images | |
| `colors` | id, name, hex, position, active, builder_tint, builder_texture | Configured in dashboard |
| `sizes` | id, label, position, active | Configured in dashboard |
| `size_chart_columns` | id, label, unit, position | Chest, Length, Sleeve, etc. |
| `size_chart_values` | id, size_id, column_id, value | One cell of the size chart |
| `hoodie_variants` | id, hoodie_id, color_id, size_id, sku, quantity, reserved | Stock lives here; generated from colors × sizes |
| `builder_config` | key, value (JSON) | Mode (`2d`/`3d`/`both`), default, 3D model file, back-panel mesh, camera, 2D placement per color |
| `drops` | id, name, slug, story, accent_color, starts_at, ends_at, status | |
| `stimpies` | id, name, slug, type (`core`/`limited`), drop_id nullable, price_cents, cost_cents, quantity, reserved, images, story, active | |
| `packs` | id, name, rule (hoodie + N Stimpies), price_cents | $35 and $45 packs |
| `customers` | id, name, phone (unique, normalized +961), whatsapp (normalized +961), email, area_id, notes | One row per phone; no password, no login |
| `email_templates` | key, subject, body, enabled | One per event (order received, confirmed, out for delivery, delivered, cancelled) |
| `whatsapp_templates` | key, body | Pre-filled texts for "Message customer" |
| `email_log` | id, order_id nullable, to_email, template_key, status, error, attempts, sent_at | Powers the email log and retries |
| `orders` | id, number (unique, e.g. `STP-1042`, immutable), customer_id, status, source, subtotal_cents, delivery_fee_cents, total_cents, cash_collected, delivery_number nullable, out_for_delivery_at, area_id nullable, address, notes, contact_email, contact_phone, contact_whatsapp, placed_at | Delivery number required when status = out for delivery |
| `order_items` | id, order_id, item_type, item_id, variant_id, name_snapshot, unit_price_cents, unit_cost_cents, qty | Snapshots so history survives price changes |
| `order_events` | id, order_id, from_status, to_status, user_id, note | Audit timeline |
| `stock_movements` | id, item_type, item_id, delta, reason, order_id nullable, user_id | Every change is traceable |
| `areas` | id, name, fee_cents nullable, est_days nullable, active | Optional overrides; the default flat fee lives in `settings` |
| `expenses` | id, category, amount_cents, note, spent_on | Finance tab |
| `ad_spend` | id, channel, amount_cents, spent_on | |
| `subscribers` | id, contact, type (`whatsapp`/`email`), drop_id nullable | "Notify me" |
| `faqs` | id, question, answer, position, show_on_home | |
| `content_blocks` | key, value (JSON) | Announcement bar, hero, policy text |
| `reviews` | id, name, text, media_url, visible | |
| `counters` | name, value | The order-number counter (`order_number`), incremented inside the order transaction so numbers are unique and never reused |
| `settings` | key, value | WhatsApp number, order-number prefix, default delivery fee |

Indexes: unique `orders(number)`, `orders(status, placed_at)`, `orders(customer_id)`, `orders(delivery_number)`, `customers(phone)`, `order_items(order_id)`, `stimpies(slug)`.

---

## 10. API Overview

All JSON, versioned under `/api/v1`. Public routes need no login; admin routes require an authenticated session.

### Public (website)

| Method | Route | Purpose |
|---|---|---|
| GET | `/products/hoodies`, `/products/hoodies/:slug` | Hoodie catalog |
| GET | `/products/stimpies`, `/products/stimpies/:slug` | Stimpie catalog with stock state |
| GET | `/packs` | Pack definitions and prices |
| GET | `/drops`, `/drops/:slug` | Current, upcoming, archive |
| POST | `/drops/:id/subscribe` | "Notify me" |
| GET | `/options` | Configured colors and sizes |
| GET | `/size-chart` | Size chart table and measuring text |
| GET | `/builder/config` | Builder mode, default, and the assets for the chosen mode |
| GET | `/delivery/fees` | Default fee and optional per-area fees |
| GET | `/content` | Announcement bar, FAQ, policies, homepage blocks |
| POST | `/orders` | Place an order (transactional stock reservation) |
| POST | `/orders/track` | Look up by order number + phone |
| POST | `/orders/find` | "Lost your order number?": emails the order numbers on file to the given email; always returns the same response |

### Admin (dashboard)

| Group | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| Overview | `GET /admin/overview` |
| Orders | `GET /admin/orders`, `GET/PATCH /admin/orders/:id`, `POST /admin/orders` (manual), `POST /admin/orders/:id/status`, `POST /admin/orders/:id/delivery` (set delivery number and mark out for delivery), `PATCH /admin/orders/:id/contact` (correct email/phone/WhatsApp), `POST /admin/orders/:id/email` (send or resend an email), `POST /admin/orders/export` |
| Products | CRUD on `/admin/hoodies`, `/admin/stimpies`, `/admin/packs`, `/admin/colors`, `/admin/sizes`, `/admin/size-chart` |
| Stock | `GET /admin/stock`, `POST /admin/stock/adjust`, `GET /admin/stock/movements` |
| Drops | CRUD on `/admin/drops`, `POST /admin/drops/:id/end` |
| Customers | `GET /admin/customers`, `GET /admin/customers/:id`, `GET /admin/subscribers` |
| Finance | `GET /admin/finance/profit`, CRUD on `/admin/expenses`, `/admin/ad-spend`, `POST /admin/orders/:id/cash` |
| Insights | `GET /admin/insights/*` |
| Content | CRUD on `/admin/faqs`, `/admin/content/:key`, `/admin/reviews`, `GET/PUT /admin/builder` (mode, assets, placement), `POST /admin/uploads`, `GET/PUT /admin/email-templates`, `GET/PUT /admin/whatsapp-templates`, `POST /admin/email-templates/:key/test`, `GET /admin/email-log`, `POST /admin/email-log/:id/retry` |
| Deliveries | `GET /admin/deliveries`, `POST /admin/deliveries/dispatch` (bulk send out with delivery numbers), CRUD on `/admin/areas`, `PATCH /admin/settings/delivery-fee` |
| Settings | `GET/PATCH /admin/settings`, user management (later) |

Conventions: Zod-validated input, consistent error format, pagination on lists, ISO-8601 UTC timestamps, idempotency key on `POST /orders` so a double-tap never creates two orders.

---

## 11. Security, Abuse and Privacy

| Risk | Mitigation |
|---|---|
| **Fake or prank cash-on-delivery orders** | Phone format validation, rate limit per IP and per phone, honeypot field, the *Confirmed* status requires WhatsApp/phone confirmation before packing, blocklist of phones with repeated failed deliveries |
| **Oversell** | Transactional conditional stock reservation (section 6.2) |
| **Price tampering** | Server recomputes all prices; client values are ignored |
| **Admin takeover** | argon2 password hashing, HttpOnly + Secure + SameSite cookies, login rate limiting, optional TOTP two-factor, admin on a separate origin |
| **Injection / XSS** | Prisma parameterized queries, Zod validation, output escaping, Content-Security-Policy headers |
| **Order data exposure** | Tracking requires order number **and** phone; no sequential public IDs exposed without the second factor |
| **Data loss** | Nightly backups, tested restore, stock movements and order events as an audit trail |
| **Downtime during a drop** | Caching of read-heavy public endpoints, a load test before each drop, staging rehearsal |
| **Privacy** | Collect only name, email, phone, WhatsApp number, and address. Used for delivery and updates. Privacy page states this. Customers can request deletion |

---

## 12. Costs, Metrics and Risks

### 12.1 Running costs

**Now: $0.** Everything runs locally with free tools (Node.js, MySQL in Docker, Three.js, Tailwind).

**Later, when going live** (estimate, not decided): roughly $7-9 per month for a small server, domain, and storage. Online payment fees would apply only if card payments are added. These are the only recurring costs to expect, and none are needed to build and test the product.

### 12.2 Metrics the dashboard should answer

- Conversion: site visits → orders (add a lightweight privacy-friendly analytics tool, e.g. Plausible or Umami).
- Which Instagram posts drive orders (UTM links on every bio and story link).
- Pack mix and extra-Stimpie attach rate.
- Sell-through speed per drop (informs price increases).
- Delivery success and return rate by area.
- Profit per order and per drop vs. the master-plan margins.

### 12.3 Risks

| Risk | Impact | Response |
|---|---|---|
| Launch window is short (Lebanon hoodie season, October–November) | Missing the season | Ship a minimal v1 first (see section 13); features are cut, not dates |
| Cash-on-delivery returns | Lost margin | Confirm every order before packing; track return rate per area |
| Builder (2D and 3D) is the biggest build item | Delays the first usable version | Build the 2D mode first inside the Builder phase and ship it behind the same dashboard setting; the 3D mode follows, reusing the existing Three.js work. The mode setting means 3D can be switched off at any time if it misbehaves |
| 3D mode is heavy on weak phones | Slow or broken Builder | Automatic fallback to 2D, compressed GLB model and textures, lazy-loaded only when 3D is chosen |
| Solo operation | Founder overload during a drop | Dashboard "needs attention" list; printed delivery sheets; keep ordering to one channel of truth |
| Server outage on drop day | Lost sales and trust | Staging rehearsal, monitoring, backups |
| Poor internet in Lebanon | Slow site | Lean pages, optimized images, Cloudflare caching |

---

## 13. Build Phases and Timeline

The target is to have a complete, locally running product ready before the October-November season, so that going live later is only a deployment step. Durations assume one full-time developer working with Claude; adjust as needed.

### Phase 0: Foundations (about 3 days)
- Monorepo, TypeScript config, Docker Compose with MySQL.
- Prisma schema from [section 9](#9-database-design), migrations, and seed data (a few example colors, sizes, size chart, Stimpies, and packs, all editable from the dashboard).
- Brand tokens (colors, Poppins) in `packages/ui`.
- Local storage and email adapters.

### Phase 1: Core shop and orders (about 2-3 weeks)
**Website:** Home, Shop, Hoodie and Stimpie detail, Checkout, Confirmation, Track, Delivery & Returns, Help (size guide from the dashboard, care, FAQ), About, Legal.
**API:** catalog, configured options and size chart, order placement with transactional stock reservation, tracking, content.
**Dashboard:** Login, Overview, Orders (list, detail, status changes, delivery number, manual order), Products (including Options and Size chart), Stock, Deliveries.

*Exit test:* a test order placed from a phone on the local network appears in the dashboard, moves through to *Out for delivery* (with a delivery number) and *Delivered*, and the stock is correct throughout.

### Phase 2: Builder and drops (about 2 weeks)
- **Builder, 2D mode first**, then **3D mode**, both on the `/builder` page, with Content -> Builder in the dashboard to choose the mode, default, assets, and per-color look. Includes automatic fallback to 2D.
- Drops (website pages and dashboard management), countdown, sold-out automation, "Notify me".
- How it works page; Customers tab and subscribers.

*Exit test:* switching the mode in the dashboard between 2D only, 3D only, and Both changes the website's Builder immediately, and adding a new color in Products -> Options makes it appear in the Builder after its look is set.

### Phase 3: Money and insight (about 1 week)
- Finance (profit, cash collection by delivery number, costs, ad spend).
- Insights.

### Phase 4: Hardening and go-live preparation (about 1 week)
- Automated tests for orders and stock (including the oversell test), Playwright flows for checkout and the Builder.
- Database backup and restore script tested.
- Performance pass on mobile, especially the 3D Builder.
- A deployment guide written (not executed), so production can be set up when decided.

### Later (not scheduled)
- Production deployment: hosting, domain, HTTPS, real email, cloud storage.
- Customer swap videos and reviews on the site.
- Community "Design the next Stimpie" voting page.
- Optional WhatsApp Business automation, staff accounts, courier integration, and online payments if demand justifies.

### Definition of done for the local version
- [ ] Full order -> delivered flow tested on a real phone over the local network.
- [ ] Oversell test: 50 simultaneous orders against 5 units results in exactly 5 orders.
- [ ] A new color, size, and size chart row added in the dashboard appear correctly on the website without any code change.
- [ ] Builder works in 2D only, 3D only, and Both modes, and falls back to 2D when WebGL is unavailable.
- [ ] An order cannot be set to *Out for delivery* without a delivery number, and the number shows in Orders, Deliveries, and the tracking page.
- [ ] Every order gets a unique, never-reused order number at placement (including manual orders and under 50 simultaneous orders), shown on the confirmation page, in every email, in the WhatsApp message, and on the printed label.
- [ ] The dashboard search finds an order from its order number, delivery number, phone, email, or name.
- [ ] "Lost your order number?" emails the numbers on file and gives the same response for unknown emails.
- [ ] Placing an order sends an "Order received" email (visible in the local mail catcher), and each status change sends its matching email with the delivery number included when out for delivery.
- [ ] The order detail page shows the customer's email, phone, and WhatsApp number, and "Message customer on WhatsApp" opens the correct number.
- [ ] Backup script runs and one restore is tested.
- [ ] Privacy and terms pages written.
- [ ] Deployment guide written for later.

---

## 14. Open Decisions

### Settled

| Decision | Outcome |
|---|---|
| Hoodie colors and sizes | Not fixed in code. Configured in the dashboard (Products -> Options) |
| Size chart | Configured in the dashboard (Products -> Size chart) |
| Delivery partner and fees | No partner integration. Orders are marked *Out for delivery* and given a delivery number. The delivery fee is a configurable default, with optional per-area overrides |
| Domain, hosting, production | Deferred. Version 1 is local only; see [section 8.3](#83-environment-local-only-for-now) |
| Builder | In version 1, with both 2D and 3D modes. The dashboard chooses 2D only, 3D only, or Both, plus the default |
| Backend stack | Node.js, TypeScript, MySQL |

### Still assumed (change anytime)

| # | Decision | Current assumption |
|---|---|---|
| 1 | Stock hold time for unconfirmed orders | 12 hours, editable in Settings |
| 2 | Checkout contact | **Settled:** email, phone, and WhatsApp number are all collected (WhatsApp defaults to the phone number). No account |
| 3 | Admin users | Founder only in v1 |
| 4 | Order notifications | Email (logged locally for now) plus in-dashboard alerts; WhatsApp automation later |
| 5 | Analytics | A privacy-friendly tool plus UTM links, added when going live |
| 6 | Who builds it | You with Claude as the developer |
| 7 | Delivery number format | Free text; duplicates warn but do not block, since one run may carry several orders |
| 8 | 3D hoodie model | Needs a hoodie GLB model: reuse or adapt the one in `stimpy-video/app` and `second_video`, or model a new one |
| 9 | Existing assets | Stimpie back-design cards in `stimpy-video/out/stimpies/` and the hoodie work in `second_video/` and `stimpy-video/app/` will be reviewed for Builder and product images |
| 10 | Seed data | A few placeholder colors, sizes, and size-chart values are seeded only so the site is not empty; replace them in the dashboard |
