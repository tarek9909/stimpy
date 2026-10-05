// 5 · STIMPIE GLIMPSES (10 s, a series: one episode per design). Build desire without revealing.
//
//  0–2     the whole screen is a closed zipper over a solid colour that hints at the design
//  2–5     the zipper opens a few centimetres: a sliver of the artwork, then it snaps shut; again elsewhere
//  5–8     the rhythm speeds up with the music: open, flash, close. Three single frames (2 frames at 60 fps,
//          so they survive a 30 fps upload) show a much bigger piece: "Pause it if you can."
//  8–9.45  the pull runs down to 80%, stops… and zips shut
//  9.45–10 "Not yet."
import { C, ink, rgba } from '../engine/brand';
import { drawLockup, LOGO } from '../engine/logo';
import { text, type Ctx } from '../engine/draw';
import { closedTeeth, openTeeth, drawPull, Track, type TeethStyle } from '../engine/zipper';
import { byId, type Design } from '../art/designs';
import type { Film, Post } from '../engine/engine';
import { Score, n, chord } from '../audio/score';
import { W, H, SAFE, fabricFill, glow, pill } from './common';
import { ease, seg, clamp, pulse, mulberry, clock, lerp } from '../engine/util';

const K = clock(120);
const b = K.b;

export interface Episode { id: string; no: number; design: string; hint: string; teeth: string; tab: string; root: string; focus?: number; zoom?: number }
export const EPISODES: Episode[] = [
  { id: 'flame', no: 1, design: 'flame', hint: C.coral, teeth: C.black, tab: C.black, root: 'F', focus: 0.74, zoom: 1.35 },
  { id: 'sun', no: 2, design: 'sun', hint: C.butter, teeth: C.black, tab: C.coral, root: 'G' },
  { id: 'wave', no: 3, design: 'wave', hint: C.sky, teeth: C.white, tab: C.coral, root: 'A', focus: 0.62, zoom: 1.2 },
  { id: 'bloom', no: 4, design: 'bloom', hint: C.lilac, teeth: C.black, tab: C.coral, root: 'D' },
  { id: 'night', no: 5, design: 'night', hint: C.blue, teeth: C.white, tab: C.coral, root: 'E' },
];

const PARK = 330;       // the slider rests near the top of the safe area (its tab hangs above)
const LONG = { t0: b(16), stop: b(17.8), shut0: b(18.5), shut1: b(18.9) };
const NOT_YET = LONG.shut1 + 0.03;
const END = 10;

interface Op { t0: number; open: number; hold: number; close: number; yA: number; len: number; amp: number; flash?: boolean }

function buildOps(seed: number): Op[] {
  const r = mulberry(seed);
  const ops: Op[] = [];
  // three slow glimpses
  ops.push({ t0: b(4), open: 0.28, hold: 0.45, close: 0.09, yA: 700, len: 330, amp: 96 });
  ops.push({ t0: b(6.4), open: 0.24, hold: 0.4, close: 0.08, yA: 1080, len: 360, amp: 104 });
  ops.push({ t0: b(8.4), open: 0.2, hold: 0.32, close: 0.07, yA: 430, len: 300, amp: 92 });
  // 8ths then 16ths
  for (let q = 10; q < 13; q += 0.5) ops.push({ t0: b(q), open: 0.07, hold: 0.08, close: 0.05, yA: 330 + r() * 1000, len: 220 + r() * 180, amp: 80 + r() * 40 });
  for (let q = 13; q < 16; q += 0.25) ops.push({ t0: b(q), open: 0.035, hold: 0.04, close: 0.03, yA: 330 + r() * 1050, len: 200 + r() * 220, amp: 76 + r() * 44 });
  // the hidden frames: exactly two frames at 60 fps
  for (const f of [b(11.5) + 0.12, b(13.75) + 0.02, b(15.25) + 0.05]) {
    const tf = Math.round(f * 60) / 60;
    ops.push({ t0: tf, open: 0, hold: 2 / 60 - 1e-4, close: 0, yA: 280, len: 1450, amp: 430, flash: true });
  }
  return ops.sort((a, b2) => a.t0 - b2.t0);
}

