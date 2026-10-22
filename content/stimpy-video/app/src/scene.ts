// The edit. drawFrame(ctx, t) paints the whole frame for song time t and returns
// the post-processing parameters. Every value derives from t and song.json.
import { SONG, T, BEAT, BAR, pulse, since } from './song';
import { CARDS, cardCanvas, CARD_ASPECT, BONE, BLACK, RED } from './cards';
import { drawHoodie, slotRect, HoodieOpts } from './hoodie';
import { avatar } from './avatar';
import {
  W, H, worldDark, worldVoid, worldAfterDark, worldCedar, worldDreamer, worldDreamerFront, worldStudio, worldEnd,
} from './worlds';
import { clamp, lerp, inv, smooth, easeOutExpo, easeInOut, easeOutBack, easeOutCubic, hash, noise1, TAU } from './util';

type Ctx = CanvasRenderingContext2D;
export type Post = {
  flash: number;
  flashColor: [number, number, number];
  ca: number;
  bloom: number;
  grain: number;
  vignette: number;
  fade: number;
};

// ---------------------------------------------------------------- the card schedule

type Attach = { t: number; card: number; F: number; side: number };
const ATTACH: Attach[] = [
  { t: T(8), card: 1, F: 0.45, side: 1 },
  { t: T(10), card: 2, F: 0.42, side: -1 },
  { t: T(12), card: 3, F: 0.42, side: 1 },
  { t: T(14), card: 4, F: 0.42, side: -1 },
  ...Array.from({ length: 12 }, (_, k) => ({ t: T(20) + k * BEAT, card: 5 + k, F: 0.2, side: k % 2 ? 1 : -1 })),
  { t: T(23), card: 0, F: 0.42, side: 1 },
];
const DETACH = T(16);
const WORLD_CLICKS = ATTACH.slice(0, 4).map((a) => a.t);
const SWAP_CLICKS = ATTACH.slice(4, 16).map((a) => a.t);
const WORDS = ['ONE', 'HOODIE', 'ENDLESS', 'WORLDS', 'CLICK', 'SWAP', 'CLICK', 'SWAP', 'NEW', 'DAY', 'NEW', 'YOU'];
const WORLD_NAMES = ['void', 'afterdark', 'cedar', 'dreamer'];

function attachedAt(t: number): { a: Attach; i: number } | null {
  let r: { a: Attach; i: number } | null = null;
  ATTACH.forEach((a, i) => {
    if (a.t <= t + 1e-6) r = { a, i };
  });
  if (!r) return null;
  const rr = r as { a: Attach; i: number };
  if (rr.a.t < DETACH && t >= DETACH - 0.3) return null;
  return rr;
}

// ---------------------------------------------------------------- text helpers

function text(c: Ctx, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left', alpha = 1, spacing = 0) {
  if (alpha <= 0.001 || !s) return;
  c.save();
  c.globalAlpha = clamp(alpha);
  c.font = font;
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  (c as any).letterSpacing = `${spacing}px`;
  c.fillText(s, x, y);
  c.restore();
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%&*';
function scramble(s: string, u: number, seed: number) {
  const n = Math.floor(clamp(u) * s.length);
  let out = s.slice(0, n);
  if (n < s.length) out += GLYPHS[Math.floor(hash(seed + n) * GLYPHS.length)];
  return out;
}

function fitFont(c: Ctx, s: string, weight: string, family: string, size: number, maxW: number) {
  c.font = `${weight} ${size}px ${family}`;
  const w = c.measureText(s).width;
  const k = w > maxW ? maxW / w : 1;
  return `${weight} ${Math.floor(size * k)}px ${family}`;
}

function drawCard(c: Ctx, n: number, cx: number, cy: number, w: number, rot: number, alpha = 1, shadow = 0.6) {
  const h = w / CARD_ASPECT;
  c.save();
  c.globalAlpha = clamp(alpha);
  c.translate(cx, cy);
  c.rotate(rot);
  // the shadow follows the picture's own shape
  if (shadow > 0) {
    c.shadowColor = `rgba(0,0,0,${shadow})`;
    c.shadowBlur = w * 0.12;
    c.shadowOffsetY = w * 0.05;
  }
  c.drawImage(cardCanvas(n), -w / 2, -h / 2, w, h);
  c.restore();
}

function brackets(c: Ctx, color: string, alpha: number) {
  c.save();
  c.strokeStyle = color;
  c.globalAlpha = alpha;
  c.lineWidth = 3;
  const m = 44, a = 46;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.beginPath();
    c.moveTo(x, y + sy * a);
    c.lineTo(x, y);
    c.lineTo(x + sx * a, y);
    c.stroke();
  }
  c.restore();
}

