// The worlds behind the hoodie. Each draws the full 1080x1920 frame.
import { BLACK, BONE, RED } from './cards';
import { hash, hash2, noise1, lerp, clamp, TAU, easeInExpo } from './util';

export const W = 1080;
export const H = 1920;
type Ctx = CanvasRenderingContext2D;

const HY = 880; // horizon in the dark world

// ---------------------------------------------------------------- DARK: the empty world with a door of light

export function worldDark(c: Ctx, t: number, door: number, travel: number, flicker: number) {
  c.fillStyle = '#040405';
  c.fillRect(0, 0, W, H);

  // the door ahead: grows as we approach
  const d = easeInExpo(clamp(door));
  const dw = lerp(44, 1900, d);
  const dh = dw * 2.2;
  const bottom = HY + d * d * 1400;
  const lightA = clamp(0.35 + 0.65 * door + flicker * 0.5);

  // spill on the floor
  c.save();
  c.globalCompositeOperation = 'lighter';
  const sg = c.createLinearGradient(0, bottom, 0, H);
  sg.addColorStop(0, `rgba(236,230,218,${0.22 * lightA})`);
  sg.addColorStop(1, 'rgba(236,230,218,0)');
  c.fillStyle = sg;
  c.beginPath();
  c.moveTo(540 - dw / 2, bottom);
  c.lineTo(540 + dw / 2, bottom);
  c.lineTo(540 + dw * 3.2 + 300, H);
  c.lineTo(540 - dw * 3.2 - 300, H);
  c.closePath();
  c.fill();
  // halo
  const r = 120 + dw * 1.4;
  const hg = c.createRadialGradient(540, bottom - dh / 2, 0, 540, bottom - dh / 2, r);
  hg.addColorStop(0, `rgba(236,230,218,${0.35 * lightA})`);
  hg.addColorStop(1, 'rgba(236,230,218,0)');
  c.fillStyle = hg;
  c.fillRect(0, 0, W, H);
  c.restore();

  // floor grid
  c.save();
  c.strokeStyle = BONE;
  for (let i = -14; i <= 14; i++) {
    c.globalAlpha = 0.06;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(540 + i * 4, HY);
    c.lineTo(540 + i * 260, H);
    c.stroke();
  }
  const fr = travel - Math.floor(travel);
  for (let k = 0; k < 40; k++) {
    const z = k + 1 - fr;
    if (z < 0.3) continue;
    const y = HY + 700 / z;
    if (y > H) continue;
    c.globalAlpha = clamp(0.16 / Math.sqrt(z)) * (0.5 + 0.5 * lightA);
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.restore();

  // the door itself
  c.save();
  c.shadowColor = BONE;
  c.shadowBlur = 60;
  c.fillStyle = BONE;
  c.globalAlpha = lightA;
  c.fillRect(540 - dw / 2, bottom - dh, dw, dh);
  c.restore();

  // dust in the light
  c.save();
  c.fillStyle = BONE;
  for (let i = 0; i < 160; i++) {
    const x = (hash(i) * W + noise1(t * 0.2 + i, 5) * 60 + t * 6) % W;
    const y = (hash(i + 500) * H - t * (8 + hash(i + 9) * 18) + H * 4) % H;
    const near = Math.exp(-Math.abs(x - 540) / (200 + dw));
    c.globalAlpha = (0.08 + 0.5 * near * lightA) * (0.4 + hash(i + 3) * 0.6);
    c.beginPath();
    c.arc(x, y, 0.8 + hash(i + 77) * 1.8, 0, TAU);
    c.fill();
  }
  c.restore();

  // fog
  c.save();
  for (let i = 0; i < 5; i++) {
    const fx = ((hash(i + 40) * W + t * (12 + i * 5)) % (W + 800)) - 400;
    const fy = HY - 100 + i * 170;
    const g = c.createRadialGradient(fx, fy, 0, fx, fy, 500);
    g.addColorStop(0, 'rgba(120,120,125,0.06)');
    g.addColorStop(1, 'rgba(120,120,125,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  c.restore();
}

// ---------------------------------------------------------------- 001 THE VOID: bone void, black eclipse

export function worldVoid(c: Ctx, t: number, lt: number) {
  c.fillStyle = BONE;
  c.fillRect(0, 0, W, H);
  const cx = 540, cy = 560, R = 300 + lt * 6;
  c.save();
  c.strokeStyle = BLACK;
  c.lineWidth = 1.3;
  c.setLineDash([3, 9]);
  for (const rr of [R + 90, R + 150, R + 230, R + 330]) {
    c.beginPath();
    c.arc(cx, cy, rr, 0, TAU);
    c.stroke();
  }
  c.setLineDash([]);
  const spin = t * 0.05;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * TAU + spin;
    const len = 20 + 170 * Math.abs(noise1(i * 0.17 + t * 0.4, 3)) + (i % 6 === 0 ? 60 : 0);
    c.lineWidth = i % 6 === 0 ? 2 : 1;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * (R + 6), cy + Math.sin(a) * (R + 6));
    c.lineTo(cx + Math.cos(a) * (R + 6 + len), cy + Math.sin(a) * (R + 6 + len));
    c.stroke();
  }
  c.fillStyle = BLACK;
  c.beginPath();
  c.arc(cx, cy, R, 0, TAU);
  c.fill();
  // the diamond ring, in acid red
  const a = -0.75 + t * 0.05;
  c.shadowColor = RED;
  c.shadowBlur = 60;
  c.fillStyle = RED;
  c.beginPath();
  c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 16, 0, TAU);
  c.fill();
  c.strokeStyle = RED;
  c.lineWidth = 5;
  c.beginPath();
  c.arc(cx, cy, R, a - 0.45, a + 0.45);
  c.stroke();
  c.shadowBlur = 0;
  // horizon + engraved ground
  c.strokeStyle = BLACK;
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(0, 1500);
  c.lineTo(W, 1500);
  c.stroke();
  c.lineWidth = 1.4;
  let y = 1515, gap = 30;
  const scroll = (lt * 40) % 30;
  while (y < H) {
    c.beginPath();
    c.moveTo(0, y + scroll * (gap / 30));
    c.lineTo(W, y + scroll * (gap / 30));
    c.stroke();
    gap = Math.max(8, gap * 0.88);
    y += gap;
  }
  // black ash rising
  c.fillStyle = BLACK;
  for (let i = 0; i < 90; i++) {
    const x = hash(i) * W + noise1(t * 0.3 + i, 2) * 40;
    const yy = (hash(i + 300) * 1600 - t * (20 + hash(i + 7) * 50) + 1600 * 10) % 1600;
    c.globalAlpha = 0.25 + hash(i + 1) * 0.6;
    c.fillRect(x, yy, 2 + hash(i + 2) * 3, 2 + hash(i + 2) * 3);
  }
  c.restore();
}

