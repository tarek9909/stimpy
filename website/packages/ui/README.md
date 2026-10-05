# @stimpy/ui

The Stimpy design system: a Tailwind 3.4 preset, CSS tokens, self-hosted Poppins, the official logo files and the shared presentational React components. Consumed by `frontend/web` (Next.js 15) and `frontend/admin` (Vite + React 19).

- **No data fetching.** Everything is props in, events out. Server clock, links and images are injected.
- **No framework imports.** No `next/*` anywhere (a test enforces it). `next/link` and `next/image` are passed in through `UIProvider`.
- Specification: `docs/website/frontend/design-system.md` (tokens, components), `website-pages.md` section 2 (component props), `state-and-errors.md` (formatting, states, accessibility, countdown rules).

## What is in the package

| Path | What |
|---|---|
| `tailwind-preset.cjs` | Tailwind preset `@stimpy/ui/preset`. Replaces the default palette, radii, shadows, type scale, motion tokens |
| `src/tokens.css` | CSS variables, `.surface-dark` / `.surface-colored`, focus ring, reduced-motion rules, zip-line, base styles |
| `src/fonts.css` + `fonts/*.woff2` | Poppins 400 / 500 / 700, latin subset, `font-display: swap` |
| `assets/logo/*` | Optimised official logos (see Logos) |
| `src/format.ts` | `formatCents`, date/time in the business zone, relative times, countdown text, Lebanese phone helpers, `whatsappLink` |
| `src/clockMath.ts`, `src/clock.tsx` | Server-clock offset maths, `ServerClockProvider`, `useCountdown` |
| `src/components/*` | The components below |
| `gallery/` | A runnable visual gallery of every component |
| `test/` | Vitest + Testing Library (jsdom) |

## Setup in an app

```ts
// tailwind.config.ts / .cjs  (Tailwind 3.4)
module.exports = {
  presets: [require('@stimpy/ui/preset')],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}', // REQUIRED: the component class names live here
  ],
};
```

```ts
// app entry (layout.tsx / main.tsx): import as JS so the bundler resolves url() and exports
import '@stimpy/ui/fonts.css';   // omit if you load Poppins with next/font and set --font-sans
import '@stimpy/ui/tokens.css';
import './globals.css';          // contains the three @tailwind directives
```

`frontend/web` also needs `transpilePackages: ['@stimpy/ui']` in `next.config`. The package ships TypeScript source.

Providers (all optional; each has a safe default):

```tsx
<UIProvider link={AppLink} renderImage={renderImage} logoBaseUrl="/brand">   {/* framework links + images */}
  <ServerClockProvider offsetMs={offsetMs} uncertain={!hasSample}>             {/* countdowns */}
    <ToastProvider persistErrors={isAdmin}>                                    {/* toasts */}
      {children}
```

## Rules baked in

- Palette is **replaced**, not extended: `bg-red-500`, `shadow-md`, `bg-gradient-*` generate nothing. A test proves it.
- Brand text pairs per section 3.1: components pick the text colour themselves (`Section`, `Badge`, `StatusPill`, `Button`). Consumers cannot pass a text colour.
- Electric blue only on `Button` `primary`/`cta`. No gradients except the zip-line teeth. Shadows only `shadow-float` and `shadow-overlay`.
- Semantic variables: `text-fg`, `text-fg-muted`, `text-fg-inverse`, `text-fg-danger`, `bg-surface-base`, `border-base`, `border-control`. A band with `.surface-dark` (black) or `.surface-colored` switches them, so components work on both. Use `<Section tone="black">` rather than hand-rolling dark bands.
- 44px minimum targets, 16px form text, 3px focus ring (white on dark), reduced motion honoured (CSS and ZipWipe).
- No raw hex, `rgb()` or arbitrary colour utilities outside `tokens.css`, the preset and runtime data (swatch hex, logo files). Tests scan the source.
- Components that use hooks start with `'use client'`; pure helpers (`format`, `clockMath`, `constants`, `buttonClasses`, `RichText`, `Badge`, `PriceTag`, ...) are plain modules, so server components can call and render them.

## Component inventory

All components accept `className` for layout only and forward refs where they render a single element.

**Primitives and forms**: `Button` (`primary`/`cta` blue, `dark`, `secondary`, `ghost`, `coral`, `danger`; `sm`/`md`/`lg`; `loading`, `fullWidth`, `iconOnly`, `href` + `as`), `LinkButton`, `TextLink`, `Spinner`, `Input` (prefix/suffix), `Textarea` (auto-grow, counter), `Select`, `Checkbox` (indeterminate), `RadioGroup` (default, card), `Switch`, `SegmentedControl`, `QuantityStepper` (1..10), `FormField`, `ErrorSummary` (+ `focusField`, `focusFirstInvalid`).

**Selection**: `ColorSwatches`, `ColorSwatch`, `ColorDots`, `SizeSelector`, `SizeChip`.

**Display**: `Badge` / `Tag` (CORE, LIMITED, LOW, SOLD_OUT, UPCOMING, ENDED, POPULAR, CUSTOM), `Pill`, `StatusPill` (7 `OrderStatus` values, icon + label), `PriceTag`, `Media`, `Card`, `StretchedLink`, `StatCard`, `ProductCard`, `StimpieCard`, `PackCard`, `DropCard`, `Countdown`, `StatusTimeline`, `Tabs` + `TabPanel`, `Accordion`, `RichText`, `TrustStrip`, `ReviewCard`, `Avatar`.

**Overlays and feedback**: `Modal`, `Drawer`, `BottomSheet`, `ConfirmModal`, `ToastProvider` + `useToast`, `Banner`, `AnnouncementBar`, `Skeleton` + `SkeletonGroup` + `useSkeletonDelay`, `SlowLoadingHint`, `ProgressBar`, `EmptyState`, `ErrorState`.

