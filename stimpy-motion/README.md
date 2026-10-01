# Stimpy: motion graphics

The six motion-graphic videos from `motion.md`, built as code: 21 variants in total. Every frame is a pure
function of time, and every soundtrack is synthesised from the same timeline, so what you preview is
exactly what gets rendered. **Nothing has been rendered to video yet.** That waits for your approval.

## Preview (inspect and approve)

```sh
cd stimpy-motion/app
npm install          # already done on this machine
npm run dev          # → http://localhost:5210
```

Use the dropdowns to pick a film and a variant. Controls:

| Key | Action |
|---|---|
| `space` / click | play or pause, with sound |
| `←` / `→` | seek 1 s (hold `shift` for 5 s) |
| `,` / `.` | step one frame |
| `[` / `]` | jump between the section markers under the timeline |
| `l` | loop the current section |
| `s` | show the Reels safe area |
| `m` | mute |
| `h` | hide the UI |

Links like `?film=countdown&v=d3&t=2.4` open a film at a given variant and time.

## The films

| # (brief) | Film | Length | Variants | Caption idea (from the brief) |
|---|---|---|---|---|
| 01 | **Logo Reveal** | 10 s | – | "Something's about to change." |
| 02 | **The Question** | 15 s | – | "Be honest. How many?" |
| 05 | **Stimpie Glimpses** | 10 s each | 5 episodes: Flame/coral, Sun/butter, Wave/sky, Bloom/lilac, Night/blue | "Pause it if you can." |
| 07 | **Countdown** | 6 s each, launch 8 s | 5, 4, 3, 2, 1 days, Tomorrow, Launch day | (just the countdown) |
| 09 | **Which Back Are You?** | 10 s poll + 8 s results | Loud/Quiet, Chaos/Calm, Night/Day (poll and results for each) | "Which back are you?" |
| 10 | **The Split Screen** | 15 s, seamless loop | – | "Count how many looks." |

**01 Logo Reveal.** Black and silent. Then the zip sound starts and a seam of light is pulled down the dark, with a coral pull tab. The back parts, coral light floods out, and the two halves of the split S slide together while the wordmark rises. The letters flicker through four identities on the beat: flame, checkerboard, pastel bloom, graffiti. Then two quick 8th-note flickers. It settles, the tagline types itself, the zipper closes back over everything, and "Coming soon." appears with an electric-blue underline.

**02 The Question.** "How many hoodies do you own…" One hoodie drops. "…just because of the back design?" Hoodies rain down faster and faster, each with a different printed back, and the blue counter ticks 1 → 3 → 7 → 12 → 20. The tower wobbles and collapses, and the music cuts out. Silence. A vacuum pulls everything into ONE Stimpy hoodie, whose back flickers through every design like a slot machine, and the counter flips to a coral "1". "What if you only needed one?" Signature zip wipe to the logo.

**05 Glimpses.** The whole screen is a giant closed zipper over the drop's colour. It cracks open for slivers of the design and snaps shut, faster and faster with the music. Three hidden flashes show a much bigger piece. Each flash lasts 2 frames at 60 fps, so it survives Instagram's 30 fps re-encode as exactly one frame. At the end it opens to 80%, stops in silence, zips shut, and shows "Not yet."

**07 Countdown.** The hoodie is seen from behind. A Stimpie flies in, lands, and zips on around its edge, and its design IS the number, in a different art style each day:

| Day | Number style |
|---|---|
| 5 | pop-art with halftone |
| 4 | dot matrix |
| 3 | inflated balloon |
| 2 | flickering neon |
| 1 | serif italic with stars |
| Tomorrow | graffiti |

A day track at the top carries every day's colour. On launch day the hoodie turns to face you, a huge zipper runs down the screen and unzips to "Live now." on electric blue, with confetti. There's empty space below for the link sticker.

