# Stimpies v2: retro concept set

Original Stimpie back panels, one per reference niche plus extra 70s/80s pieces.
Everything here is drawn from scratch as SVG. No traced or copied artwork, and no real brands, bands, characters or logos.
The only photographic source is a public-domain (CC0) bust from the Art Institute of Chicago (see `08`).

## Canvas
- Finished panel: **30 × 40 cm**. SVG `viewBox="0 0 3000 4000"`, so **1 unit = 0.1 mm**.
- **Full bleed**: every design fills the whole panel with its own background (no transparency).
- **Safe zone**: keep text and key art at least **150 units (15 mm)** from every edge (seam + zipper allowance).
- Print export: 3543 × 4724 px (300 dpi), from `render.sh`.

## Signature (required on every design)
The split-S icon sits in the bottom-right corner, inside the safe zone, about 220 units tall.
Copy this block before `</svg>`, keeping its position. Recolor it to suit the background: on dark, set the solid half to `#FFFFFF`; on coral, set the outline half to `#FFFFFF`.

```xml
<g id="stimpy-sig" transform="translate(2730 3760)">
  <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
  <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
  <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="#111111" clip-path="url(#sigL)">S</text>
  <text x="0" y="22" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="none" stroke="#FF7A59" stroke-width="11" clip-path="url(#sigR)">S</text>
</g>
```

## Fonts
Load Google Fonts with an `@import` inside `<style>` at the top of the SVG, and always include Poppins 700 for the signature:
```xml
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Bungee&amp;display=block');</style>
```
(Escape `&` as `&amp;` inside SVG.)

## Brand tie-in
Stimpies may bring the noise, but each design should nod to the brand: coral `#FF7A59`, black `#111111` and cream `#FFF4E6` appear somewhere, and many play on **two sides / the swap / one hoodie, many identities**.
Copy is English only: clever, not crude.

## Files
- `src/NN-name.svg`: the source artwork.
- `out/preview/NN-name.png`: 750 × 1000 preview.
- `out/print/NN-name.png`: 3543 × 4724 print file (300 dpi).

Render: `bash content/stimpies-v2/render.sh [NN-name ...]` (no args = all).
