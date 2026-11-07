// The shoot animatics: every idea is a short film you can watch, and the same film with the shoot notes on
// top (shot number, framing, setup, what to do), so whoever films it can match it shot for shot.
// Also the end cards the real footage closes on.
import { C } from '../../engine/brand';
import { drawLockup, LOGO, type LogoColors } from '../../engine/logo';
import { text, measure, type Ctx } from '../../engine/draw';
import type { Film, Post } from '../../engine/engine';
import type { Score } from '../../audio/score';
import { W, H, SAFE, fabricFill, fill, glow, kinetic } from '../common';
import { ease, seg, clamp, pulse } from '../../engine/util';

export interface Shot { t: number; title: string; note: string }

export interface ShootDef {
  id: string;
  title: string;
  /** the short code in the notes (e.g. "03 · A") */
  code: string;
  duration: number;
  loop?: boolean;
  shots: Shot[];
  draw(c: Ctx, t: number, post: Post): void;
  score(): Score;
}

export const SHOOT_VARIANTS = [{ id: 'clean', label: 'Clean' }, { id: 'notes', label: 'With shoot notes' }];

export function shootFilm(d: ShootDef, v: string): Film {
  const notes = v === 'notes';
  return {
    id: d.id, title: `${d.title}${notes ? ' (shoot notes)' : ''}`, duration: d.duration, loop: d.loop,
    marks: d.shots.map((s) => ({ t: s.t, label: s.title })),
    draw(c, t, post) {
      c.save();
      d.draw(c, t, post);
      c.restore();
      if (notes) slate(c, t, d, post);
    },
    score: () => d.score(),
  };
}

function wrap(c: Ctx, s: string, maxW: number, o: { size: number; weight?: number }) {
  const lines: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(c, next, o) > maxW && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** The notes overlay: which shot, what to do, and a timeline of all shots. */
function slate(c: Ctx, t: number, d: ShootDef, post: Post) {
  let i = 0;
  d.shots.forEach((s, k) => { if (t >= s.t) i = k; });
  const s = d.shots[i]!;
  const x = 36, y = 40, w = W - 72;
  const noteO = { size: 27, weight: 400 };
  const lines = wrap(c, s.note, w - 56, noteO).slice(0, 3);
  const h = 108 + lines.length * 36;
  c.save();
  c.fillStyle = 'rgba(17,17,17,0.78)';
  c.beginPath(); c.roundRect(x, y, w, h, 22); c.fill();
  text(c, `${d.code}  ·  SHOT ${i + 1}/${d.shots.length}`, x + 28, y + 44, { size: 24, weight: 700, color: C.coral, track: 0.12 });
  text(c, `${t.toFixed(1)}s`, x + w - 28, y + 44, { size: 24, weight: 500, color: C.cream, align: 'right', family: 'Plex' });
  text(c, s.title, x + 28, y + 86, { size: 34, weight: 700, color: C.white });
  lines.forEach((l, k) => text(c, l, x + 28, y + 126 + k * 36, { ...noteO, color: C.cream }));
  // all shots as a strip, the current one lit
  const by = y + h + 14, bw = w;
  d.shots.forEach((sh, k) => {
    const t1 = d.shots[k + 1]?.t ?? d.duration;
    const x0 = x + (sh.t / d.duration) * bw, x1 = x + (t1 / d.duration) * bw;
    c.fillStyle = k === i ? C.coral : 'rgba(17,17,17,0.55)';
    c.fillRect(x0 + 2, by, Math.max(2, x1 - x0 - 4), 10);
  });
  c.fillStyle = C.white;
  c.fillRect(x + (t / d.duration) * bw - 2, by - 4, 4, 18);
  c.restore();
}

// ---------------------------------------------------------------- end cards
function logoColors(bg: string): LogoColors { return bg === C.coral ? LOGO.main : bg === C.black ? LOGO.onBlack : LOGO.onWhite; }

/** The logo alone (on black, coral or white); `age` = time since the card is fully open. */
export function logoCard(c: Ctx, age: number, bg: string = C.black) {
  if (bg === C.black) fabricFill(c, C.black); else fill(c, bg);
  glow(c, W / 2, H / 2, 800, bg === C.black ? C.coral : C.cream, bg === C.black ? 0.08 : 0.3);
  drawLockup(c, W / 2, H / 2, 150, logoColors(bg), {
    icon: { outline: ease.outCubic(seg(age, -0.2, 0.6)), solid: ease.outExpo(seg(age, -0.3, 0.3)) },
    word: { reveal: seg(age, 0.05, 0.85) },
  });
}

/** A line, a big word with the electric-blue underline, and the logo underneath (on black). */
export function lineCard(c: Ctx, age: number, o: { small?: string; big: string; bg?: string }) {
  const bg = o.bg ?? C.black;
  if (bg === C.black) fabricFill(c, C.black); else fill(c, bg);
  const fg = bg === C.black ? C.white : C.black;
  glow(c, W / 2, H / 2, 900, C.coral, (bg === C.black ? 0.1 : 0) + 0.15 * pulse(age, 2));
  if (o.small) kinetic(c, o.small, W / 2, H / 2 - 120, age, { size: 64, weight: 500, color: fg, align: 'center', stagger: 0.07 });
  const big = measure(c, o.big, { size: 190, weight: 700 });
  const size = big > 900 ? (190 * 900) / big : 190;
  kinetic(c, o.big, W / 2, H / 2 + 70, age - (o.small ? 0.25 : 0), { size, weight: 700, color: fg, align: 'center', dur: 0.6 });
  const u = ease.outExpo(seg(age, 0.5, 1.1));
  if (u > 0) {
    c.fillStyle = C.blue;
    const w = Math.min(520, measure(c, o.big, { size, weight: 700 }) * 0.8) * u;
    c.beginPath(); c.roundRect(W / 2 - w / 2, H / 2 + 125, w, 14, 7); c.fill();
  }
  drawLockup(c, W / 2, SAFE.bottom - 40, 62, logoColors(bg), { word: { reveal: seg(age, 0.6, 1.4) }, icon: { alpha: clamp((age - 0.5) * 3) } });
}
