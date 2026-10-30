// Instagram feed posts (4:5, 1080 × 1350). Built from the same kit as the films: the flat hoodie, the zipper,
// the split-S logo and the 11 real Stimpie artworks (placed and cropped only, never altered). No prices.
import { C, mix, rgba } from '../engine/brand';
import { drawLockup, LOGO, type LogoColors } from '../engine/logo';
import { font, text, type Ctx } from '../engine/draw';
import { drawHoodie, drawPanel, DOCK, tones, type HoodieOpts } from '../engine/hoodie';
import { Track, closedTeeth, openTeeth, drawPull } from '../engine/zipper';
import { DESIGNS, byId, paint, image, artStill, type Design } from '../art/designs';
import { mulberry } from '../engine/util';

export const PW = 1080, PH = 1350;
const M = 64; // outer margin

export interface Poster { id: string; title: string; draw: (c: Ctx) => void }

// ---------------------------------------------------------------- helpers
function hexLum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function contrast(a: string, b: string) { const x = hexLum(a), y = hexLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const isDark = (hex: string) => hexLum(hex) < 0.08;
/** The colour from the design's glow (or ink) that stands out most on its world. */
function accent(d: Design) {
  const cands = [...d.glow, d.ink];
  return cands.reduce((best, k) => (contrast(k, d.world) > contrast(best, d.world) ? k : best), cands[0]!);
}
function logoFor(bg: string): LogoColors {
  if (bg === C.coral) return LOGO.main;
  return isDark(bg) ? LOGO.onBlack : LOGO.onWhite;
}
function bg(c: Ctx, col: string) { c.fillStyle = col; c.fillRect(0, 0, PW, PH); }
/** Subtle printed-paper grain so flat colour fields don't look digital. */
function grain(c: Ctx, seed = 1, amt = 0.05) {
  const r = mulberry(seed);
  c.save();
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = r() > 0.5 ? `rgba(255,255,255,${amt * r()})` : `rgba(0,0,0,${amt * r()})`;
    c.fillRect(r() * PW, r() * PH, 1.6, 1.6);
  }
  c.restore();
}
/** Font size that makes `s` exactly `w` wide. */
function fitSize(c: Ctx, s: string, w: number, weight = 900, track = -0.02, max = 1000) {
  c.save();
  c.font = font({ size: 100, weight });
  c.letterSpacing = `${track * 100}px`;
  const m = c.measureText(s).width - track * 100;
  c.restore();
  return Math.min(max, (100 * w) / m);
}
function bigWord(c: Ctx, s: string, cx: number, base: number, size: number, o: { color?: string; stroke?: string; lw?: number; weight?: number; track?: number; alpha?: number } = {}) {
  c.save();
  c.font = font({ size, weight: o.weight ?? 900 });
  c.letterSpacing = `${(o.track ?? -0.02) * size}px`;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.globalAlpha = o.alpha ?? 1;
  const x = cx + ((o.track ?? -0.02) * size) / 2;
  if (o.color) { c.fillStyle = o.color; c.fillText(s, x, base); }
  if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lw ?? 3; c.lineJoin = 'round'; c.strokeText(s, x, base); }
  c.restore();
}
function header(c: Ctx, ink: string, left: string, right: string) {
  text(c, left, M, 84, { size: 21, weight: 600, color: ink, track: 0.2 });
  text(c, right, PW - M, 84, { size: 21, weight: 600, color: ink, track: 0.2, align: 'right' });
}
function footer(c: Ctx, bgCol: string, y = PH - 74, h = 40) { drawLockup(c, PW / 2, y, h, logoFor(bgCol)); }