/** Extent 0..1 of an op at t (0 = shut). */
function extent(o: Op, t: number) {
  if (t < o.t0) return 0;
  if (o.flash) return t < o.t0 + o.hold ? 1 : 0;
  const a = t - o.t0;
  if (a < o.open) return ease.outCubic(a / o.open);
  if (a < o.open + o.hold) return 1;
  if (a < o.open + o.hold + o.close) return 1 - ease.inCubic((a - o.open - o.hold) / o.close);
  return 0;
}

interface State { gap: (y: number) => number; pull: number; swing: number; flash: boolean; openness: number }

function state(ops: Op[], t: number): State {
  // the long open: a V below the parked slider
  if (t >= LONG.t0) {
    const down = ease.inOutCubic(seg(t, LONG.t0, LONG.stop));
    const up = ease.inCubic(seg(t, LONG.shut0, LONG.shut1));
    const target = lerp(PARK, PARK + 0.8 * (H - PARK), down);
    const pull = lerp(target, PARK, up);
    const spread = 0.36 * (1 - up * 0.3);
    return { gap: (y) => (y > PARK && y < pull ? Math.min((pull - y) * spread, (y - PARK) * 1.4 + 2) : 0), pull, swing: Math.sin(t * 9) * 0.25 * (1 - seg(t, LONG.stop, LONG.stop + 0.4)), flash: false, openness: (pull - PARK) / (H - PARK) };
  }
  const active = ops.filter((o) => extent(o, t) > 0.001);
  let pull = PARK, flash = false, openness = 0;
  for (const o of ops) if (t >= o.t0) pull = o.yA + o.len * extent(o, t);
  const last = [...ops].reverse().find((o) => t >= o.t0);
  if (last && extent(last, t) <= 0.001) pull = last.yA; // snapped shut: the slider sits where it closed
  if (!last) pull = PARK;
  for (const o of active) { if (o.flash) flash = true; openness = Math.max(openness, extent(o, t) * (o.len / 400)); }
  const gap = (y: number) => {
    let g = 0;
    for (const o of active) {
      const e = extent(o, t);
      const L = o.len * (o.flash ? 1 : e);
      const u = (y - o.yA) / L;
      if (u <= 0 || u >= 1) continue;
      g = Math.max(g, o.amp * Math.sqrt(e) * Math.sin(Math.PI * Math.pow(u, 0.8)));
    }
    return g;
  };
  return { gap, pull: flash ? pull : pull, swing: 0, flash, openness };
}

/** The artwork behind the zipper, full frame. */
function artwork(c: Ctx, d: Design, t: number, focus = 0.5, zoom = 1) {
  const s = Math.max(W / 300, H / 364) * 1.05 * zoom;
  c.save();
  c.translate(W / 2 - 150 * s, clamp(H / 2 - 364 * focus * s, H - 364 * s, 0));
  c.scale(s, s);
  d.draw(c, 300, 364, t);
  c.restore();
}

function hud(c: Ctx, ep: Episode, t: number) {
  const fg = ink(ep.hint);
  const col = ep.hint === C.coral ? LOGO.main : ep.hint === C.blue ? { ...LOGO.onBlack, outline: C.butter } : { ...LOGO.onWhite, outline: C.coral };
  // the zipper splits the frame: the HUD sits on either side of it
  const lk = { x: SAFE.left + 150, y: SAFE.bottom - 30 };
  drawLockup(c, lk.x, lk.y, 46, col, { word: { reveal: seg(t, 0.2, 1.0) } });
  // episode counter + the drop colours
  const y = SAFE.top - 20;
  text(c, `GLIMPSE`, SAFE.left, y - 34, { size: 24, weight: 600, color: fg, track: 0.14 });
  text(c, `Nº 0${ep.no}`, SAFE.left, y + 22, { size: 52, weight: 700, color: fg });
  EPISODES.forEach((e, i) => {
    const x = SAFE.right - (EPISODES.length - 1 - i) * 46 - 14;
    const y = SAFE.bottom - 40;
    const cur = e.no === ep.no;
    c.beginPath(); c.arc(x, y - 9, cur ? 18 : 15, 0, Math.PI * 2);
    c.fillStyle = e.hint; c.fill();
    c.lineWidth = cur ? 5 : 3; c.strokeStyle = cur ? fg : C.white; c.stroke();
  });
}