// ---------------------------------------------------------------- 002 AFTER DARK: neon rain city

function skylineLayer(c: Ctx, seed: number, base: number, scale: number, drift: number, t: number, col: string, winA: number) {
  let x = -((drift % 1400) + 1400) % 1400 - 200;
  let k = 0;
  while (x < W + 200) {
    const id = Math.floor(k);
    const w = (80 + hash2(id, seed) * 150) * scale;
    const h = (200 + hash2(id, seed + 1) * 600) * scale;
    const top = base - h;
    c.fillStyle = col;
    c.fillRect(x, top, w + 1, h + 400);
    if (winA > 0) {
      for (let wy = top + 20 * scale; wy < base - 10; wy += 26 * scale) {
        for (let wx = x + 12 * scale; wx < x + w - 14 * scale; wx += 22 * scale) {
          const hh = hash2(Math.floor(wx * 7 + wy * 13), seed + id);
          if (hh < 0.28) {
            const on = noise1(t * 0.5 + hh * 90, id) > -0.6;
            c.fillStyle = hh < 0.05 ? RED : BONE;
            c.globalAlpha = winA * (on ? 0.8 : 0.1);
            c.fillRect(wx, wy, 9 * scale, 12 * scale);
          }
        }
      }
      c.globalAlpha = 1;
    }
    if (hash2(id, seed + 5) < 0.22 && scale > 0.8) {
      // neon sign
      const fl = noise1(t * 6 + id, 4) > -0.7 ? 1 : 0.2;
      c.save();
      c.strokeStyle = RED;
      c.shadowColor = RED;
      c.shadowBlur = 40;
      c.globalAlpha = fl;
      c.lineWidth = 5;
      c.strokeRect(x + w * 0.3, top + 60, 40 * scale, 220 * scale);
      c.restore();
    }
    x += w;
    k++;
  }
}

