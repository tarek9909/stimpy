# Frontend: Overview and Plan

**Purpose and audience.** The entry point for everyone building the two frontends: the public **website** and the private **dashboard**. It fixes the technology and folder structure, the conventions both apps follow, the order to build things in, and what "done" means. The detailed per-page specifications are in the documents listed in [§5](#5-document-map).

> **Status: documentation only.** No frontend code exists yet. The backend is likewise only documented ([backend docs](../backend/README.md)).

## Contents

1. [The two frontends](#1-the-two-frontends)
2. [Technology decisions](#2-technology-decisions)
3. [Planned folder layout](#3-planned-folder-layout)
4. [Conventions both apps follow](#4-conventions-both-apps-follow)
5. [Document map](#5-document-map)
6. [Build order](#6-build-order)
7. [Definition of done](#7-definition-of-done)
8. [Glossary](#8-glossary)

---

## 1. The two frontends

| | **Website** (`apps/web`) | **Dashboard** (`apps/admin`) |
|---|---|---|
| Who uses it | Customers, mostly on phones arriving from Instagram | The founder, on a phone and a PC |
| Job | Explain the product, let people try looks, order, and track | Run orders, stock, drops, content and money |
| Pages | 15 public pages + global elements | 12 pages + login, with tabs |
| Access | Public, no accounts | Login required, one owner account in v1 |
| Rendering | Server-rendered for shop and drops (fast, link previews); client-side for cart, checkout, builder | Client-side single-page app |
| Tone | Brand-forward: coral, black, white, playful motion | Quiet work tool, unmistakably Stimpy |
| Local URL | `http://localhost:3000` | `http://localhost:5173` |
| Detailed spec | [website-pages.md](website-pages.md) | [dashboard-pages.md](dashboard-pages.md) |

Both talk only to the API ([contract](../backend/api-reference.md)); neither reads the database. See [wiring](../wiring/README.md) for how they connect.

---

## 2. Technology decisions

| Concern | Website | Dashboard | Why |
|---|---|---|---|
| Framework | Next.js (App Router), React, TypeScript | Vite, React, TypeScript | SSR/ISR and link previews for the shop; plain SPA for a private tool |
| Routing | Next.js file routes | React Router | |
| Styling | Tailwind CSS with the shared brand preset | Same | One token set for both ([design system](design-system.md)) |
| Server state | Server components with `fetch` revalidation; small client fetch helpers | TanStack Query | See [state-and-errors](state-and-errors.md) |
| Forms | React Hook Form + Zod resolvers | Same | Validation mirrors the API's rules |
| Client state | Cart in a small store (Zustand) persisted to `localStorage` | Minimal; URL holds filters and tabs | Cart has no server side in v1 |
| API access | `@stimpy/api-client` (generated, typed) | Same, with credentials | No hand-written API types |
| 3D | Three.js, loaded lazily, only on `/builder` and the home teaser | Reuses the public Builder component for the live preview | [builder.md](builder.md) |
| Icons | One icon set (Lucide) | Same | |
| Testing | Vitest + React Testing Library; Playwright end to end | Same | |
| Language / currency | English only; USD formatted from integer cents | Same | Brand rule |

---

## 3. Planned folder layout

```
website/                         (workspace root, shared with the backend; created at implementation time)
├── apps/
│   ├── web/
│   │   ├── app/                 Next.js routes (layout.tsx, page.tsx per route; see website-pages.md route map)
│   │   ├── components/          page-specific components
│   │   ├── features/            cart/, checkout/, builder/, tracking/ (each: components, hooks, schemas, tests)
│   │   ├── lib/                 api helpers, formatters, analytics
│   │   └── public/              static assets (fonts if self-hosted, og images)
│   └── admin/
│       ├── src/
│       │   ├── routes/          one folder per page (orders/, stock/, drops/, ...)
│       │   ├── features/        reusable feature modules (order-status-actions, stock-editor, builder-settings, ...)
│       │   ├── components/      dashboard-only components (DataTable, FilterBar, ...)
│       │   ├── lib/             query client, session, formatters
│       │   └── main.tsx
├── packages/
│   ├── api-client/              generated types + wrapper clients
│   └── ui/                      tokens, Tailwind preset, shared components, zip-wipe animation, formatters
```

Rule: **a component used by both apps lives in `packages/ui`; everything else stays inside its app.** Code in `packages/ui` has no data fetching.

---

## 4. Conventions both apps follow

**Contract and data**
- Money is integer cents everywhere in code; format only at the edge with the shared formatter (`4500` → `$45`; show cents only when non-zero, e.g. `$45.50`).
- Dates arrive as ISO UTC strings; format for display with the shared formatter in the business timezone (`Asia/Beirut`).
- Never compute authoritative prices, totals, stock, or statuses in the browser. Display what the API returns; client-side estimates are labelled estimates.
- Endpoint paths and field names are exactly those in the [API reference](../backend/api-reference.md). Anything missing is raised as an "open question for the API", never invented.

**UI**
- Mobile-first: design the 360 px wide layout first, then enhance. Tap targets at least 44 × 44 px.
- Colour rules from the brand: electric blue only for calls to action; one secondary colour per view; status never conveyed by colour alone ([design system](design-system.md)).
- Customer-supplied text (names, addresses, notes, reviews) is always rendered as plain text. `dangerouslySetInnerHTML` is forbidden except inside the single audited rich-text renderer for the content subset (`**bold**`, `- ` lists, blank-line paragraphs).
- Every interactive element is keyboard reachable and has a visible focus state. Motion respects `prefers-reduced-motion`.
- Empty, loading, error, and sold-out states are designed for every list and page, not left as defaults.

**Code**
- TypeScript strict; no `any` without a comment. API types come only from `@stimpy/api-client`.
- One folder per feature; no cross-feature imports except through `packages/ui` or `lib`.
- Environment variables are read in one module per app and validated at startup; no `process.env`/`import.meta.env` scattered in components.
- Components are small and named for what they show (`StimpieCard`, `StatusPill`), not how they look.

**Quality**
- Performance budgets and accessibility targets in [state-and-errors.md](state-and-errors.md) are build requirements, not goals.
- Every page has at least one end-to-end test of its main path.

---

## 5. Document map

| Document | Covers | Read it when |
|---|---|---|
| [README.md](README.md) (this) | Decisions, layout, conventions, build order | First |
| [../backend/api-reference.md](../backend/api-reference.md) | Every endpoint, shape and error code | Constantly |
| [design-system.md](design-system.md) | Tokens, typography, components, motion | Before building any UI |
| [state-and-errors.md](state-and-errors.md) | Caching, errors, forms, performance, accessibility, analytics, env vars | Before building any data-driven UI |
| [website-pages.md](website-pages.md) | All 15 public pages and global elements | Building the website |
| [checkout-and-order-flow.md](checkout-and-order-flow.md) | Cart, checkout, confirmation, tracking, QA cases | Building purchase and tracking |
| [builder.md](builder.md) | 2D and 3D Builder, fallbacks, asset requirements | Building `/builder` |
| [dashboard-pages.md](dashboard-pages.md) | All dashboard pages and tabs | Building the dashboard |
| [auth-and-sessions.md](auth-and-sessions.md) | Login, session behaviour, dashboard security | Building the dashboard shell |
| [../wiring/README.md](../wiring/README.md) | Ports, CORS, cookies, env, client generation | Setting up the workspace |

---

## 6. Build order

The frontends can only be built as fast as the API steps they need are ready. Backend steps are the `B` numbers in the [backend README](../backend/README.md#9-build-order); the typed client regenerates after each.

| Step | Needs backend | Website | Dashboard |
|---|---|---|---|
| F0 | B0 | Workspace, Tailwind preset and tokens in `packages/ui`, layout shell, API client wiring | Shell, route guard stub |
| F1 | B1–B2 | : | Login, session bootstrap, layout, Settings (Account, Business) |
| F2 | B3 | Shop, Hoodie detail, Stimpie detail, header, footer, announcement bar | Products (Hoodies, Stimpies, Packs, Options, Size chart), uploads |
| F3 | B4–B5 | Cart, Checkout, Confirmation, Track order, Delivery & Returns, Help, About, Legal | Orders list and detail with status actions, delivery number, contact block, emails sent |
| F4 | B6 | : | Overview, Stock, Deliveries, bulk actions, CSV export, manual order |
| F5 | B7 | Drops, Drop detail, Builder (2D then 3D), How it works, Home | Drops, Content (Announcement, FAQ, Policies, Homepage, Builder, Emails), Customers/Subscribers |
| F6 | B8–B9 | : | Finance, Insights |
| F7 | B10 | Performance and accessibility pass, e2e suite, empty/error states audit | Same, plus phone-width audit of every page |

**Milestone gates**
- **After F3:** a customer can place and track an order on a phone; the founder can confirm, pack, send out with a delivery number, and deliver it, and every email arrives in Mailpit.
- **After F5:** the founder can switch the Builder between 2D, 3D, and Both from the dashboard and see the site change.
- **After F7:** the combined definition of done below.

---

## 7. Definition of done

**Website**
- [ ] All 15 pages and global elements exist and match [website-pages.md](website-pages.md).
- [ ] The purchase and tracking flows pass the QA cases in [checkout-and-order-flow.md](checkout-and-order-flow.md).
- [ ] The Builder works in 2D only, 3D only, and Both, falls back to 2D when WebGL is unavailable, and passes the cases in [builder.md](builder.md).
- [ ] Performance budgets and accessibility targets in [state-and-errors.md](state-and-errors.md) are met on a throttled mid-range Android profile.
- [ ] Every colour, size, price, fee, FAQ, and policy shown comes from the API, nothing hard-coded.

**Dashboard**
- [ ] All 12 pages and tabs exist and match [dashboard-pages.md](dashboard-pages.md); every page is usable at 360 px width.
- [ ] Login, expiry, logout and multi-tab behaviour match [auth-and-sessions.md](auth-and-sessions.md).
- [ ] Order status buttons only offer `allowedTransitions` from the API; *Out for delivery* cannot be submitted without a delivery number; order and stock changes are never optimistic.
- [ ] Order number and delivery number are never confused anywhere in the UI (labelled "Order number" and "Delivery number").

**Both**
- [ ] No API types are hand-written; the client regenerates cleanly from the OpenAPI document.
- [ ] No console errors in normal use; no unhandled promise rejections.
- [ ] Reduced-motion mode works everywhere.

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Stimpy** | The brand: one premium hoodie with an interchangeable back |
| **Stimpie** | An interchangeable printed back panel that zips onto the hoodie |
| **Pack** | A priced bundle: a hoodie plus 1 or 2 Stimpies |
| **Core** / **Limited** | Core Stimpies are always available; limited ones belong to a drop and are never restocked |
| **Drop** | A time-boxed release of limited Stimpies with its own accent colour |
| **Builder** | The interactive preview where a visitor swaps Stimpies on a hoodie (2D and/or 3D) |
| **Order number** | Automatic, permanent reference for an order (`STP-1042`); the customer's handle |
| **Delivery number** | Entered by the founder when an order goes out for delivery; may be shared by several orders |
| **Zip wipe** | The brand's signature transition: a zipper line opens the next scene |
| **Cash on delivery** | The only payment method in v1 |
