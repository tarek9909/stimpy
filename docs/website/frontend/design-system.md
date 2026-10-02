# Design System (packages/ui) - Tokens and Components

## Purpose and audience

This document defines the design tokens and the shared component inventory used by **both** the public website (`apps/web`, Next.js) and the dashboard (`apps/admin`, Vite + React). It lives in code as `packages/ui`: a Tailwind preset that exposes the tokens, plus React components. It is written for the developer who sets up `packages/ui` and for anyone reviewing the visuals.

**Provenance labels.** Every value is tagged:

- **[Brand]**: taken from [identity/stimpy_brand_identity.md](../../../identity/stimpy_brand_identity.md) or [stimpy_website_plan.md](../../../stimpy_website_plan.md). Must not be changed without a brand decision.
- **[Rec]**: a recommendation made in this document because the brand documents are silent. Can be changed by the founder/designer without breaking the brand.

Related: [builder.md](builder.md) (Builder UI), [state-and-errors.md](state-and-errors.md) (loading/empty/error behaviour), [API contract](../backend/api-reference.md) (enums such as `OrderStatus`).

## Table of contents

1. [Principles](#1-principles)
2. [Colour tokens](#2-colour-tokens)
3. [Text and background pairs, and colour rules](#3-text-and-background-pairs-and-colour-rules)
4. [Typography](#4-typography)
5. [Spacing](#5-spacing)
6. [Radii and shadows](#6-radii-and-shadows)
7. [Breakpoints, grid and containers](#7-breakpoints-grid-and-containers)
8. [Iconography](#8-iconography)
9. [Imagery](#9-imagery)
10. [Motion](#10-motion)
11. [Logo usage in the UI](#11-logo-usage-in-the-ui)
12. [Dark sections](#12-dark-sections)
13. [Component inventory](#13-component-inventory)
14. [Tailwind theme mapping](#14-tailwind-theme-mapping)
15. [Visual QA checklist](#15-visual-qa-checklist)
16. [Open questions for the API](#16-open-questions-for-the-api)

---

## 1. Principles

1. **The hoodie stays calm, the Stimpies bring the noise** [Brand]. UI chrome is white/cream/black; colour comes from Coral moments, drop accents and the product imagery.
2. **Electric blue is for actions only** [Brand]. Nothing that is not a clickable call to action is blue.
3. **One secondary colour per view** [Brand: "no more than one or two"; this system tightens it to one, **Rec**]. A drop page uses that drop's Butter/Sky/Lilac; everything else stays primary + electric blue for actions.
4. **Clean over decorated** [Rec]: no gradients, glows, textures or multiple shadows in UI chrome (section 6).
5. **Mobile first** [Brand/plan]: design at 360 x 800, then enhance. Tap targets >= 44 px [Rec].
6. **Tokens only.** Components never contain raw hex values or pixel sizes outside the token scale.
7. **The dashboard is quieter than the storefront** [Brand/plan 7.2]: same tokens, denser layouts, coral limited to the active sidebar item and key highlights.

---

## 2. Colour tokens

### 2.1 Brand palette [Brand]

| Token | Name | Hex | RGB | Role |
|---|---|---|---|---|
| `coral` | Coral | `#FF7A59` | 255, 122, 89 | Signature. Sections, badges, highlights, active nav (dashboard). |
| `black` | Black | `#111111` | 17, 17, 17 | Text, dark sections. |
| `white` | White | `#FFFFFF` | 255, 255, 255 | Default background, text on dark. |
| `blue` | Electric blue | `#2E63FF` | 46, 99, 255 | **Actions only** (primary buttons, countdown call-outs). The announcement bar link is not blue: it is white and underlined on the black bar. |
| `butter` | Butter | `#FFE45C` | 255, 228, 92 | Drop accent (`AccentColor` `BUTTER`). |
| `sky` | Sky | `#5CC8FF` | 92, 200, 255 | Drop accent (`SKY`). |
| `lilac` | Lilac | `#C9B6FF` | 201, 182, 255 | Drop accent (`LILAC`). |
| `cream` | Cream | `#FFF4E6` | 255, 244, 230 | Warm alternative to white; panels; hang-tag backgrounds. |

The API's `Drop.accentHex` (and `Stimpie.drop.accentHex`) is always exactly the brand hex for its `accentColor` (`BUTTER` = `#FFE45C`, `SKY` = `#5CC8FF`, `LILAC` = `#C9B6FF`), so the three tokens above equal what the API returns. The UI still maps the `accentColor` enum to the token (so tokens, not runtime strings, drive styling and text-on-accent contrast), and may use `accentHex` directly only where a hex string is unavoidable (for example Open Graph images).

### 2.2 Supporting neutrals [Rec]

The brand defines no greys. These are needed for borders, disabled text and table lines.

| Token | Hex | Use |
|---|---|---|
| `ink-70` | `#4D4D4D` | Secondary text on white/cream. |
| `ink-55` | `#6B6B6B` | Placeholder/helper text (5.3:1 on white). Never smaller than 14 px. |
| `line` | `#E7E1D8` | Decorative dividers and card borders on white/cream (not for input borders). |
| `line-strong` | `#8A8A8A` | Input, checkbox and control borders (3.4:1 on white, meets the 3:1 non-text rule). |
| `surface` | `#FAF7F2` | Quiet panel background in the dashboard (lighter than cream). |
| `disabled-bg` | `#EFEAE3` | Disabled control fill. |
| `disabled-fg` | `#767676` | Disabled text (conveys inactive, exempt from contrast but kept >= 4.5:1 for legibility). |

### 2.3 Status colours (dashboard) [Brand for the mapping, Rec for green/red/grey hex]

The plan (section 7.2) assigns: New = coral, Confirmed = electric blue, Packed = butter, Out for delivery = sky, Delivered = green, Cancelled/Returned = grey/red. Green and red are not brand colours and are reserved for **status meaning only**.

| Token | Hex | Use |
|---|---|---|
| `success` | `#167A3E` | Delivered pill background, positive deltas, "Saved" text. White text on it is 5.4:1. |
| `danger` | `#C62828` | Returned pill, destructive buttons, error text/borders. White on it 5.6:1; as text on white 5.6:1. |
| `warning` | `#FFE45C` (= `butter`) | Warnings reuse Butter with black text; no new yellow. |
| `info` | `sky` background with black text | Informational banners; electric blue stays reserved for actions. |
| `neutral` | `#6B6B6B` | Cancelled pill (white text, 5.3:1). |

**StatusPill mapping (all 7 `OrderStatus` values):**

| `OrderStatus` | Label | Background | Text | Icon (always shown, plus label) |
|---|---|---|---|---|
| `NEW` | New | `coral` | `black` | circle-dot |
| `CONFIRMED` | Confirmed | `blue` | `white` | check |
| `PACKED` | Packed | `butter` | `black` | package |
| `OUT_FOR_DELIVERY` | Out for delivery | `sky` | `black` | truck |
| `DELIVERED` | Delivered | `success` | `white` | check-double |
| `CANCELLED` | Cancelled | `neutral` | `white` | x-circle |
| `RETURNED` | Returned | `danger` | `white` | undo |

Colour is **never** the only signal: every pill has a text label (plan rule) and an icon. These status colours are semantic and **exempt** from the "one secondary colour per view" rule, which applies to decorative use.

---

## 3. Text and background pairs, and colour rules

### 3.1 Brand pairs [Brand]

| Background | Text colour |
|---|---|
| Coral | Black |
| Black | White |
| White | Black |
| Electric blue | White |
| Butter, Sky, Lilac, Cream | Black |

### 3.2 Measured contrast (calculated with the WCAG relative-luminance formula; re-verify with a tool at implementation) [Rec]

| Pair | Ratio | Verdict |
|---|---|---|
| Black on White | 18.9:1 | AAA |
| White on Black | 18.9:1 | AAA |
| Black on Coral | 7.4:1 | AAA |
| White on Electric blue | 4.8:1 | AA (normal text) |
| Black on Butter | 14.8:1 | AAA |
| Black on Sky | 10.0:1 | AAA |
| Black on Lilac | 10.5:1 | AAA |
| Black on Cream | 17:1 | AAA |
| **White on Coral** | 2.6:1 | **Fails. Never use.** |
| **Coral text on White or Cream** | 2.6:1 | **Fails. Never use coral for text on light backgrounds.** Coral is a fill/graphic colour on light surfaces. |
| Coral text on Black | 7.4:1 | AAA (allowed, for large display accents on dark sections) |
| Electric blue text on White | 4.8:1 | AA: allowed for links on white |
| **Electric blue text on Cream** | 4.4:1 | **Fails by a hair. Links on cream use black text with underline**, or move the link to a white card. |
| **Electric blue text on Black** | 3.9:1 | **Fails for normal text.** Blue buttons on black are fine (white text on the blue fill passes; the 3.9:1 button edge meets the 3:1 non-text rule). |

### 3.3 Colour rules

| # | Rule | Source |
|---|---|---|
| 1 | Primary colours (coral, black, white) must make up the majority of every view. | [Brand] |
| 2 | Electric blue only for calls to action (Add to cart, Order now, Place order, Checkout, primary dashboard buttons) and the countdown call-out. Never for decoration, borders, icons in nav, or headings. | [Brand] |
| 3 | At most one drop/secondary colour (Butter, Sky or Lilac) per view; a drop page uses its own colour only. The StatusPill is the exception in the dashboard. | [Brand], tightened [Rec] |
| 4 | Secondary colours are never used for the logo. | [Brand] |
| 5 | Text colour follows section 3.1 on every filled surface. Components set `color` themselves (via a `tone` prop), consumers cannot pass arbitrary text colours. | [Rec] |
| 6 | Coral is never body-text colour on light backgrounds. | [Rec] (from 3.2) |
| 7 | Red and green are used only for status meaning (Delivered, Returned, errors, success), never as decoration. | [Brand plan 7.2] |
| 8 | Each status or state is conveyed by text or icon in addition to colour. | [Brand plan 7.2] |
| 9 | Focus ring: 3 px solid `black` with 2 px white offset on light surfaces; 3 px solid `white` on dark surfaces. Never remove focus outlines. | [Rec] |

---

## 4. Typography

**Font: Poppins** [Brand], weights Regular 400 (body, captions), Medium 500 (subheads), Bold 700 (wordmark, headlines). Use only these three weights [Brand: Bold / Medium / Regular]. Load via `next/font` (web) and a self-hosted `@font-face` (admin) as `woff2`, Latin subset only, `font-display: swap`, preload 400 and 700. Fallback stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. All copy is English [Brand]. Keep headlines short and punchy [Brand].

### 4.1 Scale [Rec]

Sizes in `rem` (1 rem = 16 px). Fluid values use `clamp()` between mobile (360 px) and desktop (1280 px).

| Token | Role | Mobile / Desktop size | Line height | Weight | Letter spacing | Used for |
|---|---|---|---|---|---|---|
| `display` | Hero headline | 2.5rem / 4.5rem (`clamp(2.5rem, 1.6rem + 3.5vw, 4.5rem)`) | 1.05 | 700 | -0.02em | Hero, drop name on drop page |
| `h1` | Page title | 2rem / 3rem | 1.1 | 700 | -0.015em | One per page |
| `h2` | Section title | 1.5rem / 2.25rem | 1.15 | 700 | -0.01em | Section headings |
| `h3` | Card/sub-section title | 1.25rem / 1.5rem | 1.25 | 700 | 0 | Cards, drawer titles |
| `h4` | Small title | 1.125rem | 1.3 | 500 | 0 | Table headers (dashboard), form groups |
| `lead` | Intro paragraph | 1.125rem / 1.25rem | 1.5 | 400 | 0 | Under headings |
| `body` | Default text | 1rem | 1.5 | 400 | 0 | Everything |
| `body-sm` | Secondary text | 0.875rem | 1.45 | 400 | 0 | Helper text, table cells in dashboard |
| `caption` | Captions, tags | 0.75rem (12 px) | 1.4 | 500 | 0.02em | Badges, timestamps. Never below 12 px. |
| `price` | Prices | 1.25rem-2rem | 1.1 | 700 | 0 | `PriceTag` (tabular numbers) |
| `button` | Button label | 1rem (large 1.125rem) | 1 | 500 | 0.01em | Buttons |

Rules:
- Body text never below 16 px on mobile for inputs (prevents iOS zoom on focus) [Rec].
- Use `font-variant-numeric: tabular-nums` for prices, tables and countdowns [Rec].
- Headlines in sentence case (no all-caps blocks of text); small tags may be uppercase with 0.04em tracking [Rec].
- Maximum line length 65-75 characters for long text (policies, FAQ) [Rec].

---

## 5. Spacing

[Rec] 4 px base unit. Tokens (Tailwind default spacing scale matches):

| Token | px | Typical use |
|---|---|---|
| `1` | 4 | Icon-to-label gap |
| `2` | 8 | Tight gaps |
| `3` | 12 | Input padding vertical, chip gaps |
| `4` | 16 | **Page gutter on mobile**, card padding |
| `5` | 20 | |
| `6` | 24 | Section inner gaps, page gutter from `md` |
| `8` | 32 | Between related blocks, gutter from `lg` |
| `10` | 40 | |
| `12` | 48 | Section padding (mobile) |
| `16` | 64 | Section padding (tablet) |
| `20` | 80 | |
| `24` | 96 | Section padding (desktop) |

Rules: component internals use 4-24; layout uses 32-96. Minimum touch target 44 x 44 px (use padding, not just icon size). Vertical rhythm between stacked sections on the storefront: 48 px mobile, 80 px desktop.

---

## 6. Radii and shadows

### 6.1 Radii [Rec]

| Token | px | Use |
|---|---|---|
| `radius-sm` | 6 | Tags, small chips, table row badges |
| `radius-md` | 12 | Buttons, inputs, selects |
| `radius-lg` | 16 | Cards, drawers (top corners on mobile bottom sheets: 20) |
| `radius-xl` | 24 | Large media tiles, hero media |
| `radius-full` | 9999 | Pills, swatches, avatar |
| Stimpie art | 4% of width | Real panels may have rounded corners; confirm with the physical product (see [builder.md](builder.md#74-how-the-064-stimpie-aspect-maps-onto-the-panel)) |

### 6.2 Shadows [Rec]

The brand is clean, flat and high-contrast. Shadows exist only to separate **floating** layers from the page.

| Token | Value | Allowed on |
|---|---|---|
| `shadow-none` | none | Default for everything: cards, buttons, inputs, tables. Use borders (`line`) instead. |
| `shadow-float` | `0 8px 24px rgba(17,17,17,0.12)` | Popovers, dropdown menus, toasts, sticky Add-to-cart bar |
| `shadow-overlay` | `0 16px 48px rgba(17,17,17,0.20)` | Modals, drawers, bottom sheets |

**Not allowed:** shadows on the logo (brand rule), coloured shadows or glows (the earlier video work used a red glow; it is not part of the UI system), inner shadows, stacked/multi-layer fancy shadows, neumorphism, drop shadows on text, gradient backgrounds (the only gradient permitted is a black-to-transparent scrim under text laid on photos, max 60% opacity, so the text meets contrast), blur/backdrop-filter on content surfaces (a 40% black scrim behind modals is fine), animated shadows.

---

## 7. Breakpoints, grid and containers

### 7.1 Breakpoints [Rec] (Tailwind defaults, min-width)

| Name | px | Notes |
|---|---|---|
| (base) | 0-639 | Design target 360 x 800. One column. |
| `sm` | 640 | Large phones/landscape: two-column product grids. |
| `md` | 768 | Tablets: sidebar appears in the dashboard (below `md` it is a bottom bar). |
| `lg` | 1024 | Desktop: Builder two-column, three-to-four-column grids. |
| `xl` | 1280 | Wide desktop; max container reached. |
| `2xl` | 1536 | Dashboard tables may use extra width. |

### 7.2 Grid and containers

| Item | Website | Dashboard |
|---|---|---|
| Columns | 4 (base), 8 (`md`), 12 (`lg`+) | 4 (base), 12 (`md`+), fluid |
| Gutter | 16 px base, 24 px `md`, 32 px `lg` | 16 px base, 24 px `md`+ |
| Page padding (side) | 16 px base, 24 px `md`, 32 px `lg` | 16 px base, 24 px `md`+ |
| Max content width | **1200 px** (text pages 720 px) | 1440 px for content area (sidebar 240 px expanded / 72 px collapsed, outside this) |
| Product grid | 2 columns base, 3 at `md`, 4 at `lg` | n/a |
| Header height | 56 px mobile, 72 px desktop | Top bar 56 px |

Sticky elements: announcement bar (36-44 px) is not sticky; header is sticky; the mobile Add-to-cart bar sticks to the bottom with `padding-bottom: env(safe-area-inset-bottom)`.

---

## 8. Iconography

[Rec] One icon set for both apps: **Lucide** (`lucide-react`, tree-shaken, MIT). Stroke 2 px at 24 px, `currentColor`, no filled variants, no emoji in UI.

| Rule | Detail |
|---|---|
| Sizes | 16 (inline), 20 (buttons, inputs), 24 (nav, default), 32 (empty states). |
| Colour | Inherit text colour. No blue icons unless inside a blue action. |
| Accessibility | Decorative icons `aria-hidden="true"`. Icon-only buttons must have `aria-label` and a 44 px target. |
| Brand marks | The Stimpy **split S** is not part of the icon set; it comes from logo assets only (section 11). Social icons (Instagram, WhatsApp) are single-colour glyphs in `currentColor`, never in their own brand colours. |
| Payment | "Cash on delivery" uses a plain banknote icon. No card-network logos in v1. |
| Weight | Import individual icons (`lucide-react/icons/...`) to keep bundles small. |

---

## 9. Imagery

Real photos and video of the actual product are the hero [Brand/plan]. Images are served as responsive WebP/AVIF through the framework's image optimiser, with explicit `width`/`height` or `aspect-ratio` so there is no layout shift.

| Surface | Aspect ratio | Rationale / notes |
|---|---|---|
| Stimpie artwork (card, detail, Builder) | **0.64 (800 x 1250), i.e. 16:25** [Brand/assets] | Source files are 800 x 1250. Never crop; use `object-fit: cover` only inside a box that is already 0.64. |
| Hoodie product card and gallery | 4:5 [Rec] | Same as the Builder stage. |
| Product card (Shop grid) | Stimpie 0.64; hoodie 4:5 (grid rows align to the taller) [Rec] | |
| Hero media (mobile) | 9:16 video/poster with `max-height: 80svh` [Rec] | Matches the Instagram video format. |
| Hero media (desktop) | 16:9 [Rec] | |
| Drop teaser | 4:5 image or 9:16 video [Rec] | |
| Drop banner (drop page) | 3:2 mobile, 21:9 desktop [Rec] | |
| Customer review media | 9:16 or 1:1 [Rec] | |
| Open Graph image | 1200 x 630 (1.91:1), < 300 KB [Rec] | See SEO in [state-and-errors.md](state-and-errors.md#16-seo-and-link-previews). |
| Avatar/icon tiles | 1:1 | |

Rules:
- Placeholder colour while loading: `cream` (solid, no shimmer on images, no blur-up tricks) [Rec].
- Hero/LCP images: `priority`/`fetchpriority="high"`; everything below the fold `loading="lazy"`.
- Alt text: product name plus view ("Midnight Cedar Stimpie, flat"). Purely decorative images use `alt=""`.
- Format and budget: product images <= 120 KB each at displayed size; hero poster <= 150 KB.
- No stock-photo people. Photography on cream/white/coral/black backgrounds [Brand].
- Never put text over a photo without a solid or scrim background that meets contrast.

---

## 10. Motion

### 10.1 Tokens [Rec unless noted]

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | Hover/press feedback, checkbox, toggle |
| `--motion-base` | 200 ms | Dropdowns, tabs, small fades, toasts |
| `--motion-slow` | 320 ms | Drawers, modals, bottom sheets |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--motion-zip` | **450 ms** | The zip-wipe in the Builder swap |
| `--ease-zip` | `cubic-bezier(0.65, 0, 0.35, 1)` | Zip-wipe (symmetric ease in-out) |
| `--motion-zip-section` | 600 ms | The zip-wipe as a section transition on the storefront |

The zip wipe is the **signature transition** [Brand/plan 7.1]: between sections on the storefront and in the Builder swap.

### 10.2 Zip-wipe specification

| Property | Spec |
|---|---|
| What | A horizontal line (4 px, `black`, 2 px teeth at 6 px pitch drawn with a repeating gradient) travels **top to bottom** across the element; the incoming content is revealed above the line, the outgoing content remains below it. |
| Mechanism | `clip-path: inset(0 0 X% 0)` on the incoming layer plus a `translateY` on the line element. Animate only `clip-path`, `transform`, `opacity`. |
| Builder swap | 450 ms, `--ease-zip`, frame-by-frame timeline in [builder.md](builder.md#43-zip-wipe-swap-frame-by-frame). |
| Section transition | 600 ms, once per section as it enters the viewport (`IntersectionObserver`, threshold 0.3), at most **one zip-wipe in view at a time**; use it only on section boundaries listed in the plan (idea in three steps -> next section), not on every section. |
| Line colour | `black` on light surfaces, `white` on dark surfaces (section 12). Never a secondary colour. |
| Performance | Wrapper gets `will-change: clip-path, transform` only during the animation. |
| **Reduced motion** | `@media (prefers-reduced-motion: reduce)`: the wipe is replaced by an **instant** swap (Builder) or no transition (sections; content simply appears). Cross-fades up to 120 ms are permitted for non-spatial changes (colour change) but instant is the default. All other transitions drop to `opacity` only, <= 120 ms, no translation, no parallax, no autoplay of the hero video (show the poster with a play button). |
| Sound | Optional zip sound: muted by default, never autoplays, requires a user gesture and a visible toggle. |

General motion rules: no looping decorative animation except the muted hero video; no animation that blocks interaction; skeleton shimmer disabled under reduced motion (static fill).

---

## 11. Logo usage in the UI

Official versions [Brand]: **Main** (coral background), **On black**, **On white**. Files in `identity/` (`stimpy_logo_main.png`, `stimpy_logo_on_black.png`, `stimpy_logo_on_white.png`, `stimpy_icon_*.png`, transparent icon variants). The brand note says the PNGs must be redrawn as **SVG** before production use; the UI should use SVG components (`<Logo variant="full|icon" surface="white|black|coral" />`) once those exist [Rec].

| Surface | Version | Form |
|---|---|---|
| Storefront header (white) | On white | Full logo |
| Storefront footer (black) | On black | Small **icon only** (plan section 4.1) |
| Hero/section on coral background | Main | Full or icon |
| Dark sections (black) | On black | Full |
| Dashboard sidebar (white/cream) | On white | Full when expanded, **icon only** when collapsed |
| Dashboard login page | On white (white card) or Main (coral page background) | Full |
| Favicon / app icon / small spots (< 120 px wide) | Icon (transparent for light bg or dark bg as needed) | Icon only |
| Email header (plain) | On white | Full |
| Loading screen | Main (coral full-bleed) | Icon |

Rules [Brand unless marked Rec]:
- **Clear space** around the logo at least the width of the solid half of the S (roughly half the icon width). Implement as padding token `--logo-clear` = 0.5 x icon width [Rec for the number].
- Minimum sizes: full logo >= 96 px wide, icon >= 20 px [Rec].
- Never recolour outside the three versions, never use a secondary colour, never stretch, rotate, add shadow or effects, never on a busy photo without a solid background behind it.
- Never place the logo on a Butter/Sky/Lilac background (no official version) [Rec]; use the white or black version on a neutral panel instead.
- The logo is not a link-styled element (no underline, no hover colour); the header logo links to `/` with `aria-label="Stimpy home"`.

---

## 12. Dark sections

Black sections are for premium moments: drop teasers, countdown, footer [Brand/plan 7.1].

| Token (semantic) | Light surface | Dark surface (`data-theme="dark"` or class `.surface-dark`) |
|---|---|---|
| `--bg` | white / cream | `#111111` |
| `--fg` | `#111111` | `#FFFFFF` |
| `--fg-muted` | `ink-70` | `#C9C9C9` (11.6:1 on black) [Rec] |
| `--border` | `line` | `rgba(255,255,255,0.18)` |
| `--border-control` | `line-strong` | `#8F8F8F` (5.5:1 on black) |
| `--accent` | coral (fills only) | coral (fills and large text allowed) |
| `--action` | blue fill + white text | blue fill + white text (same) |
| Focus ring | black | white |
| Logo | On white | On black |
| Zip line | black | white |

Rules: a dark section is a full-width band, not a theme for individual components; use the semantic variables so components work on both surfaces; coral may be text on black (7.4:1); blue never as text on black; the dashboard has no dark mode in v1 [plan 7.2: optional later, black + coral]. Photography on dark sections should be product shots on black or transparent PNGs; avoid white-background photos on black (use a cream card).

---

## 13. Component inventory

Used by: **W** = website, **A** = admin dashboard. All components accept `className` for layout only, forward refs, support `disabled`/`loading` where it makes sense, and are keyboard accessible.

### 13.1 Primitives and form controls

| Component | Apps | Purpose | Variants | States | Notes |
|---|---|---|---|---|---|
| **Button** | W A | Actions | `primary` (blue fill, white text) - **the only blue button**, one per view region; `secondary` (black outline on light / white outline on dark); `ghost` (text only, black); `coral` (coral fill, black text, for marketing highlights like "Try the Builder"); `danger` (danger fill, white text, dashboard only); sizes `sm` (36 px, dashboard tables only), `md` (44 px default), `lg` (52 px, mobile CTAs) | default, hover, focus-visible, active, disabled, `loading` (spinner replaces icon, label stays, width fixed, `aria-busy`) | Full-width option. Icon + label or icon-only (needs `aria-label`). Never two primary blue buttons adjacent. |
| **LinkButton / TextLink** | W A | Navigation | `inline` (underlined, black), `action` (blue, white backgrounds only) | hover, focus, visited not styled | External links get `rel` and an icon. |
| **Input** | W A | Text, email, tel, number, password, search | `default`, `with-prefix` (e.g. +961), `with-suffix` | default, focus, filled, error (danger border + message), disabled, read-only | Label always visible above (no placeholder-only labels). Min 44 px height, 16 px font. Helper text slot. `inputmode` set properly (`tel`, `email`, `numeric`). |
| **Textarea** | W A | Notes, messages | auto-grow optional | same | Character counter optional. |
| **Select** | W A | Pick from a list (area, status filter) | native `<select>` styled (default), `Combobox` (searchable, dashboard) | same + open | Use native select on mobile for usability. |
| **Checkbox** | W A | Boolean choice ("same as my phone number") | default, with description | unchecked, checked, indeterminate, error, disabled, focus | 24 px box in a 44 px hit area. |
| **Radio / RadioGroup** | W A | Single choice (mode, lighting) | default, `card` variant (selectable card) | same | Arrow-key navigation. |
| **Switch** | A | On/off settings (email template enabled) | default | on, off, disabled, loading | Label required; state text visible ("On"/"Off"), not colour alone. |
| **Segmented control** | W A | 2-4 exclusive options (2D/3D, pack choice, Hoodies/Stimpies tab) | default | selected, focus | `role="radiogroup"`. |
| **QuantityStepper** | W | Cart/line quantity (1..10 per API) | default | min, max, disabled | +/- 44 px buttons, live value announced. |
| **FileUpload** | A | Image, video, GLB upload via `POST /admin/uploads` | `image` (preview thumb), `model` (GLB, shows parsed stats), `video` | empty, drag-over, uploading (progress), success, error (code message), replacing | Shows size limits (images resized to <= 2000 px, video <= 100 MB, GLB <= 50 MB per contract), accepted types, remove button. Camera/gallery on mobile. |
| **ColorPicker** | A | Hex pickers (colour, tint) | default | focus, error | Text hex field + native `<input type="color">` + swatch; validates `#RRGGBB`. |
| **DatePicker / DateTimeInput** | A | Drop start/end, ranges | date, datetime, range | default, error | Native `<input type="datetime-local">` acceptable in v1; show the timezone label beside it, taken from `business.timezone` (default `Asia/Beirut`), not hard-coded. |
| **SearchField** | A | Global search (order number, phone, name) | default, with-results dropdown | default, loading | Debounce 250 ms. Shortcut `/` focuses (desktop). |
| **FormField** | W A | Label + control + helper + error wrapper | n/a | error (links `aria-describedby`) | Maps API `fields` paths to messages (see [state-and-errors.md](state-and-errors.md#6-form-handling-and-validation-mapping)). |
| **ErrorSummary** | W A | List of form errors on submit | n/a | n/a | Links to each field; focus moves to it after a failed submit. |

### 13.2 Display components

| Component | Apps | Purpose | Variants | States | Notes |
|---|---|---|---|---|---|
| **Badge** | W A | Small labelled marker ("Most popular", count) | `coral`, `black`, `outline`, `accent` (current drop colour) | n/a | One accent per view. |
| **Tag** | W | Product tag: Core, Limited, Last few, Sold out | `core` (cream bg, black text), `limited` (accent or coral, black text), `last-few` (butter, black), `sold-out` (neutral, white text) | n/a | Maps from `Stimpie.type` and `status` (`LOW`, `SOLD_OUT`). Text always present. |
| **StatusPill** | A (W for track page) | Order status | the 7 `OrderStatus` values (section 2.3) | default; `size` sm/md | Icon + label. Track page uses a lighter timeline instead of pills. |
| **PriceTag** | W A | Money display | `default`, `compact` (tables), `strike` (was price), `total` | n/a | Takes **cents**, formats USD with tabular numbers ([state-and-errors.md](state-and-errors.md#12-formatting-rules)). "Free" never used unless fee is 0 -> "Free delivery". |
| **Card** | W A | Surface container | `plain` (border `line`), `cream`, `product` (image + body), `stat` (dashboard KPI) | hover (product only, border darkens; no lift), focus-within | No shadow. Clickable cards use one link (stretched), not nested interactive elements. |
| **ProductCard** | W | Shop grid item (hoodie / Stimpie) | `hoodie`, `stimpie`, `compact` (Builder carousel) | default, hover, sold-out (dimmed image, still readable), focus | Stimpie image 0.64. Shows `Tag`, price, remaining only when `status` is `LOW`. |
| **PackCard** | W | The $45 / $35 packs | `featured` (Most popular, coral accent), `standard` | default, selected | Shows `Pack.badge`, `priceCents`, description. |
| **ColorSwatch** | W A | Colour selection and display | `selectable` (radio), `static` | default, selected (2 px black ring + 2 px white gap), disabled/sold-out (diagonal strike), focus | Circle 32 px in a 44 px target; accessible name = colour name (+ "sold out"). |
| **SizeChip** | W | Size selection | default | default, selected, disabled (sold out), low ("Only N left" text) | 44 x 44 min. |
| **Avatar / Initials** | A | Customer or user initial | default | n/a | |
| **Countdown** | W (A preview) | Drop countdown | `strip` (under hero, black bg), `inline`, `large` (drop page) | counting, `Going live...` (server confirming), live, ended, reduced-motion (no flip animation) | Uses server-clock offset ([state-and-errors.md](state-and-errors.md#13-server-clock-offset-and-countdowns)). `role="timer"` with `aria-live="off"`; announce minutes only via a visually hidden polite region every minute. |
| **DropBanner** | W | Current/upcoming drop block | `live`, `upcoming`, `archive` | n/a | Uses the drop accent colour, one per view. |
| **Tabs** | W A | Switch views within a page (Shop: Hoodies/Stimpies; Orders status tabs) | `underline` (default), `pill`, with `count` badge (Orders tabs) | selected, focus, disabled | WAI-ARIA tabs; arrow-key navigation; tab panel linked by URL query where it matters (`?tab=`). |
| **Table / DataTable** | A | Lists with sorting, selection | `dense` / `comfortable`; sticky header; row selection (bulk actions); mobile "card list" fallback below `md` | loading (skeleton rows), empty, error, row hover, selected | Sort icons with `aria-sort`; column visibility; horizontal scroll never on the whole page. |
| **Pagination** | A (W if needed) | Page through `Page<T>` | `full` (numbers + prev/next), `compact` (mobile: prev/next + "Page 2 of 7") | disabled ends | Driven by `page`, `pageSize`, `total`; page size options 25 / 50 / 100 (API max 100). |
| **Timeline** | W A | Order status history | `vertical` | reached / current / upcoming | W track page uses statuses Received -> Confirmed -> Packed -> Out for delivery -> Delivered; A shows `events` with user and note. |
| **Stepper** | W | Multi-step flows if needed (checkout is single page in v1, used for size/pack in the Builder if multi-step) | `horizontal`, `vertical` | complete, current, upcoming | Not used on checkout v1; keep available. |
| **StatCard** | A | Overview KPIs | default, with delta | loading, error | Number uses tabular numerals; label + value + optional hint. |
| **Chart wrappers** | A | 7-day sales, insights | `line`, `bar` | loading, empty | Uses brand tokens; colour never the only channel; follow the `dataviz` guidance when implemented. |
| **Accordion** | W | FAQ | single/multi | collapsed/expanded, focus | `<details>`-based progressive enhancement. |
| **RichText** | W A | Renders API long text (blank-line paragraphs, `**bold**`, `- ` lists) | n/a | n/a | Safe renderer only; never `dangerouslySetInnerHTML` on API text. |
| **Image / Media** | W A | Optimised image, video | `ratio` prop (`0.64`, `4/5`, `9/16`...) | loading, error (cream tile with icon) | Required `alt` (explicit empty string allowed). |
| **Logo** | W A | Logo versions | `full` / `icon` x `white` / `black` / `coral` | n/a | Section 11. |

### 13.3 Overlays and feedback

| Component | Apps | Purpose | Variants | States | Notes |
|---|---|---|---|---|---|
| **Modal** | W A | Confirmations, forms | `sm`, `md`, `lg`; `confirm` preset (title, text, Cancel + Confirm, destructive tone) | open, closing; scroll-lock | Focus trap, Esc closes (unless a destructive action is in flight), returns focus to trigger. Mobile: full-width, may render as a bottom sheet. |
| **Drawer** | W A | Cart drawer (right), filters, order quick view | `right`, `bottom` (mobile sheet) | open, closing | Width 420 px max on desktop; same focus rules as Modal. Swipe-to-dismiss on bottom sheets. |
| **BottomSheet** | W | Size chooser, filters on mobile | n/a | open | Drawer `bottom` preset with drag handle. |
| **Popover / Menu** | W A | User menu, row actions | n/a | open | Arrow-key navigation. |
| **Tooltip** | A | Short hints on icon buttons | n/a | hover/focus | Never essential info; not on touch. |
| **Toast** | W A | Transient confirmations ("Link copied", "Saved") | `success`, `info`, `error` (error toasts do not auto-dismiss on the dashboard) | enter/exit (opacity), stacked max 3 | `role="status"` (polite) / `role="alert"` for errors. Auto-dismiss 4 s (success/info); position bottom-centre mobile (above sticky bars), top-right desktop. See usage rules in [state-and-errors.md](state-and-errors.md#11-toasts-vs-inline-errors). |
| **Banner / Alert** | W A | Persistent messages (offline, hold expired, announcement) | `info` (sky), `warning` (butter), `error` (danger border), `announcement` (storefront bar: always black bg, white text; not configurable) | dismissible optional | Inline, in flow; `role="alert"` only for errors. |
| **Skeleton** | W A | Loading placeholders | `text`, `rect`, `card`, `table-row`, `stat` | static (reduced motion) / shimmer | Cream-on-cream pulse (opacity 0.6-1, 1.2 s) not a gradient. Shape matches final content to avoid layout shift. |
| **Spinner** | W A | Inline progress | `sm`, `md` | n/a | Only inside buttons or small regions; page-level waits use skeletons. |
| **ProgressBar** | W A | Upload, GLB download | determinate / indeterminate | n/a | `role="progressbar"`. |
| **EmptyState** | W A | No data | `icon + title + text + optional action` | n/a | One consistent layout; copy per screen in [state-and-errors.md](state-and-errors.md#8-empty-states). |
| **ErrorState** | W A | Page/section failed to load | `retry` action | n/a | Plain language, never a stack trace; includes "Try again" button. |
| **OfflineBanner** | W A | No connection | n/a | shown/hidden | See [state-and-errors.md](state-and-errors.md#10-offline-and-slow-network-behaviour). |

### 13.4 Layout and navigation

| Component | Apps | Purpose | Notes |
|---|---|---|---|
| **AnnouncementBar** | W | Content-controlled message (`GET /content` -> `announcement`) | Hidden when `null` (switched off); 36-44 px; fixed black bar with white text and an underlined white link; only `text` and `linkUrl` come from the API, there is no style option. |
| **Header / NavBar** | W | Logo, nav (Shop, Builder, Drops, How it works), cart count, hamburger | Sticky; cart count has `aria-label="Cart, N items"`. |
| **Footer** | W | Navigation, policies, social, small icon logo | Black section. |
| **FloatingWhatsApp** | W | Bottom-right chat button | 56 px, `white` glyph on a `black` circle (not WhatsApp green) [Rec]; hides behind open sheets; offsets above the sticky Add-to-cart bar. |
| **Sidebar** | A | Primary navigation (Overview, Orders, ... Settings) | Collapses to a **bottom bar** below `md`; active item = coral marker + bold; badge counts (Orders -> `NEW`). |
| **TopBar** | A | Global search, **+ New order**, notification bell, user menu | |
| **PageHeader** | W A | Title + actions + breadcrumbs | |
| **Section** | W | Standard storefront band with padding, optional dark/cream/coral background | Applies surface tokens (section 12). |
| **Breadcrumbs** | W A | Hierarchy | |
| **SkipLink** | W A | "Skip to content" | First focusable element. |

### 13.5 Domain components

| Component | Apps | Purpose | Notes |
|---|---|---|---|
| **BuilderStage / StimpieCarousel / ModeToggle / PackSelector / SizeSheet** | W (A preview) | The Builder UI | Specified in [builder.md](builder.md). |
| **CartDrawer / CartLine** | W | Cart | Shows pack/hoodie/stimpie lines, quantity stepper, subtotal, "Checkout" (blue). Delivery fee shown on checkout. |
| **OrderSummary** | W A | Items, subtotal, delivery fee, total | Same component in checkout, confirmation, track and dashboard (read-only vs editable). |
| **WhatsAppButton** | W A | `wa.me` link | `target="_blank"` with `rel="noopener"`; W label "Confirm on WhatsApp"; A "Message customer". Use a normal anchor (not `window.open`) to survive in-app browsers. |
| **CopyButton** | W A | Copy order number, phone, address | Success feedback via Toast and an `aria-live` text change. |
| **OrderNumber** | W A | Large order number display (`STP-1042`) | Monospace-free: Poppins 700 with tabular nums; copy button attached. |
| **StockBadge / StockCell** | A | Quantity / reserved / available with low highlight | Low = butter background + text "Low". |
| **AddressBlock / ContactBlock** | A | Customer contact with copy/call/email/WhatsApp actions | Order detail Summary tab. |
| **EmailTemplateEditor / PlaceholderChips** | A | Edit templates with placeholders | Placeholders from the API `placeholders` list. |
| **PlacementEditor** | A | Position/size/rotate the Stimpie box over a hoodie image (0.64 locked) | Used in Content -> Builder. |
| **ConfirmDialog (status change)** | A | Confirm order status change; asks for delivery number when going `OUT_FOR_DELIVERY`, reason when `CANCELLED` | Mirrors `POST /admin/orders/:id/status` payload. |

---

## 14. Tailwind theme mapping

`packages/ui` exports a Tailwind preset (`stimpyPreset`) and a `tokens.css` that defines the CSS variables on `:root` (and the `.surface-dark` override). Components use Tailwind class names; apps may use CSS variables directly. Whether Tailwind 3.4 (preset in JS) or Tailwind 4 (`@theme` in CSS) is used is a setup decision; the **names below are the contract** either way. [Rec]

| Token | CSS variable | Tailwind name (usage) |
|---|---|---|
| Coral | `--color-coral` | `coral` (`bg-coral`, `text-coral` on dark only) |
| Black | `--color-black` | `ink` (`text-ink`, `bg-ink`) *(named `ink` to avoid overriding Tailwind's `black`)* |
| White | `--color-white` | `white` |
| Electric blue | `--color-blue` | `action` (`bg-action`) |
| Butter | `--color-butter` | `butter` |
| Sky | `--color-sky` | `sky` |
| Lilac | `--color-lilac` | `lilac` |
| Cream | `--color-cream` | `cream` |
| Ink 70 | `--color-ink-70` | `ink-70` |
| Ink 55 | `--color-ink-55` | `ink-55` |
| Line | `--color-line` | `line` (`border-line`) |
| Line strong | `--color-line-strong` | `line-strong` |
| Surface | `--color-surface` | `surface` |
| Success | `--color-success` | `success` |
| Danger | `--color-danger` | `danger` |
| Neutral status | `--color-neutral` | `neutral` |
| Semantic bg | `--bg` | `bg-surface-base` (maps to `var(--bg)`) |
| Semantic fg | `--fg` | `text-fg` |
| Semantic muted fg | `--fg-muted` | `text-fg-muted` |
| Semantic border | `--border` | `border-base` |
| Control border | `--border-control` | `border-control` |
| Font | `--font-sans` | `font-sans` (Poppins stack) |
| Font sizes | `--text-display` ... `--text-caption` | `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-h4`, `text-lead`, `text-body`, `text-body-sm`, `text-caption` |
| Spacing | `--space-1` ... `--space-24` | default Tailwind spacing (`p-4`, `gap-6`) |
| Radius | `--radius-sm/md/lg/xl` | `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` (overridden to 6/12/16/24 px) |
| Shadow | `--shadow-float`, `--shadow-overlay` | `shadow-float`, `shadow-overlay` (default Tailwind shadows removed) |
| Breakpoints | n/a | `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 |
| Container | `--container-max` (1200px) | `container` configured: centred, padding 16/24/32 |
| Motion durations | `--motion-fast/base/slow/zip` | `duration-fast`, `duration-base`, `duration-slow`, `duration-zip` |
| Easing | `--ease-standard`, `--ease-zip` | `ease-standard`, `ease-zip` |
| Logo clear space | `--logo-clear` | `p-logo` |
| Focus ring | `--focus-ring` | `ring` utilities configured (3 px, offset 2 px) |

Rules: purge default Tailwind palette (`colors` replaced, not extended) so off-brand colours cannot be used; ESLint rule (or Tailwind plugin) forbids arbitrary values for colour (`bg-[#...]`) outside `packages/ui`; dark surfaces switch the semantic variables, not individual classes.

---

## 15. Visual QA checklist

Run for each page on a 360 x 800 phone, a 768 tablet and a 1280 desktop, in both apps where relevant.

**Brand**
- [ ] Only the three official logo versions, correct version per surface, clear space respected, no effects.
- [ ] Majority of the view is coral/black/white/cream; at most one secondary (Butter/Sky/Lilac) colour on the page (dashboard status pills excepted).
- [ ] Electric blue appears only on actions (and nowhere decorative).
- [ ] Every filled surface uses the brand text colour from section 3.1; no white on coral, no coral text on light backgrounds, no blue text on black or cream.
- [ ] Headlines Poppins Bold, subheads Medium, body Regular; no other fonts or weights.
- [ ] Copy is English, short and punchy.

**Layout and spacing**
- [ ] 16 px gutters on mobile; content max 1200 px on the storefront.
- [ ] No horizontal scrolling at 360 px (except intentional carousels/tables with their own scroll).
- [ ] Spacing only from the token scale.
- [ ] Sticky bars respect safe-area insets and do not cover focused fields.

**Components and states**
- [ ] Every interactive element has visible default, hover, focus, active, disabled and loading states where applicable.
- [ ] Focus ring visible (3 px) on every control, on light and dark surfaces.
- [ ] Tap targets >= 44 x 44 px.
- [ ] Errors are shown inline next to the field and summarised; not colour alone.
- [ ] Loading uses skeletons that match the final layout (no layout shift); empty and error states exist for each list.
- [ ] Status pills: all 7 statuses show icon + label + correct colours.

**Imagery**
- [ ] Stimpie art is 0.64 everywhere, never cropped or stretched; the split-S corner mark is visible.
- [ ] Hero/LCP image prioritised; other images lazy; no layout shift; alt text present.
- [ ] No text over photos without a solid/scrim background.

**Shadow / effects**
- [ ] No shadows except `shadow-float` and `shadow-overlay`; no gradients (except a text scrim); no glow.

**Motion**
- [ ] Zip wipe is 450 ms (Builder) / 600 ms (section); only one at a time.
- [ ] With `prefers-reduced-motion`, swaps are instant and nothing slides, pulses or autoplays.

**Accessibility**
- [ ] Contrast measured (not eyeballed) for any new colour pair.
- [ ] Keyboard-only run-through of the page succeeds; no focus traps except modals.
- [ ] Zoom to 200% still usable.
- [ ] Icon-only buttons have accessible names.

**Dashboard specifics**
- [ ] Tables are readable at 360 px (card list fallback or controlled horizontal scroll).
- [ ] Destructive actions use `danger` buttons and a confirmation.
- [ ] Money values show two decimals and tabular numerals.

---

## 16. Open questions for the API

The decisions for every earlier question (G1-G5) are recorded in [../open-questions.md](../open-questions.md), which is the decision log.

None open; every earlier question is settled in [../open-questions.md](../open-questions.md). Two earlier notes need no API change: `Color.hex` has no light/dark hint, so the swatch ring colour is computed on the client; and SVG logo files are not in the repo (only PNGs), so the production UI needs SVG logos redrawn per the brand note (a design asset task, not an API matter).
