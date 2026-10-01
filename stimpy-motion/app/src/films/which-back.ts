// 9 · "WHICH BACK ARE YOU?" (10 s poll + 8 s results follow-up). Followers pick a favourite before launch.
//
// Poll:     0–3  two hoodies, backs to camera; their Stimpies are dark silhouettes leaking colour and texture
//           3–6  personality labels fade in beneath; a spotlight sweeps slowly between them
//           6–10 the silhouettes pulse with the music; "Which back are you?" (room left for the poll sticker)
// Results:  a bar fills between them; the winner's silhouette cracks with light shining through the gaps;
//           "You chose. Revealed first."
import { C, ink, rgba } from '../engine/brand';
import { drawLockup, LOGO } from '../engine/logo';
import { drawHoodie, DOCK } from '../engine/hoodie';
import { text, scratch, type Ctx } from '../engine/draw';
import type { Design } from '../art/designs';
import { art, byId } from '../art/designs';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, H, SAFE, fill, glow, kinetic } from './common';
import { ease, seg, clamp, pulse, mulberry, clock, lerp, TAU, lastEvent } from '../engine/util';

const K = clock(96);
const b = K.b;

interface Pair { id: string; left: string; right: string; lLabel: string; rLabel: string; badge: string; ring: string; root: string; result: number }
export const PAIRS: Pair[] = [
  { id: 'loud', left: 'flame', right: 'eye', lLabel: 'Loud', rLabel: 'Quiet', badge: C.sky, ring: C.cream, root: 'E', result: 0.64 },
  { id: 'chaos', left: 'static', right: 'wave', lLabel: 'Chaos', rLabel: 'Calm', badge: C.butter, ring: C.lilac, root: 'C', result: 0.41 },
  { id: 'night', left: 'night', right: 'sun', lLabel: 'Night', rLabel: 'Day', badge: C.lilac, ring: C.sky, root: 'A', result: 0.58 },
];

const LX = 285, RX = 795, HY = 880, HS = 0.55;
const HOODIE = '#262626';
const TP = { labels: b(4.8), sweep0: b(4.8), poll: b(9.6), end: 10 };
const TR = { bar0: b(2), bar1: b(5.5), crack: b(6.2), chose: b(8.4), end: 8 };

/** Screen rect of the panel for a hoodie drawn at (x, y, s). */
function panelRect(x: number, y: number, s: number) {
  return { x: x + (DOCK.x - DOCK.w / 2 - 500) * s, y: y + (DOCK.y - DOCK.h / 2 - 500) * s, w: DOCK.w * s, h: DOCK.h * s, r: DOCK.r * s };
}

/**
 * The design as a backlit silhouette: its shapes read clearly (flames, an eye, a moon…) as darks and lights
 * against a glow in the design's own colours, but the real artwork stays hidden. `light` brightens it
 * (spotlight, beat); `reveal` fades in the real, full-colour design.
 */
function backlit(d: Design, t: number, light: number, reveal: number) {
  return (k: Ctx, w: number, h: number) => {
    const L = scratch(300, 364, 2.4);
    d.draw(L.c, 300, 364, t);
    const g = k.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, d.glow[0]!);
    g.addColorStop(1, d.glow[1] ?? d.glow[0]!);
    k.fillStyle = g;
    k.fillRect(0, 0, w, h);
    k.save();
    k.filter = `grayscale(1) contrast(2.6) brightness(${0.7 + 0.3 * light})`;
    k.globalCompositeOperation = 'multiply';
    k.drawImage(L.cv, 0, 0, w, h);
    k.restore();
    // keep it in shadow: a silhouette, not a reveal
    k.fillStyle = rgba('#000000', 0.42 - 0.22 * light);
    k.fillRect(0, 0, w, h);
    if (reveal > 0) {
      k.save();
      k.globalAlpha = clamp(reveal);
      k.drawImage(L.cv, 0, 0, w, h);
      k.restore();
    }
    L.release();
  };
}

