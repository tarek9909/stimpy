# Hoodie model generator

Procedural, seeded generator for the Builder's 3D hoodie (`docs/website/frontend/builder.md` section 7.1). No Blender, no downloads: plain Node + the repo's `three` / `playwright-core` / `sharp` for the preview harness only (the generator itself and the validator have zero dependencies).

## Re-run

```bash
# from C:\Projects\motion\website
node tools/hoodie-model/generate.mjs            # writes backend/seed-assets/models/hoodie.glb + hoodie.meta.json (deterministic, --seed=7 default)
node tools/hoodie-model/validate.mjs            # contract checker, exit code 1 on failure (add --json for machine output)
NOSHEEN=1 node tools/hoodie-model/generate.mjs  # same model without the optional KHR_materials_sheen on `fabric`
```

Two environment switches exist for debugging: `PARTS=1` prints the triangle count per part, `SKIP=hood,rimstitch` omits parts (by name prefix) from the output. Regenerate normally afterwards.

## Files

| File | Purpose |
|---|---|
| `generate.mjs` | The garment: torso loft, hood cowl, ribbed hem and cuffs, sleeves (relaxed pose, elbow creases, wrist gather), kangaroo pockets, front zip with tape/teeth/slider/pull, drawcords with eyelets/knots/aglets, seams, back panel + zip border. |
| `lib/math.mjs`, `lib/mesh.mjs`, `lib/glb.mjs` | Vector/noise/spline helpers, mesh toolkit (grids, tubes, super-ellipsoids, normals), GLB writer. |
| `validate.mjs` | `validateHoodieGlb(buffer, { panelMesh }) -> { ok, errors[], warnings[], stats }` (ES module, dependency-free, reusable by the dashboard upload check) and CLI. |
| `viewer/index.html`, `viewer/shoot.mjs` | Loads the GLB exactly like the Builder (GLTFLoader, `fabric` tint, `panel` swapped for a textured MeshStandardMaterial with `flipY=false`, sRGB, NeutralToneMapping, STUDIO/SOFT/NIGHT presets). `shoot.mjs` serves the workspace on port 4195 and screenshots with the system Chrome. |
| `previews/` | Ten showcase JPEGs (back, front, 3-4 back, 3-4 front, side; cream F1E6D6 and #1a1a1c; STUDIO + front fill). |
| `ITERATIONS.md` | Log of every visual iteration. |

Screenshots: `node tools/hoodie-model/viewer/shoot.mjs <outDir> name:view:color:light[:png|jpg] ...` where view is one of `back front back_left back_right front_right front_left left right top_hood hood_side hood_lower hood_front front_top neck34 panel_zip panel_zip_bot cuff hem zip_pull pocket shoulder armpit under`, colour is `black|cream|coral|grey|#hex`, light is `STUDIO|SOFT|NIGHT`. The test artwork is read from `HOODIE_TEX` (default: a 1024x1600 downscale of `stimpie-003.png` in the session scratchpad; create it with sharp).

## Output structure

`Hoodie` (root, no transforms) with children `hoodie_body`, `back_panel`, `zip`, `drawcords`, `panel_zip`. Materials: `fabric` (everything except the panel) and `panel`. Front faces +Z, metres, +Y up, origin mid-chest, all transforms baked into vertices.

## Panel UV convention

glTF convention (origin top-left, V down), seen from -Z: `u` grows toward world -X, `v` grows toward world -Y. Load artwork with `texture.flipY = false`.
