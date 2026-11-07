# STIMPY — "One Hoodie" teaser

A code-generated 9:16 teaser (1080×1920, ~50 s) for STIMPY: one ghost hoodie, multiple worlds,
a new Stimpie on every click. The music is synthesized from code too, so every cut lands exactly on the beat.

## Layout

- `song/synth.py` — the track (128 BPM, F minor, EDM). Writes `app/public/stimpy.wav` and the timing map `app/src/song.json`.
- `app/src/cards.ts` — the Stimpie cards (tarot-card format: number, art, nameplate, edition): card 0 = STIMPY logo,
  cards 1–11 = the real artworks from `app/src/stimpies.json` (copy of `content/_stimpies/stimpies.json`), images in `app/public/stimpies/`.
- `app/src/hoodie.ts` — the ghost hoodie, the Stimpie slot and the snap studs.
- `app/src/worlds.ts` — Darkness, THE VOID (NEON), AFTER DARK (VHS), THE CEDAR (IREZUMI), THE DREAMER (SAME DAY), studio, end.
- `app/src/scene.ts` — the edit: what happens when, all driven by `song.json`.
- `app/scripts/render.mjs` — export (headless Chrome → ffmpeg).

## Preview

```sh
cd app
npm install
npx vite
```

Open http://localhost:5190. Keys: space play/pause, ←/→ seek (shift = 5 s), `[` `]` previous/next section,
`,` `.` step a frame, `h` hide the UI. `?t=15` starts at 15 s.

## Render

```sh
cd app
node scripts/render.mjs video --fps 30 --samples 4 --out ../out/stimpy.mp4     # final
node scripts/render.mjs video --fps 30 --samples 1 --out ../out/draft.mp4      # fast draft
node scripts/render.mjs sheet --every 1.25                                     # contact sheet
```

ffmpeg comes from the `imageio-ffmpeg` package in `song/.venv` (or set `FFMPEG=path`).

## Regenerate the song

```sh
cd song
python -m venv .venv
.venv/Scripts/python -m pip install numpy scipy imageio-ffmpeg matplotlib
.venv/Scripts/python synth.py
```

## Stimpie artwork

The cards draw the real artworks: each card's art area shows its image cover-fitted toward `focus[0]` over the
spec's `world` colour; palette (world / ink / glow) and name come from the spec. Images are loaded and decoded
(`loadStimpies()`) before any card canvas or 3D texture is built and before `__stimpy.ready` is set.

```sh
node scripts/render.mjs cards            # out/stimpies/stimpie-000..011.png + lookbook.jpg
node scripts/render.mjs video --avatar --fps 30 --samples 4 --out ../out/stimpy_avatar.mp4   # 3D avatar cut
```