export function worldAfterDark(c: Ctx, t: number, lt: number) {
  const g = c.createLinearGradient(0, 0, 0, 1450);
  g.addColorStop(0, '#040406');
  g.addColorStop(1, '#1a0706');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // striped red sun
  c.save();
  c.beginPath();
  c.arc(540, 760, 400, 0, TAU);
  c.clip();
  const sgr = c.createLinearGradient(0, 360, 0, 1160);
  sgr.addColorStop(0, RED);
  sgr.addColorStop(1, '#6e0c06');
  c.fillStyle = sgr;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#060607';
  for (let i = 0; i < 10; i++) {
    const y = 760 + i * 34 + i * i * 2 - ((lt * 30) % 34);
    c.fillRect(0, y, W, 4 + i * 3);
  }
  c.restore();
  skylineLayer(c, 11, 1300, 0.7, lt * 18, t, '#0c0a0b', 0.35);
  skylineLayer(c, 23, 1460, 1.0, lt * 45, t, '#060606', 0.8);
  // wet street
  c.fillStyle = '#050505';
  c.fillRect(0, 1460, W, H - 1460);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = ((hash(i) * W - lt * 45 * 1.0) % W + W) % W;
    const red = hash(i + 4) < 0.35;
    c.fillStyle = red ? 'rgba(255,42,26,0.35)' : 'rgba(236,230,218,0.18)';
    const len = 40 + hash(i + 8) * 260;
    c.fillRect(x, 1470 + hash(i + 2) * 80, 3 + hash(i + 3) * 5, len);
  }
  const rg = c.createLinearGradient(0, 1460, 0, H);
  rg.addColorStop(0, 'rgba(255,42,26,0.25)');
  rg.addColorStop(1, 'rgba(255,42,26,0)');
  c.fillStyle = rg;
  c.fillRect(0, 1460, W, H - 1460);
  c.restore();
  // rain
  c.save();
  c.strokeStyle = BONE;
  c.lineWidth = 1.5;
  for (let i = 0; i < 380; i++) {
    const sp = 1800 + hash(i + 11) * 1400;
    const x = hash(i) * (W + 300) - 150;
    const y = ((hash(i + 900) * (H + 200) + t * sp) % (H + 200)) - 100;
    c.globalAlpha = 0.12 + hash(i + 5) * 0.35;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 14, y + 50 + hash(i + 3) * 40);
    c.stroke();
  }
  c.restore();
}

// ---------------------------------------------------------------- 003 THE CEDAR: faded Beirut memory

function cedarSil(c: Ctx, cx: number, top: number, bottom: number, width: number, t: number) {
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const y = lerp(top, bottom, u);
    const w = lerp(width * 0.3, width, Math.sqrt(u));
    const h = lerp(46, 70, u);
    const sway = Math.sin(t * 0.8 + i) * 6 * u;
    c.beginPath();
    c.moveTo(cx - w + sway, y + h * 0.45);
    c.quadraticCurveTo(cx - w * 0.55, y - h * 0.15, cx, y - h * 0.5);
    c.quadraticCurveTo(cx + w * 0.55, y - h * 0.15, cx + w + sway, y + h * 0.45);
    c.quadraticCurveTo(cx, y + h * 0.2, cx - w + sway, y + h * 0.45);
    c.fill();
  }
  c.fillRect(cx - 22, bottom, 44, 140);
}