/** The hoodie (back view) centred at (x, y) with its body ~ `hh` px tall, wearing design `d`. */
function hoodie(c: Ctx, x: number, y: number, hh: number, d: Design | null, o: Partial<HoodieOpts> = {}, bgCol?: string) {
  const s = hh / 820;
  const dark = bgCol ? isDark(bgCol) : false;
  drawHoodie(c, {
    x, y, s, color: dark ? '#232327' : C.black,
    panel: d ? { art: artStill(d), zip: 1 } : null,
    dockSeam: !d, shadow: dark ? 0 : 0.9, shadowY: 430,
    rim: dark && d ? rgba(accent(d), 0.55) : null, rimW: 3,
    ...o,
  });
}
/** A Stimpie as a loose card showing the whole artwork (its true aspect), white border, soft shadow. */
function card(c: Ctx, d: Design, cx: number, cy: number, h: number, rot = 0, o: { border?: number; shadow?: number; radius?: number } = {}) {
  const img = image(d.id);
  const w = h * (img.naturalWidth / img.naturalHeight);
  const b = o.border ?? Math.max(6, h * 0.028), r = o.radius ?? h * 0.035;
  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.shadowColor = `rgba(0,0,0,${0.28 * (o.shadow ?? 1)})`;
  c.shadowBlur = h * 0.09;
  c.shadowOffsetY = h * 0.035;
  c.fillStyle = C.white;
  c.beginPath(); c.roundRect(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, r + b); c.fill();
  c.shadowColor = 'transparent';
  c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, r); c.clip();
  paint(c, d, -w / 2, -h / 2, w, h, { focus: [0.5, 0.5] });
  c.restore();
  return w;
}
const D = (id: string) => byId(id);

// ---------------------------------------------------------------- 01 · ONE HOODIE (hero)
const hero: Poster = {
  id: '01_one-hoodie', title: 'One hoodie. Eleven identities.',
  draw(c) {
    bg(c, C.coral);
    grain(c, 3, 0.06);
    // the eleven, fanned out behind one hoodie like a hand of cards
    const px = PW / 2, py = 1160, R = 610;
    const order = ['neon', 'vhs', 'bubblegum', 'receipt', 'sabotage', 'chameleon', 'tiger', 'bside', 'unhinged', 'ducks', 'sameday'];
    order.forEach((id, i) => {
      const a = (-1 + (2 * i) / (order.length - 1)) * 0.92;
      card(c, D(id), px + Math.sin(a) * R, py - Math.cos(a) * R, 290, a * 0.9, { shadow: 0.8 });
    });
    text(c, 'ONE HOODIE.', PW / 2, 196, { size: 128, weight: 900, color: C.black, align: 'center', track: -0.03 });
    hoodie(c, PW / 2, 880, 560, D('sameday'), { shadow: 0.7, shadowY: 395 });
    text(c, 'ELEVEN IDENTITIES.', PW / 2, 1236, { size: 64, weight: 800, color: C.black, align: 'center', track: -0.01 });
    header(c, C.black, 'DROP 001', '11 STIMPIES');
    footer(c, C.coral, PH - 54, 30);
  },
};

// ---------------------------------------------------------------- 02–12 · the identity series
function identity(d: Design, n: number): Poster {
  return {
    id: `${String(n + 1).padStart(2, '0')}_stimpie-${d.id}`, title: `${d.name} — ${d.word}`,
    draw(c) {
      const dark = isDark(d.world);
      const acc = accent(d);
      bg(c, d.world);
      // a soft spotlight behind the hoodie, tinted by the art
      const g = c.createRadialGradient(PW / 2, 720, 40, PW / 2, 720, 620);
      g.addColorStop(0, rgba(dark ? acc : '#FFFFFF', dark ? 0.22 : 0.32));
      g.addColorStop(1, rgba(dark ? acc : '#FFFFFF', 0));
      c.fillStyle = g; c.fillRect(0, 0, PW, PH);
      grain(c, n + 11, dark ? 0.07 : 0.05);
      // the word: solid behind the hoodie, outline in front of it (the split S: one solid, one outline)
      const size = fitSize(c, d.word, PW - 2 * 44, 900, -0.02, 330);
      const base = 300 + size * 0.36;
      bigWord(c, d.word, PW / 2, base, size, { color: acc });
      hoodie(c, PW / 2, 750, 780, d, { shadowY: 395 }, d.world);
      bigWord(c, d.word, PW / 2, base, size, { stroke: acc, lw: 2.5 });
      header(c, d.ink, `STIMPIE Nº ${String(n).padStart(2, '0')} / 11`, d.name);
      text(c, d.line, PW / 2, 1226, { size: 38, weight: 500, italic: true, color: d.ink, align: 'center' });
      footer(c, d.world, PH - 66, 32);
    },
  };
}