**Actions**: `CopyButton`, `WhatsAppButton`, `FloatingWhatsApp`.

**Layout and brand**: `Section` (tones white, cream, black, coral, accent), `SkipLink`, `Logo`, `ZipWipe`.

**Formatting and clock (no React)**: `formatCents`, `parseDollarsToCents`, `formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatDateRange`, `formatDropStart`, `formatCountdown`, `formatCount`, `formatPercent`, `pluralize`, `normalizeLebanesePhone`, `formatPhoneDisplay`, `whatsappLink`, `telLink`, `phoneDigits`, `resolveTimeZone`, `contrastRatio`; `estimateClockOffset`, `offsetFromSample`, `offsetFromDateHeader`, `computeRemainingMs`, `countdownParts`.

### Usage notes

```tsx
<Button variant="cta" size="lg" fullWidth loading={pending}>Place order</Button>
<Button href="/builder" variant="coral">Try the Builder</Button>      {/* renders the injected Link */}

<StimpieCard stimpie={s} onAdd={() => add(s)} showDrop />             {/* image 0.64, never cropped */}
<ProductCard hoodie={h} />                                            {/* 4:5, "from" price, colour dots */}
<PriceTag cents={4550} prefix="from" />                               {/* from $45.50 */}

<Countdown target={drop.startsAt} label="Drop 03 starts in" variant="strip" accent={drop.accentColor}
           onComplete={refetchDrops} staticText={serverFormattedText} />

<RichText text={page.policies.returns} />                             {/* safe: paragraphs, **bold**, "- " lists only */}

<Tabs aria-label="Shop" tabs={tabs} value={tab} onChange={setTab} urlParam="tab">
  <TabPanel tabId="hoodies">...</TabPanel>
</Tabs>

<Section tone="black" heading="Next drop" zipIn>...</Section>        {/* ZipWipe once, when in view */}
```

**Countdown**: `ServerClockProvider` is fed by the app (the package never calls `/health`). Sample `GET /health` three times, build `ClockSample`s (`serverTime`, `sentAt = Date.now()` before the request, `rttMs`), pass them to `estimateClockOffset`, and give the result to the provider. The countdown shows only static `<time>` text on the server and first paint, ticks every second, announces once a minute (every 10 s in the last minute) in a separate polite region, shows "Going live..." at zero and calls `onComplete` once. It never decides that a drop is live.

**ZipWipe**: `direction` `down` (default, incoming content above the line) | `up` | `ltr` | `rtl`; `color` `coral | black | cream | accent`; `durationMs` (`ZIP_DURATION.section` 600, `ZIP_DURATION.builder` 450); `trigger` `inView` (35% visible, plays once) | `manual` (`ref.play()`); `outgoing` (the old scene rendered in the cover, for the Builder swap); `onDark` (white line). Only `clip-path` and `transform` animate, one wipe at a time per page, content never leaves the DOM, `aria-hidden` and `pointer-events: none` on the overlay. Reduced motion: instant (default) or a 120 ms cross-fade (`reducedMotion="fade"`).

## Logos

Source: `identity/*.png` (the official PNGs). Optimised and **trimmed** (the clear space is added in CSS, not baked into the file) into `assets/logo/`:

| File | Use | Size |
|---|---|---|
| `logo-on-white.webp`, `logo-on-black.webp`, `logo-main.webp` | `<Logo variant="full" surface="white\|black\|coral" />` | 480 x 167 (2x of a 240 px logo) |
| `icon-on-white.png`, `icon-on-black.png`, `icon-main.png` | `<Logo variant="icon" ... />`. The first two are transparent (for light / dark backgrounds); `main` carries the coral | 180 x 256 |

`Logo` bundles them (`new URL(..., import.meta.url)`), or serves them from `public/` when `UIProvider logoBaseUrl="/brand"` is set (copy `packages/ui/assets/logo/*` to `public/brand/`). Rules enforced: minimum width 96 px (full) / 20 px (icon), clear space = half the width of the solid half of the S, official version per surface only, no recolour, no effects. Do not put it on Butter, Sky, Lilac or on photos.

**The PNGs are placeholders for web use.** The brand note says the logo must be redrawn as SVG before production (and before any print or embroidery use). That is a future design task; when SVGs exist, replace the files behind `Logo` and keep its props.

## Gallery

```
npm run gallery:build -w @stimpy/ui     # builds gallery/dist
npm run gallery:dev   -w @stimpy/ui     # http://localhost:5290
npm run gallery:shots -w @stimpy/ui     # Chrome screenshots at 360 and 1280 (SHOTS_DIR, SHOTS_WIDTHS, SHOTS_MOTION)
```

The gallery uses the real preset and tokens, real Stimpie artwork (resized) and every component, including open overlays and toasts. Resize to 360 px and tab through it.

## Commands

```
npm run typecheck -w @stimpy/ui
npm run test -w @stimpy/ui
```

## Not in this package (yet)

Dashboard-specific and app-specific pieces named in design-system section 13 that are not shared primitives: `Table`/`DataTable`, `Pagination`, `FileUpload`, `ColorPicker`, `DatePicker`, `SearchField`, `Combobox`, `Popover/Menu`, `Tooltip`, `Stepper`, chart wrappers, `Breadcrumbs`, `Header`, `Footer`, `Sidebar`, `TopBar`, `PageHeader`, `OfflineBanner` (use `Banner live`), `DropBanner`, `OrderSummary`, `OrderNumber`, `StockBadge`, `AddressBlock`, the Builder components, `CartDrawer`, `PackComposer` and `SubscribeForm` (the last two are marked `web` in website-pages). Build them in the app from these primitives, or add them here when the second app needs them.
