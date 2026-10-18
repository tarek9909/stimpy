# Storefront loading and navigation

Measured on 2026-10-18 with local Chrome and the optimized Next.js production build. Desktop viewport: 1440 × 900; mobile viewport: 390 × 844. No network or CPU throttling was applied. Navigation timings include a 150 ms hover before clicking, allowing intended destinations to prefetch. These are local checks, not an internet speed benchmark.

## Findings and changes

Public API requests warmed to 2–7 ms. Cold development routes took 2.6–7 seconds to compile, while repeated requests were much faster. Development compilation contributed to the reported pauses.

- Primary navigation prefetches destinations. Shopping links warm on hover, focus or touch and show pending feedback. Save Data disables this work.
- Shop/help tabs and product filters update immediately while server results arrive. The previous panel keeps its height during the transition.
- The mobile menu opens immediately. The cart starts downloading on intent and shows a loading drawer if its editor is still arriving.
- The homepage hero streams before optional shopping sections. Independent product, Builder, shop and size-guide requests run concurrently; product recommendations stream separately.
- Builder posters and interactive previews share their image paths and geometry. Reviews render once with consistent dimensions.
- Offscreen instructional videos do not request their sources; videos pause when hidden. The hoodie artwork picker loads when a chosen set requires it.
- Icon exports are individually tree-shaken. The homepage FAQ uses native disclosures and works before hydration.

## Browser results

| Destination | Click to visible heading |
| --- | ---: |
| Shop | 26 ms |
| Builder | 41 ms |
| Drops | 44 ms |
| How it works | 22 ms |
| Home | 25 ms |

All five transitions used client navigation without a document reload. The initial homepage heading appeared in 552 ms in this run. The mobile menu opened in 80 ms and the cart dialog in 97 ms.

The Builder teaser changed height by 0 px during activation. Measured homepage cumulative layout shift was 0.00018. Desktop and mobile had no horizontal overflow. The deferred artwork picker worked, the Stimpies tab selected immediately, and the checked routes produced no browser runtime errors.

## Checks

- All 204 storefront tests passed.
- Production compilation, type validation and every configured JavaScript/CSS budget passed.
- Initial gzip JavaScript: home 129.1 KiB; shop 136.9 KiB; hoodie 138.8 KiB; Stimpie 138.5 KiB; checkout 110.2 KiB; 2D Builder 144.0 KiB.
- Website CSS: 14.8 KiB gzip. Lazy Three.js engine: 152.3 KiB gzip.

Production speed requires `next build` and `next start`. `next dev` keeps compiling routes on first visits. An isolated production snapshot was built in `.next-navigation-perf` and served at `http://localhost:3001`; the existing development server uses port 3000.