export function worldCedar(c: Ctx, t: number, lt: number) {
  const g = c.createLinearGradient(0, 0, 0, 1180);
  g.addColorStop(0, '#efe4cf');
  g.addColorStop(1, '#e2b98d');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const hz = 1180;
  // sun sinking into the sea
  c.save();
  c.beginPath();
  c.rect(0, 0, W, hz);
  c.clip();
  c.fillStyle = 'rgba(255,42,26,0.9)';
  c.beginPath();
  c.arc(840, 330 + lt * 6, 130, 0, TAU);
  c.fill();
  c.restore();
  // birds
  c.strokeStyle = '#2a1a12';
  c.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const bx = ((hash(i) * W + lt * (60 + hash(i + 1) * 40)) % (W + 200)) - 100;
    const by = 260 + hash(i + 2) * 400 + Math.sin(t * 2 + i) * 10;
    const s = 12 + hash(i + 3) * 10;
    const f = Math.sin(t * 9 + i * 2) * 0.5;
    c.beginPath();
    c.moveTo(bx - s, by - s * f);
    c.quadraticCurveTo(bx - s * 0.4, by - s * 0.5, bx, by);
    c.quadraticCurveTo(bx + s * 0.4, by - s * 0.5, bx + s, by - s * f);
    c.stroke();
  }
  // sea
  const sg = c.createLinearGradient(0, hz, 0, H);
  sg.addColorStop(0, '#a4735a');
  sg.addColorStop(1, '#4a2e22');
  c.fillStyle = sg;
  c.fillRect(0, hz, W, H - hz);
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 40; j++) {
    const y = hz + 6 + j * j * 0.55;
    const w = 40 + (40 - j) * 5;
    c.fillStyle = `rgba(255,120,80,${0.3 * (1 - j / 40)})`;
    const off = Math.sin(t * 2 + j) * 20;
    c.fillRect(840 - w / 2 + off, y, w, 2 + j * 0.12);
  }
  c.restore();
  c.strokeStyle = 'rgba(40,24,16,0.5)';
  c.lineWidth = 2;
  for (let j = 0; j < 26; j++) {
    const y = hz + 20 + j * j * 1.1;
    c.beginPath();
    for (let x = 0; x <= W; x += 10) {
      const yy = y + Math.sin(x * 0.02 + t * 1.5 + j) * (2 + j * 0.3);
      x ? c.lineTo(x, yy) : c.moveTo(x, yy);
    }
    c.stroke();
  }
  // Raouche: the pigeon rocks
  c.fillStyle = '#23150f';
  c.beginPath();
  c.moveTo(700, hz + 10);
  c.lineTo(730, 930);
  c.quadraticCurveTo(800, 840, 890, 900);
  c.lineTo(930, 980);
  c.lineTo(960, hz + 10);
  c.lineTo(900, hz + 10);
  c.quadraticCurveTo(850, 1030, 790, hz + 10);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(960, hz + 10);
  c.lineTo(990, 1060);
  c.quadraticCurveTo(1040, 1020, 1090, 1070);
  c.lineTo(1090, hz + 10);
  c.closePath();
  c.fill();
  // the cedar, big, on the left
  c.fillStyle = '#1c110c';
  cedarSil(c, 70, 820, 1200, 330, t);
  // light leaks
  c.save();
  c.globalCompositeOperation = 'lighter';
  const lk = 0.5 + 0.5 * noise1(t * 1.3, 8);
  const lg = c.createRadialGradient(W, 200, 0, W, 200, 800);
  lg.addColorStop(0, `rgba(255,90,40,${0.35 * lk})`);
  lg.addColorStop(1, 'rgba(255,90,40,0)');
  c.fillStyle = lg;
  c.fillRect(0, 0, W, H);
  c.restore();
}

// ---------------------------------------------------------------- 004 THE DREAMER: red sky, floating stairs

function stair(c: Ctx, x: number, y: number, s: number) {
  c.fillStyle = BONE;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + 140 * s, y);
  c.lineTo(x + 200 * s, y - 44 * s);
  c.lineTo(x + 60 * s, y - 44 * s);
  c.closePath();
  c.fill();
  c.fillStyle = BLACK;
  c.fillRect(x, y, 140 * s, 70 * s);
  c.beginPath();
  c.moveTo(x + 140 * s, y);
  c.lineTo(x + 200 * s, y - 44 * s);
  c.lineTo(x + 200 * s, y + 26 * s);
  c.lineTo(x + 140 * s, y + 70 * s);
  c.closePath();
  c.fill();
}

function cloudShape(c: Ctx, x: number, y: number, s: number) {
  c.beginPath();
  c.arc(x, y, 60 * s, Math.PI, 0);
  c.arc(x + 80 * s, y - 20 * s, 76 * s, Math.PI, 0);
  c.arc(x + 170 * s, y, 56 * s, Math.PI, 0);
  c.closePath();
  c.fill();
  c.stroke();
}

