// The Stimpies: collectible back panels drawn like tarot cards.
// Each card is rendered once into its own canvas and reused.
import { rng, noise1, TAU, lerp } from './util';

export const BLACK = '#0a0a0a';
export const BONE = '#ece6da';
export const RED = '#ff2a1a';

export const CW = 800;
export const CH = 1250;
export const CARD_ASPECT = CW / CH;

type Pal = { bg: string; ink: string; acc: string };
type Ctx = CanvasRenderingContext2D;
type Art = (c: Ctx, p: Pal, r: () => number) => void;

const PAL = {
  night: { bg: BLACK, ink: BONE, acc: RED },
  paper: { bg: BONE, ink: BLACK, acc: RED },
  blood: { bg: RED, ink: BLACK, acc: BONE },
  ember: { bg: BLACK, ink: RED, acc: BONE },
};

// illustration area (inside the frame)
const AX = 70, AY = 140, AW = 660, AH = 870;

export type CardDef = { n: number; name: string; pal: Pal; art: Art; world?: string };

// ---------------------------------------------------------------- drawing helpers

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number) {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}
function circle(c: Ctx, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

/** A tiny ghost hoodie (back view), h = total height, standing on (x, y). */
export function miniHoodie(c: Ctx, x: number, y: number, h: number) {
  const s = h / 100;
  c.save();
  c.translate(x, y - h);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-14, 22);
  c.bezierCurveTo(-16, 4, -10, 0, 0, 0);
  c.bezierCurveTo(10, 0, 16, 4, 14, 22);
  c.lineTo(30, 27);
  c.lineTo(38, 78);
  c.lineTo(29, 80);
  c.lineTo(26, 50);
  c.lineTo(27, 97);
  c.lineTo(-27, 97);
  c.lineTo(-26, 50);
  c.lineTo(-29, 80);
  c.lineTo(-38, 78);
  c.lineTo(-30, 27);
  c.closePath();
  c.fill();
  c.restore();
}

function stars(c: Ctx, p: Pal, r: () => number, n: number, h = AH) {
  c.fillStyle = p.ink;
  for (let i = 0; i < n; i++) {
    const s = r() < 0.08 ? 2.4 : 1.1;
    c.globalAlpha = 0.35 + r() * 0.65;
    circle(c, r() * AW, r() * h, s);
    c.fill();
  }
  c.globalAlpha = 1;
}

function hatch(c: Ctx, y0: number, y1: number, gap0: number, gap1: number) {
  let y = y0;
  while (y < y1) {
    line(c, 0, y, AW, y);
    const u = (y - y0) / (y1 - y0);
    y += lerp(gap0, gap1, u);
  }
}

// ---------------------------------------------------------------- the illustrations

// ---------------------------------------------------------------- flagship: THE VOID (engraved)

function leaf(c: Ctx, x: number, y: number, len: number, ang: number, ink: string, bg: string) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = ink;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  c.fill();
  c.strokeStyle = bg;
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(len * 0.1, 0);
  c.lineTo(len * 0.85, 0);
  c.stroke();
  c.restore();
}

function flower(c: Ctx, x: number, y: number, rad: number, col: string, bg: string) {
  c.fillStyle = col;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    c.beginPath();
    c.ellipse(x + Math.cos(a) * rad * 0.9, y + Math.sin(a) * rad * 0.9, rad * 0.75, rad * 0.45, a, 0, TAU);
    c.fill();
  }
  c.fillStyle = bg;
  circle(c, x, y, rad * 0.35);
  c.fill();
}

/** A climbing vine along x0 from y1 (bottom) to y0 (top). */
function vine(c: Ctx, p: Pal, r: () => number, x0: number, y0: number, y1: number, side: number) {
  const X = (y: number) => x0 + Math.sin(y * 0.022) * 12 * side;
  c.strokeStyle = p.ink;
  c.lineWidth = 2.2;
  c.beginPath();
  for (let y = y1; y >= y0; y -= 4) y === y1 ? c.moveTo(X(y), y) : c.lineTo(X(y), y);
  c.stroke();
  let k = 0;
  for (let y = y1 - 20; y > y0 + 10; y -= 26) {
    const s = k % 2 ? 1 : -1;
    const len = 18 + r() * 12;
    leaf(c, X(y), y, len, -Math.PI / 2 + s * (0.9 + r() * 0.3), p.ink, p.bg);
    if (k % 6 === 3) flower(c, X(y) + s * 16 * side, y - 6, 7 + r() * 3, r() < 0.5 ? p.acc : p.ink, p.bg);
    k++;
  }
}

