// The split S and the wordmark, rebuilt as vector geometry from Poppins Bold so they can animate at any size.
//
// Measured from identity/stimpy_logo_*.png:
//   the left half of the S is solid, cut at the glyph's horizontal centre;
//   the right half is the same glyph outlined (stroke ≈ 2.9% of the S height), scaled ×1.033 about the
//   top of the cut and dropped by 4.5% of the S height;
//   the wordmark's cap height is 42.3% of the S height, its cap centre is level with the solid S's centre,
//   and it starts 25% of the S height to the right of the outline half.
import opentype from 'opentype.js';
import { C } from './brand';
import type { Ctx } from './draw';

export interface LogoColors { solid: string; outline: string; word: string; bg?: string }
export const LOGO = {
  main: { bg: C.coral, solid: C.black, outline: C.white, word: C.black } as LogoColors,
  onBlack: { bg: C.black, solid: C.white, outline: C.coral, word: C.white } as LogoColors,
  onWhite: { bg: C.white, solid: C.black, outline: C.coral, word: C.black } as LogoColors,
};

const OUT_SCALE = 1.033;
const OUT_DROP = 0.045;
const STROKE = 0.029;
const WORD_CAP = 0.423;
const WORD_GAP = 0.25;

interface Glyph { path: Path2D; x: number; w: number }
let S: { path: Path2D; w: number; len: number } | null = null; // normalised: S height 1, origin at (cut, top)
let WORD: { glyphs: Glyph[]; w: number; capTop: number } | null = null; // normalised to cap height 1, baseline 0

function toPath2D(p: opentype.Path) { return new Path2D(p.toPathData(5)); }

/** Approximate length of an opentype path (flattened curves). */
function pathLength(p: opentype.Path) {
  let len = 0, x = 0, y = 0, sx = 0, sy = 0;
  const N = 16;
  for (const cmd of p.commands) {
    if (cmd.type === 'M') { x = sx = cmd.x; y = sy = cmd.y; }
    else if (cmd.type === 'L') { len += Math.hypot(cmd.x - x, cmd.y - y); x = cmd.x; y = cmd.y; }
    else if (cmd.type === 'Q' || cmd.type === 'C') {
      let px = x, py = y;
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        let qx: number, qy: number;
        if (cmd.type === 'Q') { qx = u * u * x + 2 * u * t * cmd.x1 + t * t * cmd.x; qy = u * u * y + 2 * u * t * cmd.y1 + t * t * cmd.y; }
        else { qx = u ** 3 * x + 3 * u * u * t * cmd.x1 + 3 * u * t * t * cmd.x2 + t ** 3 * cmd.x; qy = u ** 3 * y + 3 * u * u * t * cmd.y1 + 3 * u * t * t * cmd.y2 + t ** 3 * cmd.y; }
        len += Math.hypot(qx - px, qy - py); px = qx; py = qy;
      }
      x = cmd.x; y = cmd.y;
    } else if (cmd.type === 'Z') { len += Math.hypot(sx - x, sy - y); x = sx; y = sy; }
  }
  return len;
}

export async function loadLogo() {
  const buf = await (await fetch('fonts/Poppins-Bold.ttf')).arrayBuffer();
  const font = opentype.parse(buf);
  // the S: measure at 1000 units, then renormalise to height 1 with the origin at the cut's top
  const g = font.getPath('S', 0, 0, 1000);
  const bb = g.getBoundingBox();
  const h = bb.y2 - bb.y1, cut = (bb.x1 + bb.x2) / 2;
  const s = font.getPath('S', -cut / h, -bb.y1 / h, 1000 / h);
  S = { path: toPath2D(s), w: (bb.x2 - bb.x1) / h, len: pathLength(s) };
  // the wordmark: per-glyph paths (kerned), cap height 1
  const cap = (font.tables.os2 as any).sCapHeight as number || 700;
  const size = font.unitsPerEm / cap;
  const paths = font.getPaths('Stimpy', 0, 0, size);
  const glyphs: Glyph[] = paths.map((p) => {
    const b = p.getBoundingBox();
    return { path: toPath2D(p), x: b.x1, w: b.x2 - b.x1 };
  });
  const last = paths[paths.length - 1]!.getBoundingBox();
  WORD = { glyphs, w: last.x2 - glyphs[0]!.x, capTop: -1 };
}