function topHud(c: Ctx, color: string, alpha: number) {
  if (alpha <= 0) return;
  brackets(c, color, alpha * 0.6);
  text(c, 'STIMPY', 84, 128, '900 38px ArchivoX', color, 'left', alpha);
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = RED;
  c.beginPath();
  c.moveTo(84, 146);
  c.lineTo(104, 146);
  c.lineTo(94, 158);
  c.closePath();
  c.fill();
  c.restore();
  text(c, 'DROP 001', W - 84, 124, '600 24px PlexB', color, 'right', alpha, 3);
}

// ---------------------------------------------------------------- world dispatch

function drawWorld(c: Ctx, name: string, t: number, lt: number) {
  if (name === 'void') worldVoid(c, t, lt);
  else if (name === 'afterdark') worldAfterDark(c, t, lt);
  else if (name === 'cedar') worldCedar(c, t, lt);
  else if (name === 'dreamer') worldDreamer(c, t, lt);
  else worldDark(c, t, 1, 0, 0);
}

const LIGHT: Record<string, Partial<HoodieOpts>> = {
  void: { rim: BONE, rimAmt: 0.4 },
  afterdark: { rim: RED, rimAmt: 0.9, tint: RED, tintAmt: 0.03 },
  cedar: { rim: '#ff9a5a', rimAmt: 0.6, tint: '#ffb070', tintAmt: 0.05 },
  dreamer: { rim: BONE, rimAmt: 0.45, tint: RED, tintAmt: 0.08 },
};
const HUD_INK: Record<string, string> = { void: BLACK, afterdark: BONE, cedar: '#1c110c', dreamer: BONE };

// ---------------------------------------------------------------- the frame

