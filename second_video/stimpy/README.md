# STIMPY — "Multiple Identities" (launch film)

A 60-second, code-rendered launch film for **Stimpy**: one premium hoodie, interchangeable back panels
("Stimpies"). Everything is generated: the soundtrack is synthesised in Python, and every frame is a pure
function of song time, rendered with three.js. So the browser preview and the exported MP4 are identical.

## The film (cut to the music, 120 BPM, one scene per section)

| Time | Scene | Idea |
|---|---|---|
| 0–4 s | **Cold open** | The back slams to a new Stimpie on every beat: *WHO / ARE / YOU / TODAY?* |
| 4–8 s | **The blank** | Silence. The clean hoodie in studio light: *ONE HOODIE.* |
| 8–16 s | **How it works** | Blueprint exploded view: 400 GSM shell, hidden zip track, Stimpie. The track zips home. |
| 16–22 s | **The zip** | The zip track lights up, a Stimpie tumbles in, slams on the drop and zips itself shut: *MULTIPLE IDENTITIES.* |
| 22–40 s | **Identities** | The hoodie walks; each swap peels the panel off and changes the whole world. The swaps accelerate. |
| 40–48 s | **Collection** | A wall of holographic cards: *collect them, swap them, trade them.* One slot left… |
| 48–54 s | **Yours** | Stimpy Studio: a drawing is dropped in, printed on cotton, and snaps onto the hoodie. |
| 54–60 s | **End** | The panel peels away, the logo lands with the magnets, every identity flickers through once. |

Product details on screen: 400 GSM fleece and a zip-on back panel. The panel size (41 × 50 cm) and "Drop 01" are placeholders.

## Layout

- `music/compose.py`: the original score (numpy/scipy synthesis: drums, bass, chords, lead, FX, mix and limiter). Writes `app/public/audio/stimpy.wav` and `app/src/music.json` (sections and the event times the visuals sync to).
- `app/src/engine/`: renderer core.
  - `hoodie.ts`: the hoodie is a procedural fabric height map (parts, folds, seams, ribbing) lit in a shader. The Stimpie panel mesh curls (page-peel), ripples on impact, and zips on: a zipper with interlocking teeth and a pull that runs round its edge.
  - `cards.ts`: holographic collectible cards.
  - `engine.ts`: motion blur by sub-frame accumulation, plus a grade pass (chromatic aberration, vignette, grain, flash).
- `app/src/art/`: the six Stimpie designs (with alternate colourways), the custom doodle, and a "world" per design.
- `app/src/scenes/`: one module per scene. `app/src/timeline.ts` maps them to the score.
- `app/scripts/render.ts`: offline renderer (headless Chrome → raw frames → ffmpeg).

## Run

```sh
cd music && uv run python compose.py          # regenerate the soundtrack (optional, committed output)
cd app && bun install
bunx vite                                      # preview at http://localhost:5199 (space, ←/→, [ ], l, h)
node scripts/render.ts video --samples 6 --out ../out/stimpy.mp4   # final 1080p60 with audio (Node 24+)
node scripts/render.ts sheet --from 0 --to 60 --n 24               # contact sheet
node scripts/render.ts stills --t 18.4,23.5                        # PNG stills
```

`--scale 2` renders true 4K. On Windows the renderer launches Chrome itself and attaches over CDP (Playwright's pipe transport hangs under Bun), so run it with Node.

Fonts: Archivo, IBM Plex Mono, Cormorant Garamond (SIL Open Font License).
