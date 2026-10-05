# Builder (2D and 3D) - Frontend Specification

## Purpose and audience

This document specifies the public **Builder** (`/builder`) and its compact home-page teaser: what it shows, how it is driven by the API, how the 2D and 3D modes work, when it falls back, what assets it needs, and how to test it. It is written for the developer who builds `apps/web` (Builder UI and renderers) and for whoever builds the dashboard page **Content -> Builder** (which produces the assets and settings the Builder consumes).

The public Builder and dashboard configuration editor are implemented in the website workspace. The public route fetches its initial configuration and catalog data on the server, renders a 2D preview, and hydrates the interactive client island. This document describes the current contract; implementation decisions and any scoped deviations are recorded in `website/docs/DECISIONS.md`. API field names, endpoints and enums are taken from the [API contract](../backend/api-reference.md); anything the contract does not provide is listed under [Open questions for the API](#16-open-questions-for-the-api). Business context is in [stimpy_website_plan.md](../../../stimpy_website_plan.md) (section 4.3 item 5 and section 5.3 item 10). Visual rules are in [design-system.md](design-system.md); cross-cutting behaviour (errors, caching, performance) is in [state-and-errors.md](state-and-errors.md).

## Table of contents

1. [Goal and non-goals](#1-goal-and-non-goals)
2. [Data: what drives the Builder](#2-data-what-drives-the-builder)
3. [Mode resolution and the in-page toggle](#3-mode-resolution-and-the-in-page-toggle)
4. [2D mode](#4-2d-mode)
5. [3D mode](#5-3d-mode)
6. [Automatic fallback and lazy loading](#6-automatic-fallback-and-lazy-loading)
7. [Assets contract](#7-assets-contract)
8. [What the dashboard (Content -> Builder) must let the founder set](#8-what-the-dashboard-content---builder-must-let-the-founder-set)
9. [Reuse analysis of existing code](#9-reuse-analysis-of-existing-code)
10. [UI, pack/size flow and Add to cart](#10-ui-packsize-flow-and-add-to-cart)
11. [Share link](#11-share-link)
12. [Home-page teaser](#12-home-page-teaser)
13. [Accessibility](#13-accessibility)
14. [Analytics events](#14-analytics-events)
15. [Test plan](#15-test-plan)
16. [Open questions for the API](#16-open-questions-for-the-api)

---

## 1. Goal and non-goals

**Goal.** Let a visitor, in about five seconds on a phone, pick a hoodie colour, flick through Stimpies, and see the back of the hoodie change with the signature zip wipe. It explains the product (the zip swap is the whole product) and ends in a purchase intent: running pack price and **Add to cart**.

**The Builder is a preview, not the product.**

| Rule | Detail |
|---|---|
| Labelled | A visible label "Preview" must sit on or next to the canvas/stage at all times (text, not only an icon). Suggested copy: "Preview. Real photos are one tap away." |
| Photos are the truth | A link/button "See real photos" must always be visible and go to the Stimpie detail page `/shop/stimpie/[slug]` (and to the hoodie page for colour photos). The Builder never replaces product photography. |
| No promises | Colours on screen vary by display and are not a colour guarantee. The label above covers this; do not add legal-sounding text. |
| Not a designer | Visitors cannot upload art, move, scale or recolour a Stimpie. Custom Stimpies are out of scope for v1 (plan section 1, non-goals). |
| Not a checkout | Add to cart adds items to the normal cart (section 10). Orders are only placed on `/checkout`. |
| Never blocks the shop | If the Builder fails entirely, the page shows a static fallback (section 6.5) and the rest of the site is unaffected. |

---

## 2. Data: what drives the Builder

The Builder is built from three public endpoints, joined on the client (or in a server component that passes the joined result down).

| Endpoint | Used for | Cache (web) |
|---|---|---|
| `GET /builder/config` | Mode, default view, the hoodie the Builder sells (`hoodie`), 3D model + camera + lighting, per-colour look, per-Stimpie texture overrides | Next fetch `revalidate: 60`, tag `builder` |
| `GET /products/stimpies` | Stimpie list: name, `slug`, `artworkUrl`, `artworkWidth`/`artworkHeight`, `priceCents`, `status`, `remaining`, `purchasable`, `drop`. Defaults return only `AVAILABLE`, `LOW` and `SOLD_OUT` | `revalidate: 30`, tag `catalog` |
| `GET /options` | Colour names and hex (`Color.name`, `Color.hex`), colour order (`position`) | `revalidate: 60`, tag `options` |

Also needed for the purchase flow (not for rendering): `GET /packs`, `GET /products/hoodies/:slug` using `config.hoodie.slug` (for sizes and variant stock), and `POST /cart/validate` (checked when the cart drawer opens, see [state-and-errors.md](state-and-errors.md)).

All image and GLB URLs in these payloads are absolute and `/uploads/*` is served with `Access-Control-Allow-Origin: *`, so textures can be loaded with `crossOrigin = "anonymous"` and read by WebGL. File names are random and immutable, so they cache for a year.

### 2.1 Field-by-field mapping

| Contract field | Builder use |
|---|---|
| `mode` | Informational only (what the founder chose). Never drive rendering from it. |
| `effectiveMode` | **The only mode the page may use.** `2D`, `3D` or `BOTH`. The server downgrades to `2D` when 3D assets are missing. |
| `defaultView` | Which view opens first when `effectiveMode` is `BOTH`. Ignored otherwise. |
| `hoodie` | `{ id, slug, name }`: the hoodie the Builder sells. Its `id` goes into every cart item the Builder creates; its `slug` is used for `GET /products/hoodies/:slug`. Set in the dashboard (defaults to the first active hoodie). |
| `model3d.url` | GLB to load (3D only, lazily). `null` means no 3D. |
| `model3d.sizeBytes` | GLB size in bytes: drives the "Load 3D (about N MB)" label and the data-saver gate (section 6.3). |
| `model3d.panelAspect` | Width / height of the back panel (default 0.64): used for texture cropping (section 5.5). |
| `model3d.backPanelMesh` | Name of the mesh that receives the Stimpie texture. Looked up with `scene.getObjectByName`. |
| `model3d.camera.position / target / fov` | Initial and "reset" camera. `position` and `target` are `[x, y, z]` in model units (metres). |
| `model3d.lighting` | `STUDIO`, `SOFT` or `NIGHT` (section 5.3). |
| `colors[].colorId` | Join key to `Color.id` from `GET /options`. |
| `colors[].tint` | Hex applied to the hoodie body material in 3D. If `null`, use `Color.hex`. Read-only mirror of `builderTint`, which is edited only in `/admin/colors`. |
| `colors[].texture3d` | Optional fabric texture URL for 3D (`material.map` of the body). Read-only mirror of `builderTexture` (edited only in `/admin/colors`). |
| `colors[].hoodieImage2d` | Flat back-view hoodie image for 2D. |
| `colors[].overlay2d` | Optional transparent shading/shadow image drawn over the Stimpie panel in 2D (layer 5, section 4.1). `null` = none. |
| `colors[].placement2d` | `{ x, y, width, rotation }`; geometry defined in section 4.2 (`x`,`y` = panel centre as fractions of image width/height, `width` = fraction of image width, `rotation` degrees clockwise). |
| `stimpieTextures[]` | Per-Stimpie 3D texture overrides: if a `stimpieId` is present, use its `textureUrl` in 3D; otherwise use `Stimpie.artworkUrl`. 2D always uses `Stimpie.artworkUrl`. |
| `Stimpie.artworkUrl` | Back-panel artwork (2D layer; 3D texture unless overridden). |
| `Stimpie.artworkWidth`, `artworkHeight` | Pixel size of the artwork (`null` for older uploads). Used to detect art whose aspect differs from the panel aspect and to reserve space; when `null`, assume `0.64` and read the size from the loaded image. |
| `Stimpie.drop.accentHex` | Optional accent for the selected state of a limited Stimpie (design-system rule: one secondary colour per view). |
| `Stimpie.status`, `purchasable`, `remaining` | Badge and whether Add to cart is allowed (section 10.5). |

### 2.2 The join

1. Fetch the three payloads.
2. **Usable colours** = `Color` (active, from `GET /options`) joined with `config.colors` on `colorId`, filtered by what the current view can render:
   - 2D usable: `hoodieImage2d !== null` **and** `placement2d !== null`.
   - 3D usable: always (tint falls back to `Color.hex`), provided `model3d !== null`.
3. **Usable Stimpies** = every Stimpie from `GET /products/stimpies` with its defaults (`includeSoldOut=true`, `includeUpcoming=false`, `includeEnded=false`), so only `AVAILABLE`, `LOW` and `SOLD_OUT` come back. Sold-out Stimpies are previewable but not addable (section 10.5). Upcoming and ended Stimpies are never requested.
4. A colour that exists in `GET /options` but has no entry in `config.colors` is **not shown** in the Builder (the founder has not set its look yet; plan Phase 2 exit test). It still appears in the shop.
5. A colour usable in only one view of a `BOTH` configuration is shown; when the user switches to the view that cannot render it, the selection moves to the first usable colour of that view (no error message; the swatch for the unusable colour is hidden in that view).
6. If, after filtering, there are zero usable colours or zero Stimpies, show the static fallback (section 6.5).

---

## 3. Mode resolution and the in-page toggle

```
effectiveMode = '2D'    -> render 2D. No toggle. three.js is never requested.
effectiveMode = '3D'    -> try 3D. No toggle. On failure -> automatic fallback to 2D (if 2D assets exist) else static fallback.
effectiveMode = 'BOTH'  -> start in defaultView (subject to fallback rules); show the 2D / 3D toggle.
```

| Rule | Detail |
|---|---|
| Toggle visibility | Shown **only** when `effectiveMode === 'BOTH'` **and** 3D is currently viable (not auto-disabled). When 3D was auto-disabled, the toggle is hidden (no disabled/greyed control, no message). |
| Toggle form | A two-segment control: "2D" / "3D", 44 px tall minimum, keyboard operable, `role="radiogroup"`. Placed top-right of the stage. |
| First view | `defaultView`, unless fallback rules force 2D (section 6). A user who explicitly switches to 3D later overrides the slow-connection default, but **not** a hard failure (WebGL unsupported / context lost). |
| Persistence | The user's last explicit choice is kept in `sessionStorage` (`stimpy.builder.view`), wrapped in try/catch. It is not persisted across sessions. |
| Preserving selection | Switching 2D <-> 3D keeps the selected colour, Stimpie and pack. The swap animation does not replay. |
| Config changes | `effectiveMode` is read on each server render/revalidation (60 s). A founder changing the mode in the dashboard is reflected after at most `60 s + 30 s` (Next revalidate plus the API's `max-age=30`). In dev, set `revalidate: 0`. |
| `3D` only mode on a weak device | Falls back to 2D if 2D assets exist for the selected colour; otherwise the static fallback. The founder is warned about this in the dashboard (section 8). |

---

## 4. 2D mode

### 4.1 Layering model

2D mode is plain DOM/CSS (no canvas, no WebGL). One fixed-aspect **stage** element contains, bottom to top:

| Layer | Content | Notes |
|---|---|---|
| 0 Stage background | Cream (`--color-cream`) or white | Not black: the brand rule is "hoodie stays calm"; the dark hoodie reads best on cream. |
| 1 Hoodie | `<img>` of `colors[].hoodieImage2d` for the selected colour | `object-fit: contain`, fills the stage. Decorative colour changes cross-fade 150 ms (instant with reduced motion). |
| 2 Stimpie (old) | `<img>` of the previous Stimpie art | Exists only during a swap. |
| 3 Stimpie (new) | `<img>` of the selected Stimpie art | Positioned by `placement2d`. |
| 4 Zip line | A 4 px high element with a tooth pattern | Exists only during a swap. |
| 5 Shade overlay (optional) | `<img>` of `colors[].overlay2d`: a pre-rendered transparent PNG/WebP of fabric shading/seams that sits over the Stimpie, same box as the hoodie image | Rendered only when `overlay2d` is not `null`. Without it, the panel can look pasted on; fall back to `multiply` blending with a subtle inner-edge gradient (allowed). |
| 6 "Preview" chip | Text label | Section 1. |

The stage has the aspect ratio of the hoodie image (recommended 4:5, section 7.3). Layers 2-4 share one wrapper positioned by `placement2d`, so a swap never moves layout.

### 4.2 Placement maths

`placement2d` is `{ x, y, width, rotation }` with this defined geometry ([API §3.6](../backend/api-reference.md#36-builder-config)): `x` and `y` are the **centre** of the Stimpie panel as fractions (0..1) of the hoodie image's width and height; `width` is the panel width as a fraction of the image width; the panel height is `panelWidthPx / 0.64`; `rotation` is degrees **clockwise** about the centre.

```
panelWidthPx  = stageWidthPx * placement2d.width
panelHeightPx = panelWidthPx / 0.64              // Stimpie artwork aspect, section 7.4
left  = stageWidthPx  * x - panelWidthPx  / 2
top   = stageHeightPx * y - panelHeightPx / 2
transform: translate(left, top) rotate(rotation deg)   // transform-origin: centre
```

Implement with CSS percentages (`left: calc(x * 100%)`, `width: width * 100%`, `aspect-ratio: 16/25`, `transform: translate(-50%, -50%) rotate(...)`) so it scales with the stage without JS and without layout shift.

### 4.3 Zip-wipe swap, frame by frame

Total duration **450 ms**, easing `cubic-bezier(0.65, 0, 0.35, 1)` (the `--motion-zip` tokens in [design-system.md](design-system.md#10-motion)). Timeline at 60 fps (27 frames). The new image must already be **decoded** (`img.decode()` awaited) before frame 0; if it is not decoded within 400 ms, swap without animation (instant) rather than stall.

| Time (frames) | What moves |
|---|---|
| 0 ms (f0) | Layer 3 (new art) is mounted above layer 2 (old art) with `clip-path: inset(0 0 100% 0)` (fully hidden). Zip line sits at the panel's top edge, `opacity: 0`. |
| 0-50 ms (f0-f3) | Zip line fades in (`opacity 0 -> 1`). Nothing else moves. |
| 50-400 ms (f3-f24) | The zip line travels **top to bottom** over the panel (`translateY(0 -> panelHeight)`, eased). The new art is revealed above the line: `clip-path` animates `inset(0 0 100% 0) -> inset(0 0 0 0)` in lock-step. Below the line the old art is still visible. The line is 4 px, `--color-black` with 2 px teeth at 6 px pitch (repeating gradient background; no images). |
| 300-450 ms (f18-f27) | Settle: the wrapper scales `1 -> 1.012 -> 1` (ease-out). Overlaps the end of the wipe. |
| 400-450 ms (f24-f27) | Zip line fades out (`opacity 1 -> 0`). |
| 450 ms (f27) | Old art unmounted; new art becomes layer 2 for the next swap. |

Rules:
- **Only** `transform`, `opacity` and `clip-path` are animated; never `top/left/width/height`.
- Use `will-change: transform, clip-path` on the swap wrapper **only during** a swap, removed afterwards.
- **Rapid swapping:** if a swap is requested while one runs, the running swap is completed instantly (jump to its end state), then the new swap starts from there. At most one swap runs and at most one is pending; additional requests replace the pending one (latest wins). The carousel selection itself is never delayed.
- **Reduced motion:** swap is instant (single frame, no zip line, no settle). The colour change is also instant.
- **Colour change** (not Stimpie change): cross-fade the hoodie image 150 ms; the Stimpie layer stays; no zip wipe (the wipe is reserved for the swap).
- **Sound:** optional zip sound is muted by default, never autoplays, and only plays after a user gesture, with a visible mute/unmute button (plan section 7.1). Skip entirely in v1 if audio assets are not ready; it must not block the Builder.

### 4.4 Performance budget (2D)

| Item | Budget |
|---|---|
| Additional JS for 2D mode | <= 25 KB gzip beyond the shared app shell (no animation library; CSS + a small hook) |
| Hoodie image | <= 80 KB, WebP (AVIF if the pipeline supports it), max 1000 px wide |
| Stimpie art in 2D | <= 120 KB each, WebP, 640 px wide displayed max (source 800x1250) |
| First usable render | Hoodie image + first Stimpie visible within the page LCP target (<= 2.5 s on 4G mid-range Android). The hoodie image is the LCP element: server-rendered `<img>` with `fetchpriority="high"`, explicit `width`/`height`. |
| Preloading | After first render, on idle (`requestIdleCallback`, fallback `setTimeout 200`), preload and `decode()` the selected Stimpie's neighbours (+/-1 in the carousel). Never preload all Stimpies. Skip preloading when `navigator.connection.saveData` is true. |
| Memory | Keep at most 5 decoded Stimpie images referenced (selected, +/-1, previous, one spare). |
| CLS | 0: stage has `aspect-ratio` from the first byte. |
| Frame rate | Swap must hold 60 fps on a mid-range Android; if frame time sampling shows < 30 fps during two consecutive swaps, shorten the swap to a 200 ms cross-fade for the rest of the session. |

---

## 5. 3D mode

3D mode is a client-only module (`BuilderCanvas3D`) loaded by dynamic import only when 3D is actually chosen (section 6.4). It uses Three.js (pin an exact version in `package.json`; the guidance below assumes a release that has `THREE.NeutralToneMapping`, r162 or newer).

### 5.1 Scene graph

```
Scene
 |- Group "rig"
 |   |- (GLB scene root, name "Hoodie")
 |   |    |- Mesh "hoodie_body"        material: fabric (tinted)
 |   |    |- Mesh <backPanelMesh>      material: panel  (Stimpie texture)
 |   |    '- (optional decorative meshes sharing the fabric material, e.g. zip, cuffs)
 |   '- (nothing else; no skeleton, no animations)
 |- Lights (per preset, section 5.3)
 |- PerspectiveCamera (from model3d.camera)
 '- (no ground plane; transparent canvas over the page's cream)
```

| Setting | Value |
|---|---|
| Renderer | `WebGLRenderer({ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' })`. **Do not** set `preserveDrawingBuffer` (the existing video code does; it costs performance and is only needed for frame export). |
| Output | `renderer.outputColorSpace = THREE.SRGBColorSpace`; `toneMapping = THREE.NeutralToneMapping` (keeps Stimpie artwork colours close to the source; ACES, used in the video code, desaturates brand colours) with `toneMappingExposure = 1.0`. If the Three version in use lacks Neutral, use `NoToneMapping`. |
| Shadows | Off. A fake contact shadow is not needed (no floor). |
| Camera | `PerspectiveCamera(fov, aspect, near = 0.05, far = 20)`; position/target from config; `aspect` from the canvas size. |
| Background | Transparent; the page background shows through. |

### 5.2 Loading the model

1. `GLTFLoader` (with `MeshoptDecoder` set; Draco optional with decoder files served locally from `/draco/`, never from a CDN) loads `model3d.url`.
2. Find `backPanelMesh` by name. If missing: log a console warning, report `builder_fallback` (reason `PANEL_MESH_MISSING`) and fall back to 2D.
3. Find the body material (see section 7.1: the material named `fabric`). Set `material.color.set(tint)`.
4. Replace the panel mesh's material with a fresh `MeshStandardMaterial({ roughness: 0.9, metalness: 0, map: stimpieTexture })`. The panel is **never tinted**.
5. Compute the bounding box once; do **not** rescale or re-centre the model at runtime (the asset contract fixes units and origin, section 7.1). The camera comes from config.
6. Show the hoodie as soon as it loads, with a neutral placeholder (grey `MeshStandardMaterial`) on the panel until the first Stimpie texture is ready (max 300 ms typical).

### 5.3 Lighting presets (`model3d.lighting`)

Intensities assume physically-based light units (Three r155+). They are starting values to be tuned by eye against the real hoodie; the **setups** (which lights, where) are the requirement.

| Preset | Setup | Mood |
|---|---|---|
| `STUDIO` | `HemisphereLight(0xffffff, 0x8a8a8a, 0.6)`; key `DirectionalLight(0xffffff, 2.2)` at (2, 3, -4) (front-right of the back view); fill `DirectionalLight(0xffffff, 0.8)` at (-3, 1, -2); rim `DirectionalLight(0xffffff, 1.2)` at (0, 2, 3) | Clean, product-photo. Default. |
| `SOFT` | `AmbientLight(0xffffff, 1.0)`; `HemisphereLight(0xffffff, 0xcfc7bc, 0.9)`; one `DirectionalLight(0xffffff, 0.9)` at (1, 2, -3) | Flat, low contrast, shows artwork colour most faithfully. |
| `NIGHT` | `HemisphereLight(0x6677aa, 0x111111, 0.25)`; key `DirectionalLight(0xaabbff, 1.4)` at (-2, 2, -3); coral rim `DirectionalLight(0xFF7A59, 2.0)` at (1, 1.5, 3) | Premium, "on black" mood (use on dark sections). Rim colour is the brand coral. |

Positions are given for a model facing +Z with the default back-view camera on -Z (section 7.1); mirror Z if the asset is authored the other way.

### 5.4 Colour tint application

- `fabricMaterial.color.set(colors[].tint ?? Color.hex)`. Because `color` multiplies `map`, a fabric texture should be authored **light grey/neutral** so tinting works; document this for the founder (section 7.2).
- If `texture3d` is present: load as `fabricMaterial.map` (sRGB, `flipY = false`, `wrapS = wrapT = RepeatWrapping`). No normal maps in v1.
- Colour change: animate `material.color` towards the target over 150 ms (lerp in linear space); instant with reduced motion. Do not recreate the material.
- Very dark hoodies (tint near black) need `roughness: 0.95` and the `SOFT`/`STUDIO` rim light to show form; set fabric `roughness = 0.9` baseline in code, not in the GLB.

### 5.5 Texture handling

| Topic | Rule |
|---|---|
| Loader | `THREE.TextureLoader` (or `ImageBitmapLoader` + `CanvasTexture`; both fine). One `Texture` per Stimpie. |
| Colour space | `texture.colorSpace = THREE.SRGBColorSpace` for artwork and fabric textures. |
| `flipY` | `texture.flipY = false`, **because the panel UVs follow the glTF convention** (origin top-left; section 7.1). If the asset is authored with GL-convention UVs the artwork appears upside down: this is the first thing to check. |
| Fit | Compare the artwork aspect (`artworkWidth / artworkHeight`, or the loaded image size when those are `null`) with `model3d.panelAspect` (default 0.64). If they differ by more than 2%, apply "cover" cropping: `texture.repeat` / `texture.offset` centre-crop so the artwork is never stretched. Otherwise no fitting is needed. |
| Cross-origin | Load every texture with `crossOrigin = "anonymous"`; `/uploads/*` sends `Access-Control-Allow-Origin: *`, so WebGL may read them. |
| Anisotropy | `texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), tier === 'high' ? 8 : tier === 'mid' ? 4 : 2)`. The panel is seen at oblique angles when rotated, so this matters. |
| Mipmaps | `generateMipmaps = true`, `minFilter = LinearMipmapLinearFilter`, `magFilter = LinearFilter`. |
| Size | Textures are 1024 x 1600 (or 800 x 1250 as supplied) max; never above 2048 on the long side. Low tier: downscale to 640 wide with an offscreen canvas before upload. |
| Cache | An LRU map `stimpieId -> Texture` of **4 entries** (selected, +/-1, previous). On eviction call `texture.dispose()`. Never keep all Stimpie textures in GPU memory. |
| Preloading | Same idle rule as 2D; skip on `saveData`. |
| Swap upload | Upload textures **before** the swap starts: `renderer.initTexture(texture)` after load to avoid a hitch on the first frame. |
| Disposal | Evicted textures `dispose()`; `ImageBitmap`s are `close()`d. Material is reused, only `uniform` values change (section 5.7). |

### 5.6 Orbit controls

Use `OrbitControls` (from `three/examples/jsm/controls/OrbitControls.js`), configured as:

| Property | Value | Why |
|---|---|---|
| `enableDamping` / `dampingFactor` | `true` / `0.08` | Smooth, premium inertia. |
| `enablePan` | `false` | Keeps the hoodie centred. |
| `target` | `model3d.camera.target` | |
| `minPolarAngle` / `maxPolarAngle` | 70 deg / 100 deg (in radians) | Slight look-down to slight look-up; never under or over the hoodie. |
| Azimuth | Unlimited (full 360 degrees) | Visitors may look at the front; a **Back view** button resets to `model3d.camera.position` over 600 ms (instant with reduced motion). |
| `minDistance` / `maxDistance` | 0.7x / 1.3x the initial camera distance | Pinch zoom limits. |
| `enableZoom` | `true` for touch pinch **and** the +/- buttons; **mouse wheel zoom disabled** | Wheel capture would hijack page scroll on desktop. Implement by ignoring `wheel` events unless `ctrlKey` is pressed. |
| `rotateSpeed` | 0.6 | Precise on small screens. |
| `touches` | `{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }` with pan disabled so two fingers only dolly | |
| `autoRotate` | Off. A one-time idle "teaser" sway of +/-8 degrees over 2 s after the first render, cancelled by any input, and **skipped with reduced motion** | Hints that it is draggable. |

**No page-scroll hijack on mobile:** set the canvas CSS `touch-action: pan-y` **after** constructing the controls (OrbitControls sets `none` by default, which would trap vertical swipes). Vertical swipes then scroll the page; horizontal drags rotate. Verify on iOS Safari and Android Chrome (section 15, test 14). Add a visible hint on first view: "Drag to turn". Provide button alternatives (rotate left/right 45 degrees, zoom +/-, Back view) for keyboard and switch users.

### 5.7 Swap animation in 3D

Same timing as 2D (450 ms, `cubic-bezier(0.65, 0, 0.35, 1)`, same reduced-motion rule). Implementation: patch the panel `MeshStandardMaterial` via `onBeforeCompile` with two samplers (`mapOld`, `mapNew`) and a `uProgress` uniform (0..1):

1. Fragment: sample both maps; `float line = uProgress;` use the panel's `vUv.y` (0 at top in glTF convention): if `vUv.y < line` take `mapNew`, else `mapOld`.
2. Within `abs(vUv.y - line) < 0.006`, output the zip line colour (`#111111`) with a tooth pattern `step(0.5, fract(vUv.x * 40.0))`.
3. Panel pops outwards along its normal by 0 -> 3 mm -> 0 over the 450 ms (vertex displacement via `uProgress`, or `mesh.position` along the local axis), mirroring the 2D settle.
4. At `uProgress = 1`: `mapOld = mapNew`, progress reset to 0, the old texture is released to the LRU cache.
5. Rapid swaps follow the same "complete the running swap instantly, latest wins" rule as 2D.
6. If the shader patch fails to compile (logged via `renderer.debug.onShaderError`), fall back to a 200 ms cross-fade of `material.opacity` between two textures, and report `builder_fallback` reason `SHADER_PATCH_FAILED` once.

### 5.8 Resize and DPR

- Observe the canvas container with `ResizeObserver`; on change, `renderer.setSize(w, h, false)`, update `camera.aspect`, `updateProjectionMatrix()`, request one frame. Debounce to one resize per `requestAnimationFrame`.
- Pixel ratio by tier: `high` min(devicePixelRatio, 2), `mid` min(devicePixelRatio, 1.5), `low` 1. If frame-time sampling (section 6.3) shows < 40 fps on `high`/`mid`, drop one tier at runtime (set `renderer.setPixelRatio` again).
- The canvas has a fixed `aspect-ratio` (same as the 2D stage) so there is no layout shift on load.

### 5.9 Render loop, pausing, disposal

| Concern | Rule |
|---|---|
| Loop style | **Render on demand.** Run `requestAnimationFrame` only while something is animating (damping, swap, colour lerp, idle sway). When idle, render nothing. This saves battery and heat. |
| Off-screen | `IntersectionObserver` (threshold 0.05): when the canvas leaves the viewport, stop the loop; resume when it re-enters. |
| Hidden tab | `document.visibilitychange`: stop when hidden, render one frame on return. |
| Context loss | Listen to `webglcontextlost` (call `preventDefault()`, stop the loop) and `webglcontextrestored` (rebuild textures; re-run the render). If not restored within 3 s: fallback to 2D (section 6.2). |
| Unmount / mode switch | Cancel rAF; remove all listeners and observers; `controls.dispose()`; traverse the scene and `dispose()` every geometry, material and texture (including cached ones and `material.map`); `renderer.dispose()`; `renderer.forceContextLoss()`; remove the canvas element; null all references. Switching 3D -> 2D -> 3D 20 times must not grow GPU memory (test 17). |
| Strict Mode | React 18 dev double-mount must not leak: create the renderer in an effect and always clean it up. |

---

## 6. Automatic fallback and lazy loading

The page must **never show an alarming message**. On automatic fallback the user simply sees the 2D Builder. No toast, no banner, no "your device does not support...". The only hint allowed is a neutral, optional line in the Builder footer when 3D is available but was held back for data reasons: "3D view available" with a button (section 6.3 rule c).

### 6.1 Decision order (run once, before any three.js code is fetched)

```
1. effectiveMode === '2D'                      -> 2D.
2. Hard checks (any fails -> 2D, 3D hidden):
   a. WebGL2 (or WebGL1 + needed extensions) context cannot be created on a 1x1 test canvas.
   b. Renderer string matches /swiftshader|llvmpipe|software|basic render/i  (via WEBGL_debug_renderer_info, if exposed).
   c. gl.getParameter(gl.MAX_TEXTURE_SIZE) < 4096.
   d. window.matchMedia('(prefers-reduced-data: reduce)').matches.
3. Soft checks (any -> start in 2D; 3D stays selectable if mode is BOTH):
   a. navigator.deviceMemory !== undefined && navigator.deviceMemory <= 2.
   b. navigator.hardwareConcurrency <= 2.
   c. Data: navigator.connection?.saveData === true, or effectiveType in ['slow-2g','2g'],
      or effectiveType === '3g' (3D starts only after an explicit "Load 3D (about N MB)" tap).
4. Otherwise start in defaultView (BOTH) or 3D (3D-only).
5. After 3D renders: frame-time sampling (6.3).
```

Missing APIs (`deviceMemory`, `connection` are not available in Safari/iOS) count as "no signal", not as failure. The test canvas from check 2 is created once, and its context is released with `WEBGL_lose_context`.

### 6.2 Hard failures at runtime

| Event | Behaviour |
|---|---|
| GLB fetch fails / times out (15 s) / is not valid glTF | Fall back to 2D, report `builder_fallback`; one silent retry only if the failure was a network error. |
| `backPanelMesh` not found | Fall back to 2D (section 5.2). |
| `webglcontextlost` not restored in 3 s | Fall back to 2D. |
| Uncaught error in the render loop | Error boundary around `BuilderCanvas3D`; fall back to 2D. |
| 2D assets also missing for the selected colour | Static fallback (6.5). |

Fallback keeps the current colour/Stimpie selection and cart state.

### 6.3 Performance sampling and the "slow device" rule

After the first 3D frame, sample frame times for **60 frames or 1.5 s, whichever is later** (excluding the first 5 frames, which include shader compile):

| Result | Action |
|---|---|
| Median frame time <= 20 ms (>= 50 fps) | Stay in 3D at the current tier. |
| 20-33 ms (30-50 fps) | Drop one DPR tier (section 5.8) and sample again once. |
| > 33 ms median, or p95 > 50 ms, after the DPR drop | Switch to 2D automatically (silently). If `effectiveMode` is `BOTH`, keep the toggle hidden for this session. |

A short synthetic benchmark is also acceptable instead of waiting for frames (render the hoodie 10 times to an off-screen target at 256 px, time it, > 120 ms total = low tier), but the frame-time sampling above is the required minimum because it measures reality. Cache the verdict in `sessionStorage` (`stimpy.builder.tier`) so reloads in the same session skip the probing.

The data rule (3c) means: on slow-2g/2g/saveData **3D never downloads**; on 3g the 3D module and GLB are downloaded only after a tap on "Load 3D" (label includes the size from `model3d.sizeBytes`, e.g. "Load 3D (about 2.4 MB)", rounded to one decimal in MB).

### 6.4 Lazy loading

| Asset | Fetched when |
|---|---|
| three.js, loaders, controls chunk | Only after the decision order says 3D is viable **and** (view is 3D by default, or the user taps the 3D toggle). Loaded via `import()` behind `next/dynamic({ ssr: false })` or a plain dynamic import in an effect. Never in the initial JS of `/` or `/builder`. |
| `model3d.url` GLB | Only after the three.js chunk has loaded. Use `fetch` with progress where available to drive a thin progress bar over the poster (2D image stays visible until the first 3D frame is ready, then cross-fades 150 ms). |
| 3D textures | After the GLB, for the selected Stimpie first, neighbours on idle. |
| 2D images | Server-rendered for the first colour and Stimpie; the rest on demand/idle. |
| Prefetch hint | When `effectiveMode` is `BOTH` with 2D default and the device is `high` tier on a fast connection, the 3D chunk may be prefetched on idle after the 2D Builder is interactive (`<link rel="prefetch">` or dynamic import without executing). Never on soft-check devices. |

Budget: three.js chunk (tree-shaken, including GLTFLoader and OrbitControls) <= 250 KB gzip; GLB <= 2.5 MB target.

### 6.5 Static fallback (when nothing can render)

A non-interactive card: first usable colour's hoodie photo (`Color.images[0]`) with the first Stimpie's art in a row beneath, a link to the shop, and the sentence "Try Stimpies on the hoodie: browse the shop." No error wording. Report `builder_fallback` reason `NO_RENDERER`.

---

## 7. Assets contract

### 7.1 GLB requirements (3D hoodie model)

| Requirement | Value |
|---|---|
| Format | `.glb` (glTF 2.0 binary). The API accepts up to 50 MB via `POST /admin/uploads`; the Builder's own budget is far lower and the dashboard must warn (section 8). |
| File size | Target <= 2.5 MB, hard limit 5 MB. Use meshopt (preferred) or Draco compression and no embedded textures. |
| Triangles | Target <= 40,000, hard limit 80,000 (whole scene). |
| Scene structure | One scene. No skeleton/skinned meshes, no animations, no morph targets, no cameras, no lights, no extras that need extensions beyond `EXT_meshopt_compression` / `KHR_draco_mesh_compression` / `KHR_materials_sheen` optional. |
| Units and orientation | Metres, +Y up, hoodie front faces **+Z** (so the back faces -Z and the default camera sits on -Z). About 0.70 m from shoulder seam to hem. Origin at the hoodie's centre of mass (roughly mid-chest). Transforms applied (scale 1, rotation 0 on all nodes). |
| Node naming | Root node `Hoodie`. Body mesh `hoodie_body`. Back panel mesh: **the name stored in `model3d.backPanelMesh`**, default `back_panel`. Names are case-sensitive and unique. |
| Materials | **Exactly two**: `fabric` (everything on the hoodie except the panel) and `panel` (the back-panel mesh only). Anything else is rejected by the dashboard validator. Materials are plain PBR (`baseColor` white, roughness 0.9, metallic 0); no textures embedded (the app sets colour/textures at runtime). |
| Back panel mesh | A slightly curved surface hugging the back, 800-2,000 triangles, **world-space proportions 0.64 : 1 (width : height)**, e.g. about 0.33 m x 0.52 m. Sits 1-2 mm proud of the body so there is no z-fighting. Its own mesh (not merged into the body). |
| Panel UV layout | One UV set (`TEXCOORD_0`). The panel's UVs cover the **full 0..1 square**, mapped so the artwork reads upright when viewed from the back (-Z), in the **glTF convention** (origin top-left, V down). No overlaps, no mirroring, no rotation, no padding, no atlas sharing. Texel density uniform (no stretching). |
| Body UVs | Needed only if a fabric `texture3d` is used: tileable, any layout. |
| Normals | Present, smooth. Tangents not required. |
| Detail the model must have | Visible zip outline around the panel (geometry, not texture), hood, sleeves, ribbed cuffs and hem. Coral hood-inside detail is optional (the hood interior is not visible from the back default camera). |

### 7.2 Textures

| Texture | Source | Size | Format | Notes |
|---|---|---|---|---|
| Stimpie artwork (2D layer) | `Stimpie.artworkUrl` | 800 x 1250 px, max 120 KB displayed | WebP/AVIF (delivered via the image optimiser) | Aspect 0.64 |
| Stimpie texture (3D) | `stimpieTextures[].textureUrl`, else `Stimpie.artworkUrl` | 1024 x 1600 recommended (0.64), max 2048 on the long side | WebP or PNG; sRGB | Overrides exist for prints needing adjustment (colour, bleed) in 3D |
| Fabric texture (3D, optional) | `colors[].texture3d` | 512 x 512 tileable, <= 100 KB | WebP/PNG, **neutral light grey**, sRGB | Multiplied by tint, so it must be neutral |
| Hoodie flat image (2D) | `colors[].hoodieImage2d` | 1000 x 1250 px (4:5) max 1200 wide | WebP, <= 80 KB, transparent or cream-matching background | One per colour, same framing and canvas size for every colour |

KTX2/Basis compression is a possible later optimisation (not v1).

### 7.3 Stage aspect

The 2D stage and the 3D canvas share one aspect ratio, **4:5** (portrait), full width on mobile, max 560 px wide on desktop beside the controls (two-column layout from `lg`).

### 7.4 How the 0.64 Stimpie aspect maps onto the panel

The existing Stimpie cards are 800 x 1250 px (`CW`/`CH` in `stimpy-video/app/src/cards.ts`), aspect 800/1250 = **0.64**. The video's hoodie slot (330 x 515 local units) has the same proportion (0.641).

| Place | Mapping |
|---|---|
| 2D | Panel box = `placement2d.width * stageWidth` wide, height = width / 0.64 (section 4.2). The image fills the box with `object-fit: cover`. |
| 3D | Panel mesh world proportions 0.64 : 1 with full-square UVs, so the 800 x 1250 image maps 1:1 without stretching. |
| Non-conforming artwork | If a Stimpie's `artworkWidth / artworkHeight` differs by more than 2% from the panel aspect (0.64, or `model3d.panelAspect` in 3D), the dashboard flags it on the Stimpie (Products -> Stimpies) and the Builder centre-crops ("cover") instead of stretching. Never letterbox inside the panel. |
| Corner signature | Each Stimpie already carries the small split-S icon (brand identity, section 5); the crop must not remove it, so the dashboard must warn if the artwork is not at the expected aspect. |
| Rounded corners | Real Stimpie panels may have rounded corners; in 2D apply `border-radius: 4%` on the panel box; in 3D bake the shape into the panel mesh or an alpha map. Decide with the physical product (open item for the founder). |

---

## 8. What the dashboard (Content -> Builder) must let the founder set

Backed by `GET /admin/builder` and `PUT /admin/builder`, `POST /admin/uploads`, `GET /admin/colors`.

| Control | Detail |
|---|---|
| Hoodie | Dropdown of hoodies (`hoodieId`, writable on `PUT /admin/builder`); this is the hoodie the Builder sells. Defaults to the first active hoodie. |
| Mode | Radio: 2D only / 3D only / Both. Default view radio (2D / 3D) **enabled only when Both**. Shows `assetsReady` status next to each mode and a warning if the selected mode is missing assets (the API returns `warnings: string[]` on `PUT`, show them verbatim as inline warnings, not blocking). |
| 3D model | Upload `.glb` (`POST /admin/uploads`, `purpose: "builder-model"`). After upload the page **parses the file in the browser** (GLTFLoader) and shows: file size (the server fills `model3d.sizeBytes` itself from the upload; the dashboard never sends it), triangle count, node names, material count, whether the scene contains skins/animations. Red/amber/green against section 7.1 budgets. **Back-panel mesh** is a dropdown filled from the parsed node names (default `back_panel`), not free text. A **Panel aspect** field (`model3d.panelAspect`, default 0.64) sits beside it. |
| Camera | Position, target (x/y/z) and fov fields, plus a "Use current preview view" button that reads the orbit camera in the live preview. "Reset" returns to defaults. |
| Lighting | Three radio cards `STUDIO` / `SOFT` / `NIGHT` with a live preview. |
| Per colour (one row per active colour from `GET /admin/colors`) | Hoodie flat image upload (`hoodieImage2d`) with size/aspect check; **placement editor** (drag/resize/rotate a Stimpie-shaped box over the image, locked to 0.64, with numeric `x`, `y` (panel centre), `width`, `rotation` (clockwise) fields and a sample Stimpie picker); optional shading overlay upload (`overlay2d`). The 3D tint and fabric texture are shown **read-only** here with a link "Edit in Products -> Colors" (they are edited only in `/admin/colors` as `builderTint` / `builderTexture`; `PUT /admin/builder` ignores them). Status chips from `assetsReady.colors2d[]`: "2D ready" / "2D missing", "3D uses tint"; overall counts from `assetsReady.overlays2d` and `assetsReady.stimpieTextures`. A new colour added in Products -> Options appears here as "Not set" and is hidden from the public Builder until set. |
| Per-Stimpie 3D override | Searchable list of Stimpies with an optional texture upload (`stimpieTextures`), showing the default artwork beside it and the aspect check (section 7.4). |
| Live preview | The **same** Builder component as the website, fed with the form's unsaved state (client-side only, no API call), with a 2D/3D toggle regardless of the mode being edited, and a throttle simulator (slow 3G, low tier) to test fallback. |
| Save | `PUT /admin/builder` takes the full object as returned by `GET` and is live immediately: there is no draft or publish step in v1 (saved = live; the preview above is client-side and happens before saving). Show a confirmation, the returned warnings, and an "Open /builder" link. |
| Safety | "Switch to 2D only" is one click at all times (the plan notes 3D can be switched off if it misbehaves). Unsaved-changes guard on navigation. |

---

## 9. Reuse analysis of existing code

Honest summary: **the existing code is cinematic video tooling, not a real-time product viewer.** Little of it can ship as the Builder. Reusable value is in ideas, constants and the pattern of loading a GLB; the renderers themselves must be rewritten.

Files read for this analysis: `stimpy-video/README.md`, `stimpy-video/app/src/hoodie.ts` (read in full), the first 30 lines of `stimpy-video/app/src/avatar.ts` and the loader section, `second_video/stimpy/README.md`, and the first 120 lines of `second_video/stimpy/app/src/engine/hoodie.ts`. `cards.ts`, `scene.ts`, `worlds.ts`, the rest of `avatar.ts`/`engine/hoodie.ts` and the other `second_video` engine files were **not** read. Marked items "verify" must be checked by opening the file.

| Existing item | What it actually is | Reusable? |
|---|---|---|
| `stimpy-video/app/src/hoodie.ts` | A **2D canvas procedural drawing** of a near-black "ghost hoodie" (Path2D bezier shapes, gradients, `ctx.filter` blurs, rim light, walk animation with bob/sway/`turn` squash, kangaroo pocket on the front, "STIMPY" chest print). The Stimpie **slot** is a rectangle `SLOT = { x: -165, y: -235, w: 330, h: 515 }` (aspect 0.641) with four snap studs and a card drawn into it with a shadow and edge darkening. It is redrawn per frame into an offscreen canvas, tied to song timing (`HoodieOpts`: walk, turn, rim, tint...). Falls back to `avatar.draw` when `avatar.ready`. | **No** as a Builder renderer (black only, no colour variants, expensive per-frame blurs, video-timeline coupling). **Yes** as: (a) the confirmed 0.64 slot proportion; (b) a one-off **export** of a still back-view PNG for the black hoodie, if its look is acceptable as the 2D hoodie image (verify visually; it is a stylised ghost, not a product render); (c) the idea of darkening panel edges so it "sits on fabric". |
| `stimpy-video/app/src/avatar.ts` | A three.js module that loads a **GLB of a full CC0 character wearing a hoodie** ("Hoodie Character", Quaternius Ultimate Modular Men pack, per its header comment), restyles materials by name, scales it to 1.78 m, and attaches the Stimpie as a **curved panel** (`BEND = 1.2`) with four snap studs. Renders at a fixed 1080 x 1920 with `preserveDrawingBuffer: true`, `ACESFilmicToneMapping`, PCF soft shadows, `setPixelRatio(1)`; skinned, animated, posed from song time. Model files live in `stimpy-video/app/public/models/` (**file names and sizes not inspected: verify**). | **Not as is**: it is a person, not a hoodie; skinned and animated; the model size and polygon count are unknown and probably over budget; fixed resolution; shadows and `preserveDrawingBuffer` are wrong for a phone viewer. **Possibly** as an **asset source**: if the licence is confirmed CC0 (verify against the pack's licence file), the hoodie geometry could be separated from the character in Blender, de-skinned, retopologised to budget and given a proper back-panel mesh and UVs (section 7.1). **Reusable code patterns**: `GLTFLoader` usage, restyling by material name, `CARD_ASPECT`, the curved-panel idea. |
| `second_video/stimpy/app/src/engine/hoodie.ts` | A three.js-based **procedural fabric height-map plane**: garment parts rasterised, blurred and stacked into a height map, lit in a custom shader. A Stimpie panel mesh that curls (page-peel), ripples, and a **zipper with interlocking teeth and a pull running around the panel edge** (the `zipPoint(s)` function gives position and tangent along the zip path). `DOCK = { x: 0, y: -55, w: 300, h: 364, r: 22 }` is the panel footprint (aspect 0.82, **different from 0.64: do not copy**). Rendered offline with motion-blur accumulation. | **No** as a 3D hoodie: it is a flat plane with shader-faked relief, so it cannot be orbited. **Yes** as design reference: the zipper geometry maths (`zipPoint`) could drive a more elaborate zip animation later; the page-peel/curl idea; the fact that the zip should start at the bottom centre (`ZIP_START`). v1 uses the simpler top-to-bottom wipe (section 4.3) for performance. |
| `content/stimpy-video/app/src/cards.ts` and `content/stimpy-video/out/stimpies/stimpie-000.png ...` | Procedurally drawn Stimpie "tarot cards" (`CW = 800`, `CH = 1250`, 17 designs) and exported PNGs (`stimpie-000.png` onward, plus `lookbook.jpg`). | **Yes, as placeholder artwork** for development and for seeding the `artworkUrl` of demo Stimpies. Verify the PNG dimensions are 800 x 1250 (not opened here). They are illustrative designs, not final prints, so real artwork replaces them. |
| `stimpy-video/app/src/scene.ts`, `worlds.ts`, `song.*`, post-processing | Video choreography | **No.** |

### Recommended approach

1. **2D mode: build from scratch with DOM layers** (section 4). Produce one flat back-view hoodie image per colour (a Blender/clay render of the final hoodie shape, or flat-lay photography on a neutral background) with identical framing. The current ghost hoodie may serve as the placeholder for the first colour if it is exported as a still.
2. **3D mode: build a new real-time module** (section 5), loading a **dedicated hoodie GLB** that meets section 7.1. Source the GLB by one of: (a) modelling it new in Blender (preferred, ~1-2 days, full control of UVs and budget), (b) extracting and cleaning the hoodie from the Quaternius character after licence verification, or (c) commissioning one. Decision needed from the founder (plan decision #8). Until it exists, `effectiveMode` is `2D` by API rule, so the rest of the Builder can ship first (plan Phase 2: 2D first).
3. Reuse **only**: the 0.64 aspect, the loader/restyle pattern, the placeholder card images, and the zipper maths as inspiration.
4. Do not import any file from `stimpy-video` or `second_video` into `apps/web`. Copy individual assets deliberately into the dashboard-uploaded content instead.

---

## 10. UI, pack/size flow and Add to cart

### 10.1 Layout

Mobile (one column, top to bottom): stage (4:5) -> colour swatches -> Stimpie carousel -> pack selector -> running price + Add to cart (sticky bottom bar on mobile). From `lg`: two columns (stage left, controls right), Add to cart in the right column.

| Element | Spec |
|---|---|
| Stage | 2D or 3D, "Preview" chip, mode toggle (only when BOTH), 3D helper buttons (rotate left/right, zoom +/-, Back view) shown in 3D only. |
| Colour swatches | `ColorSwatch` row (design system), 44 px tap target, swatch circle 32 px with 2 px black ring when selected plus the colour name beneath/in a tooltip. Order by `Color.position`. A colour with no available variants shows a diagonal strike and "Sold out" in its accessible name; it is still previewable. |
| Stimpie carousel | Horizontal scroll-snap list of Stimpie cards (art at 0.64, name, price, tag). Selected card has a 3 px black outline (or the drop's accent colour for limited Stimpies, never more than one accent per view) and a check icon. Tags: `Core`, `Limited`, `Last few`, `Sold out` from `type`/`status`. Cards use `role="listbox"`/`option`. |
| Swipe | Native scroll-snap (`scroll-snap-type: x mandatory`) gives swipe for free; **tapping** a card selects it (selection does not change by scroll alone). Edge fade hints more items. |
| Keyboard | The carousel is a single tab stop (roving tabindex): Left/Right (or Up/Down) move focus and select, Home/End jump, Enter/Space confirm if selection is on focus-only, `Tab` leaves. `aria-activedescendant` or roving focus; focus ring 3 px offset 2 px (design system). Swatches: arrow keys inside a `radiogroup`. |
| Selected-state | Visible without colour alone: outline + check icon + `aria-selected="true"`. Announce changes via a polite live region: "Midnight Cedar selected. Hoodie plus 2 Stimpies, $45." |
| Pack selector | Segmented control driven by `GET /packs`: one option per pack (by `stimpieCount`: 1 and 2 today) plus "Hoodie only" (uses the hoodie `priceCents`). Default selection is the pack with `badge === "Most popular"`; fall back to the highest `stimpieCount`. Option shows `name` and `priceCents`, and the `badge` if present. |
| Running price | `PriceTag` showing the current total: pack `priceCents` (pack total includes hoodie + its Stimpies); hoodie-only uses the hoodie's `priceCents`. Updates immediately on pack change. Text under it: pack `description` and "Pay cash on delivery". Extra Stimpies are **not** priced here (they are bought separately from the shop). Never compute prices that the server does not publish. |
| Add to cart | Electric blue, full width on mobile, label "Add to cart - $45". Disabled states in 10.5. |

### 10.2 Slots in a pack

A pack of N Stimpies requires exactly N entries in `stimpieIds` (contract: `stimpieIds.length` must equal the pack's `stimpieCount`).

- The **carousel always previews one Stimpie on the hoodie** (the one most recently chosen).
- The pack selector shows N "slots" chips above the carousel: for a 2-Stimpie pack, "On your hoodie" (slot 1) and "In the box" (slot 2). Tapping a chip makes that slot the target of the next carousel selection; the stage shows the Stimpie of the **focused slot** with the swap animation.
- Default behaviour: the first carousel tap fills slot 1; the second distinct tap while slot 2 is empty fills slot 2 (auto-advance), and so on; once all slots are full a tap replaces the focused slot.
- The same Stimpie in both slots is **not allowed**: a pack is N different designs, and the API rejects duplicates in `stimpieIds` with `VALIDATION_ERROR` on `items.N.stimpieIds.M`. The UI disables the already-chosen card for the other slot. `LIMITED` Stimpies may be used in packs while their drop is live.
- Changing pack to a smaller `stimpieCount` drops the last slots; to a larger one adds empty slots (the cart button stays disabled until all are filled, with a hint "Pick 1 more Stimpie").

### 10.3 What exactly gets added to the cart

Item shape (from `CartItem`):

| Selection | Cart item |
|---|---|
| Pack chosen | `{ kind: 'pack', packId, hoodieId, colorId, sizeId, stimpieIds: [...], qty: 1 }` |
| Hoodie only | `{ kind: 'hoodie', hoodieId, colorId, sizeId, qty: 1 }` |

`hoodieId` is `config.hoodie.id` (the hoodie the Builder sells; the Builder never guesses and has no `?hoodie=` parameter). The cart also stores display data (names, art URL, unit price) for the drawer; the cart is checked with `POST /cart/validate` when the drawer opens, the server re-prices at order time, and the client sends `expectedTotalCents` (the grand total including delivery, taken from `validate.totalCents`).

### 10.4 Choosing size (bottom sheet)

Size is not shown on the stage page to keep it clean. Pressing **Add to cart** opens a size chooser (bottom sheet on mobile, modal on desktop) when no size is selected yet:

1. Title "Choose your size". Data: `GET /products/hoodies/:slug` -> `sizes` and `variants` for the selected `colorId`.
2. Size chips ordered by `Size.position`. A size with `inStock: false` for the chosen colour is disabled with "Sold out" in its accessible name. If `remaining` is not null, show "Only N left".
3. Link "Size guide" (opens `/help` size chart in a new tab; the sheet state is preserved).
4. Primary button "Add to cart - $45" (enabled after a size is picked). The sheet closes, the cart drawer opens with the new line, and focus moves to the drawer heading.
5. The chosen size is remembered in `sessionStorage` (`stimpy.size`) as a convenience for later adds.

If all sizes are out for the chosen colour: Add to cart is disabled with the text "This colour is sold out. Try another colour." and the swatch is struck.

### 10.5 Add-to-cart state matrix

| Situation | Behaviour |
|---|---|
| Pack N slots not all filled | Disabled; hint "Pick N more Stimpies". |
| Any chosen Stimpie `purchasable === false` | Disabled; the offending card shows its reason (`SOLD_OUT`, `UPCOMING`, `ENDED`); hint "Choose an available Stimpie". |
| Stimpie `status === 'UPCOMING'` | Not in the list by default (`includeUpcoming=false`). If reached via a share link, show it as "Coming soon", not addable, with a link to the drop page. |
| Share link refers to a missing/hidden Stimpie or colour | Ignore silently and use defaults (section 11). |
| Stock changes between preview and checkout | Handled by `POST /cart/validate` (per-line problems, when the drawer opens) and at checkout (`SOLD_OUT`, `NOT_PURCHASABLE`; see [state-and-errors.md](state-and-errors.md)). The problem items carry `kind` (`HOODIE_VARIANT` or `STIMPIE`), the ids and `itemIndex`, so the Builder can mark exactly the Stimpie, colour or size that failed in the cart lines it added. The Builder never promises stock. |

---

## 11. Share link

URL: `/builder?color=<colorId>&stimpie=<slug>`.

| Param | Value | Notes |
|---|---|---|
| `color` | `Color.id` (integer) | Colours have no slug; ids are acceptable for v1. |
| `stimpie` | `Stimpie.slug` | The slot-1 Stimpie. |
| `pack` (optional) | `Pack.slug` | Restores the pack. |
| `stimpie2` (optional) | `Stimpie.slug` | Slot 2 for 2-Stimpie packs. |
| `view` (optional) | `2d` or `3d` | Honoured only if that view is available; never overrides fallbacks. |

Rules: read once on load (server component reads `searchParams`), then keep the URL in sync with `history.replaceState` (no history entry per click). Invalid or unavailable values are ignored (defaults apply) and never produce an error. Share button: `navigator.share({ title, url })` if available, else copy to clipboard with a toast "Link copied". Link previews (Open Graph) for `/builder` with params use the selected Stimpie's `artworkUrl` and a title like "Midnight Cedar on a Stimpy hoodie" (server `generateMetadata`). The Stimpie detail page "Preview on my hoodie" opens `/builder?stimpie=<slug>`.

---

## 12. Home-page teaser

A compact Builder inside section 3 of the home page ("Builder teaser").

| Aspect | Spec |
|---|---|
| Size | Stage max height 420 px on mobile (4:5 stage scaled), 480 px on desktop; one row of up to **4 colours** and up to **6 Stimpies** (core first, then the live drop). |
| Mode | **Always 2D**, regardless of `effectiveMode`. three.js is never loaded on the home page. If the first colour has no 2D assets (3D-only configuration), the teaser degrades to a static card strip (art cards over a hoodie photo from `Color.images[0]`) with the same link. |
| Interaction | Colour swatches and a tap-to-swap carousel, with the same zip wipe. No pack selector, no size sheet. Reduced motion respected. |
| CTA | "Open full Builder" (link to `/builder?color=<id>&stimpie=<slug>` carrying the current selection). The home page also has the blue "Order now" CTA elsewhere; the teaser CTA is a secondary/outline button (electric blue is reserved for primary actions). |
| Loading | Below the fold: render the shell server-side, hydrate on visibility (`IntersectionObserver`, rootMargin 200 px). The teaser's images must not compete with the hero for LCP; its images are `loading="lazy"`. |
| Data | Same three endpoints; they are already fetched for other home sections where possible (shared Next fetch cache). |

---

## 13. Accessibility

| Topic | Requirement |
|---|---|
| Keyboard | Everything operable without a pointer: swatches (arrow keys), carousel (section 10.1), mode toggle, pack selector, 3D buttons (rotate +/-45 degrees, zoom +/-, Back view), size sheet (focus trap, Esc closes, focus returns to Add to cart). |
| 3D canvas | The canvas has `role="img"` and `aria-label` that reflects state: "3D preview of a {colour name} Stimpy hoodie with the {Stimpie name} Stimpie on the back. Drag to rotate." The label updates on every selection. Wrapping region has `aria-live="polite"` (one concise sentence, not for every frame). Keyboard users get the helper buttons; OrbitControls' own keyboard rotation is also enabled (`controls.listenToKeyEvents`) only while the canvas has focus (`tabindex="0"`). |
| 2D images | Hoodie `<img alt="{colour name} Stimpy hoodie, back view">`; the Stimpie layer `alt="{Stimpie name} Stimpie"`. During a swap both images exist: the outgoing one gets `alt=""` and `aria-hidden="true"` for the duration. |
| Reduced motion | `prefers-reduced-motion: reduce` -> swap is **instant**, no idle sway, no damping inertia (set `dampingFactor` to 1 or disable damping), no cross-fades, no carousel smooth-scroll. The Back view reset is instant. |
| Contrast and targets | All text meets the brand contrast table; tap targets >= 44 x 44 px; focus ring visible. Selected state does not rely on colour alone. |
| Preview label | The "Preview" text is real text (not an image) and is in the accessible name of the stage region. |
| Zoom | Layout works at 200% text size; the stage scales, controls wrap. |
| No traps | A user must be able to tab past the 3D canvas; the canvas must not capture the arrow keys unless focused. |
| Errors | Fallbacks are silent for sighted users; do not announce them to screen readers either, except that the stage label updates (e.g. no "3D" wording). |

---

## 14. Analytics events

Privacy-friendly (no PII, no cookies required); names are snake_case; see the catalogue and rules in [state-and-errors.md](state-and-errors.md#17-analytics-events-catalogue). Builder events:

| Event | Properties | When |
|---|---|---|
| `builder_open` | `surface` (`page`/`teaser`), `source` (`nav`/`stimpie_page`/`share`/`home_cta`) | Builder becomes visible |
| `builder_mode_resolved` | `effective_mode`, `view` (`2d`/`3d`), `tier` (`high`/`mid`/`low`), `reason` (`DEFAULT`/`WEBGL_UNSUPPORTED`/`LOW_MEMORY`/`SLOW_CONNECTION`/`SAVE_DATA`/`SLOW_FRAMES`/`USER_TOGGLE`) | After the decision order runs |
| `builder_fallback` | `reason` (`WEBGL_UNSUPPORTED`/`CONTEXT_LOST`/`GLB_FAILED`/`PANEL_MESH_MISSING`/`SHADER_PATCH_FAILED`/`SLOW_FRAMES`/`NO_RENDERER`) | Each automatic fallback (once per session per reason) |
| `builder_toggle_view` | `to` (`2d`/`3d`) | User flips the toggle |
| `builder_color_select` | `color_id` | Colour changed |
| `builder_stimpie_select` | `stimpie_slug`, `slot`, `view` | Stimpie changed |
| `builder_swap_done` | `view`, `duration_ms` (measured), `dropped_frames` (rounded) | After each swap (sampled: 1 in 5, plus the first) |
| `builder_pack_select` | `pack_slug` or `hoodie_only` | Pack changed |
| `builder_3d_interact` | `kind` (`rotate`/`zoom`/`reset`) | First of each kind per session |
| `builder_share` | `method` (`native`/`copy`) | Share pressed |
| `builder_see_photos` | `target` (`stimpie`/`hoodie`) | "See real photos" clicked |
| `builder_size_sheet_open` | none | Size sheet shown |
| `builder_add_to_cart` | `kind` (`pack`/`hoodie`), `pack_slug`, `value_cents` | Cart item added |
| `builder_load_3d_tap` | none | User taps "Load 3D" on a slow connection |
| `builder_perf` | `view`, `median_frame_ms`, `fps_tier` | Once after the sampling window |

Events go to the privacy-friendly third-party or self-hosted tool chosen in [state-and-errors.md](state-and-errors.md), on the website only and with no personal data (not to the Stimpy API; there is no event endpoint in v1). UTM values captured on landing are not an analytics event: they are sent as `attribution` on `POST /orders`.

---

## 15. Test plan

Run on: a recent iPhone (Safari and the Instagram in-app browser), a mid-range Android (Chrome, Instagram in-app browser), a low-end Android (2 GB RAM), desktop Chrome/Firefox/Safari. Use Playwright for the automatable cases and the browser's throttling/WebGL flags for the others.

| # | Area | Test | Expected |
|---|---|---|---|
| 1 | Dashboard mode | Set mode to 2D only, save, reload `/builder` (after revalidate) | 2D renders; no three.js request in the network log; no toggle. |
| 2 | Dashboard mode | Set 3D only | 3D renders on capable device; no toggle; falls back to 2D silently on weak device. |
| 3 | Dashboard mode | Set Both with default 3D, then default 2D | Toggle visible; opens in the chosen default; selection preserved when toggling. |
| 4 | Dashboard mode | Set 3D/Both with no GLB uploaded | `GET /builder/config` returns `effectiveMode: 2D`; page behaves as 2D only; dashboard shows the `PUT` warning. |
| 4a | Hoodie | Change the Builder hoodie in the dashboard, save, wait for revalidation | Add to cart sends the new `config.hoodie.id`; sizes come from the new hoodie's slug. |
| 4b | Saved = live | Save in the dashboard (no draft step) | The website shows the change after revalidation; the dashboard preview was client-side only before saving. |
| 5 | New colour | Add colour in Products -> Options without a Builder look | Colour does not appear in the Builder; after setting image+placement it appears without code change. |
| 6 | Missing asset | One colour lacks `hoodieImage2d` in 2D | Swatch hidden in 2D; if it was selected via share link, first usable colour is chosen; no error shown. |
| 7 | Missing asset | `stimpieTextures` URL returns 404 | 3D uses `artworkUrl`; if that fails, keeps previous art and the card shows no art placeholder; no crash. |
| 8 | Missing asset | `model3d.url` returns 404 or corrupt GLB | Falls back to 2D silently; `builder_fallback` fired once. |
| 9 | Missing asset | `backPanelMesh` name wrong | Falls back to 2D; console warning with the mesh names found. |
| 10 | WebGL disabled | Disable WebGL (Chrome flag) with mode Both/default 3D | 2D shown, toggle hidden, no three.js chunk requested. |
| 11 | Context loss | `WEBGL_lose_context.loseContext()` while in 3D | Loop pauses; restores or falls back to 2D within 3 s; state preserved. |
| 12 | Low-end phone | 2 GB / 4x CPU throttle, mode Both default 3D | Starts in 2D (soft check) or drops to 2D after frame sampling; never freezes the page. |
| 13 | Slow connection | Throttle to slow 3G | 3D not downloaded automatically; "Load 3D (about N MB)" (N from `model3d.sizeBytes`) requires a tap; 2D images load progressively; LCP element is the hoodie image. |
| 14 | Touch scroll | On a phone, swipe vertically over the 3D canvas | The page scrolls; horizontal drag rotates; two-finger pinch zooms within limits; no scroll lock. |
| 15 | Orbit limits | Drag aggressively up/down, pinch fully in/out | Polar stays 70-100 degrees; distance stays 0.7x-1.3x; no flip, no clipping. |
| 16 | Rapid swapping | Tap through 10 Stimpies in 2 seconds | No more than one animation runs; final state is the last tap; no blank panel; frame rate acceptable; no console errors. |
| 17 | Memory leak | Automated: perform 200 swaps in 3D (alternating Stimpies), then 20 toggles 3D<->2D, record `renderer.info.memory` (geometries, textures) and Chrome heap | `info.memory.textures` never exceeds 6 during swaps and returns to 0 after unmount; heap after forced GC grows < 10% versus after swap 20; no detached canvases. |
| 18 | Memory leak 2D | 200 swaps in 2D | Decoded image count bounded (<= 5 referenced); heap stable. |
| 19 | Off-screen | Scroll the 3D stage out of view / switch tab | rAF stops (verify via `renderer.info.render.frame` not increasing); resumes on return. |
| 20 | Resize | Rotate phone, resize desktop window | Canvas keeps aspect, no stretch, no blur flash; DPR cap applied. |
| 21 | Reduced motion | Enable reduced motion in OS | Swap, colour change, sway and Back view are instant; no zip line. |
| 22 | Keyboard | Operate entire Builder with keyboard only | Every control reachable and operable; focus order matches visual order; focus returns properly from the size sheet. |
| 23 | Screen reader | VoiceOver/TalkBack on swatches, carousel, canvas | Names, selected state and live announcements correct; the canvas label updates. |
| 24 | Share link | Open `/builder?color=2&stimpie=<slug>`; also with invalid values | Correct selection; invalid values ignored silently; URL stays in sync. |
| 25 | Pack flow | Select 2-Stimpie pack, fill both slots, choose size, add | Cart gets one `pack` item with `stimpieIds.length == 2`, correct `sizeId`, price from the pack; drawer opens. |
| 26 | Stock | Choose a colour whose sizes are all out of stock | Add to cart disabled with message; other colour works. |
| 27 | Sold-out Stimpie | Select a `SOLD_OUT` Stimpie | Previewable; Add to cart disabled with reason. |
| 27a | Catalog defaults | Carousel contents with an `UPCOMING` and an `ENDED` Stimpie in the database | Neither appears (default `includeUpcoming=false`, `includeEnded=false`). |
| 27b | Duplicates | In a 2-Stimpie pack, try to pick the same Stimpie for both slots | The chosen card is disabled for the other slot; the API is never sent a duplicate. |
| 27c | Cart validate | Sell out a Stimpie in the cart, open the drawer | `POST /cart/validate` marks the line using `kind`/ids/`itemIndex`; the right line is flagged. |
| 27d | Textures cross-origin | Load a 3D texture from the uploads origin | No CORS/tainted-texture error (`crossOrigin = "anonymous"`). |
| 27e | Placement | 2D panel with `rotation: 10` | Panel centred on `x`,`y`, tilted 10 degrees clockwise. |
| 27f | Overlay | A colour with `overlay2d` set and one without | Overlay drawn over the panel only where set. |
| 28 | Instagram browser | Open the link inside Instagram's in-app browser on iOS and Android | 2D works; 3D either works or falls back; sheets and share work. |
| 29 | Home teaser | Load `/` | No three.js request; teaser swaps with zip wipe; CTA carries selection to `/builder`. |
| 30 | Config revalidation | Change mode in the dashboard; wait for revalidate | Website reflects the change within about 90 s without redeploy. |
| 31 | Texture orientation | View each Stimpie in 3D from the back | Artwork upright, not mirrored, not stretched; correct against 2D. |
| 32 | Visual regression | Playwright screenshot of `/builder` per colour and per lighting preset | No unintended differences; colours of the brand art unchanged by tone mapping. |

---

## 16. Open questions for the API

The decisions for every earlier question (B1-B14) are recorded in [../open-questions.md](../open-questions.md), which is the decision log.

None open; every earlier question is settled in [../open-questions.md](../open-questions.md). Responsive image widths (B8) are handled by `next/image` with the API host in `remotePatterns`; colour share links use `colorId` (B6); analytics use a separate website-only tool (B11).