export function drawFrame(c: Ctx, t: number): Post {
  const post: Post = { flash: 0, flashColor: [1, 1, 1], ca: 0.0015, bloom: 0.55, grain: 0.028, vignette: 0.4, fade: 1 };
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';

  const walk = (t / BEAT) * Math.PI;
  const kickP = pulse(SONG.kicks, t, 0.09);
  const heartP = pulse(SONG.hearts, t, 0.18);

  // camera: kick punch + click shake
  let shake = 0;
  const wc = since(WORLD_CLICKS, t);
  const sc = since(SWAP_CLICKS, t);
  const fc = t - T(23);
  shake += 28 * Math.exp(-wc / 0.12);
  shake += 10 * Math.exp(-sc / 0.08);
  if (fc >= 0) shake += 34 * Math.exp(-fc / 0.15);
  const zoom = 1 + 0.004 * kickP;
  const sx = noise1(t * 40, 1) * shake, sy = noise1(t * 40, 2) * shake;
  c.save();
  c.translate(W / 2 + sx, H / 2 + sy);
  c.scale(zoom, zoom);
  c.translate(-W / 2, -H / 2);

  const att = attachedAt(t);
  let hud: () => void = () => {};
  let hoodie: HoodieOpts;
  let after: () => void = () => {};

  if (t < T(8)) {
    // ------------------------------------------------ DARK + WALK
    const walking = smooth(T(4), T(4.5), t);
    const door = t < T(4) ? 0.02 + 0.03 * (t / T(4)) : lerp(0.05, 1, inv(T(4), T(8) - BEAT, t));
    const travel = walking * (t - T(4)) * 1.6;
    const flicker = t < T(4) ? heartP * 0.6 : 0;
    worldDark(c, t, door, travel, flicker);
    const push = easeInOut(inv(T(4), T(8) - BEAT, t));
    hoodie = {
      x: 540, y: lerp(1330, 1060, push), s: lerp(0.5 + 0.04 * (t / T(4)), 1.0, push), t, walk, walkAmt: walking,
      sad: 1 - smooth(T(4.5), T(7), t),
      rim: BONE, rimAmt: 0.15 + heartP * 0.25 * (t < T(4) ? 1 : 0) + door * 0.9, card: null,
      slotGlow: t > T(5.5) ? smooth(T(5.5), T(6), t) * (0.55 + 0.45 * Math.sin(t * 16)) : 0,
    };
    post.bloom = 0.9;
    post.fade = smooth(0, 1.2, t);
    // intro words
    const lines: [string, number, number][] = [
      ["you don't have to wear", T(0, 2), 0.5],
      ['the same version of yourself', T(1, 2), 0.5],
      ['every day.', T(2, 2), 1],
    ];
    hud = () => {
      const out = 1 - smooth(T(3, 2), T(4), t);
      lines.forEach(([s, t0, step], li) => {
        const words = s.split(' ');
        let x0 = 0;
        c.font = '400 64px CormI';
        const full = c.measureText(s).width;
        let x = 540 - full / 2;
        words.forEach((wd, wi) => {
          const a = smooth(t0 + wi * BEAT * step, t0 + wi * BEAT * step + 0.3, t) * out;
          const wpx = c.measureText(wd + ' ').width;
          text(c, wd, x, 560 + li * 86 + (1 - a) * 14, '400 64px CormI', li === 2 ? RED : BONE, 'left', a);
          x += wpx;
          x0 += wpx;
        });
      });
      topHud(c, BONE, smooth(T(4), T(4.5), t));
      // the empty slot callout
      const ca = smooth(T(5), T(5.3), t) * (1 - smooth(T(7.5), T(7.8), t));
      if (ca > 0) {
        const r = slotRect(hoodie);
        c.save();
        c.globalAlpha = ca;
        c.strokeStyle = RED;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(r.cx + r.w / 2 + 10, r.cy - r.h * 0.3);
        c.lineTo(r.cx + r.w / 2 + 90, r.cy - r.h * 0.3 - 80);
        c.lineTo(W - 90, r.cy - r.h * 0.3 - 80);
        c.stroke();
        c.restore();
        const u = inv(T(5), T(5.6), t);
        text(c, scramble('STIMPIE SLOT', u, 1), W - 90, r.cy - r.h * 0.3 - 96, '600 24px PlexB', RED, 'right', ca, 3);
        text(c, scramble('EMPTY', inv(T(5.3), T(5.8), t), 2), W - 90, r.cy - r.h * 0.3 - 48, '400 24px Plex', BONE, 'right', ca, 3);
      }
    };
    // vacuum beat: blinding
    if (t > T(8) - BEAT) post.flash = 0.25 * inv(T(8) - BEAT, T(8), t);
  } else if (t < T(16)) {
    // ------------------------------------------------ WORLDS
    const wi = Math.min(3, Math.floor((t - T(8)) / (2 * BAR)));
    const wt = WORLD_CLICKS[wi];
    const name = WORLD_NAMES[wi];
    const lt = t - wt;
    const push = inv(wt, wt + 2 * BAR, t);
    hoodie = {
      x: 540, y: 1010 - push * 10, s: 1.0 + push * 0.05, t, walk, walkAmt: 0.55,
      ...LIGHT[name], card: att?.a.card ?? null,
      cardSettle: att ? Math.exp(-(t - att.a.t) / 0.07) : 0,
      snapFlash: att ? Math.exp(-(t - att.a.t) / 0.12) : 0,
    };
    // portal: the new world bursts out of the card
    const dt = t - wt;
    if (dt < 0.34) {
      const prev = wi === 0 ? 'glare' : WORLD_NAMES[wi - 1];
      if (prev === 'glare') {
        c.fillStyle = BONE;
        c.fillRect(0, 0, W, H);
      } else drawWorld(c, prev, t, t - WORLD_CLICKS[wi - 1]);
      const r = slotRect({ ...hoodie, t: wt });
      const u = easeOutExpo(dt / 0.34);
      const hw = lerp(r.w / 2, W * 1.2, u), hh = lerp(r.h / 2, H * 1.2, u);
      c.save();
      c.beginPath();
      c.rect(r.cx - hw, r.cy - hh, hw * 2, hh * 2);
      c.clip();
      drawWorld(c, name, t, lt);
      c.restore();
    } else drawWorld(c, name, t, lt);
    if (name === 'dreamer') after = () => worldDreamerFront(c, t, lt);
    post.bloom = name === 'afterdark' ? 1.0 : name === 'void' ? 0.35 : 0.6;
    post.grain = name === 'cedar' ? 0.045 : 0.028;
    post.flash = 0.9 * Math.exp(-wc / 0.09);
    const ink = HUD_INK[name];
    hud = () => {
      topHud(c, ink, 1);
      const card = CARDS[wi + 1];
      const u = inv(wt + 0.05, wt + 0.5, t);
      text(c, scramble(card.name, inv(wt + 0.1, wt + 0.6, t), wi * 10 + 3), 80, 1572, fitFont(c, card.name, '900', 'ArchivoX', 70, 900), ink);
    };
  } else if (t < T(20)) {
    // ------------------------------------------------ DECK: the system
    const lt = t - T(16);
    worldStudio(c, t, 0.6 + 0.4 * smooth(T(16), T(16.5), t));
    const toFront = easeInOut(inv(T(16) + 0.15, T(16, 3), t));
    const toBack = easeInOut(inv(T(17, 2), T(18), t));
    const turn = Math.PI * toFront + Math.PI * toBack;
    const vac = t > T(20) - BEAT;
    hoodie = {
      x: 540, y: 1100, s: 0.82, t, walk, walkAmt: 0.15, turn, rim: vac ? RED : BONE, rimAmt: vac ? 0.8 : 0.4, card: null,
      slotGlow: vac ? 1 : smooth(T(19), T(20) - BEAT, t) * (0.5 + 0.5 * Math.sin(t * 25)),
    };
    // the fan of stimpies
    const orbitMix = smooth(T(18), T(18.6), t);
    const spinU = inv(T(18), T(20) - BEAT, t);
    const spin = spinU * spinU * 9 + spinU * 1.5;
    const explode = inv(T(20) - BEAT, T(20) - BEAT + 0.25, t);
    const fan = (behind: boolean) => {
      const rf = SONG.riffle;
      const dur = rf[1] - rf[0];
      for (let k = 0; k < 16; k++) {
        const u = k / 16;
        const tk = rf[0] + dur * (1 - Math.pow(1 - u, 1.7));
        const app = easeOutBack(clamp((t - tk) / 0.28), 1.3);
        if (t < tk) continue;
        const a = (k - 7.5) * 0.1;
        let x = 540 + Math.sin(a) * 1150;
        let y = 1950 - Math.cos(a) * 1150 - 20;
        let rot = a;
        let w = 230;
        const oa = (k / 16) * TAU + spin;
        const depth = Math.sin(oa);
        const ox = 540 + Math.cos(oa) * 470, oy = 980 + depth * 170;
        x = lerp(x, ox, orbitMix);
        y = lerp(y, oy, orbitMix);
        rot = lerp(rot, Math.cos(oa) * 0.25, orbitMix);
        w = lerp(w, 170 + depth * 50, orbitMix);
        if (orbitMix > 0.5 && (depth < 0) !== behind) continue;
        if (orbitMix <= 0.5 && !behind) continue;
        // fly in from the pile
        const px = lerp(540, x, app), py = lerp(2100, y, app);
        const ex = explode * 1400;
        drawCard(c, k + 1, px + Math.cos(oa) * ex, py + Math.sin(oa) * ex, w, rot, 1 - explode, 0.5);
      }
    };
    fan(true);
    after = () => fan(false);
    post.flash = 0.35 * Math.exp(-Math.abs(t - DETACH) / 0.08);
    post.bloom = 0.7;
    const f = toFront - toBack;
    hud = () => {
      topHud(c, BONE, 1 - (vac ? 1 : 0));
      const a1 = smooth(T(16, 2.5), T(16, 3), t) * (1 - smooth(T(17, 2), T(17, 2.5), t));
      text(c, 'FRONT', 540, 330, '900 110px ArchivoX', BONE, 'center', a1);
      text(c, '= BRAND', 540, 420, '400 64px CormI', BONE, 'center', a1 * f);
      const a2 = smooth(T(17, 3), T(17, 3.5), t) * (1 - smooth(T(18) - 0.1, T(18), t));
      text(c, 'BACK', 540, 330, '900 110px ArchivoX', RED, 'center', a2);
      text(c, '= EXPRESSION', 540, 420, '400 64px CormI', BONE, 'center', a2);
      const a3 = smooth(T(18), T(18) + 0.15, t) * (1 - smooth(T(19) - 0.1, T(19), t));
      text(c, 'ONE HOODIE.', 540, 360, fitFont(c, 'ONE HOODIE.', '900', 'ArchivoX', 120, 960), BONE, 'center', a3);
      const a4 = smooth(T(19), T(19) + 0.1, t) * (1 - (vac ? 1 : 0));
      text(c, '∞ STIMPIES.', 540, 360, fitFont(c, '∞ STIMPIES.', '900', 'ArchivoX', 120, 960), RED, 'center', a4);
    };
    if (vac) {
      c.fillStyle = 'rgba(0,0,0,0.85)';
      c.fillRect(0, 0, W, H);
    }
  } else if (t < T(23)) {
    // ------------------------------------------------ SWAP: a new stimpie every beat
    const k = Math.floor((t - T(20)) / BEAT);
    const card = CARDS[5 + k];
    const pal = card.pal;
    c.fillStyle = pal.bg;
    c.fillRect(0, 0, W, H);
    // halftone rings behind
    c.save();
    c.strokeStyle = pal.ink;
    c.globalAlpha = 0.12;
    c.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      c.beginPath();
      c.arc(540, 900, 120 + i * 70 + ((t - T(20)) * 140) % 70, 0, TAU);
      c.stroke();
    }
    c.restore();
    const word = WORDS[k];
    const wu = easeOutCubic(clamp((t - SWAP_CLICKS[k]) / 0.12));
    c.save();
    c.translate(540, 350);
    c.scale(1.25 - 0.25 * wu, 1.25 - 0.25 * wu);
    text(c, word, 0, 0, fitFont(c, word, '900', 'ArchivoX', 250, 980), pal.ink, 'center', 1);
    c.restore();
    hoodie = {
      x: 540, y: 1040, s: 0.95, t, walk, walkAmt: 0.4, rim: pal.acc === BONE ? BONE : RED, rimAmt: pal.bg === BLACK ? 0.7 : 0.25,
      card: att?.a.card ?? null, cardSettle: att ? Math.exp(-(t - att.a.t) / 0.06) : 0, snapFlash: att ? Math.exp(-(t - att.a.t) / 0.1) : 0,
    };
    post.flash = 0.3 * Math.exp(-sc / 0.07);
    post.flashColor = k % 2 ? [1, 0.16, 0.1] : [1, 1, 1];
    post.bloom = 0.5;
    hud = () => {
      topHud(c, pal.ink, 1);
      text(c, card.name, 80, 1572, fitFont(c, card.name, '900', 'ArchivoX', 70, 900), pal.ink);
    };
  } else {
    // ------------------------------------------------ LOGO
    const lt = t - T(23);
    const glow = 0.6 + 0.4 * Math.exp(-lt / 0.4) + 0.3 * heartP;
    worldEnd(c, t, glow);
    const pull = easeInOut(inv(T(23) + 0.45, T(24) + 0.4, t));
    hoodie = {
      x: 540, y: lerp(1040, avatar.ready ? 720 : 790, pull), s: lerp(0.95, 0.62, pull), t, walk, walkAmt: 0.2 * (1 - pull), rim: RED, rimAmt: 0.7,
      card: 0, cardSettle: Math.exp(-lt / 0.08), snapFlash: Math.exp(-lt / 0.15),
    };
    post.flash = 0.9 * Math.exp(-lt / 0.22);
    post.flashColor = [1, 0.16, 0.1];
    post.bloom = 0.8;
    post.fade = 1 - smooth(T(25, 2), T(26) + 0.7, t);
    hud = () => {
      const flick = t > T(25) && t < T(25) + 0.35 ? (Math.sin(t * 90) > 0 ? 1 : 0.2) : 1;
      const word = 'STIMPY';
      const font = fitFont(c, word, '900', 'ArchivoX', 200, 900);
      c.font = font;
      const total = c.measureText(word).width;
      let x = 540 - total / 2;
      for (let i = 0; i < word.length; i++) {
        const t0 = T(23) + 0.9 + i * 0.07;
        const a = easeOutBack(clamp((t - t0) / 0.3));
        c.font = font;
        const cw = c.measureText(word[i]).width;
        c.save();
        c.translate(x + cw / 2, 1440);
        c.scale(1, clamp(a, 0, 1.3));
        text(c, word[i], 0, 0, font, BONE, 'center', clamp(a * 2) * flick);
        c.restore();
        x += cw;
      }
      text(c, 'ONE HOODIE. YOUR WORLD.', 540, 1540, '600 32px PlexB', BONE, 'center', smooth(T(24), T(24) + 0.3, t) * flick, 5);
      text(c, 'DROP 001  ·  11.11.26  ·  100 HOODIES', 540, 1600, '400 26px Plex', RED, 'center', smooth(T(24, 2), T(24, 2) + 0.3, t) * flick, 3);
      text(c, '@STIMPY.LB', 540, 1690, '900 44px ArchivoX', BONE, 'center', smooth(T(24, 3), T(24, 3) + 0.3, t) * flick, 2);
      brackets(c, BONE, 0.5 * flick);
    };
  }

  // ground shadow + hoodie + flying cards
  const sh = hoodie;
  if (!avatar.ready) {
  c.save();
  c.globalAlpha = 0.45;
  c.filter = `blur(${24 * sh.s}px)`;
  c.fillStyle = '#000';
  c.beginPath();
  c.ellipse(sh.x, sh.y + 560 * sh.s, 300 * sh.s, 34 * sh.s, 0, 0, TAU);
  c.fill();
  c.restore();
  }

  // a flight window hides the attached card while the new one is incoming
  let flying: Attach | null = null;
  for (const a of ATTACH) if (t >= a.t - a.F && t < a.t) flying = a;
  if (flying) {
    const idx = ATTACH.indexOf(flying);
    const prev = idx > 0 ? ATTACH[idx - 1] : null;
    const prevOn = prev && !(prev.t < DETACH && flying.t > DETACH);
    const out = prevOn ? inv(flying.t - flying.F, flying.t - flying.F * 0.3, t) : 1;
    hoodie = { ...hoodie, card: null, slotGlow: Math.max(hoodie.slotGlow ?? 0, 0.8) };
    drawHoodie(c, hoodie);
    after();
    const r = slotRect(hoodie);
    if (prevOn && out < 1) {
      const e = out * out;
      drawCard(c, prev!.card, lerp(r.cx, 540 - flying.side * 900, e), lerp(r.cy, -600, e), lerp(r.w, r.w * 1.9, e), lerp(r.rot, -flying.side * 0.9, e), 1);
    }
    const u = inv(flying.t - flying.F, flying.t, t);
    const e = Math.pow(u, 2.2);
    drawCard(
      c, flying.card,
      lerp(540 + flying.side * 640, r.cx, e), lerp(2350, r.cy, e),
      lerp(r.w * 2.8, r.w, e), lerp(flying.side * 0.55, r.rot, easeOutCubic(u)), 1, 0.7,
    );
  } else {
    drawHoodie(c, hoodie);
    after();
  }
  // the stimpie peels off before the breakdown
  const pu = inv(DETACH - 0.3, DETACH + 0.55, t);
  if (pu > 0 && pu < 1) {
    const r = slotRect({ x: 540, y: 1010, s: 1.0, t, walk, walkAmt: 0.55 });
    const e = pu * pu;
    drawCard(c, 4, lerp(r.cx, 300, e), lerp(r.cy, -500, e), lerp(r.w, r.w * 1.6, e), lerp(0, -0.9, e), 1);
  }
  c.restore(); // camera

  hud();
  c.setTransform(1, 0, 0, 1, 0, 0);

  // post: click-driven aberration
  const clickP = Math.max(Math.exp(-wc / 0.15), 0.6 * Math.exp(-sc / 0.1), fc >= 0 ? Math.exp(-fc / 0.2) : 0);
  post.ca = 0.0003 + 0.009 * clickP;
  return post;
}