function lunarRow(c: Ctx, p: Pal, cy: number) {
  for (let i = 0; i < 7; i++) {
    const x = AW / 2 + (i - 3) * 62;
    const ph = (i - 3) / 3;
    c.save();
    circle(c, x, cy, 15);
    c.clip();
    c.fillStyle = i === 3 ? p.bg : p.ink;
    c.fillRect(x - 16, cy - 16, 32, 32);
    if (i !== 3) {
      c.fillStyle = p.bg;
      circle(c, x + ph * 26, cy, 15);
      c.fill();
    }
    c.restore();
    c.strokeStyle = p.ink;
    c.lineWidth = 1.2;
    circle(c, x, cy, 15);
    c.stroke();
  }
  c.lineWidth = 1;
  line(c, 40, cy, AW / 2 - 3 * 62 - 24, cy);
  line(c, AW / 2 + 3 * 62 + 24, cy, AW - 40, cy);
}

const VOID: Art = (c, p, r) => {
  const cx = AW / 2;
  // stipple sky, denser near the top
  c.fillStyle = p.ink;
  for (let i = 0; i < 1400; i++) {
    const y = Math.pow(r(), 1.8) * 520;
    c.globalAlpha = 0.2 + r() * 0.5;
    c.fillRect(r() * AW, y, 1.3, 1.3);
  }
  c.globalAlpha = 1;
  stars(c, p, r, 40, 480);
  lunarRow(c, p, 40);

  // rays from the doorway (under the eclipse)
  const dw = 58, dtop = 470, dbot = 690;
  c.strokeStyle = p.ink;
  c.lineWidth = 0.8;
  for (let i = 0; i < 44; i++) {
    const a = Math.PI * (0.08 + (i / 43) * 0.84);
    c.globalAlpha = 0.35;
    line(c, cx, dtop + 40, cx - Math.cos(a) * 420, dtop + 40 - Math.sin(a) * 260);
  }
  c.globalAlpha = 1;
  // corona: flowing strands
  const ecy = 265, R = 104;
  c.strokeStyle = p.ink;
  for (let s = 0; s < 460; s++) {
    let a = (s / 460) * TAU;
    let rr = R + 4;
    const long = s % 7 === 0 ? 1.8 : 1;
    c.lineWidth = s % 7 === 0 ? 1.4 : 0.8;
    c.globalAlpha = 0.5 + r() * 0.5;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * rr, ecy + Math.sin(a) * rr);
    const steps = Math.floor((10 + 14 * Math.abs(noise1(s * 0.13, 21))) * long);
    for (let k = 0; k < steps; k++) {
      a += noise1(s * 0.05 + k * 0.12, 4) * 0.022;
      rr += 4.2;
      c.lineTo(cx + Math.cos(a) * rr, ecy + Math.sin(a) * rr);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
  c.setLineDash([2, 6]);
  c.lineWidth = 1;
  for (const rr of [R + 118, R + 150]) {
    circle(c, cx, ecy, rr);
    c.stroke();
  }
  c.setLineDash([]);
  c.fillStyle = p.bg;
  circle(c, cx, ecy, R);
  c.fill();
  c.lineWidth = 2.5;
  c.stroke();
  // diamond ring
  const da = -0.8;
  c.save();
  c.shadowColor = p.acc;
  c.shadowBlur = 26;
  c.fillStyle = p.acc;
  circle(c, cx + Math.cos(da) * R, ecy + Math.sin(da) * R, 7);
  c.fill();
  c.strokeStyle = p.acc;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, ecy, R, da - 0.55, da + 0.55);
  c.stroke();
  c.restore();

  // the doorway of light
  // dark wall around the door, engraved
  c.fillStyle = p.bg;
  c.fillRect(cx - dw - 34, dtop - 20, (dw + 34) * 2, dbot - dtop + 20);
  c.strokeStyle = p.ink;
  c.lineWidth = 1;
  for (let y = dtop - 14; y < dbot; y += 6) line(c, cx - dw - 30, y, cx + dw + 30, y);
  c.beginPath();
  c.moveTo(cx - dw, dbot);
  c.lineTo(cx - dw, dtop + dw);
  c.arc(cx, dtop + dw, dw, Math.PI, 0);
  c.lineTo(cx + dw, dbot);
  c.closePath();
  c.fillStyle = p.ink;
  c.fill();
  c.lineWidth = 3;
  c.stroke();
  // the wanderer
  c.fillStyle = p.bg;
  miniHoodie(c, cx, dbot - 8, 96);
  // steps
  c.strokeStyle = p.ink;
  c.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const w = dw + 20 + i * 26;
    c.fillStyle = p.bg;
    c.fillRect(cx - w, dbot + i * 16, w * 2, 16);
    c.strokeRect(cx - w, dbot + i * 16, w * 2, 16);
  }

  // ground: stipple lit by the door, the wanderer's long shadow
  const gy = dbot + 48;
  c.lineWidth = 2;
  line(c, 0, gy, AW, gy);
  c.fillStyle = p.ink;
  for (let i = 0; i < 2600; i++) {
    const x = r() * AW, y = gy + 4 + r() * (AH - gy);
    const d = Math.abs(x - cx) / (120 + (y - gy) * 2.2);
    if (r() > Math.exp(-d * d)) continue;
    c.globalAlpha = 0.6;
    c.fillRect(x, y, 1.6, 1.6);
  }
  c.globalAlpha = 1;
  c.fillStyle = p.bg;
  c.beginPath();
  c.moveTo(cx - 10, gy);
  c.lineTo(cx + 10, gy);
  c.lineTo(cx + 44, AH);
  c.lineTo(cx - 44, AH);
  c.closePath();
  c.fill();

  vine(c, p, r, 22, 110, AH - 10, 1);
  vine(c, p, r, AW - 22, 110, AH - 10, -1);
};