/** Light leaking out around a panel edge. */
function leak(c: Ctx, x: number, y: number, s: number, colors: string[], a: number, t: number) {
  const R = panelRect(x, y, s);
  c.save();
  c.globalCompositeOperation = 'screen';
  colors.forEach((col, i) => {
    c.shadowColor = col;
    c.shadowBlur = 50 + 20 * Math.sin(t * 2 + i);
    c.strokeStyle = rgba(col, 0.55 * a);
    c.lineWidth = 6;
    c.beginPath(); c.roundRect(R.x - 2 - i * 3, R.y - 2 - i * 3, R.w + 4 + i * 6, R.h + 4 + i * 6, R.r + 2); c.stroke();
  });
  c.restore();
  // a crisp inner line of each colour where the art meets the veil
  c.save();
  colors.forEach((col, i) => {
    c.strokeStyle = col;
    c.lineWidth = 4.5;
    c.beginPath(); c.roundRect(R.x + 5 + i * 6, R.y + 5 + i * 6, R.w - 10 - i * 12, R.h - 10 - i * 12, Math.max(3, R.r - 4)); c.stroke();
  });
  c.restore();
}

/** Cracks spreading from the panel's centre (in panel units), light pouring through. */
function cracks(seed: number, p: number, col: string) {
  const r = mulberry(seed);
  const paths: [number, number][][] = [];
  const grow = (x: number, y: number, a: number, len: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    let cx = x, cy = y, ang = a;
    const n = 6;
    for (let i = 0; i < n; i++) {
      ang += (r() - 0.5) * 0.9;
      cx += Math.cos(ang) * len / n; cy += Math.sin(ang) * len / n;
      pts.push([cx, cy]);
      if (depth < 2 && r() < 0.35) grow(cx, cy, ang + (r() < 0.5 ? 0.9 : -0.9), len * 0.5, depth + 1);
    }
    paths.push(pts);
  };
  for (let i = 0; i < 7; i++) grow(150 + (r() - 0.5) * 30, 182 + (r() - 0.5) * 30, (i / 7) * TAU + r() * 0.5, 120 + r() * 90, 0);
  return (c: Ctx) => {
    if (p <= 0) return;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const pass of [0, 1]) {
      c.shadowColor = col; c.shadowBlur = pass ? 8 : 26;
      c.strokeStyle = pass ? C.white : rgba(col, 0.9);
      c.lineWidth = pass ? 2.2 : 6;
      for (const pts of paths) {
        const k = Math.max(1, Math.floor(pts.length * p));
        c.beginPath();
        pts.slice(0, k + 1).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      }
    }
    c.restore();
  };
}

