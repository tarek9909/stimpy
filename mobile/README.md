# Stimpy Admin (mobile)

The Stimpy dashboard in your pocket: orders with their designs, customers, and push alerts for new orders.
Android first. It talks to the same API and signs in with the same email and password as the web dashboard.

## What it does today

- **Orders**: tabs with live counts (the Orders badge follows the New count, polled every 30 s while the app is open),
  search, infinite scroll.
- **Order screen**: the design of every item (hoodie picture with colour and size, each Stimpie with its picture),
  customer with Call and WhatsApp, delivery, cash collected/settled, timeline, notes, email log, stock-hold extension.
- **Status changes**: Confirm, Pack, Send out (delivery number), Deliver, Return (restock or write off), Cancel (reason).
  The buttons come only from the server's `allowedTransitions`; if someone else already moved the order the app says so
  and reloads it.
- **New order**: the dashboard's manual order for Instagram, WhatsApp and phone orders, with all four line kinds
  (hoodie, hoodie + Stimpies set, single Stimpie, Stimpie offer), customer lookup, delivery area and fee, and the same
  stock and validation rules as the web.
- **Print** (from an order, or from a list tab): invoice, shipping labels and delivery sheet, grouped by area, status,
  source, date or delivery number. Opens Android's print dialog (printers or Save as PDF) or the share sheet.
  Documents are drawn with Poppins and an Arabic fallback font, so Arabic names and addresses print correctly.
- Customers and Overview are not built yet (their tabs are placeholders).

## Run

```bash
# Emulator (the default API address is the emulator's view of your PC)
flutter run

# A real phone on your Wi-Fi: use your PC's LAN address, and give the app the OneSignal App ID for push
flutter run \
  --dart-define=API_BASE_URL=http://192.168.1.20:4000/api/v1 \
  --dart-define=ONESIGNAL_APP_ID=your-onesignal-app-id
```

- `API_BASE_URL` defaults to `http://10.0.2.2:4000/api/v1`. For a phone, start the API on your PC and set
  `API_PUBLIC_URL` in `website/backend/.env` to the same LAN address, then re-seed (`--reset`), otherwise image URLs
  in the data point at `localhost` and will not load on the phone.
- Push is off when `ONESIGNAL_APP_ID` is not set. Backend setup: `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY`
  in `website/backend/.env`; `POST /api/v1/admin/push/test` sends a test notification.

## Design system

The look follows the web, in two layers:

| Layer | Source of truth | In the app |
|---|---|---|
| Identity: coral, split-S logo, status colours, zip line, Poppins | `website/packages/ui` (`tailwind-preset.cjs`, `src/tokens.css`), `stimpy_master_plan.md` section 11 | `lib/theme/brand.dart`, `lib/ui/brand_logo.dart`, `lib/ui/zip_line.dart`, `lib/ui/pill.dart` |
| Dashboard feel: cool slate neutrals, 6-8px radii, blue active state, dense type | `website/frontend/admin` (`tailwind.config.cjs`, `src/styles/globals.css`) | `lib/theme/app_theme.dart`, `lib/theme/typography.dart` |

Rules worth keeping (from `docs/website/frontend/design-system.md`):

- Use the tokens in `Brand`, `Radii` and `Space`. No raw hex in screens.
- Order status is always an icon **and** a label (`StatusPill`), never colour alone.
- Pills pick a tone and the tone picks the text colour (black on coral/butter/sky/lilac/cream, white on the rest).
- Blue is for things you can press. Coral and the zip line are for identity moments, not decoration.
- The logo comes only from the official files in `assets/brand` (`BrandLogo`), never recoloured or stretched, and
  never on butter/sky/lilac.
- Icons are Lucide (the same set as the dashboard). Numbers use tabular figures (`.tabular`).
- Light theme only (the dashboard has no dark mode in v1).

Shared widgets live in `lib/ui`: `BrandLogo`, `ZipLine`/`ZipLoader`, `Pill`, `StatusPill`, `StatTile`, `EmptyState`,
`AppTopBar`, `AppTextField`.

## Tests

```bash
flutter test          # 66 tests: logic, screens against a fake API, PDF generation (the live tests are skipped)
```

`test/live_api_test.dart` checks the app's own code against a **real** running API (all four line kinds, the full
life of an order, errors, search, print data). It creates orders, so point it at a scratch database, never at data
you care about:

```bash
flutter test test/live_api_test.dart \n  --dart-define=LIVE_API=http://localhost:4100/api/v1 \n  --dart-define=LIVE_EMAIL=owner@stimpy.local --dart-define=LIVE_PASSWORD=...
```

It cancels the orders it creates. The API allows 5 sign-ins per 15 minutes per address, so avoid re-running it in a
loop.

## Preview screens without a device

```bash
flutter test test/preview_test.dart test/preview_orders_test.dart
```

Renders the real screens (with the real fonts) to `build/previews/*.png`: splash, login, the tabs, the Orders list and
order screen, the status sheets, the New order form and editors, the print sheet, and the three printable documents.
Open the PNGs to review a change.

## Assets

- `assets/brand/`: official logo files copied from `website/packages/ui/assets/logo`, plus the launcher icon sources.
- `assets/fonts/`: Poppins (SIL Open Font License, see `OFL.txt`).
- Regenerate launcher icons after changing the sources: `dart run flutter_launcher_icons`.

## Android identity

Package `com.stimpy.admin` (must match the Firebase app that OneSignal uses). The home-screen name, launcher icon
(split-S on coral) and launch screen (coral) are set in `android/app/src/main`.