const AFTER_DARK: Art = (c, p, r) => {
  const cx = AW / 2;
  // striped sun
  c.save();
  circle(c, cx, 340, 200);
  c.clip();
  c.fillStyle = p.acc;
  c.fillRect(0, 0, AW, AH);
  c.fillStyle = p.bg;
  for (let i = 0; i < 9; i++) {
    const y = 350 + i * 22 + i * i * 1.2;
    c.fillRect(0, y, AW, 3 + i * 2.2);
  }
  c.restore();
  // skyline
  let x = -10;
  let k = 0;
  while (x < AW) {
    const w = 50 + r() * 70;
    const h = 90 + r() * 260 + (k === 3 ? 140 : 0);
    const top = 700 - h;
    c.fillStyle = p.bg;
    c.fillRect(x, top, w, h);
    c.strokeStyle = p.ink;
    c.lineWidth = 1.5;
    c.strokeRect(x, top, w, h);
    for (let wy = top + 14; wy < 690; wy += 18) {
      for (let wx = x + 9; wx < x + w - 10; wx += 15) {
        if (r() < 0.35) {
          c.fillStyle = r() < 0.18 ? p.acc : p.ink;
          c.fillRect(wx, wy, 6, 8);
        }
      }
    }
    if (k === 3) {
      // vertical neon sign
      c.strokeStyle = p.acc;
      c.shadowColor = p.acc;
      c.shadowBlur = 18;
      c.lineWidth = 3;
      c.strokeRect(x + w - 34, top + 30, 26, 150);
      c.fillStyle = p.acc;
      c.font = '600 22px PlexB';
      c.textAlign = 'center';
      'OPEN'.split('').forEach((ch, i) => c.fillText(ch, x + w - 21, top + 65 + i * 32));
      c.shadowBlur = 0;
    }
    x += w - 2;
    k++;
  }
  // wet street reflections
  c.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const rx = r() * AW;
    const ry = 715 + r() * 150;
    c.strokeStyle = r() < 0.3 ? p.acc : p.ink;
    c.globalAlpha = 0.25 + r() * 0.5;
    line(c, rx, ry, rx, ry + 8 + r() * 26);
  }
  // rain
  c.globalAlpha = 0.55;
  c.strokeStyle = p.ink;
  c.lineWidth = 1;
  for (let i = 0; i < 170; i++) {
    const rx = r() * (AW + 100);
    const ry = r() * AH;
    line(c, rx, ry, rx - 12, ry + 34);
  }
  c.globalAlpha = 1;
  c.strokeStyle = p.ink;
  c.lineWidth = 2;
  line(c, 0, 702, AW, 702);
};

function cedarShape(c: Ctx, cx: number, top: number, bottom: number, width: number) {
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const y = lerp(top, bottom, u);
    const w = lerp(width * 0.32, width, Math.sqrt(u));
    const h = lerp(34, 52, u);
    c.beginPath();
    c.moveTo(cx - w, y + h * 0.45);
    c.quadraticCurveTo(cx - w * 0.55, y - h * 0.15, cx, y - h * 0.5);
    c.quadraticCurveTo(cx + w * 0.55, y - h * 0.15, cx + w, y + h * 0.45);
    c.quadraticCurveTo(cx, y + h * 0.18, cx - w, y + h * 0.45);
    c.fill();
  }
}