// motes of colour escaping the silhouettes: every brand colour leaks out, drifting up through the light
const MOTE_COLS = [C.coral, C.butter, C.sky, C.lilac, C.blue, C.cream, C.white];
const MOTES = (() => {
  const r = mulberry(404);
  return Array.from({ length: 130 }, (_, i) => ({ side: i % 2, u: r(), ph: r(), sp: 0.06 + r() * 0.08, sz: 5 + r() * 7, col: MOTE_COLS[i % MOTE_COLS.length]!, wob: r() * TAU }));
})();
function motes(c: Ctx, t: number, amt: number, win?: 'l' | 'r', crack = 0) {
  if (amt <= 0) return;
  for (const m of MOTES) {
    const x0 = m.side ? RX : LX;
    const R = panelRect(x0, HY, HS);
    const life = (t * m.sp + m.ph) % 1;
    // born on the panel's edge, drifting up and out
    const edge = m.u * 2 * (R.w + R.h);
    let bx = R.x, by = R.y;
    if (edge < R.w) { bx += edge; } else if (edge < R.w + R.h) { bx += R.w; by += edge - R.w; } else if (edge < 2 * R.w + R.h) { bx += 2 * R.w + R.h - edge; by += R.h; } else { by += 2 * (R.w + R.h) - edge; }
    const boost = win && (m.side ? 'r' : 'l') === win ? 1 + 2 * crack : 1;
    const x = bx + Math.sin(t * 1.3 + m.wob) * 18 * life + (bx - (R.x + R.w / 2)) * 0.5 * life * boost;
    const y = by - life * 260 * boost;
    const a = amt * Math.min(1, 1.6 * Math.sin(Math.PI * life)) * (win && (m.side ? 'r' : 'l') !== win ? 1 - crack * 0.8 : 1);
    if (a <= 0.01) continue;
    c.globalAlpha = a;
    c.fillStyle = m.col;
    c.beginPath(); c.arc(x, y, m.sz * (1 - life * 0.5), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

function scene(c: Ctx, pair: Pair, t: number, o: { beats: number[]; labelsAt: number; sweep: boolean; winner?: 'l' | 'r'; crack?: number; bar?: number; dimLoser?: number; reveal?: number }) {
  fill(c, C.black);
  // floor glow
  glow(c, W / 2, HY + 300, 900, C.cream, 0.06);
  // the spotlight: a cone from above, sweeping between the two
  let spotX = W / 2, spotA = 0;
  if (o.sweep) {
    const u = t - TP.sweep0;
    spotA = clamp(u / 0.8);
    spotX = W / 2 + Math.sin(u * 1.25) * 270;
  }
  if (o.winner) { spotA = 1; spotX = o.winner === 'l' ? LX : RX; }
  if (spotA > 0) {
    c.save();
    c.globalCompositeOperation = 'screen';
    const g = c.createLinearGradient(0, -100, 0, HY + 400);
    g.addColorStop(0, rgba(C.cream, 0.0));
    g.addColorStop(0.2, rgba(C.cream, 0.12 * spotA));
    g.addColorStop(1, rgba(C.cream, 0.28 * spotA));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(W / 2 - 40, -100); c.lineTo(W / 2 + 40, -100); c.lineTo(spotX + 260, HY + 420); c.lineTo(spotX - 260, HY + 420); c.closePath(); c.fill();
    c.fillStyle = rgba(C.cream, 0.18 * spotA);
    c.beginPath(); c.ellipse(spotX, HY + 400, 260, 44, 0, 0, TAU); c.fill();
    c.restore();
  }
  const [, lastBeat] = lastEvent(o.beats, t);
  const beat = pulse(t - lastBeat, 7);
  const sides: ['l' | 'r', number, string, string][] = [['l', LX, pair.left, pair.lLabel], ['r', RX, pair.right, pair.rLabel]];
  for (const [side, x, did, label] of sides) {
    const d = byId(did);
    const lit = spotA * clamp(1 - Math.abs(spotX - x) / 320);
    const isWin = o.winner === side, isLose = o.winner && !isWin;
    const dim = isLose ? 1 - 0.45 * (o.dimLoser ?? 0) : 1;
    const s = HS * (1 + 0.025 * beat * (o.winner ? (isWin ? 1 : 0.3) : 1));
    c.save();
    const crackP = isWin ? o.crack ?? 0 : 0;
    const cr = cracks(did.length * 97 + 3, crackP, d.glow[0]!);
    drawHoodie(c, {
      x, y: HY, s, color: HOODIE, rim: rgba(C.cream, 0.1 + 0.35 * lit), rimW: 3,
      shadow: 0.9, shadowY: 420,
      panel: {
        art: backlit(d, t, clamp(0.5 * beat + 0.7 * lit + crackP), isWin ? o.reveal ?? 0 : 0), zip: 1, parked: true, teeth: '#333',
        overlay: (k) => { if ((o.reveal ?? 0) < 1 || !isWin) { k.save(); k.globalAlpha = isWin ? 1 - clamp(o.reveal ?? 0) : 1; cr(k); k.restore(); } },
      },
    });
    leak(c, x, HY, s, d.glow, (0.45 + 0.4 * beat + 0.3 * lit + (isWin ? 1.2 * crackP : 0)) * dim, t);
    if (dim < 1) {
      // the loser steps back into the dark (painted over, so the hidden art never shows through)
      // a soft falloff (no hard box edge against the background)
      const cy = HY - 20 * s, R = 620 * s;
      const g = c.createRadialGradient(x, cy, R * 0.55, x, cy, R);
      g.addColorStop(0, rgba('#0d0d0d', 1 - dim));
      g.addColorStop(1, rgba('#0d0d0d', 0));
      c.fillStyle = g;
      c.fillRect(x - R, cy - R, R * 2, R * 2);
    }
    if (isWin && crackP > 0) {
      c.save(); c.globalCompositeOperation = 'screen';
      const R = panelRect(x, HY, s);
      const fade = 1 - 0.75 * clamp(o.reveal ?? 0);
      glow(c, R.x + R.w / 2, R.y + R.h / 2, 420, d.glow[0]!, 0.5 * crackP * fade);
      glow(c, R.x + R.w / 2, R.y + R.h / 2, 180, C.white, 0.35 * crackP * fade * fade);
      c.restore();
    }
    c.restore();
    // the label
    const la = seg(t, o.labelsAt + (side === 'r' ? 0.35 : 0), o.labelsAt + (side === 'r' ? 1.25 : 0.9));
    if (la > 0) {
      c.save();
      c.globalAlpha = ease.outCubic(la) * dim;
      const ly = HY + 355 + (1 - ease.outCubic(la)) * 30;
      c.shadowColor = d.glow[0]!; c.shadowBlur = 30 * (0.5 + beat);
      text(c, label, x, ly, { size: 84, weight: 700, color: d.glow[0] === C.white || d.glow[0] === C.black ? C.white : d.glow[0], align: 'center' });
      c.restore();
    }
  }
  motes(c, t, clamp(t / 1.2) * 0.9, o.winner, o.crack ?? 0);
  // the VS badge
  const va = seg(t, o.labelsAt + 0.6, o.labelsAt + 1.1);
  if (va > 0) {
    const s = ease.outBack(va) * (1 + 0.06 * beat);
    c.save();
    c.translate(W / 2, HY + 60); c.scale(s, s); c.rotate(-0.1);
    c.fillStyle = pair.badge;
    c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.fill();
    c.lineWidth = 6; c.strokeStyle = pair.ring; c.stroke();
    text(c, 'vs', 0, 14, { size: 44, weight: 700, color: ink(pair.badge), align: 'center' });
    c.restore();
  }
  drawLockup(c, W / 2, SAFE.top - 10, 42, LOGO.onBlack);
}

function makePoll(pair: Pair): Film {
  const beats = Array.from({ length: 16 }, (_, i) => b(i));
  return {
    id: 'which', title: `09 · Which Back Are You? — ${pair.lLabel} vs ${pair.rLabel}`, duration: TP.end,
    marks: [{ t: 0, label: 'silhouettes' }, { t: TP.labels, label: 'labels + spotlight' }, { t: TP.poll, label: 'poll' }],
    draw(c, t, post) {
      scene(c, pair, t, { beats: t >= TP.poll ? beats : [], labelsAt: TP.labels, sweep: t >= TP.sweep0 });
      if (t >= TP.poll) {
        kinetic(c, 'Which back', W / 2, SAFE.top + 150, t - TP.poll, { size: 100, weight: 700, color: C.white, align: 'center' });
        kinetic(c, 'are you?', W / 2, SAFE.top + 262, t - TP.poll - 0.18, { size: 100, weight: 700, color: C.white, align: 'center' });
      }
      post.vignette = 0.35;
      post.flash = 0.08 * pulse(t - TP.poll, 8);
    },
    score() {
      const S = new Score(TP.end, { delayTime: K.beat * 0.75, verbSize: 3 });
      const root = n(`${pair.root}1`);
      const m = [0, 3, 7, 10, 14];
      S.pad(0, m.slice(0, 4).map((x) => root + 24 + x), TP.end, 0.45, { attack: 2, cutoff: 900, release: 0.5 });
      S.sub(0, root, TP.end, 0.35);
      // a heartbeat
      for (let q = 0; q < 16; q++) {
        const g = q < 8 ? 0.55 : 0.9;
        S.kick(b(q), g, { tone: 0.75, duck: 0.4 });
        if (q >= 4) S.kick(b(q) + 0.16, g * 0.55, { tone: 0.7, duck: 0 });
        if (q >= 8) S.hat(b(q + 0.5), 0.35);
      }
      // the silhouettes' motif, then the labels
      [0, 2, 3, 5].forEach((q, i) => S.pluck(b(q) + 0.02, root + 36 + m[i]!, 0.3, 0.35, { pan: i % 2 ? 0.4 : -0.4, delay: 0.35 }));
      S.whoosh(TP.sweep0, 1.6, 0.35, { from: 300, to: 1200, panFrom: -0.6, panTo: 0.6 });
      S.bell(TP.labels + 0.1, root + 48 + 7, 0.5, { pan: -0.4 });
      S.bell(TP.labels + 0.45, root + 48 + 3, 0.5, { pan: 0.4 });
      // the poll
      S.pop(TP.poll, 1, 1.2);
      S.stab(TP.poll, m.slice(0, 4).map((x) => root + 36 + x), 0.5, 0.7);
      for (let q = 9; q < 16; q += 2) S.clap(b(q + 0.5), 0.25);
      return S;
    },
  };
}

function makeResults(pair: Pair): Film {
  const beats = Array.from({ length: 14 }, (_, i) => b(i));
  const win = pair.result >= 0.5 ? 'l' : 'r';
  const winLabel = win === 'l' ? pair.lLabel : pair.rLabel;
  return {
    id: 'which', title: `09 · Which Back — results (${winLabel} wins)`, duration: TR.end,
    marks: [{ t: 0, label: 'recap' }, { t: TR.bar0, label: 'results bar' }, { t: TR.crack, label: 'winner cracks' }, { t: TR.chose, label: 'you chose' }],
    draw(c, t, post) {
      const crack = ease.outCubic(seg(t, TR.crack, TR.crack + 1.2));
      // "Revealed first": the winner breaks open into its real, full-colour design
      const reveal = ease.outCubic(seg(t, TR.chose - 0.45, TR.chose + 0.25));
      scene(c, pair, t, { beats, labelsAt: -2, sweep: false, winner: t >= TR.crack - 0.4 ? win : undefined, crack, dimLoser: seg(t, TR.crack, TR.crack + 0.8), reveal });
      // headline
      if (t < TR.chose - 0.3) kinetic(c, 'The results.', W / 2, SAFE.top + 190, t - 0.2, { size: 100, weight: 700, color: C.white, align: 'center' });
      else {
        kinetic(c, 'You chose.', W / 2, SAFE.top + 150, t - TR.chose, { size: 100, weight: 700, color: C.white, align: 'center' });
        kinetic(c, 'Revealed first.', W / 2, SAFE.top + 262, t - TR.chose - 0.35, { size: 84, weight: 600, color: byId(win === 'l' ? pair.left : pair.right).glow[0] === C.white ? C.coral : byId(win === 'l' ? pair.left : pair.right).glow[0]!, align: 'center' });
      }
      // the bar
      const bp = ease.inOutCubic(seg(t, TR.bar0, TR.bar1));
      const share = lerp(0.5, pair.result, bp);
      const x0 = SAFE.left + 20, x1 = SAFE.right - 20, y = SAFE.bottom - 70, hgt = 34;
      const ap = ease.outCubic(seg(t, TR.bar0 - 0.5, TR.bar0));
      if (ap > 0) {
        c.save();
        c.globalAlpha = ap;
        const mid = lerp(x0, x1, share);
        const lc = byId(pair.left).glow[0]!, rc = byId(pair.right).glow[0]!;
        c.beginPath(); c.roundRect(x0, y, x1 - x0, hgt, hgt / 2); c.clip();
        c.fillStyle = lc === C.white ? C.cream : lc; c.fillRect(x0, y, mid - x0, hgt);
        c.fillStyle = rc === C.white ? C.cream : rc; c.fillRect(mid, y, x1 - mid, hgt);
        c.fillStyle = C.black; c.fillRect(mid - 3, y, 6, hgt);
        c.restore();
        c.save(); c.globalAlpha = ap;
        const pct = (v: number) => `${Math.round(v * 100)}%`;
        text(c, pct(share), x0, y - 20, { size: 56, weight: 700, color: C.white });
        text(c, pct(1 - share), x1, y - 20, { size: 56, weight: 700, color: C.white, align: 'right' });
        c.restore();
      }
      post.vignette = 0.35;
      post.flash = 0.12 * pulse(t - TR.crack - 0.5, 6) + 0.3 * pulse(t - TR.chose + 0.45, 7);
      post.flashColor = byId(win === 'l' ? pair.left : pair.right).glow[0]!;
      post.ca = 0.8 * pulse(t - TR.crack - 0.5, 6);
    },
    score() {
      const S = new Score(TR.end, { delayTime: K.beat * 0.75, verbSize: 3 });
      const root = n(`${pair.root}1`);
      const m = [0, 3, 7, 10, 14];
      S.pad(0, m.slice(0, 4).map((x) => root + 24 + x), TR.crack, 0.4, { attack: 1, cutoff: 900, release: 0.3 });
      for (let q = 0; q < 14; q++) { S.kick(b(q), q < 9 ? 0.6 : 0.9, { tone: 0.75, duck: 0.4 }); S.kick(b(q) + 0.16, 0.35, { tone: 0.7, duck: 0 }); }
      // the bar fills: rising ticks
      for (let k = 0; k < 22; k++) S.tick(lerp(TR.bar0, TR.bar1, (k / 22) ** 0.7), 0.5, 1500 + k * 60);
      S.riser(TR.bar0, TR.crack + 0.5, 0.6);
      S.crack(TR.crack, 1.1, 1);
      S.sparkle(TR.crack + 0.5, 0.9, 0.8, root + 60);
      S.boom(TR.crack + 0.5, 0.7);
      // the winner breaks open into its real design
      S.boom(TR.chose - 0.45, 0.6);
      S.sparkle(TR.chose - 0.42, 0.6, 0.9, root + 60);
      // "you chose" — major resolution
      const maj = [0, 4, 7, 11, 14];
      S.stab(TR.chose, maj.slice(0, 4).map((x) => root + 36 + x), 0.6, 0.9);
      S.pad(TR.crack + 0.5, maj.map((x) => root + 24 + x), TR.end - TR.crack, 0.55, { attack: 0.3 });
      S.bass(TR.chose, root + 12, 1.2, 0.8);
      for (let q = 0; q < 3; q++) S.bell(TR.chose + 0.2 + q * K.beat, root + 48 + maj[q + 1]!, 0.5);
      return S;
    },
  };
}

export function makeWhichBack(v: string): Film {
  const [kind, id] = v.split('-') as [string, string];
  const pair = PAIRS.find((p) => p.id === id) ?? PAIRS[0]!;
  return kind === 'result' ? makeResults(pair) : makePoll(pair);
}

export const WHICH_VARIANTS = [
  ...PAIRS.map((p) => ({ id: `poll-${p.id}`, label: `Poll: ${p.lLabel} vs ${p.rLabel}` })),
  ...PAIRS.map((p) => ({ id: `result-${p.id}`, label: `Results: ${p.lLabel} vs ${p.rLabel}` })),
];

export { chord, H };