// ---------------------------------------------------------------- 13 · WHICH ONE ARE YOU TODAY?
const which: Poster = {
  id: '13_which-one-are-you', title: 'Which one are you today?',
  draw(c) {
    bg(c, C.cream);
    grain(c, 21, 0.05);
    text(c, 'WHICH ONE', PW / 2, 196, { size: 104, weight: 900, color: C.black, align: 'center', track: -0.03 });
    text(c, 'ARE YOU TODAY?', PW / 2, 290, { size: 70, weight: 800, color: C.coral, align: 'center', track: -0.02 });
    const r = mulberry(7);
    const rows = [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]];
    const H = 238, gapX = 236, y0 = 470, gapY = 296;
    rows.forEach((row, ri) => {
      row.forEach((di, ci) => {
        const x = PW / 2 + (ci - (row.length - 1) / 2) * gapX;
        const y = y0 + ri * gapY;
        const rot = (r() - 0.5) * 0.12;
        const d = DESIGNS[di]!;
        card(c, d, x, y, H, rot, { shadow: 0.7 });
        // the number badge
        const bx = x - 66, by = y - H / 2 + 4;
        c.save();
        c.fillStyle = C.black;
        c.beginPath(); c.arc(bx, by, 27, 0, Math.PI * 2); c.fill();
        c.restore();
        text(c, String(di + 1).padStart(2, '0'), bx, by + 9, { size: 25, weight: 800, color: C.white, align: 'center' });
      });
    });
    text(c, 'Comment your number.', PW / 2, 1262, { size: 36, weight: 600, color: C.black, align: 'center' });
    header(c, C.black, 'DROP 001', 'POLL');
    // the arrow pointing down to the comments
    c.save();
    c.strokeStyle = C.coral; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(PW / 2 + 252, 1236); c.lineTo(PW / 2 + 252, 1268); c.moveTo(PW / 2 + 238, 1256); c.lineTo(PW / 2 + 252, 1270); c.lineTo(PW / 2 + 266, 1256); c.stroke();
    c.restore();
    drawLockup(c, PW / 2, 1316, 24, LOGO.onWhite);
  },
};