const CEDAR: Art = (c, p, r) => {
  const cx = AW / 2;
  c.fillStyle = p.acc;
  circle(c, cx, 330, 150);
  c.fill();
  // sun rays (engraved)
  c.strokeStyle = p.acc;
  c.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU;
    line(c, cx + Math.cos(a) * 165, 330 + Math.sin(a) * 165, cx + Math.cos(a) * (185 + (i % 2) * 25), 330 + Math.sin(a) * (185 + (i % 2) * 25));
  }
  c.fillStyle = p.ink;
  c.fillRect(cx - 13, 600, 26, 120);
  cedarShape(c, cx, 170, 620, 270);
  // engraving lines through the tree
  c.strokeStyle = p.bg;
  c.lineWidth = 1;
  for (let y = 150; y < 690; y += 7) line(c, cx - 290, y, cx + 290, y);
  // sea
  c.strokeStyle = p.ink;
  c.lineWidth = 1.6;
  for (let j = 0; j < 12; j++) {
    const y = 735 + j * 12;
    c.beginPath();
    for (let xx = 0; xx <= AW; xx += 6) {
      const yy = y + Math.sin(xx * 0.05 + j * 1.7) * (2 + j * 0.3);
      xx === 0 ? c.moveTo(xx, yy) : c.lineTo(xx, yy);
    }
    c.stroke();
  }
  // Raouche rock with its arch
  c.fillStyle = p.ink;
  c.beginPath();
  c.moveTo(470, 740);
  c.lineTo(485, 650);
  c.quadraticCurveTo(520, 610, 560, 640);
  c.lineTo(600, 740);
  c.lineTo(565, 740);
  c.quadraticCurveTo(540, 690, 515, 740);
  c.closePath();
  c.fill();
  // birds
  c.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const bx = 70 + r() * 180, by = 120 + r() * 160, s = 8 + r() * 8;
    c.beginPath();
    c.moveTo(bx - s, by - s * 0.4);
    c.quadraticCurveTo(bx - s * 0.4, by - s * 0.6, bx, by);
    c.quadraticCurveTo(bx + s * 0.4, by - s * 0.6, bx + s, by - s * 0.4);
    c.stroke();
  }
};

function cloud(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.arc(x, y, 30 * s, Math.PI, 0);
  c.arc(x + 40 * s, y - 10 * s, 38 * s, Math.PI, 0);
  c.arc(x + 85 * s, y, 28 * s, Math.PI, 0);
  c.closePath();
  c.fill();
  c.stroke();
}

const DREAMER: Art = (c, p, r) => {
  // inverted moon
  c.fillStyle = p.acc;
  circle(c, 140, 150, 70);
  c.fill();
  c.fillStyle = p.bg;
  circle(c, 165, 180, 62);
  c.fill();
  // floating stairs
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const x = 90 + i * 44;
    const y = 780 - i * 60;
    c.fillStyle = p.acc;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 70, y);
    c.lineTo(x + 100, y - 22);
    c.lineTo(x + 30, y - 22);
    c.closePath();
    c.fill();
    c.fillStyle = p.ink;
    c.fillRect(x, y, 70, 38);
    c.beginPath();
    c.moveTo(x + 70, y);
    c.lineTo(x + 100, y - 22);
    c.lineTo(x + 100, y + 16);
    c.lineTo(x + 70, y + 38);
    c.closePath();
    c.fill();
  }
  // the door at the top, light pouring out
  const dx = 470, dy = 110;
  c.fillStyle = p.acc;
  c.globalAlpha = 0.35;
  c.beginPath();
  c.moveTo(dx, dy);
  c.lineTo(dx + 90, dy);
  c.lineTo(dx + 200, dy + 360);
  c.lineTo(dx - 120, dy + 360);
  c.closePath();
  c.fill();
  c.globalAlpha = 1;
  c.fillRect(dx, dy, 90, 150);
  c.strokeStyle = p.ink;
  c.lineWidth = 4;
  c.strokeRect(dx, dy, 90, 150);
  c.fillStyle = p.ink;
  miniHoodie(c, dx + 45, dy + 150, 46);
  // clouds
  c.fillStyle = p.bg;
  c.strokeStyle = p.ink;
  c.lineWidth = 2.5;
  cloud(c, 40, 870, 1.3);
  cloud(c, 430, 860, 1.1);
  cloud(c, 380, 420, 0.7);
  stars(c, { ...p, ink: p.ink }, r, 40, 400);
};

