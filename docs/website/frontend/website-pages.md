# Website Pages (Public Storefront)

## Purpose and audience

This document specifies every page and global element of the public Stimpy website (`apps/web`, Next.js App Router + TypeScript + Tailwind CSS, dev port 3000) so a developer who has never seen the project can build it. It covers route and rendering mode, data, layout (mobile first), components, states, interactions, SEO and accessibility for the 15 public pages plus the global elements. The purchase flow in depth (cart, checkout, confirmation, tracking) is in [checkout-and-order-flow.md](checkout-and-order-flow.md). The API contract is [api-reference.md](../backend/api-reference.md); endpoint names, fields, enums and error codes here match it exactly. Business intent comes from `stimpy_website_plan.md`, visual rules from `identity/stimpy_brand_identity.md`.

Fixed decisions: server-rendered pages for shop and drops (so Instagram/WhatsApp previews work); interactive parts (cart, checkout, builder, countdown) are client components; English only; USD shown as `$45`; cash on delivery; customers mostly arrive on phones from Instagram; no accounts.

## Table of contents

1. [Conventions](#1-conventions)
2. [Shared components](#2-shared-components)
3. [Global elements](#3-global-elements)
4. [Pages](#4-pages)
   - 4.1 Home `/` · 4.2 Shop `/shop` · 4.3 Hoodie detail · 4.4 Stimpie detail · 4.5 Builder · 4.6 Drops · 4.7 Drop detail · 4.8 How it works · 4.9 Checkout · 4.10 Order confirmation · 4.11 Track order · 4.12 Delivery & Returns · 4.13 Size guide & FAQ · 4.14 About · 4.15 Legal (each is a `###` heading under section 4)
5. [Route map](#5-route-map)
6. [Open questions for the API](#6-open-questions-for-the-api)

---

## 1. Conventions

### 1.1 Rendering modes

| Mode | Meaning in Next.js | Used for |
|---|---|---|
| **ISR** | Server component, data fetched with `fetch(url, { next: { revalidate: N } })`. The API sends `Cache-Control: public, max-age=30`, so catalog pages use **30** seconds; content-driven pages use **60** | Catalog, drops, content pages |
| **Dynamic (SSR)** | Server-rendered per request because it reads `searchParams`; its API fetches still use `revalidate` | Shop filters |
| **Client-only** | `"use client"` page body, `robots: noindex` | Checkout, confirmation, tracking results |
| **Shell + client island** | Server-rendered shell and metadata with a client component for the interactive part | Builder, countdowns, forms |

The server reads the API from `API_URL` (default `http://localhost:4000/api/v1`); the browser from `NEXT_PUBLIC_API_URL`. Calls go through the generated `packages/api-client`. Absolute URLs for SEO use `NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`). Because the dashboard changes content without a redeploy, staleness is bounded by the revalidate window; there is no on-demand revalidation in v1 (decision log: [open-questions.md](../open-questions.md)). Fetches of `GET /drops` and `GET /drops/:slug` use `revalidate: 10` (the API sends `max-age=10`, and `no-store` within 60 s of a drop start), so pages that show a drop (Home, Drops, Drop detail, Stimpie detail) revalidate every 10 s; the countdown hand-off in 2.2 covers the exact start.

### 1.2 Money, dates, text

- `formatCents(4500)` -> `$45`; `formatCents(4550)` -> `$45.50` (decimals only when not a whole dollar). Never do arithmetic on formatted strings; the API sends integer cents (`...Cents`).
- Dates arrive as ISO UTC strings and are formatted on the client in the business timezone, `business.timezone` from `GET /content` (default `Asia/Beirut`), using `Intl.DateTimeFormat` with the device locale for wording ("Oct 14, 9:30 PM"). Order and drop times therefore read the same on every device. On the server, render only a neutral `<time datetime>` and format after hydration to prevent a hydration mismatch.
- Long text fields (`policies.*`, `about`, `howItWorks`, `Drop.story`, `Stimpie.story`) are plain text with blank-line paragraphs, `**bold**` and `- ` lists. Render them with the shared `RichText` component, never as raw HTML.

### 1.3 Layout and brand rules (apply to every page)

- Mobile-first: single column, 16 px gutters, tap targets at least 48 px, body text 16 px, no horizontal scroll at 320 px. Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.
- Poppins: Bold headlines, Medium subheads, Regular body. Colours: base white/cream, coral signature, black premium sections, **electric blue only for calls to action** (Order now, Checkout, Place order, Add to cart). Text on coral is black; on black and on electric blue it is white; on butter/sky/lilac/cream it is black.
- Drop accent: the custom `Drop.accentHex` is used on that drop's pages, one drop at a time. Foreground text switches between black and white for contrast.
- Logo: full logo on white in the header; "on black" in black sections; icon-only for favicon; no effects or recolouring.
- All images use `next/image` with explicit width/height or `fill` + aspect ratio to avoid layout shift; the first visible image on each page is `priority`. All image, video and GLB URLs in API responses are absolute (random, immutable file names; `/uploads/*` is served with CORS `*` so WebGL can read textures), so the API's upload host must be listed in `next.config` `images.remotePatterns`. There is no width parameter; `next/image` does the optimising.

### 1.4 State vocabulary used below

| State | Standard handling |
|---|---|
| Loading | Server pages stream with `loading.tsx` skeletons shaped like the final layout; client islands show a `Skeleton` |
| Empty | `EmptyState` with a message and a next action |
| Error | `error.tsx` boundary with `ErrorState` ("Something went wrong", Retry button calling `reset()`); 404 from the API -> `notFound()`. When the failure came from an API error body, the support line "If it keeps happening, message us and quote this code: {requestId}" shows `error.requestId` (also readable from the `X-Request-Id` header). No line for network failures, which have no id. |
| Stimpie statuses | `AVAILABLE`, `LOW` (shows "Last few", plus "{remaining} left" when `remaining` is not null), `SOLD_OUT`, `UPCOMING`, `ENDED`; `purchasable` is the only flag that enables Add to cart |

### 1.5 SEO defaults

Title template `%s | Stimpy`. Default description: "One hoodie. Multiple identities. Zip on a Stimpie, swap it tomorrow. Cash on delivery across Lebanon." Default Open Graph image: `/og-default.png` (1200x630, coral background, main logo). Every page sets canonical URL, `og:title`, `og:description`, `og:image` (absolute), `twitter:card=summary_large_image`. Checkout, confirmation and tracking set `robots: noindex`. `sitemap.xml` is generated from `GET /products/hoodies`, `GET /products/stimpies`, `GET /drops` and the static routes; `robots.txt` disallows `/checkout`, `/order/`, `/track`.

---

## 2. Shared components

Defined once here; pages refer to them by name. All live in `packages/ui` unless marked `web`. Props are TypeScript shapes.

| Component | Props | Behaviour |
|---|---|---|
| `Section` | `{ tone: 'white'\|'cream'\|'black'\|'coral'\|'accent'; accentHex?: string; id?: string; heading?: string; eyebrow?: string; children; zipIn?: boolean }` | Page band with consistent padding (py-12 mobile, py-20 desktop), max width 1200 px. `tone` sets background and matching text colour per the contrast table. `zipIn` plays `ZipWipe` when scrolled into view. |
| `Button` | `{ variant: 'cta'\|'primary'\|'ghost'\|'danger'; size; href?; loading?; disabled? }` | `cta` = electric blue with white text, used only for purchase actions. `primary` = black. Loading shows a spinner and `aria-busy`. |
| `PriceTag` | `{ cents: number; compareAtCents?: number; size?: 'sm'\|'md'\|'lg'; prefix?: string }` | Renders `formatCents`. With `prefix="from"` shows "from $10". |
| `Badge` | `{ kind: 'CORE'\|'LIMITED'\|'LOW'\|'SOLD_OUT'\|'UPCOMING'\|'ENDED'\|'POPULAR'\|'CUSTOM'; label?: string; remaining?: number\|null }` | Maps to copy: Core, Limited, "Last few" (+ "{n} left"), Sold out, "Coming soon", "Won't return" (ended/sold out drops), pack `badge` text (e.g. "Most popular"). Colour is never the only signal; each has text. |
| `ProductCard` | `{ hoodie: HoodieSummary }` | Hoodie tile: image, name, `PriceTag` ("from"), a row of up to 5 small colour dots from `hoodie.colors` (`hex`, with the colour `name` as accessible text; "+n" beyond five; row omitted when `colors` is empty), "Sold out" badge if `inStock` is false. Links to `/shop/hoodie/{slug}`. |
| `StimpieCard` | `{ stimpie: Stimpie; onAdd?: ()=>void; selectable?: boolean; selected?: boolean; showDrop?: boolean }` | Image (`images[0]` ?? `artworkUrl`), name, `PriceTag`, `Badge` for `type` and `status`, drop chip using `drop.accentHex`. Links to `/shop/stimpie/{slug}`. When `purchasable` is false the card is muted and the add button is replaced by the status label. In picker mode (`selectable`) it is a toggle button with `aria-pressed`. |
| `PackCard` | `{ pack: Pack; effectiveExtraCents?: number; highlight?: boolean }` | Name, description, `PriceTag` (`priceCents`), `Badge` from `pack.badge`, optional line "second Stimpie effectively {price}" (see 4.1). Button opens `PackComposer`. |
| `PackComposer` | `{ pack: Pack \| 'HOODIE_ONLY'; preset?: { hoodieSlug?; colorId?; sizeId?; stimpieSlugs?: string[] }; onAdded?: ()=>void }` (`web`) | The pick-pack/colour/size/N Stimpies flow described in checkout-and-order-flow.md 1.3. Emits a `CartItem`. |
| `ColorSwatches` | `{ colors: Color[]; value: number; onChange; disabledIds?: number[] }` | Radio group of round swatches with `Color.hex`; name shown on hover/focus and in text next to the group. |
| `SizeSelector` | `{ sizes: Size[]; variants: HoodieDetail['variants']; colorId: number; value: number\|null; onChange }` | Radio group of size pills; a size is disabled when its variant for `colorId` has `inStock: false`; shows "{n} left" when `remaining` is not null. |
| `QuantityStepper` | `{ value: number; min?: 1; max?: 10; onChange; label: string }` | Minus/plus buttons (48 px) and a number; announces value changes; `max` reflects the contract (1..10). |
| `Countdown` | `{ target: ISODate; label: string; accent?: string; onComplete?: ()=>void; size?: 'sm'\|'lg' }` (`web`, client) | Days/hours/minutes/seconds. Uses the server clock offset (below). Server renders only the static `<time>` text; dates in it are formatted in `business.timezone`. |
| `StatusTimeline` | `{ steps: {status: OrderStatus; label: string}[]; timeline: TimelineEntry[]; current: OrderStatus }` | Vertical on mobile, horizontal at `md`. States done/current/upcoming, uses text plus icons, not colour alone. Handles `CANCELLED`/`RETURNED`. |
| `ZipWipe` | see 2.1 | Signature transition. |
| `RichText` | `{ text: string }` | Safe renderer for the tiny Markdown subset (paragraphs, `**bold**`, `- ` lists). Escapes everything else. |
| `Accordion` | `{ items: {id; question; answer}[]; allowMultiple? }` | Disclosure buttons with `aria-expanded`; answers rendered with `RichText`. |
| `Tabs` | `{ tabs: {id; label}[]; value; onChange; urlParam?: string }` | `role="tablist"`, arrow-key navigation; with `urlParam` the active tab lives in the query string. |
| `DropCard` | `{ drop: Drop; variant: 'live'\|'upcoming'\|'archive' }` | Teaser image/video, name, accent background, state badge, `Countdown` (live: to `endsAt` if set; upcoming: to `startsAt`), units remaining (live), "Sold out — won't return" (archive `SOLD_OUT`) or "Ended" (`ENDED`). |
| `SubscribeForm` | `{ dropId: number; accentHex?: string }` (`web`, client) | "Notify me" form: type toggle (WhatsApp / Email), contact input, calls `POST /drops/{id}/subscribe` with `{ contact, type: 'WHATSAPP'\|'EMAIL' }`. `204` -> "You're on the list." |
| `CopyButton` | `{ text: string; label: string }` | Clipboard copy with polite "Copied" announcement and a fallback. |
| `WhatsAppButton` | `{ number: string \| null; text?: string; variant }` | Builds `https://wa.me/<digits>?text=<encoded>` (digits only). Renders nothing when `number` is null. |
| `EmptyState` / `ErrorState` / `Skeleton` | `{ title; text?; action? }` | Standard states. |
| `FormField` | `{ label; name; error?; hint?; children }` | Label, hint, `aria-describedby`, `aria-invalid`; errors in text with an icon. |
| `TrustStrip` | `{ items?: {icon; text}[] }` | Four short points: Real footage, Cash on delivery, Delivery across Lebanon, Clear exchange policy. |
| `ReviewCard` | `{ review: {name; text; mediaUrl} }` | Short quote with optional video/image. |

### 2.1 `ZipWipe` (the signature transition)

The zip wipe is the brand's motion idea: a zipper pull travels across, opening one scene and closing the other.

| Prop | Type | Notes |
|---|---|---|
| `direction` | `'ltr' \| 'rtl' \| 'up' \| 'down'` | Horizontal for section changes, `up` for the Builder back-panel swap (zips up the hoodie back) |
| `color` | `'coral' \| 'black' \| 'cream' \| 'accent'` | The panel colour that is pulled across |
| `durationMs` | number | 500 for sections, 650 for the Builder swap |
| `trigger` | `'inView' \| 'manual'` | `inView` uses `IntersectionObserver` (threshold 0.35, plays once); `manual` is driven by a `play()` handle |
| `onDone` | function | Called when finished |

Implementation: an absolutely positioned overlay whose visible region is clipped with an animated `clip-path` (a stepped "teeth" edge from a repeating gradient) and a small pull-tab element moving with the edge. Only `transform` and `clip-path` animate (no layout properties). The overlay is `aria-hidden` and `pointer-events: none`; content underneath remains in the DOM and readable at all times. Under `prefers-reduced-motion: reduce` replace it with a 150 ms cross-fade. Optional zip sound exists only in the Builder, muted by default, never autoplays, enabled by a user toggle. Never run more than one wipe at a time on a page and never on route changes (page navigation stays instant).

### 2.2 Countdown and the server clock

Countdowns must not trust the device clock. On mount, the client calls `GET /health` once (`no-store`, CORS-enabled), reads `time` (ISO, millisecond precision), compensates half the round-trip (`offsetMs = serverTime + rtt/2 - Date.now()` measured around the request), and stores it in a shared context used by every `Countdown`. Re-measure when the tab becomes visible after more than 5 minutes. Fallback: the `Date` header of the last API response (second precision only; the API exposes it via CORS); final fallback: device clock. Remaining = `target - (Date.now() + offsetMs)`. The visible text updates every second but the live region (`aria-live="polite"`, `aria-atomic`) only announces at minute changes and at the final minute (every 10 s).

On reaching zero: call `onComplete`, which refetches `GET /drops` with `cache: 'no-store'` (the API itself is `no-store` within 60 s of a start and cached 10 s otherwise), retries every 5 s up to 6 times until the drop `state` changes (the server decides), then refreshes the route (`router.refresh()`). Show "Starting..." in the meantime.

---

## 3. Global elements

Rendered by the root layout (`app/layout.tsx`), which fetches `GET /content` (ISR, 60 s) once for the announcement, footer and WhatsApp number.

### 3.1 Announcement bar

- Data: `GET /content` -> `announcement` (`{ text, linkUrl } | null`). `null` means hide the bar completely (no empty strip).
- Layout: full-width strip above the header, 36-40 px, one line, always a black bar with white text (only `text` and `linkUrl` are configurable), centred; text truncates with ellipsis on small screens; if `linkUrl` exists the whole text is a link. Internal links use `next/link`, external open in a new tab with `rel="noopener noreferrer"`.
- State: dismiss is not offered in v1. It scrolls away with the page (not sticky).
- Accessibility: `role="region" aria-label="Announcement"`; no auto-rotation.

### 3.2 Header

- Data: cart count from the client cart store; nothing from the API.
- Mobile: sticky, 56 px, white. Left: full logo on white (icon + wordmark, links to `/`); right: cart icon with count badge, hamburger. Hamburger opens a full-screen menu (white, large links): Home, Shop, Builder, Drops, How it works, plus Track order and Help as secondary links; focus-trapped, Esc closes.
- Desktop (`lg`): logo left, nav centre (Home, Shop, Builder, Drops, How it works), cart right. Active link is underlined in coral.
- Cart icon opens the cart drawer; count badge hidden at 0 and capped visually at "9+" while the accessible name carries the real number ("Cart, 3 items").
- Behaviour: header shrinks to 48 px after 40 px of scroll; no hide-on-scroll (keeps the cart reachable).
- Accessibility: skip link "Skip to content" first in the DOM; `nav aria-label="Main"`; current page `aria-current="page"`.

### 3.3 Cart drawer

Fully specified in [checkout-and-order-flow.md section 1.5](checkout-and-order-flow.md#15-cart-drawer-behaviour) (re-validation in 1.6). Summary: client component mounted once in the layout; slides in from the right; line items with `QuantityStepper`; subtotal (from `POST /cart/validate`, which the drawer calls when it opens); delivery note from `GET /delivery/fees` `estimateText`; sticky electric-blue "Checkout" button; empty, loading, unavailable-line and error states.

### 3.4 Footer

- Data: `GET /content` -> `business.instagramUrl`, `business.whatsappNumber`, `business.supportEmail`.
- Black section, logo "on black" (icon-only small mark at the bottom). Mobile: single column of accordions-free lists: Shop (Hoodies `/shop`, Stimpies `/shop?tab=stimpies`, Builder, Drops), Help (How it works, Delivery & Returns, Size guide & FAQ `/help`, Track order), Company (About, Legal), Contact (WhatsApp, Instagram, email; each omitted when null). Bottom row: "Cash on delivery across Lebanon", copyright. Desktop: four columns.
- Accessibility: `footer` landmark; link lists labelled; social links have text names (not icon-only).

### 3.5 Floating WhatsApp button

- Data: `business.whatsappNumber`; renders nothing when `null`.
- Fixed bottom-right (16 px inset), 56 px round, white WhatsApp glyph on a coral circle (not the green brand, to stay on-brand) with accessible name "Chat with Stimpy on WhatsApp". Opens `https://wa.me/<digits>?text=Hi%20Stimpy` in a new tab.
- Hidden on `/checkout` (it would cover the sticky Place order bar), and lifted above the cart-drawer's sticky bar if both are shown. Safe-area inset respected on iPhones.

### 3.6 404 and error pages

| File | Behaviour |
|---|---|
| `app/not-found.tsx` | Black section with the icon logo, "That page isn't here." and buttons Shop and Home. Search is not offered. Returns HTTP 404. Triggered by `notFound()` for API `404 NOT_FOUND` on slugs. `noindex`. |
| `app/error.tsx` | "Something went wrong." with Try again (`reset()`) and Home; logs the error digest. Shown for unexpected API failures (5xx, network) on server pages. |
| `app/global-error.tsx` | Minimal self-contained version (no layout dependencies) for root failures. |

---

## 4. Pages

### 4.1 Home `/`

| | |
|---|---|
| Route / mode | `/`, **ISR 10 s** (drop state changes; `GET /drops` is cached 10 s by the API). Countdown, builder teaser and carousels are client islands. |
| Purpose | Convert and explain in five seconds. |

**Data**

| Call | Drives |
|---|---|
| `GET /content` | `homepage.heroHeadline`, `heroSubheadline`, `heroVideoUrl` / `heroImageUrl` (hero), `homepage.featuredDropSlug`, `reviews` (customer swaps), `faqs` where `showOnHome` (FAQ preview, first 5), `howItWorks.steps` (three-step copy when present), `business.timezone` |
| `GET /packs` | Pack cards; `badge` -> `Badge`. "Second Stimpie effectively {x}": from the packs ordered by `stimpieCount`, `x = pack(2).priceCents - pack(1).priceCents`; shown only if both exist and `x > 0` |
| `GET /drops` | If `featuredDropSlug` is set use `GET /drops/:slug`; otherwise `live` ?? `upcoming[0]`. Drives the countdown strip and "Current drop" section (`name`, `accentHex`, `unitsRemaining`, `state`, `startsAt`, `endsAt`) |
| `GET /products/stimpies?type=CORE&includeSoldOut=false` | Core collection (first 4) |
| `GET /products/stimpies` | "Extra Stimpies from {min price}" -> minimum `priceCents` among `purchasable` Stimpies |
| `GET /promotions` | Active promotions and their product targets; the homepage matches target IDs to the public hoodie, Stimpie and pack catalogs |
| `GET /health` (client) | Server clock for `Countdown` (`time`, millisecond precision) |

**Layout, mobile (top to bottom)**

1. **Hero** (black section, ~85 vh): looping muted `playsInline` video (`heroVideoUrl`; poster `heroImageUrl`; the video loads only when `navigator.connection.saveData` is false, otherwise the image is shown). Headline `heroHeadline` (default "One hoodie. Multiple identities."), subheadline, `Button cta` "Order now" (to `/shop`), `Button ghost` "Try the Builder" (to `/builder`).
2. **Drop countdown strip** (only when a live or upcoming drop exists): the drop's `accentHex` background with contrast-aware text, drop name, `Countdown`, link to `/drops/{slug}`. Hidden when no drop.
3. **Current promotions** (omitted when none are active): each promotion name and discount, followed by cards for the products included in it. All-products promotions use the current public catalog; item-specific promotions use their configured targets. Cards link to their product or set and show the current sale price.
4. **The idea in three steps**: "Wear it plain. Zip on a Stimpie. Swap tomorrow." three cards with icons (or `howItWorks.steps` first three, with `mediaUrl`). `ZipWipe` (cream) leads into this section and the next.
5. **Builder teaser**: compact 2D preview (colour swatches + 5 Stimpies carousel) with "Open full Builder" link. Loaded lazily when scrolled near. Hidden if `GET /builder/config` has no usable 2D asset.
6. **Packs**: stacked `PackCard`s: the pack with `badge` "Most popular" first and highlighted (coral border), the entry pack next, then a smaller "Extra Stimpies from {price}" card linking to `/shop?tab=stimpies`.
7. **Current drop**: `DropCard variant="live"` or `upcoming`; omitted when there is none.
8. **Core collection**: horizontally scrollable row of 4 `StimpieCard`s (snap scrolling), "See all" link.
9. **Trust strip** (`TrustStrip`, cream).
10. **Customer swaps**: `ReviewCard` carousel from `reviews`; section omitted when `reviews` is empty.
11. **FAQ preview**: `Accordion` of up to 5 FAQs with "All questions" link to `/help?tab=faq`; omitted when empty.

**Desktop**: hero is two columns (text left, video right); packs sit side by side (3 columns); core collection is a 4-column grid; steps in a row.

**Components**: `Section`, `Button`, `Countdown`, `DropCard`, `PackCard`, `StimpieCard`, `TrustStrip`, `ReviewCard`, `Accordion`, `ZipWipe`, `BuilderTeaser` (`web`, wraps the builder renderer in compact mode).

**States**

| State | Handling |
|---|---|
| Loading | `loading.tsx`: hero block, three grey cards |
| No live/upcoming drop | Steps 2 and 6 omitted |
| Drop `SOLD_OUT`/`ENDED` only | Treated as no current drop (archive lives on `/drops`) |
| No packs | Packs section replaced by a "Shop" button |
| Drop reaches zero while open | `Countdown.onComplete` refetch (2.2) |
| API down | `error.tsx` |

**Interactions**: hero video autoplay muted loop, pauses when off-screen; `ZipWipe` between sections 2-3 once per visit; core carousel supports swipe and keyboard.

**SEO**: title "Stimpy | One hoodie. Multiple identities."; description = default plus the live drop name when one is live; OG image = `homepage.heroImageUrl` ?? `/og-default.png`. JSON-LD `Organization` with name and Instagram URL.

**Accessibility**: hero video has no audio and a pause control (`aria-label="Pause background video"`); video text alternative via the headline; carousels are scroll containers with visible focus and "Previous/Next" buttons; the countdown follows 2.2.

---

### 4.2 Shop `/shop`

| | |
|---|---|
| Route / mode | `/shop?tab=hoodies\|stimpies&type=CORE\|LIMITED&drop=<slug>&soldOut=show\|hide`. **Dynamic SSR** (reads `searchParams`), fetches use `revalidate: 30`. Shareable URLs. |
| Purpose | Browse every hoodie and Stimpie. |

**Data**

| Tab | Call | Fields |
|---|---|---|
| Hoodies | `GET /products/hoodies` | `slug`, `name`, `priceCents`, `images[0]`, `colors[{id,name,hex}]` (colour dots on the card), `inStock` |
| Stimpies | `GET /products/stimpies?type=<CORE\|LIMITED>&drop=<slug>&includeSoldOut=<true\|false>` | `Stimpie` (name, price, `type`, `status`, `remaining`, `drop`, `purchasable`) |
| Drop filter options | `GET /drops` | all drop `slug`/`name` from `live`, `upcoming`, `archive` |

`soldOut=hide` maps to `includeSoldOut=false`; default is show. Upcoming Stimpies are not requested here (`includeUpcoming` stays `false`); they live on drop pages.

**Layout, mobile**: heading "Shop"; `Tabs` (Hoodies / Stimpies); on the Stimpies tab a filter bar of chips (All / Core / Limited), a Drop `select`, and a "Hide sold out" switch (collapsed into a "Filters" bottom sheet on phones); then a 2-column grid of cards. **Desktop**: filters become a left sidebar; grid 3-4 columns.

**Components**: `Tabs`, `ProductCard`, `StimpieCard`, `Badge`, `Section`.

**Cards**: Stimpie card tag is `Badge` from `type` (Core/Limited) plus status (`LOW` -> "Last few" with "{remaining} left" only when `remaining` is not null; `SOLD_OUT` -> "Sold out"). Limited Stimpies show remaining units only when the API provides `remaining` (the server applies the threshold).

**States**: loading skeleton grid (6 cards); empty ("Nothing here yet" with a "Clear filters" button); no Stimpies for a filter ("No Stimpies match. Clear filters."); unknown `drop` slug -> filter ignored and a notice; `GET` failure -> `error.tsx`. Sold-out cards remain visible (muted) unless hidden.

**Interactions**: filters update the URL (`router.replace`, scroll preserved) and re-render on the server; tab change keeps other filters only when relevant. Cards link to detail pages.

**SEO**: title "Shop hoodies and Stimpies"; description "Heavyweight hoodies with a one-way zip system and swappable back panels called Stimpies."; canonical is `/shop` (filter params excluded from the canonical, `noindex` when more than one filter is active to avoid thin pages); OG image = first hoodie image ?? default.

**Accessibility**: tabs follow the ARIA tab pattern; filter changes announce the result count via a polite live region ("12 Stimpies"); the filters sheet is a dialog.

---

### 4.3 Hoodie detail `/shop/hoodie/[slug]`

| | |
|---|---|
| Route / mode | **ISR 30 s** with `dynamicParams = true` (slugs come from the API). The configurator is a client island. |
| Purpose | Sell the hoodie and compose the pack. |

**Data**

| Call | Drives |
|---|---|
| `GET /products/hoodies/:slug` | `name`, `description`, `priceCents`, `images`, `details[]` (bullets), `colors` (+ each `Color.images` for the gallery), `sizes`, `variants[{colorId,sizeId,inStock,remaining}]`, `inStock`. 404 -> `notFound()` |
| `GET /packs` | Pack selector options and prices |
| `GET /products/stimpies?includeSoldOut=true` | Inline Stimpie picker for the chosen pack |
| `GET /delivery/fees` | Delivery note (`estimateText`) |
| `GET /size-chart` | Only to confirm the size guide exists; the link goes to `/help?tab=size` |

**Layout, mobile**

1. Gallery: swipeable images (`Color.images` of the selected colour first, then `images`), dot indicators, pinch/tap zoom.
2. Name, `PriceTag` (hoodie only), short `description`.
3. **Configurator** (`PackComposer`): pack selector as radio cards — "Hoodie only" ($hoodie), then each `Pack` (name, `priceCents`, `badge`); `ColorSwatches`; `SizeSelector` with "Size guide" link; when a pack is chosen, a Stimpie picker row (`StimpieCard` in `selectable` mode) with "Pick {n} Stimpies (x/n)".
4. Sticky bottom bar on mobile: total price for the current selection, and `Button cta` "Add to cart" (disabled until valid). Total = hoodie price or pack `priceCents`.
5. Delivery note: "Cash on delivery. {estimateText}."
6. **Details**: accordion with `details[]` bullets (fabric, embroidered chest mark, coral hood-inside detail, one-way zip system) and care link to `/help?tab=care`.

**Desktop**: two columns; gallery left (thumbnails vertical), configurator right sticky; details below.

**Components**: gallery, `PackComposer`, `ColorSwatches`, `SizeSelector`, `StimpieCard`, `PriceTag`, `Badge`, `Accordion`, `RichText`.

**States**

| State | Handling |
|---|---|
| Colour/size out of stock | Variant `inStock: false` -> size disabled with strike-through and "Sold out" in the accessible name; `remaining` not null -> "Only {n} left" |
| Colour with no in-stock size | Swatch crossed out but selectable to view photos |
| Whole hoodie `inStock: false` | Add to cart disabled, label "Sold out"; Stimpie extras link shown |
| Pack chosen with fewer than N Stimpies | Add to cart disabled, helper text |
| Selected Stimpie becomes unpurchasable | Re-fetched on client focus; the pick is cleared with a notice |
| Added to cart | Drawer opens; button briefly shows "Added" |
| Preselection | `?color=<id>&size=<id>&pack=<slug>&stimpie=<slug>` pre-fill the configurator (used by the Builder and Stimpie pages) |

**Interactions**: choosing a colour swaps the gallery image; no layout shift (fixed aspect ratio).

**SEO**: title "{name}"; description = first 155 characters of `description`; OG image = first of `images`; JSON-LD `Product` with `offers.price` (cents / 100), `priceCurrency: "USD"`, `availability` from `inStock`.

**Accessibility**: swatches and sizes are radio groups with text names; disabled options use `aria-disabled` and explain why in their label; the sticky bar does not trap focus; the gallery has buttons with alt text.

---

### 4.4 Stimpie detail `/shop/stimpie/[slug]`

| | |
|---|---|
| Route / mode | **ISR 10 s** when the Stimpie belongs to a drop (the drop summary changes with the clock), otherwise 30 s; `notFound()` on 404. |
| Purpose | Show one Stimpie and sell it as an extra or send the visitor to the Builder. |

**Data**

| Call | Drives |
|---|---|
| `GET /products/stimpies/:slug` | `name`, `story`, `type`, `priceCents`, `images`, `artworkUrl`, `drop` (`id`, `slug`, `name`, `accentHex`, `startsAt`, `endsAt`; for an `UPCOMING` Stimpie `drop.startsAt` drives the countdown and `drop.id` the Notify me form, so no extra drop request is made), `status`, `remaining`, `purchasable` |
| `GET /products/stimpies?drop=<slug>&includeSoldOut=true` | "More from this drop" row (hidden if no drop) |

**Layout, mobile**: large image of the Stimpie flat (`artworkUrl`), swipe to lifestyle `images`; `Badge`s (type, status); name; `story` via `RichText`; drop chip (accent colour from `drop.accentHex`, links to the drop); `PriceTag`; remaining text only when `remaining` is not null ("Only 4 left"); buttons: `Button cta` "Add to cart" (adds `{ kind: 'stimpie', stimpieId, qty: 1 }`), `Button primary` "Preview on my hoodie" -> `/builder?stimpie={slug}`, and a link "Get it in a pack" -> `/shop?tab=hoodies`. Then "More from this drop". **Desktop**: image left, details right.

**Components**: gallery, `Badge`, `PriceTag`, `QuantityStepper` (1..10 for the add), `StimpieCard` (related row), `Countdown`, `SubscribeForm`.

**States by `status`**

| Status | UI |
|---|---|
| `AVAILABLE` | Add to cart enabled |
| `LOW` | "Last few" badge and "{remaining} left"; quantity stepper max = `min(10, remaining)` |
| `SOLD_OUT` | Add button replaced by "Sold out"; if from a drop, "Won't return" note for LIMITED; link to similar available Stimpies (`GET /products/stimpies?type=<same>&includeSoldOut=false`) |
| `UPCOMING` | "Coming soon", `Countdown` to `drop.startsAt`, `SubscribeForm` with `drop.id`; no Add to cart |
| `ENDED` | "This drop has ended." with link to Shop |

**SEO**: title "{name} Stimpie"; description = first 155 characters of `story`; OG image = `images[0]` ?? `artworkUrl`; `Product` JSON-LD with `availability` mapped from `purchasable`/`status`.

**Accessibility**: status communicated as text; the quantity stepper has labelled buttons; countdown per 2.2.

---

### 4.5 Builder `/builder`

| | |
|---|---|
| Route / mode | Dynamic server-rendered route (it reads share-link `searchParams`) with server-fetched Builder data, server-rendered 2D preview markup, and a hydrated interactive client island. The initial HTML includes the selected Builder state and remains useful without JavaScript. |
| Purpose | Let the visitor try Stimpies on a hoodie, then buy the combination. |

**Initial data (server, passed to the client island)**

| Call | Drives |
|---|---|
| `GET /builder/config` | `effectiveMode` (use this, not `mode`), `defaultView`, `hoodie` (`{ id, slug, name }`: the hoodie the Builder sells), `model3d` (`url`, `sizeBytes`, `backPanelMesh`, `panelAspect`, `camera`, `lighting`), per-colour `tint`/`texture3d`/`hoodieImage2d`/`overlay2d`/`placement2d`, `stimpieTextures` |
| `GET /options` | Colour names and `hex` for the swatches (builder config only has `colorId`) |
| `GET /products/stimpies?includeSoldOut=true` | Carousel: name, `artworkUrl`, price, `status`, `purchasable`. The Builder joins textures to Stimpies by `stimpieId` |
| `GET /packs` | Pack choice and running price |
| `GET /products/hoodies/:slug` with `config.hoodie.slug` | Sizes, colours and variant stock for adding to cart. The Builder always sells `config.hoodie` (set in the dashboard, default the first active hoodie); it no longer guesses the first hoodie from the list |

The page fetches these endpoints in its server component; the browser does not fetch Builder configuration or catalog data on mount. Cache windows follow [builder.md section 2](builder.md#2-data-what-drives-the-builder): configuration and options revalidate after 60 seconds, Stimpies after 30 seconds, and packs and hoodie details after 60 seconds. Dashboard configuration changes are visible within about 90 seconds, accounting for the 60-second Next.js revalidation and the API's 30-second cache. Cart validation remains client-triggered when the cart drawer opens.

Query parameters: `?stimpie=<slug>&color=<id>&pack=<slug>`.

**Layout, mobile**

1. Heading "Build your look" and a small "Preview" label.
2. **Stage** (square, ~100 vw): the hoodie back view. If `effectiveMode` is `BOTH`, a segmented toggle "2D / 3D" (initial `defaultView`).
3. Colour swatches (`ColorSwatches`) — only colours that have a usable preview asset in the active mode and exist in the hoodie's colours.
4. **Stimpie carousel**: horizontally snapping thumbnails; tapping one swaps the panel with `ZipWipe` (direction `up`, 650 ms) and updates the selected name, badge and price.
5. **Pack picker**: Hoodie + 1 / Hoodie + 2 (from `GET /packs`); with a 2-Stimpie pack the user selects which slot they are choosing (Slot 1, Slot 2); the stage shows the active slot's Stimpie.
6. Size selector (`SizeSelector`) for the chosen colour.
7. Sticky bar: running price (pack `priceCents`) and `Button cta` "Add to cart"; link "See real photos" to the Stimpie's detail page.

**Desktop**: stage on the left (large), controls on the right; carousel under the stage.

**Modes**

| `effectiveMode` | Behaviour |
|---|---|
| `2D` | Flat back-view `hoodieImage2d` for the colour with the Stimpie image positioned by `placement2d`: `x`, `y` are the **centre** of the panel as fractions (0..1) of the hoodie image's width and height, `width` is a fraction of the image width, height = panel width / 0.64, `rotation` in degrees clockwise about the centre. When the colour has `overlay2d`, that transparent shading image is drawn over the panel. Pure `img` layering, works on any phone. |
| `3D` | Rotatable Three.js hoodie loaded from `model3d.url` (GLB), `backPanelMesh` receives the Stimpie texture (`stimpieTextures` override ?? `artworkUrl`; panel aspect `model3d.panelAspect`, default 0.64), tint from the colour's `tint` / `texture3d`, camera from `model3d.camera`, lighting preset from `model3d.lighting` (`STUDIO`, `SOFT`, `NIGHT`). Drag to spin, tap thumbnail to swap. Three.js and the model are code-split and loaded only when 3D is used. |
| `BOTH` | Toggle between them; initial view = `defaultView`. |

**Data saver gate:** `model3d.sizeBytes` drives a "Load 3D (about N MB)" button instead of auto-loading when `saveData` is true or the size is large. **Automatic fallback to 2D (silent)**: when WebGL is unavailable (`canvas.getContext('webgl2'|'webgl')` fails), when `navigator.connection.saveData` is true or `effectiveType` is `slow-2g`/`2g`, when the GLB fails to load or takes more than 8 s, or when the context is lost. The toggle is hidden and no error is shown. If 2D assets are also missing, show the static `Color.images[0]` hoodie photo with the Stimpie artwork beside it.

**Components**: `BuilderApp` (`web`), `BuilderStage2D`, `BuilderStage3D`, `ColorSwatches`, `SizeSelector`, Stimpie carousel (`StimpieCard` compact), `PriceTag`, `ZipWipe`.

**States**

| State | Handling |
|---|---|
| Loading | Skeleton stage; 3D shows the 2D image first, then swaps in when ready |
| Config/catalog failure | `ErrorState` with Retry and a link to Shop |
| Stimpie `SOLD_OUT`/`UPCOMING`/`ENDED` | Still previewable (badge shown); "Add to cart" disabled with the reason |
| Colour without assets | Colour hidden for that mode |
| Pack incomplete | Add to cart disabled ("Pick 2 Stimpies") |
| Reduced motion | Wipe becomes a cross-fade; 3D auto-rotate off |
| Sound | A "Zip sound" toggle, off by default; never autoplays |

**Interactions**: swap uses the signature `ZipWipe` over the back panel; 3D drag has inertia, double-tap resets the angle; the preview is explicitly labelled "Preview" and each Stimpie links to real photos.

**SEO**: title "Builder: try Stimpies on your hoodie"; description "Pick a hoodie colour, zip through the Stimpies and see your look before you order."; OG image = `/og-builder.png` (static) ?? default; the shell contains meaningful static text for crawlers.

**Accessibility**: the stage has `role="img"` and a text alternative that updates ("Black hoodie with Neon Koi on the back"); the carousel is a listbox/radio group operable with arrow keys; a non-visual "Choose Stimpie" `select` is available as an alternative; the 3D canvas is not focusable and never traps keyboard input; swap results announce in a polite live region.

---

### 4.6 Drops `/drops`

| | |
|---|---|
| Route / mode | **ISR 10 s** server shell; `Countdown` and `SubscribeForm` are client islands. |
| Purpose | Show the current drop, announce upcoming ones and display the archive (collectability). |

**Data**: `GET /drops` -> `{ live, upcoming, archive }`; `GET /health` (client) for the clock; `POST /drops/:id/subscribe` for Notify me.

**Layout, mobile**

1. Heading "Drops".
2. **Current drop**: `DropCard variant="live"` large, using the drop's `accentHex` as background with contrast-aware text: name, `story` excerpt, `unitsRemaining` ("{n} units left"), `Countdown` to `endsAt` if set, `Button cta` "Enter drop" -> `/drops/{slug}`. Section omitted with an `EmptyState` ("No drop is live right now. The next one is below.") when `live` is null.
3. **Upcoming**: list of `DropCard variant="upcoming"` (`teaserImage`/`teaserVideo`, name, date from `startsAt`, `Countdown`) each with a `SubscribeForm` (type toggle WhatsApp/Email).
4. **Archive**: grid of `DropCard variant="archive"` (muted), `state` `SOLD_OUT` -> "Sold out — won't return", `ENDED` -> "Ended". API order is newest first.

**Desktop**: current drop as a wide two-column banner; upcoming 2-3 columns; archive 3-4 columns.

**States**

| State | Handling |
|---|---|
| Nothing live, nothing upcoming | `EmptyState` "No drops announced yet. Follow us on Instagram." with the Instagram link (`business.instagramUrl`) |
| Subscribe success | `204` -> inline "You're on the list." and the form is replaced; already subscribed is also success (the endpoint is idempotent) |
| Subscribe validation | `400 VALIDATION_ERROR` with `fields.contact` shown under the input: WhatsApp expects a Lebanese number, Email expects an email |
| Subscribe `429 RATE_LIMITED` | "Too many tries. Try again in {n}s." with `n` = `details.retryAfterSeconds` (same as the `Retry-After` header) |
| Countdown reaches zero | Refetch as in 2.2; the card moves from upcoming to current |

**Interactions**: only one drop uses an accent colour at a time on the page's hero; the rest use neutral cards with a small accent chip. `ZipWipe` (black) between the current drop and the upcoming list.

**SEO**: title "Drops: limited Stimpies, never restocked"; description "Current and upcoming Stimpy drops. When a drop sells out, it won't return."; OG image = `live.teaserImage` ?? first upcoming `teaserImage` ?? default.

**Accessibility**: contact type toggle is a radio group; the form's success/error messages are announced (`role="status"`); each countdown has an accessible text label naming the drop.

---

### 4.7 Drop detail `/drops/[slug]`

| | |
|---|---|
| Route / mode | **ISR 10 s**; `notFound()` on 404. Countdown and stock refresh are client islands. |
| Purpose | One drop's story and Stimpies, with live stock. |

**Data**: `GET /drops/:slug` -> `name`, `story`, `accentHex`, `startsAt`, `endsAt`, `state`, `teaserImage`, `teaserVideo`, `unitsRemaining`, `stimpies[]`. While the page is open and `state` is `LIVE`, the client polls `GET /drops/:slug` (`cache: 'no-store'`) every 30 s to refresh `unitsRemaining` and statuses; polling stops when hidden (Page Visibility API).

**Layout, mobile**: hero in the drop's `accentHex` (contrast-aware text) with teaser media, `name`, state badge, `Countdown` (to `startsAt` while `UPCOMING`, to `endsAt` while `LIVE` and set), "{n} units left" when `unitsRemaining` is not null; story (`RichText`); grid of `StimpieCard`s (2 columns); closing block with a pack call-to-action ("Put one on a hoodie": link to `/shop?tab=hoodies`) and, for `UPCOMING`, a `SubscribeForm`. **Desktop**: hero two columns; 3-4 column grid.

**States by `state`**

| `state` | UI |
|---|---|
| `UPCOMING` | Countdown, teaser, cards show "Coming soon" (`status: UPCOMING`, not purchasable); `SubscribeForm` |
| `LIVE` | Live stock, add-to-cart actions on cards, polling |
| `SOLD_OUT` | Banner "Sold out — won't return"; cards muted; link to the archive and the current drop |
| `ENDED` | Banner "This drop has ended."; link to Shop |

Edge cases: a Stimpie reaching `SOLD_OUT` within a live drop updates in place on the next poll; when all sell out, the banner appears; the countdown reaching zero triggers the refetch/refresh sequence in 2.2.

**SEO**: title "{name} drop"; description first 155 characters of `story`; OG image = `teaserImage` ?? first Stimpie `artworkUrl`.

**Accessibility**: the accent hero chooses black or white text based on contrast; polling updates announce only meaningful changes (sold out) in a polite region; countdown per 2.2.

---

### 4.8 How it works `/how-it-works`

| | |
|---|---|
| Route / mode | **ISR 60 s** (content only); video players are client islands. |
| Purpose | Explain the zip system and answer the trust questions. |

**Data**: `GET /content` -> `howItWorks.steps[{title,text,mediaUrl}]`, `howItWorks.promises: string[]` (the quality promises: tested zip cycles, washing, drape) and `howItWorks.faqs[{question,answer}]`. Nothing about the promises is hard-coded.

**Layout, mobile**: black hero "Wear it plain. Zip on a Stimpie. Switch it tomorrow."; numbered steps (attach, remove, swap, wear plain), each with `mediaUrl` (muted looping video or image, lazy-loaded) and `RichText`; `ZipWipe` between steps 1 and 2 only; a **quality promises** list after the steps (each `promises` string as a check-marked list item; section hidden when empty); FAQ `Accordion` from `howItWorks.faqs` ("Does it stay on?", "Can I wash it?", "What does it look like without one?"); closing CTA: `Button cta` "Order now" and "Try the Builder". **Desktop**: steps alternate image left/right.

**States**: no steps -> page shows the static hero and CTA with a short fallback line; media without `mediaUrl` is skipped; empty `promises` or FAQs hide their section; failure -> `error.tsx`.

**SEO**: title "How it works"; description "Zip a Stimpie on, swap it tomorrow. See how the one-way zipper system works."; OG image = first step with `mediaUrl` that is an image ?? default. JSON-LD `FAQPage` from `howItWorks.faqs`.

**Accessibility**: videos are muted, looped, with a pause control and `aria-label`; step order uses an `ol`; media has descriptive alt text or `aria-hidden` when decorative.

---

### 4.9 Checkout `/checkout`

| | |
|---|---|
| Route / mode | **Client-only**, `noindex` (depends on the browser cart and session state). |
| Purpose | Place a cash-on-delivery order in one page, no account. |

Complete specification of fields, validation, area/fee logic, honeypot, idempotency, errors and the submit sequence: [checkout-and-order-flow.md sections 2-4](checkout-and-order-flow.md#2-checkout-page).

**Data**: `GET /delivery/fees` (areas, fees, estimate text); `POST /cart/validate` (on mount, on quantity or area changes, and right before submit; its `totalCents`, which includes delivery, is sent as `expectedTotalCents`); `POST /orders` with header `Idempotency-Key`, the optional `attribution` object (UTM values) and `hp`.

**Layout, mobile**: heading; collapsible Order summary with editable quantities; Your details; Delivery (area, address, notes); Payment text ("Cash on delivery"); consent line; sticky bottom bar with the total and `Button cta` "Place order" (shows the total). **Desktop**: form left, sticky summary right.

**Components**: `FormField`, `QuantityStepper`, `Button`, `PriceTag`, `EmptyState`, sold-out/price-changed dialogs.

**States**: empty cart; loading fees; validation errors; submitting (button locked, "Placing order..."); `SOLD_OUT`, `NOT_PURCHASABLE`, `PRICE_CHANGED`, `RATE_LIMITED`, network failure (all in the flow document); unavailable cart lines block submission.

**SEO**: title "Checkout"; `noindex`; no OG image needed (default).

**Accessibility**: error summary with `role="alert"` and links to fields; every input has a visible label and correct `autocomplete`/`inputmode`; the sticky bar does not cover focused fields (scroll-padding); submit state is announced via `aria-busy` and a polite status.

---

### 4.10 Order confirmation `/order/[number]/thanks`

| | |
|---|---|
| Route / mode | **Client-only**, `noindex`; reads the response handed over from checkout via `sessionStorage`. |
| Purpose | Confirm the order, show its number, hand off to WhatsApp. |

Details in [checkout-and-order-flow.md section 5](checkout-and-order-flow.md#5-confirmation-page).

**Data**: no API call in the normal path (state from `POST /orders`: `order`, `whatsappUrl`, `trackUrl`); `GET /content` (from the layout) for `business.whatsappNumber` and `supportEmail`. The delivery estimate shown is `order.estimateText`, which is authoritative. Without the stored response (another tab or device) the page falls back to Track order; there is no public order read.

**Layout, mobile**: success header; order number large with `CopyButton`; "Keep this number" line; `Button cta` "Confirm on WhatsApp" (hidden if `whatsappUrl` is null); items and totals; next steps; email notice with "Wrong email? Contact us"; "Track your order" link. **Desktop**: single centred column (max 640 px).

**States**: full data; no stored data (reduced view: number from the URL, Track button, WhatsApp contact); clipboard blocked; invalid number in the URL -> `notFound()`.

**SEO**: title "Order placed"; `noindex`.

**Accessibility**: focus moves to the "Order placed" heading on load; copy confirmation is announced; the WhatsApp button states it opens in a new tab.

---

### 4.11 Track order `/track`

| | |
|---|---|
| Route / mode | Static shell with a **client-only** form and result; `noindex`. |
| Purpose | Let a customer see an order's status with order number + phone. |

Details in [checkout-and-order-flow.md section 6](checkout-and-order-flow.md#6-tracking-page-flow).

**Data**: `POST /orders/track` `{ orderNumber, phone }` -> `number`, `status`, `placedAt`, `customerName`, `items`, totals, `deliveryNumber`, `timeline`, `estimateText`, `whatsappNumber`; `POST /orders/find` `{ email }` for "Lost your order number?". Prefill from `?order=`.

**Layout, mobile**: heading; form (order number, phone, `Button primary` "Track order"); "Lost your order number?" link expanding an email form; after a successful lookup, the result: greeting, `StatusTimeline`, delivery number card (only when `deliveryNumber` is not null), items and totals, estimate, WhatsApp button. **Desktop**: form and result in a centred 720 px column; the timeline becomes horizontal.

**States**: idle; loading; not found (identical message for wrong number or wrong phone); validation; `RATE_LIMITED` with wait; network error with Retry; cancelled/returned banners; lost-number success message identical for every email.

**SEO**: title "Track your order"; description "Enter your order number and phone to see where your Stimpy order is."; `noindex`.

**Accessibility**: results region has `aria-live="polite"` and receives focus after a lookup; the timeline is an ordered list with text states; the copy button for the delivery number is labelled.

---

### 4.12 Delivery & Returns `/delivery-returns`

| | |
|---|---|
| Route / mode | **ISR 60 s**. |
| Purpose | Build trust: fees, timing, areas, cash on delivery, exchanges. |

**Data**: `GET /content` -> `policies.deliveryReturns` (the founder's text); `GET /delivery/fees` -> `defaultFeeCents`, `areas[]` (`name`, `feeCents`, `estDays`), `estimateText`.

**Layout, mobile**: heading; a highlight card with the default fee and `estimateText`; a "Cash on delivery" explainer (static short copy: you pay in cash when it arrives); the **fees table** — area, fee (`feeCents ?? defaultFeeCents`), estimate (`estDays` as "{n} working days" or `estimateText`) — rendered as stacked rows on mobile and a real table from `md`; `policies.deliveryReturns` via `RichText` (exchange policy); a contact box (WhatsApp, email); a link to the size guide. 

**States**: no areas -> only the default fee card; empty policy text -> a minimal fallback "Ask us on WhatsApp" with the button; fees call failure -> the policy text still renders and the table is hidden.

**SEO**: title "Delivery & returns"; description "Delivery fees, timing, cash on delivery and our exchange policy."; default OG image. JSON-LD `FAQPage` not used.

**Accessibility**: the table has a caption, `th scope`; stacked mobile rows keep label/value pairs readable by screen readers (`dl`).

---

### 4.13 Size guide & FAQ `/help`

| | |
|---|---|
| Route / mode | `/help?tab=size\|care\|faq`. **ISR 60 s** with the tab rendered server-side from `searchParams` (dynamic). Default tab `size`. Footer links to `/help?tab=faq`. |
| Purpose | Reduce wrong-size and "will it last" doubt. |

**Data**: `GET /size-chart` (`columns`, `rows`, `howToMeasure`); `GET /content` -> `policies.care`, `faqs[]` (`question`, `answer`, `group`; API order). The size chart's `howToMeasure` is the only "how to measure" text (`policies.howToMeasure` was removed from the contract).

**Layout, mobile**: heading; `Tabs` (Size guide, Care, FAQ).
- **Size guide**: size table (rows from `rows`, columns from `columns` with units), horizontally scrollable with a sticky first column; below it the "How to measure" text (`RichText`). Never hard-code sizes or measurements.
- **Care**: `policies.care` via `RichText`.
- **FAQ**: grouped by `group`: one heading per distinct label in order of first appearance, each with its own `Accordion`; FAQs with `group: null` come last under the heading "More questions" (no headings at all when no FAQ has a group). One item open at a time on mobile.
**Desktop**: table at full width; FAQ in two columns.

**States**: empty chart -> "The size guide is coming soon. Ask us on WhatsApp." with the button; empty FAQ/care -> same pattern; unknown `tab` -> default tab.

**SEO**: title per tab ("Size guide", "Care guide", "FAQ"); description per tab; JSON-LD `FAQPage` on the FAQ tab; OG default.

**Accessibility**: the table uses `th scope="col|row"`; scroll container is focusable with a label; tabs per ARIA; accordion buttons have `aria-expanded`.

---

### 4.14 About `/about`

| | |
|---|---|
| Route / mode | **ISR 60 s**. |
| Purpose | Founder story and the brand idea. |

**Data**: `GET /content` -> `about` (founder story, `RichText`), `business.instagramUrl`.

**Layout, mobile**: coral hero with the headline "Two sides. One identity." (static); founder story from `about` (full-width text with a founder photo placeholder slot — an image uploaded through the story text is not supported; the page uses a static brand image); the **split S explainer**: a small illustration of the icon with two captions ("The solid half is the hoodie: it stays." / "The outline half is the Stimpie: it changes."); brand personality tags (confident, clever, playful, clean); CTA to the Builder and Shop. **Desktop**: story in a centred 680 px column with the explainer beside it.

**States**: empty `about` -> only the explainer and CTA; failure -> `error.tsx`.

**SEO**: title "About Stimpy"; description "The story behind the hoodie with a swappable back panel."; OG default (logo on coral).

**Accessibility**: the icon illustration has alt text describing the split S; heading hierarchy h1 then h2s.

---

### 4.15 Legal `/legal`

| | |
|---|---|
| Route / mode | **ISR 60 s**. |
| Purpose | Privacy policy and terms of sale on one page. |

**Data**: `GET /content` -> `policies.privacy`, `policies.terms`.

**Layout, mobile**: heading; a two-link anchor row ("Privacy", "Terms") that jumps to `#privacy` and `#terms`; two sections, each a `RichText` block with an `h2`; last-updated date is not provided by the API and is omitted. **Desktop**: sticky anchor list on the left.

**States**: either text empty -> that section shows "This section is being finalized. Contact us for details." with a contact link.

**SEO**: title "Privacy and terms"; description "How Stimpy handles your data and the terms of sale."; indexable; default OG.

**Accessibility**: anchored headings receive focus when the hash is followed; long text uses readable line length (max 70 characters).

---

## 5. Route map

| Route | API calls | Render mode |
|---|---|---|
| Layout (all pages; the cart drawer also calls `POST /cart/validate`) | `GET /content` | ISR 60 s |
| `/` | `GET /content`, `GET /packs`, `GET /drops` (+ `GET /drops/:slug` if featured), `GET /products/stimpies?type=CORE&includeSoldOut=false`, `GET /products/stimpies`, client `GET /health`, `GET /builder/config` (teaser) | ISR 10 s + islands |
| `/shop` | `GET /products/hoodies` or `GET /products/stimpies?...`, `GET /drops` | Dynamic SSR (fetch revalidate 30) |
| `/shop/hoodie/[slug]` | `GET /products/hoodies/:slug`, `GET /packs`, `GET /products/stimpies?includeSoldOut=true`, `GET /delivery/fees` | ISR 30 s + configurator island |
| `/shop/stimpie/[slug]` | `GET /products/stimpies/:slug`, `GET /products/stimpies?drop=<slug>`, client `GET /health`, `POST /drops/:id/subscribe` | ISR 10 s (30 s without a drop) |
| `/builder` | server: `GET /builder/config`, `GET /options`, `GET /products/stimpies?includeSoldOut=true`, `GET /packs`, `GET /products/hoodies/:slug` (slug from `config.hoodie`) | Dynamic SSR (share-link parameters) + hydrated interactive island; endpoint-specific data revalidation |
| `/drops` | `GET /drops`, client `GET /health`, `POST /drops/:id/subscribe` | ISR 10 s + islands |
| `/drops/[slug]` | `GET /drops/:slug` (also polled), client `GET /health`, `POST /drops/:id/subscribe` | ISR 10 s + polling |
| `/how-it-works` | `GET /content` | ISR 60 s |
| `/checkout` | `GET /delivery/fees`, `POST /cart/validate`, `POST /orders` | Client-only |
| `/order/[number]/thanks` | none normally (session state); `GET /content` from layout | Client-only |
| `/track` | `POST /orders/track`, `POST /orders/find` | Static shell + client-only |
| `/delivery-returns` | `GET /content`, `GET /delivery/fees` | ISR 60 s |
| `/help` | `GET /size-chart`, `GET /content` | ISR 60 s (tab via searchParams) |
| `/about` | `GET /content` | ISR 60 s |
| `/legal` | `GET /content` | ISR 60 s |
| `not-found`, `error` | none | Static / client boundary |

---

## 6. Open questions for the API

The decision log is [../open-questions.md](../open-questions.md); every earlier question from this section (W1-W12) is settled there.

None open; every earlier question is settled in ../open-questions.md