// ---------------------------------------------------------------- 14 · THE SPLIT
const split: Poster = {
  id: '14_the-split', title: 'The hoodie stays. You change.',
  draw(c) {
    const d = D('sabotage');
    const half = (left: boolean, f: () => void) => { c.save(); c.beginPath(); c.rect(left ? 0 : PW / 2, 0, PW / 2, PH); c.clip(); f(); c.restore(); };
    half(true, () => {
      bg(c, C.black); grain(c, 31, 0.06);
      text(c, 'THE HOODIE', M, 196, { size: 62, weight: 900, color: C.white, track: -0.02 });
      text(c, 'STAYS.', M, 262, { size: 62, weight: 900, color: C.white, track: -0.02 });
      hoodie(c, PW / 2, 730, 820, null, { color: '#26262a', rim: rgba('#FFFFFF', 0.35), rimW: 3, shadow: 0 });
      text(c, 'Same fit. Every day.', M, 1196, { size: 30, weight: 500, color: rgba('#FFFFFF', 0.75) });
    });
    half(false, () => {
      bg(c, d.world); grain(c, 32, 0.05);
      text(c, 'YOU', PW - M, 196, { size: 62, weight: 900, color: C.black, track: -0.02, align: 'right' });
      text(c, 'CHANGE.', PW - M, 262, { size: 62, weight: 900, color: C.black, track: -0.02, align: 'right' });
      hoodie(c, PW / 2, 730, 820, d, { shadow: 0.9, shadowY: 405 });
      text(c, 'New look. Seconds.', PW - M, 1196, { size: 30, weight: 500, color: rgba('#111111', 0.75), align: 'right' });
    });
    // the zipper down the split, pull parked at the middle
    const tr = new Track([[PW / 2, -10], [PW / 2, PH + 10]]);
    closedTeeth(c, tr, 0, tr.len, { pitch: 13, size: 11, color: '#d8d2c6', shade: '#8b857b', tape: '#1b1b1b', tapeW: 22 });
    drawPull(c, PW / 2, 676, Math.PI / 2, 38, { tab: C.coral, body: '#2b2b2b', mark: true, shadow: 1 });
    header(c, C.white, 'STIMPY', '');
    text(c, 'ONE HOODIE', PW - M, 84, { size: 21, weight: 600, color: C.black, track: 0.2, align: 'right' });
    drawLockup(c, M + 70, PH - 70, 30, LOGO.onBlack);
  },
};

// ---------------------------------------------------------------- 15 · NOT YET (the zipper tease)
const notYet: Poster = {
  id: '15_not-yet', title: 'Not yet.',
  draw(c) {
    const d = D('neon');
    // the artwork under the fabric
    paint(c, d, 0, 0, PW, PH, { focus: [0.5, 0.42], zoom: 1.08 });
    // the opening: a lens between y0..y1 along the centre line, widest just above the pull
    const y0 = 470, y1 = 900, cx = PW / 2, open = 140;
    const edge = (side: number) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, y = y0 + (y1 - y0) * t;
        const w = Math.sin(Math.PI * t) ** 0.85 * open * (0.55 + 0.45 * t);
        pts.push({ x: cx + side * w, y });
      }
      return pts;
    };
    const L = edge(-1), Rr = edge(1);
    const fabric = (side: number, pts: { x: number; y: number }[]) => {
      c.save();
      c.beginPath();
      const x0 = side < 0 ? -10 : PW + 10;
      c.moveTo(x0, -10); c.lineTo(cx, -10); c.lineTo(cx, y0);
      for (const p of pts) c.lineTo(p.x, p.y);
      c.lineTo(cx, PH + 10); c.lineTo(x0, PH + 10); c.closePath();
      c.fillStyle = C.coral; c.fill();
      c.clip();
      // the fabric curls away at the opening: a soft shade along its edge only
      c.save();
      c.shadowColor = 'transparent';
      c.filter = 'blur(16px)';
      c.strokeStyle = 'rgba(90,20,0,0.35)';
      c.lineWidth = 46;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
      c.restore();
      grain(c, side < 0 ? 41 : 42, 0.06);
      c.restore();
    };
    // a shadow cast into the opening
    c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 40;
    fabric(-1, L); fabric(1, Rr);
    c.restore();
    const st = { pitch: 14, size: 12, color: '#efe9de', shade: '#9b948a', tape: '#1b1b1b', tapeW: 24 };
    closedTeeth(c, new Track([[cx, -10], [cx, y0]]), 0, y0 + 10, st);
    closedTeeth(c, new Track([[cx, y1], [cx, PH + 10]]), 0, PH - y1 + 10, st);
    openTeeth(c, L, { ...st, tapeW: 14 }, 1);
    openTeeth(c, Rr, { ...st, tapeW: 14 }, -1);
    drawPull(c, cx, y1 + 6, Math.PI / 2, 40, { tab: C.black, body: '#2b2b2b', mark: true, shadow: 1 });
    text(c, 'NOT', 92, 300, { size: 150, weight: 900, color: C.black, track: -0.03 });
    text(c, 'YET.', PW - 92, 1170, { size: 150, weight: 900, color: C.black, track: -0.03, align: 'right' });
    header(c, C.black, 'DROP 001', 'STIMPIE Nº ??');
    text(c, 'Something is', 92, 1226, { size: 30, weight: 500, color: C.black });
    text(c, 'about to change.', 92, 1266, { size: 30, weight: 500, color: C.black });
    drawLockup(c, PW - 92 - 70, PH - 70, 26, LOGO.main);
  },
};