const SIGNAL: Art = (c, p) => {
  const cx = AW / 2, cy = 640;
  c.strokeStyle = p.ink;
  for (let i = 1; i < 16; i++) {
    c.lineWidth = i % 3 === 0 ? 3 : 1.2;
    c.strokeStyle = i === 6 ? p.acc : p.ink;
    c.beginPath();
    c.arc(cx, cy, i * 36, Math.PI * 1.18, Math.PI * 1.82);
    c.stroke();
  }
  c.strokeStyle = p.ink;
  c.lineWidth = 5;
  line(c, cx, cy, cx - 90, 860);
  line(c, cx, cy, cx + 90, 860);
  line(c, cx - 60, 800, cx + 60, 800);
  c.fillStyle = p.acc;
  circle(c, cx, cy, 16);
  c.fill();
};

const STATIC: Art = (c, p, r) => {
  let y = 0;
  while (y < AH) {
    const h = 4 + r() * 38;
    const off = (r() - 0.5) * 140;
    c.fillStyle = r() < 0.12 ? p.acc : p.ink;
    c.globalAlpha = 0.25 + r() * 0.75;
    c.fillRect(Math.max(0, off), y, AW * (0.4 + r() * 0.6), h);
    y += h + 3 + r() * 16;
  }
  c.globalAlpha = 1;
  c.fillStyle = p.bg;
  c.fillRect(AW / 2 - 150, AH / 2 - 60, 300, 120);
  c.strokeStyle = p.ink;
  c.lineWidth = 4;
  c.strokeRect(AW / 2 - 150, AH / 2 - 60, 300, 120);
  c.fillStyle = p.ink;
  c.font = '900 64px ArchivoX';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('NO SIG', AW / 2, AH / 2 + 4);
};

const MOTH: Art = (c, p) => {
  const cx = AW / 2, cy = 440;
  c.strokeStyle = p.ink;
  c.fillStyle = p.bg;
  for (const s of [-1, 1]) {
    c.save();
    c.translate(cx, cy);
    c.scale(s, 1);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -20);
    c.bezierCurveTo(120, -260, 330, -200, 300, -40);
    c.bezierCurveTo(290, 20, 120, 40, 0, 20);
    c.stroke();
    c.beginPath();
    c.moveTo(0, 20);
    c.bezierCurveTo(160, 60, 240, 200, 150, 290);
    c.bezierCurveTo(90, 330, 30, 200, 0, 60);
    c.stroke();
    c.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const a = -1.1 + i * 0.09;
      line(c, 0, 0, Math.cos(a) * 280, Math.sin(a) * 200);
    }
    c.fillStyle = p.acc;
    circle(c, 170, -100, 34);
    c.fill();
    c.fillStyle = p.bg;
    circle(c, 170, -100, 14);
    c.fill();
    c.restore();
  }
  c.fillStyle = p.ink;
  c.beginPath();
  c.ellipse(cx, cy + 40, 16, 120, 0, 0, TAU);
  c.fill();
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx - 6, cy - 70);
  c.quadraticCurveTo(cx - 40, cy - 150, cx - 80, cy - 160);
  c.moveTo(cx + 6, cy - 70);
  c.quadraticCurveTo(cx + 40, cy - 150, cx + 80, cy - 160);
  c.stroke();
  c.lineWidth = 1;
  line(c, 40, 800, AW - 40, 800);
};

const MAZE: Art = (c, p, r) => {
  const cx = AW / 2, cy = AH / 2 - 20;
  c.strokeStyle = p.ink;
  c.lineWidth = 9;
  c.lineCap = 'round';
  for (let i = 1; i <= 9; i++) {
    const rr = i * 33;
    const gap = r() * TAU;
    c.beginPath();
    c.arc(cx, cy, rr, gap + 0.35, gap + TAU - 0.35);
    c.stroke();
    const w = r() * TAU;
    line(c, cx + Math.cos(w) * rr, cy + Math.sin(w) * rr, cx + Math.cos(w) * (rr + 33), cy + Math.sin(w) * (rr + 33));
  }
  c.lineCap = 'butt';
  c.fillStyle = p.acc;
  circle(c, cx, cy, 14);
  c.fill();
};