function scene(c: Ctx, ep: Episode, ops: Op[], t: number, post: Post | null) {
  const d = byId(ep.design);
  const st = state(ops, t);
  const cx = W / 2;
  // slow push-in, reset at "Not yet."
  const push = t < NOT_YET ? 1 + 0.045 * ease.inOutQuad(seg(t, 0, NOT_YET)) : 1;
  c.save();
  c.translate(W / 2, H / 2); c.scale(push, push); c.translate(-W / 2, -H / 2);
  artwork(c, d, t, ep.focus, ep.zoom);
  // the fabric: two halves with the openings cut into their shared edge
  const Lp = new Path2D(), Rp = new Path2D();
  const left: { x: number; y: number }[] = [], right: { x: number; y: number }[] = [];
  Lp.moveTo(-60, -60); Rp.moveTo(W + 60, -60);
  for (let y = -40; y <= H + 40; y += 5) {
    const g = st.gap(y);
    Lp.lineTo(cx - g, y); Rp.lineTo(cx + g, y);
    left.push({ x: cx - g, y }); right.push({ x: cx + g, y });
  }
  Lp.lineTo(-60, H + 60); Lp.closePath();
  Rp.lineTo(W + 60, H + 60); Rp.closePath();
  for (const p of [Lp, Rp]) {
    c.save();
    c.shadowColor = rgba(C.black, 0.45); c.shadowBlur = 36;
    fabricFill(c, ep.hint, p, 0.9);
    c.restore();
  }
  // light spilling out of any opening onto the fabric
  if (st.openness > 0.01) {
    c.save();
    c.globalCompositeOperation = 'soft-light';
    glow(c, cx, clamp(st.pull - 150, 0, H), 420, d.glow[1] ?? C.white, Math.min(0.8, st.openness));
    c.restore();
  }
  // teeth: interlocked where shut, open rows along parted edges
  const T: TeethStyle = { pitch: 64, size: 50, color: ep.teeth, tape: rgba(C.black, 0.3), tapeW: 76 };
  let runStart: number | null = null;
  const runs: [number, number, boolean][] = [];
  const ys = left.map((p) => p.y);
  ys.forEach((y, i) => {
    const open = right[i]!.x - left[i]!.x > 3;
    if (runStart === null) runStart = i;
    const nextOpen = i + 1 < ys.length ? right[i + 1]!.x - left[i + 1]!.x > 3 : !open;
    if (nextOpen !== open || i === ys.length - 1) { runs.push([runStart, i, open]); runStart = null; }
  });
  for (const [a, z, open] of runs) {
    if (open) {
      openTeeth(c, left.slice(a, z + 1), { ...T, tapeW: 60 }, -1, 0);
      openTeeth(c, right.slice(a, z + 1), { ...T, tapeW: 60 }, 1, T.pitch / 2);
    } else {
      const y0 = ys[a]!, y1 = ys[z]! + 5;
      const tr = new Track([[cx, 0], [cx, H + 60]]);
      closedTeeth(c, tr, Math.max(0, y0), Math.max(0, y1), { ...T, shade: rgba(C.black, 0.3) });
    }
  }
  // the slider
  drawPull(c, cx, st.pull, Math.PI / 2, 132, { tab: ep.tab, body: C.black }, st.swing);
  c.restore();
  if (post) {
    if (st.flash) { post.flash = 0.08; post.flashColor = C.white; }
    post.ca = st.flash ? 1.5 : 0.25 * Math.min(1, st.openness * 3);
    post.vignette = 0.22;
  }
}

