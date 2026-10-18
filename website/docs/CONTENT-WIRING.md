# Content and option wiring

Checked against the local dashboard, storefront and API on 2026-10-18.

| Dashboard control | Public destination |
| --- | --- |
| Content → Announcement | Optional announcement bar above the header; disabled announcements stay hidden. |
| Content → Homepage | Hero headline, subheadline, featured Stimpie and drop-section visibility. The hero art is part of the storefront design. |
| Content → Homepage: reviews and visibility | Homepage customer review section; hidden reviews are excluded. No testimonials are seeded. |
| Content → FAQ | Help → FAQ; marked questions can also appear on the homepage. |
| Content → Policies: delivery | Delivery page, alongside the live delivery fee and estimate settings. |
| Content → Policies: care | Help → Care. No washing procedure is published until verified. |
| Content → Policies: terms and privacy | Legal page. |
| Content → Policies: About | About page. |
| Content → Policies: How it works | How It Works page; the homepage previews its first three steps. |
| Content → Builder | Hoodie, selected Stimpie, quote, colour options and builder placement. The size guide is available in the Builder and beside size selection. |
| Promotions | Active discounts update the matching product prices across the shop and checkout. The separate promotion section remains hidden from the landing page. |
| Products → Options | Shared colours and sizes. Adding a size definition does not create stock. |
| Products → Hoodies | Product description, colour and size selections. |
| Stock → Hoodies | Quantities for each colour and size. |
| Products → Size chart | Customer size guide, shown on Help, in the Builder and while choosing a size. |
| Settings → Business | Store name and contact details in the footer, support links and order help. |
| Content → Emails | Customer and owner email templates for configured order events. |
| Content → Emails | WhatsApp templates opened by dashboard staff. |

## Published store facts

- Support: `info@stimpylb.com`; WhatsApp is not set.
- Delivery: $5, estimated 4–5 business days; no area-specific fee overrides are saved.
- Hoodie: oversized, 400 GSM, with an interchangeable back panel.
- Size chart: garment measurements for S, M, L, XL, XXL and XXXL, measured flat in centimetres.
- Care: no washing instructions have been provided, so the site directs customers to support instead of guessing.
- Reviews: no customer reviews are published until real testimonials are available.

## Refresh behaviour

Public content, options and Builder data use the existing 60-second cache; promotions and the storefront catalog use a 5-second cache; the size chart uses 300 seconds. In local development, the existing `NEXT_PUBLIC_DEV_NO_CACHE=1` setting disables these caches. Reload the storefront after saving dashboard changes.