const ORBIT: Art = (c, p, r) => {
  stars(c, p, r, 90);
  const cx = AW / 2, cy = AH / 2 - 30;
  c.strokeStyle = p.ink;
  for (let i = 0; i < 6; i++) {
    c.lineWidth = 1.3;
    c.beginPath();
    c.ellipse(cx, cy, 90 + i * 45, 40 + i * 20, -0.45, 0, TAU);
    c.stroke();
    const a = r() * TAU;
    c.fillStyle = i === 3 ? p.acc : p.ink;
    const px = cx + Math.cos(a) * (90 + i * 45) * Math.cos(-0.45) - Math.sin(a) * (40 + i * 20) * Math.sin(-0.45);
    const py = cy + Math.cos(a) * (90 + i * 45) * Math.sin(-0.45) + Math.sin(a) * (40 + i * 20) * Math.cos(-0.45);
    circle(c, px, py, 6 + i * 2);
    c.fill();
  }
  c.fillStyle = p.acc;
  circle(c, cx, cy, 52);
  c.fill();
};

const WAVE: Art = (c, p) => {
  c.strokeStyle = p.ink;
  for (let j = 0; j < 44; j++) {
    const y = 220 + j * 14;
    c.lineWidth = j % 6 === 0 ? 3 : 1.2;
    c.beginPath();
    for (let x = 0; x <= AW; x += 4) {
      const crest = Math.exp(-Math.pow((x - 420) / 150, 2)) * (160 - j * 3);
      const yy = y - Math.max(0, crest) + Math.sin(x * 0.03 + j * 0.5) * 6;
      x === 0 ? c.moveTo(x, yy) : c.lineTo(x, yy);
    }
    c.stroke();
  }
  c.fillStyle = p.acc;
  circle(c, 150, 140, 60);
  c.fill();
};

const EYE: Art = (c, p) => {
  const cx = AW / 2, cy = AH / 2 - 40;
  c.strokeStyle = p.ink;
  c.lineWidth = 1.4;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    line(c, cx + Math.cos(a) * 240, cy + Math.sin(a) * 240, cx + Math.cos(a) * (300 + (i % 3) * 20), cy + Math.sin(a) * (300 + (i % 3) * 20));
  }
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(cx - 230, cy);
  c.quadraticCurveTo(cx, cy - 190, cx + 230, cy);
  c.quadraticCurveTo(cx, cy + 190, cx - 230, cy);
  c.stroke();
  c.fillStyle = p.acc;
  circle(c, cx, cy, 82);
  c.fill();
  c.fillStyle = p.bg;
  circle(c, cx, cy, 36);
  c.fill();
  c.fillStyle = p.ink;
  circle(c, cx + 18, cy - 20, 10);
  c.fill();
};

const FLAME: Art = (c, p) => {
  const cx = AW / 2;
  const cols = [p.ink, p.acc, p.ink, p.acc];
  for (let i = 0; i < 4; i++) {
    const s = 1 - i * 0.22;
    c.fillStyle = cols[i];
    c.beginPath();
    c.moveTo(cx, 120 + i * 120);
    c.bezierCurveTo(cx + 240 * s, 380, cx + 250 * s, 620, cx, 760);
    c.bezierCurveTo(cx - 250 * s, 620, cx - 180 * s, 400, cx - 40 * s, 300 + i * 60);
    c.bezierCurveTo(cx - 30 * s, 380, cx + 10, 300, cx, 120 + i * 120);
    c.fill();
  }
  c.strokeStyle = p.ink;
  c.lineWidth = 3;
  line(c, 150, 790, AW - 150, 790);
};

const SERPENT: Art = (c, p) => {
  c.strokeStyle = p.ink;
  c.lineCap = 'round';
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    pts.push([AW / 2 + Math.sin(u * 3.2 * Math.PI) * 200 * (1 - u * 0.4), 120 + u * 680]);
  }
  for (let i = 1; i < pts.length; i++) {
    const w = 46 * Math.sin(Math.PI * Math.min(1, i / pts.length + 0.1)) + 6;
    c.lineWidth = w;
    line(c, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  c.fillStyle = p.bg;
  for (let i = 4; i < pts.length - 4; i += 4) {
    circle(c, pts[i][0], pts[i][1], 4);
    c.fill();
  }
  c.lineCap = 'butt';
  c.strokeStyle = p.acc;
  c.lineWidth = 4;
  const [hx, hy] = pts[0];
  line(c, hx, hy - 10, hx, hy - 50);
  line(c, hx, hy - 50, hx - 12, hy - 66);
  line(c, hx, hy - 50, hx + 12, hy - 66);
};

const MOUNTAIN: Art = (c, p) => {
  c.fillStyle = p.acc;
  circle(c, AW * 0.62, 300, 110);
  c.fill();
  for (let j = 0; j < 6; j++) {
    const base = 420 + j * 80;
    c.fillStyle = p.bg;
    c.strokeStyle = p.ink;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, AH);
    for (let x = 0; x <= AW; x += 8) {
      const y = base - 140 * Math.abs(noise1(x * 0.006 + j * 3.1, j)) - 60 * Math.abs(noise1(x * 0.02, j + 9));
      c.lineTo(x, y);
    }
    c.lineTo(AW, AH);
    c.closePath();
    c.fill();
    c.stroke();
  }
};

