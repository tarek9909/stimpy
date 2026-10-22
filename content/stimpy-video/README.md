# STIMPY — "One Hoodie" teaser

A code-generated 9:16 teaser (1080×1920, ~50 s) for STIMPY: one ghost hoodie, multiple worlds,
a new Stimpie on every click. The music is synthesized from code too, so every cut lands exactly on the beat.

## Layout

- `song/synth.py` — the track (128 BPM, F minor, EDM). Writes `app/public/stimpy.wav` and the timing map `app/src/song.json`.
- `app/src/cards.ts` — the 17 Stimpie cards (tarot-card format: number, art, nameplate, edition), carrying the drop 001 prints.
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

## Stimpie artwork

The cards carry the drop 001 prints from `content/drop-001`, exported (trimmed, 1600 px max, WebP) into
`app/public/stimpies/`. To change a design, replace its file there and point the card in `CARDS`
(`app/src/cards.ts`) at it; transparent prints are fitted whole, full-bleed ones use `print(file, 'cover')`.
