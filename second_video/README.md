# Second Video — STIMPY ("Multiple Identities")

A 60-second, code-rendered launch film for **Stimpy**: one premium hoodie, interchangeable back panels ("Stimpies"). Everything is generated: the soundtrack is synthesised in Python, and every frame is a pure function of song time, rendered with Three.js.

The project is located in [`stimpy/`](./stimpy).

## Quick Start

### 1. Soundtrack
```sh
cd stimpy/music
uv run python compose.py
```

### 2. Preview
```sh
cd stimpy/app
bun install # or npm install
bunx vite   # or npx vite
```
Open `http://localhost:5199` to preview the interactive animation.

### 3. Render MP4
```sh
cd stimpy/app
node scripts/render.ts video --samples 6 --out ../out/stimpy.mp4
```

See [stimpy/README.md](./stimpy/README.md) for full project documentation and details.