**09 Which Back.**
- **Poll:** two hoodies, backs to camera. Their Stimpies are dark silhouettes leaking colour at the edges, with motes of colour drifting out. Labels fade in, a spotlight sweeps between them, and they pulse to the beat under "Which back are you?". Leave the space below the labels for the poll sticker.
- **Results:** a bar fills, the winner's silhouette cracks with light shining through, the loser steps back into the dark, and "You chose. Revealed first." appears.

**10 Split Screen.** A figure in a plain hoodie. A zip runs down their back on every beat: a new Stimpie each time, and the whole world changes colour with it. The swaps speed up into a 4-way split, then slam into one on the drop: "Same hoodie." One final zip: "Different you." Then it unzips back to the plain hoodie. The last frame leads straight into the first.

## Brand rules followed

- **All 8 brand colours are in every one of the 21 variants.** This was checked by an automated pixel scan: coral, black, white, electric blue, butter, sky, lilac, cream.
- **Colour roles.** Primary colours lead. Electric blue is used for action moments: the counter, "Live now", the "Coming soon" underline, the poll bar colours. The secondaries arrive as Stimpie and drop colours.
- **Poppins throughout.** Other fonts appear only inside Stimpie artwork, such as the countdown's changing number styles.
- **The split S.** It's rebuilt as vector art from the Poppins Bold "S", matching `identity/`, and it signs every Stimpie in the corner.
- **Zip wipes and the zip sound.**
  - Every transition is a real zipper: interlocking teeth, and a coral pull tab carrying the split S.
  - Its sound is generated from the pull's motion.
  - The logo moments use one fixed "signature zip" as the sound logo.
- **Layout.** 9:16 at 1080×1920, 60 fps. Key text stays inside the Reels safe area (press `s` in the preview).

## Render (after approval)

```sh
cd stimpy-motion/app
node scripts/render.ts video --film logo                          # → ../out/stimpy_logo.mp4 (+ .wav)
node scripts/render.ts video --film countdown --v d3
node scripts/render.ts all                                        # every film and variant
node scripts/render.ts all --film glimpses                        # every variant of one film
node scripts/render.ts all --film glimpses,countdown,which        # every variant of several films
node scripts/render.ts video --film split --samples 12 --scale 2  # more motion blur, true 4K
```

Film ids: `logo`, `question`, `glimpses`, `countdown`, `which`, `split`. The variant ids are listed in the preview's dropdown and in the table above. Other modes: `sheet` (contact sheet), `stills`, `wav`, and `check` (a smoke test of every film). The renderer uses headless Chrome and ffmpeg (bundled via `ffmpeg-static`), with H.264 CRF 16 and AAC 320k.

## Things you may want to change

| What | Where |
|---|---|
| Poll results (the percentages) | `src/films/which-back.ts` → `PAIRS[].result` |
| Poll pairs, labels and designs | `src/films/which-back.ts` → `PAIRS` |
| Countdown lines ("Days left.", "Be ready.") | `src/films/countdown.ts` → `DAYS` |
| Launch-day text ("Live now.", "Tap the link") | `src/films/countdown.ts` → `live()` |
| Glimpse episodes (design and colour) | `src/films/glimpses.ts` → `EPISODES` |
| The Stimpie designs | `src/art/designs.ts`. These are placeholders until the real artwork exists; swap in real art per design. |

## Layout

- `src/engine/`:
  - `brand.ts`: palette
  - `logo.ts`: split S and wordmark
  - `zipper.ts`: teeth, pull and zip wipe
  - `hoodie.ts`: the flat hoodie, figure and Stimpie panel
  - `engine.ts`: WebGL motion blur and grade
- `src/art/`: the 12 Stimpie designs and the 6 countdown number artworks.
- `src/audio/score.ts`: the synthesiser (drums, synths, zip, whooshes and more).
- `src/films/`: one file per film, and `index.ts` (the registry).
- `scripts/render.ts`: the offline renderer.
