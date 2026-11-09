# Stimpy reel (real footage, Nov 2026)

A 14.2 s vertical reel built from the Nov 9 overhead shoot. It's cut to *Money In The Grave* starting at 0:26, with a cut on every half beat. The current version is **v5**.

The rendered videos aren't in git: the repo ignores `.mp4`. They live on the editing PC:

| What | Where |
|---|---|
| Source clips (23, 4K HEVC) | `C:\Users\aswad\Downloads\stimpy cuts\` |
| 1080x1920 30 fps working copies, segments, end card, zip sound | `...\stimpy cuts\work\` (`v2`–`v5` subfolders hold each version's segments) |
| Final exports | `...\stimpy cuts\export\stimpy_reel_v5.mp4` and `stimpy_reel_v5_no_music.mp4` |
| Premiere project | `stimpy swap.prproj`, with sequences `stimpy_reel` to `stimpy_reel_v5` |

## What's in the footage

Every Stimpy (Sabotage, Receipt, Chameleon, Same Day) was filmed three times. Each take shows one closure:

| Stimpy | Left zipper | Right zipper | Velcro (top, then bottom) |
|---|---|---|---|
| Sabotage | `214819` | `214920` | `215005` |
| Receipt | `215208` | `215337` | `215405` |
| Chameleon | `215601` | `215646` | `215712` |
| Same Day | `215845` | `215935` | `220019` |

The other clips are:

- 5 flat lays showing the Stimpies in different positions (`214348` to `214622`)
- 5 clips where the Stimpies around the hoodie disappear one by one (`220044` to `220122`)
- the pull-out (`220211`)

## How v5 is cut

Every shot lasts half a beat (0.3 s). The song runs at 100.4 BPM, the first beat is at 0.435 s, and the song starts at 0:26. In order:

1. The 5 position changes.
2. The **left zipper**, **right zipper**, **top velcro** and **bottom velcro**, each split into 8 steps.
   - Each step is a different Stimpy's own take, starting at exactly the hand position where the previous step ended, so the closing looks continuous while the design changes on every cut.
   - Each Stimpy is used twice per group, at different parts of the motion.
   - Nearly all steps play at 0.9–1.2×.
   - The splits and positions are in `data/split8.json` and `data/edl_v5.json`.
3. The 5 disappearing Stimpies.
4. The pull-out, then the empty surface. There's no logo card.

**Grade:** a Lumetri Color effect on every shot in Premiere, with Exposure +0.9, Contrast +20, Highlights −25, Shadows +20, Whites +10, Blacks −20, Temperature −8 and Saturation 118.

**Audio:** the song at 0 dB from 0:26, faded out over the last 0.6 s. The fade is added after the Premiere export, because Premiere 2021 doesn't take keyframes on that clip. The export lands at about −14.9 LUFS with peaks at −3.4 dBTP.

## Scripts (`scripts/`)

| Script | What it does |
|---|---|
| `beats.py` | Finds the tempo and the beat grid from 0:26 in the song. |
| `analyze.py` | Measures per-frame motion and alignment for every working clip. |
| `track2.py` | Tracks hand height on the zipper lines (output: `data/prog.json`, plus `data/prog_top.json` from the topmost-point variant). |
| `velcro.py` | Tracks the hand across the top velcro (`data/velcro.json`). |
| `split8.py` | Finds the 8-step split and the Stimpy order for each closure group (`data/split8.json`). |
| `build_v5.py` | Renders every shot as an exact-length segment into `work\v5\` (`data/edl_v5.json`). |
| `build_xml_v5.py` | Writes the FCP XML (`data/stimpy_reel_v5.xml`) that is imported into Premiere. |

Measurement caveats:

- The left-zipper and velcro positions in `split8.py` were read by eye from guide-line frame sheets, because the automatic skin tracking picked up the face and the designs.
- The right zipper uses the tracked curves.
- After solving, the last bottom-velcro step was extended by hand to frames 264–280, so it ends at the right corner. Re-running `split8.py` overwrites that edit.

The scripts call ffmpeg from `content/videos/second_video/stimpy/app/node_modules/ffmpeg-static`, and read and write the working folder on the editing PC.

## Version history

- **v1:** following the shoot doc (`docs/reel-step-by-step.md`). Zip hook, flat lays, full-beat swaps, payoff, logo card. 20 s.
- **v2:** one beat per shot; the zippers became a 4-shot relay. The velcro shots weren't continuous.
- **v3:** top and bottom velcro rebuilt as 4-shot relays. 18.4 s.
- **v4:** half-beat cuts, every relay played twice, the logo removed, new lighting. The repeat was rejected.
- **v5:** each relay split into 8 steps with no repeats. Current.