export function worldDreamer(c: Ctx, t: number, lt: number) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ff3a22');
  g.addColorStop(1, '#a8150b');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // upside-down crescent
  c.fillStyle = BONE;
  c.beginPath();
  c.arc(250, 330, 120, 0, TAU);
  c.fill();
  c.fillStyle = '#fa3520';
  c.beginPath();
  c.arc(290, 290, 110, 0, TAU);
  c.fill();
  // spiral of floating stairs, drifting up
  for (let i = 0; i < 16; i++) {
    const a = i * 0.55 + lt * 0.35;
    const x = 540 + Math.cos(a) * 470 - 90;
    const y = 1750 - i * 105 - lt * 40 + Math.sin(a) * 60;
    const s = 0.7 + 0.35 * Math.sin(a);
    if (Math.sin(a) < 0) stair(c, x, y, s); // behind: drawn here; front ones drawn after the hoodie
  }
  // the door in the sky
  const dx = 760, dy = 170 + Math.sin(t) * 10;
  c.save();
  c.globalAlpha = 0.3;
  c.fillStyle = BONE;
  c.beginPath();
  c.moveTo(dx, dy);
  c.lineTo(dx + 110, dy);
  c.lineTo(dx + 330, dy + 700);
  c.lineTo(dx - 220, dy + 700);
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = BONE;
  c.fillRect(dx, dy, 110, 190);
  c.strokeStyle = BLACK;
  c.lineWidth = 6;
  c.strokeRect(dx, dy, 110, 190);
  // clouds
  c.fillStyle = BONE;
  c.strokeStyle = BLACK;
  c.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    const x = ((hash(i + 60) * 1400 + lt * (25 + i * 8)) % 1500) - 300;
    const y = 700 + i * 260 + Math.sin(t * 0.7 + i) * 15;
    cloudShape(c, x, y, 0.8 + hash(i + 61) * 0.6);
  }
  // falling-upward sparks
  c.fillStyle = BONE;
  for (let i = 0; i < 70; i++) {
    const x = hash(i + 200) * W;
    const y = ((hash(i + 201) * H - t * (60 + hash(i) * 80)) % H + H) % H;
    c.globalAlpha = 0.3 + hash(i + 3) * 0.6;
    c.fillRect(x, y, 3, 3);
  }
  c.globalAlpha = 1;
}

export function worldDreamerFront(c: Ctx, t: number, lt: number) {
  for (let i = 0; i < 16; i++) {
    const a = i * 0.55 + lt * 0.35;
    const x = 540 + Math.cos(a) * 470 - 90;
    const y = 1750 - i * 105 - lt * 40 + Math.sin(a) * 60;
    const s = 0.7 + 0.35 * Math.sin(a);
    if (Math.sin(a) >= 0) stair(c, x, y, s);
  }
}

// ---------------------------------------------------------------- the studio (breakdown) and the end

export function worldStudio(c: Ctx, t: number, light: number) {
  c.fillStyle = '#050505';
  c.fillRect(0, 0, W, H);
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(0, 0, 0, 1600);
  g.addColorStop(0, `rgba(236,230,218,${0.16 * light})`);
  g.addColorStop(1, `rgba(236,230,218,${0.02 * light})`);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(440, -50);
  c.lineTo(640, -50);
  c.lineTo(1000, 1560);
  c.lineTo(80, 1560);
  c.closePath();
  c.fill();
  const fg = c.createRadialGradient(540, 1560, 10, 540, 1560, 520);
  fg.addColorStop(0, `rgba(236,230,218,${0.2 * light})`);
  fg.addColorStop(1, 'rgba(236,230,218,0)');
  c.fillStyle = fg;
  c.save();
  c.translate(540, 1560);
  c.scale(1, 0.18);
  c.translate(-540, -1560);
  c.fillRect(0, 1000, W, 1200);
  c.restore();
  c.restore();
}

export function worldEnd(c: Ctx, t: number, glow: number) {
  c.fillStyle = '#050505';
  c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(540, 860, 0, 540, 860, 900);
  g.addColorStop(0, `rgba(255,42,26,${0.32 * glow})`);
  g.addColorStop(1, 'rgba(255,42,26,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