export function makeGlimpse(v: string): Film {
  const ep = EPISODES.find((e) => e.id === v) ?? EPISODES[0]!;
  const ops = buildOps(ep.no * 101);
  return {
    id: 'glimpses', title: `05 · Stimpie Glimpses — Nº 0${ep.no}`, duration: END,
    marks: [
      { t: 0, label: 'closed' }, { t: b(4), label: 'glimpses' }, { t: b(10), label: 'faster' },
      { t: LONG.t0, label: 'to 80%' }, { t: LONG.shut0, label: 'zip shut' }, { t: NOT_YET, label: 'not yet' },
    ],
    draw(c, t, post) {
      scene(c, ep, ops, t, post);
      hud(c, ep, t);
      if (t >= NOT_YET) {
        const age = t - NOT_YET;
        const s = ease.outBack(seg(age, 0, 0.35), 2.2);
        c.save();
        c.translate(W / 2, 980);
        c.scale(s, s);
        c.rotate(-0.04);
        pill(c, 'Not yet.', 0, 0, { size: 110, bg: C.cream, color: C.black, padX: 70, padY: 44 });
        c.restore();
        post.flash = 0.2 * pulse(age, 12);
      }
    },
    score() {
      const S = new Score(END, { delayTime: K.beat * 0.75, delayFb: 0.3 });
      const root = n(`${ep.root}1`);
      const mnr = [0, 3, 7, 10, 14];
      // tension bed: sub pulse on every beat, soft pad; hats come in with the speed-up
      S.pad(0, mnr.slice(0, 4).map((x) => root + 24 + x), b(16), 0.3, { attack: 1.5, cutoff: 700 });
      for (let q = 0; q < 16; q++) {
        S.kick(b(q), q < 4 ? 0.45 : q < 10 ? 0.7 : 0.9, { tone: 0.8 });
        S.bass(b(q), root + (q % 8 === 7 ? 3 : 0), K.beat * 0.8, 0.6, { cutoff: 500 });
        if (q >= 4) S.hat(b(q + 0.5), 0.45);
        if (q >= 10) { S.hat(b(q + 0.25), 0.3); S.hat(b(q + 0.75), 0.3); if (q % 2) S.clap(b(q + 1) - 0.001, 0.5); }
      }
      S.clockTick(0.4, 0.4); S.clockTick(0.9, 0.3, false); S.clockTick(1.4, 0.4); S.clockTick(1.9, 0.3, false);
      // every opening: a short zip down, a glimpse of harmony, a snap shut
      ops.forEach((o, i) => {
        if (o.flash) { S.stab(o.t0, mnr.slice(1, 5).map((x) => root + 36 + x), 0.08, 0.9); S.snap(o.t0, 0.9); return; }
        const teeth = Math.max(4, Math.round(o.len / 46));
        S.zip(o.t0, o.t0 + o.open, (u) => ease.outCubic(u), teeth, 0.55, { stop: false, pan: (i % 3 - 1) * 0.2 });
        S.pluck(o.t0 + o.open * 0.5, root + 36 + mnr[i % 5]!, 0.15, 0.45, { pan: (o.yA - 900) / 1200 });
        S.snap(o.t0 + o.open + o.hold + o.close, 0.9);
        S.zip(o.t0 + o.open + o.hold, o.t0 + o.open + o.hold + o.close, (u) => u, Math.max(3, Math.round(teeth * 0.8)), 0.4, { stop: false, bright: 1.2 });
      });
      // the long open: zip down to 80%, then silence
      S.zip(LONG.t0, LONG.stop, (u) => ease.inOutCubic(u), 26, 1, { stop: true });
      S.riser(LONG.t0, LONG.stop, 0.7);
      S.pad(LONG.t0, mnr.map((x) => root + 24 + x), LONG.stop - LONG.t0, 0.6, { attack: 0.6, release: 0.1, cutoff: 2400 });
      S.gate(LONG.stop - 0.04, 0, 0.04);
      // …and shut
      S.zip(LONG.shut0, LONG.shut1, (u) => ease.inCubic(u), 26, 1.1, { stop: true, bright: 1.1 });
      S.boom(NOT_YET, 0.8);
      S.thud(NOT_YET, 0.8, 0.8);
      S.bell(NOT_YET + 0.02, root + 48, 0.6, { bus: 'sfx', decay: 1.4 });
      return S;
    },
  };
}

export { chord };
