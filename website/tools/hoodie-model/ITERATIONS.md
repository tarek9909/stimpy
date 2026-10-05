# Visual iteration log

Each round: generate, render with `viewer/shoot.mjs` (Chrome + SwiftShader), look at the PNGs as an art director, fix, repeat. Test artwork: stimpie-003 (art reads upright and unmirrored from the back in every round after the first render).

1. First pass (68k tris). Good start: believable silhouette, upright art. Faults: camera too tight; hood a tall narrow hump; shoulders/sleeves puffy and thick; zip passes over a single merged pocket; triangle count far over target.
2. Camera pulled back; sleeves slimmed; split pocket into two halves either side of the zip; hood widened and lowered; stitch tubes thinned; resolution trimmed (to 45k).
3. Hood bottom edge: found V-shaped tip, ragged intersection with torso. Switched the hood outer wall to a pillow profile, bottom lip `cos` shaped (U not V), then solved the drop continuously and smoothed it across theta.
4. Hood end now lands exactly on the displaced torso surface (profile uses 3D keys incl. lateral offset), displacement faded out at the end and a rolled edge tube hides the open edge. Jagged stair-step intersection gone. Torso fold noise masked under the hood zone.
5. Black hoodie read as a silhouette only. Added optional `KHR_materials_sheen` on `fabric` (colour 0.16, roughness 0.55): hood rim, hem ribs and sleeve folds now read on `#111111`; cream unaffected.
6. Elbow creases changed from lumpy sine to sharp valley creases; wrist gather noise lowered in frequency; cuff stitch ring (jagged) removed; hem fold noise faded near the band so the lip is clean; hem rib amplitude raised; panel zip teeth amplitude raised and pitch widened.
7. Hood front: edges now run to the zip with taper floor and a binding tube; displacement fades at the ends.
8. Close-up of the neck exposed a real bug: torso loft stopped at y = 0.311 instead of 0.335 (wrong denominator in the row table), leaving a hole under the collar. Fixed; neck/shoulder closed. Also found NaN vertices in the hood last column (sym > 1): bounding sphere was NaN, so the body vanished in some close-ups. Clamped, and the validator now rejects non-finite positions/normals.
9. Triangle budget brought to 39,968 (target 40,000): sleeve/hood/torso/hem resolution tuned, zip teeth and panel border pitch widened. Final previews rendered; validator passes.

Known open issues are listed in the final report (not repeated here).

## Second refinement pass (coordinator art-direction review)

10. Proportions: torso half-width 0.29 m (body 0.58 m wide chest, was 0.52), hem 0.365 m below origin, torso length +0.015 m; sleeves longer (cuff ends at hem line, rows concentrated at elbow and above the cuff), upper arm about 0.17-0.18 m diameter, forearm 0.12, cuff rib 0.10 (still tapering), arm angle about 9 deg from vertical. Bbox is now 0.905 x 0.876 m including hood and arms, shoulder-to-hem about 0.73 m. First render: hood too smooth, folds absent.
11. Hood: bigger cowl (rim height up to 0.084 m, width up to 0.11 m, drop 0.135 m on the back, forward drape 0.034 m at the front), large radiating gather folds (valley-shaped noise, 2 scales) plus small creases, irregular bottom lip, centre seam kept. Back panel still clear of the hood (panel moved 15 mm lower).
12. Hood look: first folds were too harsh/crumpled at the rim, toned the rim noise, rim stitches at full resolution. Front: hood sides now come down either side of the zip with drawcords from eyelets.
13. Surface: valley-style creases on torso (hem bunching, underarm drag, diagonal neck-to-armhole tension), sleeve elbow creases, compression wrinkles above the cuffs, shoulder drag folds. Back-panel zone masked to stay calm.
14. Ribs: hem 30 ribs, cuff 20 ribs, deeper amplitude (5.6 mm hem, 3.0 mm cuff), sharper rib profile, overlapping bead at top of the rib.
15. Front details: pocket slimmer, opening edge rolled with 4.8 mm tube and lifted gape toward the slant; zip tape crisper (higher), teeth bigger; pull tab is now a hollow rounded loop (hole through it); shoulder and armscye seams thicker (2.4 / 2.8 mm).
16. Black check: tried a front fill light (viewer `fl=1`) and a stronger sheen (0.6 grey, roughness 0.4). Form (seams, rib, hood, cuffs) reads at #1a1a1c, but the large flat surfaces stay very dark. Budget trimmed back to 40,100 triangles. Showcase set rendered (5 views x cream and #1a1a1c, STUDIO plus a front fill).

## Third pass (side view / depth / sleeves / hood)

17. Torso depth: front/back half-depths 0.14/0.133 at chest (total about 0.275 m, was 0.21), rounder superellipse (n 2.3-2.5), chest width 0.62 m (half-width 0.31). Hem depth raised to match. Side view no longer a plank.
18. Sleeves: path re-routed so the arm hangs from the armhole at mid-depth and falls nearly straight down (about 6 deg, slightly forward), elbow at z 0.02 and forearm angled forward to z 0.13 at the cuff; upper arm 0.19 m, forearm 0.13, cuff gather. Fewer, longer, softer folds; compression wrinkles only the last 10 cm above the cuff.
19. Hood: rim height up to 0.10 m, width up to 0.15 m behind the neck (about 0.11 m overhang behind the torso back), stronger gather folds. Reads as a hood draped behind the neck in side view. Panel stays clear.
20. Re-rendered the full showcase (10 images), looked at all: side, back, 3/4 back, front, 3/4 front in cream and black. validate.mjs OK. Triangles 40,100.

## Fourth pass (Builder feedback: sausage sleeves, lumpy hood, slab front)

21. Sleeves: tapered cap 0.18 m to forearm 0.12 m (cuff 0.095), cross-sections flattened laterally (0.88 vs 1.08), arms angled outward (~15 deg from vertical, elbow slightly bent, forearm forward), so there is daylight between arm and body below the armpit in front/back views. Bbox width 0.99 m.
22. Hood: wider, lower cowl (back extent up to 0.175 m, side extent bigger), folds mirrored about the centre seam so left/right are symmetric, large gather folds kept, fine creases cut, folds confined to the outer wall (inner lining smooth, was jagged), front ends tapered more so the hood edges no longer end as blocks; collar piping 6.8 mm.
23. Front: chest fuller at the pec line (front depth 0.148), diagonal tension creases between pocket corners and chest, pocket lift 7.5 mm, zip tape 2.8 mm high.
24. Fold amplitude up: hem 11.5 mm, underarm 11.5 mm, elbow 8.5 mm, compression wrinkles above cuff 9 mm over the last 13 cm; back-panel zone still masked. Panel raised 16 mm (centre y -0.066), still clear of the hood.
25. Rendered 12 previews (cream and #1a1a1c; back, front, 3/4 back, 3/4 front, side, hood top). validate OK, 40,228 triangles, camera [0, 0.02, -2.5].