export interface IconOpts {
  /** 0..1 draws the solid half on (a wipe from the cut outward). */
  solid?: number;
  /** 0..1 draws the outline on (stroke dash). */
  outline?: number;
  /** Extra separation of the halves in S-heights (the split opening). */
  split?: number;
  /** Replace the solid colour with a fill painter (texture); drawn in S-normalised space. */
  solidFill?: (c: Ctx) => void;
  /** Stroke with a pattern / gradient instead of a colour. */
  outlineStyle?: string | CanvasGradient | CanvasPattern;
  alpha?: number;
  strokeScale?: number;
}

/** Width of the icon in S-heights (from the solid half's left edge to the outline's right edge). */
export function iconWidth() { return S ? S.w / 2 + (S.w / 2) * OUT_SCALE + STROKE / 2 : 1; }

/**
 * The split S. (x, y) is the centre of the solid S; h is its height.
 */
export function drawIcon(c: Ctx, x: number, y: number, h: number, col: LogoColors, o: IconOpts = {}) {
  if (!S) return;
  const solidP = o.solid ?? 1, outP = o.outline ?? 1, split = o.split ?? 0;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.translate(x, y - h / 2);
  c.scale(h, h);
  const halfW = S.w / 2 + 0.02;
  // solid left half
  if (solidP > 0) {
    c.save();
    c.translate(-split / 2, 0);
    c.beginPath();
    c.rect(-halfW * solidP - 0.001, -0.1, halfW * solidP + 0.001, 1.3);
    c.clip();
    if (o.solidFill) { c.clip(S.path); o.solidFill(c); }
    else { c.fillStyle = col.solid; c.fill(S.path); }
    c.restore();
  }
  // outline right half
  if (outP > 0) {
    c.save();
    c.translate(split / 2, 0);
    c.beginPath();
    c.rect(0, -0.2, halfW * OUT_SCALE + 0.1, 1.5);
    c.clip();
    c.translate(0, OUT_DROP);
    c.scale(OUT_SCALE, OUT_SCALE);
    c.strokeStyle = o.outlineStyle ?? col.outline;
    c.lineWidth = (STROKE * (o.strokeScale ?? 1)) / OUT_SCALE;
    c.lineJoin = 'round';
    c.lineCap = 'butt';
    if (outP < 1) {
      c.setLineDash([S.len * outP, S.len * 2]);
      c.lineDashOffset = 0;
    }
    c.stroke(S.path);
    c.restore();
  }
  c.restore();
}

export interface WordOpts {
  /** per-letter reveal 0..1 across the word (letters rise in staggered). */
  reveal?: number;
  fill?: (c: Ctx) => void;
  alpha?: number;
}

/** The wordmark with its cap height `cap`, left edge at x and cap centre at y. Returns its width. */
export function drawWord(c: Ctx, x: number, y: number, cap: number, color: string, o: WordOpts = {}) {
  if (!WORD) return 0;
  const reveal = o.reveal ?? 1;
  c.save();
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.translate(x - WORD.glyphs[0]!.x * cap, y + cap / 2);
  c.scale(cap, cap);
  const n = WORD.glyphs.length;
  WORD.glyphs.forEach((g, i) => {
    const p = Math.min(1, Math.max(0, reveal * (n + 2) - i * 1.0) / 3);
    if (p <= 0) return;
    const e = 1 - (1 - p) ** 3;
    c.save();
    c.beginPath();
    c.rect(g.x - 0.2, -1.3, g.w + 0.4, 1.8);
    c.clip();
    c.translate(0, (1 - e) * 1.1);
    if (o.fill) { c.clip(g.path); o.fill(c); }
    else { c.fillStyle = color; c.fill(g.path); }
    c.restore();
  });
  c.restore();
  return WORD.w * cap;
}

/** Layout of the full lockup (icon + wordmark) for an icon height h. */
export function lockup(h: number) {
  const iw = iconWidth() * h;
  const solidLeft = (S ? S.w / 2 : 0.38) * h;
  const gap = WORD_GAP * h;
  const ww = (WORD?.w ?? 3.3) * WORD_CAP * h;
  const total = iw + gap + ww;
  return { total, iconW: iw, solidLeft, gap, wordW: ww, cap: WORD_CAP * h };
}

export interface LockupOpts { icon?: IconOpts; word?: WordOpts }
/** The full lockup centred at (cx, cy) with icon height h. */
export function drawLockup(c: Ctx, cx: number, cy: number, h: number, col: LogoColors, o: LockupOpts = {}) {
  const L = lockup(h);
  const left = cx - L.total / 2;
  drawIcon(c, left + L.solidLeft, cy, h, col, o.icon);
  drawWord(c, left + L.iconW + L.gap, cy, L.cap, col.word, o.word);
}