const ROSE: Art = (c, p) => {
  const cx = AW / 2, cy = AH / 2 - 40;
  for (let k = 0; k < 3; k++) {
    c.strokeStyle = k === 1 ? p.acc : p.ink;
    c.lineWidth = k === 1 ? 3 : 1.5;
    c.beginPath();
    const n = 5 + k * 2, d = 3 - k * 0.5;
    for (let i = 0; i <= 2000; i++) {
      const th = (i / 2000) * TAU * 6;
      const rr = (260 - k * 60) * Math.cos((n / d) * th);
      const x = cx + rr * Math.cos(th), y = cy + rr * Math.sin(th);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
};

const SKULL: Art = (c, p, r) => {
  const cx = AW / 2, cy = 420;
  c.fillStyle = p.ink;
  c.beginPath();
  c.ellipse(cx, cy, 190, 200, 0, Math.PI * 0.95, Math.PI * 2.05);
  c.lineTo(cx + 150, cy + 110);
  c.lineTo(cx + 110, cy + 150);
  c.lineTo(cx + 105, cy + 230);
  c.lineTo(cx - 105, cy + 230);
  c.lineTo(cx - 110, cy + 150);
  c.lineTo(cx - 150, cy + 110);
  c.closePath();
  c.fill();
  c.fillStyle = p.bg;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + s * 72, cy + 40, 52, 58, s * 0.2, 0, TAU);
    c.fill();
  }
  c.fillStyle = p.acc;
  for (const s of [-1, 1]) {
    circle(c, cx + s * 72, cy + 48, 12);
    c.fill();
  }
  c.fillStyle = p.bg;
  c.beginPath();
  c.moveTo(cx, cy + 90);
  c.lineTo(cx - 22, cy + 140);
  c.lineTo(cx + 22, cy + 140);
  c.closePath();
  c.fill();
  for (let i = -3; i <= 3; i++) c.fillRect(cx + i * 26 - 9, cy + 175, 18, 40);
  // flowers
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.05 + r() * 0.9);
    const rr = 290 + r() * 60;
    const fx = cx + Math.cos(a) * rr * (r() < 0.5 ? -1 : 1) * 0.9;
    const fy = cy + 250 + Math.sin(a) * 120 - 140 + r() * 260;
    c.fillStyle = r() < 0.3 ? p.acc : p.ink;
    for (let k = 0; k < 5; k++) {
      const pa = (k / 5) * TAU;
      circle(c, fx + Math.cos(pa) * 7, fy + Math.sin(pa) * 7, 5);
      c.fill();
    }
  }
};

const LOGO: Art = (c, p) => {
  c.fillStyle = p.ink;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = '900 230px ArchivoX';
  c.fillText('STIM', AW / 2, 420);
  c.fillText('PY', AW / 2, 640);
  c.fillStyle = p.acc;
  miniHoodie(c, AW / 2, 820, 120);
  c.font = '600 26px PlexB';
  c.fillText('ONE HOODIE — YOUR WORLD', AW / 2, 860);
};

// ---------------------------------------------------------------- the deck

export const CARDS: CardDef[] = [
  { n: 0, name: 'STIMPY', pal: PAL.ember, art: LOGO },
  { n: 1, name: 'THE VOID', pal: PAL.night, art: VOID, world: 'void' },
  { n: 2, name: 'AFTER DARK', pal: PAL.night, art: AFTER_DARK, world: 'afterdark' },
  { n: 3, name: 'THE CEDAR', pal: PAL.paper, art: CEDAR, world: 'cedar' },
  { n: 4, name: 'THE DREAMER', pal: PAL.blood, art: DREAMER, world: 'dreamer' },
  { n: 5, name: 'THE SIGNAL', pal: PAL.night, art: SIGNAL },
  { n: 6, name: 'THE STATIC', pal: PAL.paper, art: STATIC },
  { n: 7, name: 'THE MOTH', pal: PAL.night, art: MOTH },
  { n: 8, name: 'THE MAZE', pal: PAL.blood, art: MAZE },
  { n: 9, name: 'THE ORBIT', pal: PAL.night, art: ORBIT },
  { n: 10, name: 'THE WAVE', pal: PAL.paper, art: WAVE },
  { n: 11, name: 'THE EYE', pal: PAL.ember, art: EYE },
  { n: 12, name: 'THE FLAME', pal: PAL.night, art: FLAME },
  { n: 13, name: 'THE SERPENT', pal: PAL.paper, art: SERPENT },
  { n: 14, name: 'THE MOUNTAIN', pal: PAL.night, art: MOUNTAIN },
  { n: 15, name: 'THE ROSE', pal: PAL.blood, art: ROSE },
  { n: 16, name: 'THE SKULL', pal: PAL.night, art: SKULL },
];

