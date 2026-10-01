# STIMPY — "One Hoodie" teaser

A code-generated 9:16 teaser (1080×1920, ~50 s) for STIMPY: one ghost hoodie, multiple worlds,
a new Stimpie on every click. The music is synthesized from code too, so every cut lands exactly on the beat.

## Layout

- `song/synth.py` — the track (128 BPM, F minor, EDM). Writes `app/public/stimpy.wav` and the timing map `app/src/song.json`.
- `app/src/cards.ts` — the 17 Stimpie designs (tarot-card format: number, art, nameplate, edition).
- `app/src/hoodie.ts` — the ghost hoodie, the Stimpie slot and the snap studs.
- `app/src/worlds.ts` — Darkness, THE VOID, AFTER DARK, THE CEDAR, THE DREAMER, studio, end.
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

## Swapping in real Stimpie artwork

Each card in `CARDS` (`app/src/cards.ts`) draws its art with a function. To use a real design, draw an image
into the card canvas instead (keep the 800×1250 card size, or 0.64 aspect).