// ---------------------------------------------------------------- 16 · THE SWAP
const swap: Poster = {
  id: '16_the-swap', title: 'Zip off. Zip on.',
  draw(c) {
    bg(c, C.butter);
    grain(c, 51, 0.05);
    text(c, 'ZIP OFF.', M, 206, { size: 118, weight: 900, color: C.black, track: -0.03 });
    text(c, 'ZIP ON.', PW - M, 1196, { size: 118, weight: 900, color: C.coral, track: -0.03, align: 'right' });
    const hx = 470, hy = 690, hh = 680, s = hh / 820;
    const inLocal = (f: () => void) => { c.save(); c.translate(hx, hy); c.scale(s, s); c.translate(-500, -500); f(); c.restore(); };
    // the hoodie, its new Stimpie zipping on (the pull mid-way round)
    drawHoodie(c, { x: hx, y: hy, s, color: C.black, panel: { art: artStill('tiger'), zip: 0.62 }, shadow: 0.9, shadowY: 410 });
    // the old one, lifted off and floating away
    inLocal(() => {
      c.save();
      c.translate(DOCK.x, DOCK.y); c.translate(300, -250); c.rotate(0.2); c.translate(-DOCK.x, -DOCK.y);
      drawPanel(c, { art: artStill('bubblegum'), zip: 1, lift: 0.55, scale: 0.86 }, tones(C.black));
      c.restore();
    });
    // motion arc from the back to the floating panel
    c.save();
    c.strokeStyle = C.black; c.lineWidth = 4; c.setLineDash([2, 16]); c.lineCap = 'round';
    c.beginPath(); c.moveTo(600, 560); c.quadraticCurveTo(660, 400, 730, 360); c.stroke();
    c.restore();
    text(c, 'UNZIP  ·  SWAP  ·  ZIP', PW / 2, 1262, { size: 26, weight: 700, color: C.black, align: 'center', track: 0.24 });
    header(c, C.black, 'HOW IT WORKS', 'SECONDS, NOT SHOPPING');
    drawLockup(c, PW / 2, PH - 42, 24, LOGO.onWhite);
  },
};

// ---------------------------------------------------------------- 17 · SAME HOODIE ALL WEEK
const week: Poster = {
  id: '17_all-week', title: 'Same hoodie. All week.',
  draw(c) {
    bg(c, C.white);
    const days: [string, string][] = [['MON', 'receipt'], ['TUE', 'vhs'], ['WED', 'unhinged'], ['THU', 'bside'], ['FRI', 'sabotage'], ['SAT', 'ducks'], ['SUN', 'bubblegum']];
    text(c, 'SAME HOODIE.', PW / 2, 170, { size: 92, weight: 900, color: C.black, align: 'center', track: -0.03 });
    text(c, 'ALL WEEK.', PW / 2, 252, { size: 64, weight: 800, color: C.coral, align: 'center', track: -0.02 });
    // 4 + 3 tiles
    const gx = 14, top = 300, tw = (PW - 2 * M - 3 * gx) / 4, th = 400;
    days.forEach(([day, id], i) => {
      const row = i < 4 ? 0 : 1, col = row === 0 ? i : i - 4;
      const n = row === 0 ? 4 : 3;
      const x = PW / 2 + (col - (n - 1) / 2) * (tw + gx) - tw / 2;
      const y = top + row * (th + gx);
      const d = D(id);
      c.save();
      c.beginPath(); c.roundRect(x, y, tw, th, 22); c.clip();
      c.fillStyle = d.world; c.fillRect(x, y, tw, th);
      hoodie(c, x + tw / 2, y + th * 0.56, th * 0.66, d, { shadow: 0.7, shadowY: 420 }, d.world);
      text(c, day, x + 20, y + 44, { size: 26, weight: 800, color: d.ink, track: 0.1 });
      const ws = Math.min(30, fitSize(c, d.word, tw - 40, 800, 0.02));
      text(c, d.word, x + tw / 2, y + th - 24, { size: ws, weight: 800, color: accent(d), align: 'center', track: 0.02 });
      c.restore();
    });
    text(c, 'One hoodie. Seven moods. Zero repeats.', PW / 2, 1236, { size: 32, weight: 500, color: C.black, align: 'center' });
    drawLockup(c, PW / 2, PH - 56, 30, LOGO.onWhite);
  },
};