export const edition = (n: number) => String(7 + ((n * 37) % 93)).padStart(3, '0') + '/100';
export const num = (n: number) => String(n).padStart(3, '0');

const cache = new Map<number, HTMLCanvasElement>();

export function cardCanvas(n: number, scale = 1): HTMLCanvasElement {
  const key = n + scale * 1000;
  let cv = cache.get(key);
  if (cv) return cv;
  const def = CARDS[n];
  cv = document.createElement('canvas');
  cv.width = CW * scale;
  cv.height = CH * scale;
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  const p = def.pal;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, CW, CH);

  c.save();
  c.beginPath();
  c.rect(AX, AY, AW, AH);
  c.clip();
  c.translate(AX, AY);
  def.art(c, p, rng(1000 + n * 17));
  c.restore();

  // frame
  c.strokeStyle = p.ink;
  c.lineWidth = 5;
  c.strokeRect(30, 30, CW - 60, CH - 60);
  c.lineWidth = 1.5;
  c.strokeRect(46, 46, CW - 92, CH - 92);
  c.strokeRect(AX, AY, AW, AH);
  for (const [x, y] of [[46, 46], [CW - 46, 46], [46, CH - 46], [CW - 46, CH - 46]]) {
    c.fillStyle = p.ink;
    c.beginPath();
    c.moveTo(x, y - 12);
    c.lineTo(x + 12, y);
    c.lineTo(x, y + 12);
    c.lineTo(x - 12, y);
    c.closePath();
    c.fill();
  }
  // top: the Stimpy triangle + number
  c.fillStyle = p.acc;
  c.beginPath();
  c.moveTo(CW / 2 - 16, 82);
  c.lineTo(CW / 2 + 16, 82);
  c.lineTo(CW / 2, 108);
  c.closePath();
  c.fill();
  c.strokeStyle = p.ink;
  c.lineWidth = 1.5;
  line(c, 90, 95, CW / 2 - 40, 95);
  line(c, CW / 2 + 40, 95, CW - 90, 95);
  c.fillStyle = p.ink;
  c.font = '600 24px PlexB';
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText('N° ' + num(n), 90, 76);
  c.textAlign = 'right';
  c.fillText(n === 0 ? 'DROP 001' : edition(n), CW - 90, 76);

  // nameplate
  c.fillStyle = p.bg;
  c.fillRect(140, 1045, CW - 280, 110);
  c.strokeStyle = p.ink;
  c.lineWidth = 3;
  c.strokeRect(140, 1045, CW - 280, 110);
  c.lineWidth = 1;
  c.strokeRect(150, 1055, CW - 300, 90);
  c.fillStyle = p.ink;
  c.textAlign = 'center';
  c.font = `600 ${def.name.length > 10 ? 50 : 58}px Corm`;
  (c as any).letterSpacing = '6px';
  c.fillText(def.name, CW / 2 + 3, 1103);
  (c as any).letterSpacing = '0px';
  for (const sd of [-1, 1]) {
    const x = CW / 2 + sd * 290;
    for (let k = 0; k < 4; k++) leaf(c, x, 1100, 22 - k * 3, (sd > 0 ? 0 : Math.PI) + (k - 1.5) * 0.5, p.ink, p.bg);
    flower(c, x, 1100, 6, p.acc, p.bg);
  }
  c.font = '400 18px Plex';
  c.fillText('STIMPIE · STIMPY', CW / 2, 1190);

  // subtle print texture
  const r = rng(n + 99);
  c.globalAlpha = 0.06;
  c.fillStyle = p.bg === BONE ? BLACK : BONE;
  for (let i = 0; i < 2500; i++) c.fillRect(r() * CW, r() * CH, 1.5, 1.5);
  c.globalAlpha = 1;

  if (scale === 1) cache.set(key, cv);
  return cv;
}