// ---------------------------------------------------------------- 18 · DROP 001
const drop: Poster = {
  id: '18_drop-001', title: 'Drop 001.',
  draw(c) {
    bg(c, C.black);
    const g = c.createRadialGradient(PW / 2, 720, 30, PW / 2, 720, 700);
    g.addColorStop(0, rgba(C.coral, 0.28)); g.addColorStop(1, rgba(C.coral, 0));
    c.fillStyle = g; c.fillRect(0, 0, PW, PH);
    grain(c, 61, 0.07);
    // the eleven orbit the hoodie on a tilted ring; back half first, front half after
    const cx = PW / 2, cy = 860, RX = 450, RY = 230;
    const items = DESIGNS.map((d, i) => { const a = (i / DESIGNS.length) * Math.PI * 2 + 0.25; return { d, a, z: Math.sin(a) }; });
    const drawItem = (it: typeof items[number]) => {
      const k = 0.62 + 0.38 * ((it.z + 1) / 2);
      c.save(); c.globalAlpha = 0.55 + 0.45 * ((it.z + 1) / 2);
      card(c, it.d, cx + Math.cos(it.a) * RX, cy + it.z * RY - 60, 180 * k, Math.cos(it.a) * 0.18, { shadow: 1.2 });
      c.restore();
    };
    items.filter((i) => i.z < 0).sort((a, b) => a.z - b.z).forEach(drawItem);
    hoodie(c, cx, 700, 640, D('neon'), { color: '#222226', rim: rgba(C.coral, 0.6), rimW: 3, shadow: 0 });
    items.filter((i) => i.z >= 0).sort((a, b) => a.z - b.z).forEach(drawItem);
    text(c, 'DROP', PW / 2, 210, { size: 140, weight: 900, color: C.white, align: 'center', track: -0.03 });
    c.save();
    c.font = font({ size: 140, weight: 900 }); c.letterSpacing = `${-0.03 * 140}px`; c.textAlign = 'center';
    c.strokeStyle = C.coral; c.lineWidth = 3.5; c.strokeText('001', PW / 2 - 2, 340);
    c.restore();
    text(c, '11 STIMPIES  ·  ONE HOODIE', PW / 2, 1206, { size: 30, weight: 700, color: C.white, align: 'center', track: 0.14 });
    text(c, 'Coming soon.', PW / 2, 1256, { size: 34, weight: 500, italic: true, color: C.coral, align: 'center' });
    header(c, rgba('#FFFFFF', 0.7), 'STIMPY', 'DROP 001');
    drawLockup(c, PW / 2, PH - 44, 26, LOGO.onBlack);
  },
};

export const POSTERS: Poster[] = [hero, ...DESIGNS.map((d, i) => identity(d, i + 1)), which, split, notYet, swap, week, drop];
// identity posts are numbered 02–12 in the file names
POSTERS.slice(1, 12).forEach((p, i) => { p.id = `${String(i + 2).padStart(2, '0')}_stimpie-${DESIGNS[i]!.id}`; });
