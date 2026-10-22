// 48–54 s — YOURS. Stimpy Studio: a drawing is dragged in, printed onto cotton, and flies onto the
// hoodie. Then the world becomes the drawing.
import type { Stage } from '../engine/stage';
import { W, H, SAFE } from '../engine/gl';
import { seg, ease, lerp, clamp, pulse } from '../engine/util';
import { drawDoodle } from '../art/designs';
import { WORLDS } from '../art/worlds';
import { EV, INK, BLUE, placeHoodie, landed, mono, display } from './common';
import { rrect } from '../engine/draw2d';

const WIN = { x: 90, y: 300, w: 900, h: 720 };
const PREV = { cx: 540, cy: 645, s: 1.2 };
const HX = 0, HY = 560, HS = 0.62;

function cursor(c: CanvasRenderingContext2D, x: number, y: number, down: boolean) {
  c.save();
  c.translate(x, y);
  c.scale(1.4, 1.4);
  c.fillStyle = INK; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22); c.lineTo(6, 17); c.lineTo(10, 26); c.lineTo(14, 24); c.lineTo(10, 16); c.lineTo(17, 16); c.closePath();
  c.fill(); c.stroke();
  if (down) { c.strokeStyle = BLUE; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.stroke(); }
  c.restore();
}

export function yours(S: Stage, t: number) {
  const snapAge = t - EV.snap2;
  if (snapAge >= 0) return worldPart(S, t, snapAge);

  const c = S.bgc();
  c.fillStyle = '#EDE8DE'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(14,14,16,0.07)';
  for (let x = 0; x < W; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  placeHoodie(S, { x: HX, y: HY, s: HS });
  S.light.uAmb.value.setRGB(0.3, 0.3, 0.32);
  S.hoodie.mat.uniforms.uDockGlow!.value = 0.2 + 0.5 * seg(t, 50, 51.75);
  S.hoodie.mat.uniforms.uChase!.value = (t * 0.7) % 1;

  // the studio window
  const f = S.fgc();
  const win = ease.outExpo(seg(t, 48, 48.6)) * (1 - seg(t, 51.6, 51.85));
  f.save();
  f.globalAlpha = win;
  f.translate(0, (1 - win) * 60);
  f.shadowColor = 'rgba(0,0,0,0.18)'; f.shadowBlur = 40; f.shadowOffsetY = 16;
  f.fillStyle = '#FBFAF6';
  rrect(f, WIN.x, WIN.y, WIN.w, WIN.h, 18); f.fill();
  f.shadowColor = 'transparent';
  f.fillStyle = INK;
  rrect(f, WIN.x, WIN.y, WIN.w, 58, 18); f.fill();
  f.fillRect(WIN.x, WIN.y + 30, WIN.w, 28);
  mono(f, 'STIMPY STUDIO', WIN.x + 28, WIN.y + 37, { size: 15, weight: 700 });
  mono(f, 'MAKE YOUR OWN STIMPIE', WIN.x + WIN.w - 28, WIN.y + 37, { size: 13, align: 'right', color: '#8C97FF' });
  f.globalAlpha = win;

  // preview area: drop zone → printed panel
  const pw = 300 * PREV.s, ph = 364 * PREV.s;
  const px = PREV.cx - pw / 2, py = PREV.cy - ph / 2;
  const dropped = t >= EV.drop;
  const hover = seg(t, 49.1, 49.4) * (dropped ? 0 : 1);
  if (!dropped) {
    f.strokeStyle = BLUE; f.lineWidth = 2 + hover * 2; f.setLineDash([10, 8]);
    f.fillStyle = `rgba(43,61,255,${0.04 + hover * 0.08})`;
    rrect(f, px, py, pw, ph, 22); f.fill(); f.stroke();
    f.setLineDash([]);
    display(f, 'DROP YOUR ART', PREV.cx, PREV.cy + 10, { size: 30, color: BLUE });
    mono(f, 'PNG · JPG · SVG — ANYTHING YOU LOVE', PREV.cx, PREV.cy + 46, { size: 12, align: 'center', color: INK, alpha: 0.6 });
  } else if (t < 51.75) {
    const pop = ease.outBack(seg(t, EV.drop, EV.drop + 0.35), 2);
    f.save();
    f.translate(PREV.cx, PREV.cy);
    f.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
    f.translate(-pw / 2, -ph / 2);
    f.save();
    rrect(f, 0, 0, pw, ph, 22); f.clip();
    f.fillStyle = '#F6F1E6'; f.fillRect(0, 0, pw, ph);
    f.scale(PREV.s, PREV.s);
    f.strokeStyle = 'rgba(43,61,255,0.18)'; f.lineWidth = 0.7;
    for (let y = 30; y < 364; y += 16) { f.beginPath(); f.moveTo(0, y); f.lineTo(300, y); f.stroke(); }
    const pr = seg(t, EV.print[0]!, EV.print[1]!);
    // before printing: the dropped image as a flat thumbnail; while printing, the ink goes down stroke by stroke
    if (t < EV.print[0]!) { f.globalAlpha = 0.35; drawDoodle(f, 1); f.globalAlpha = win; }
    else drawDoodle(f, pr);
    f.restore();
    // print head
    if (t >= EV.print[0]!) {
      const hy = ph * pr;
      f.fillStyle = BLUE; f.fillRect(-10, hy - 2, pw + 20, 4);
      f.fillStyle = 'rgba(43,61,255,0.12)'; f.fillRect(0, hy, pw, 30 * (1 - pr));
    }
    f.restore();
  }
  // progress
  const pr = seg(t, EV.print[0]!, EV.print[1]!);
  const by = WIN.y + WIN.h - 50;
  f.fillStyle = 'rgba(14,14,16,0.1)'; f.fillRect(WIN.x + 40, by, WIN.w - 80, 8);
  f.fillStyle = BLUE; f.fillRect(WIN.x + 40, by, (WIN.w - 80) * pr, 8);
  mono(f, t < EV.print[0]! ? (dropped ? 'READY TO PRINT' : 'WAITING FOR ART…') : pr < 1 ? `PRINTING ON COTTON — ${String(Math.floor(pr * 100)).padStart(3, '0')}%` : 'DONE — ZIPPING ON', WIN.x + 40, by - 18, { size: 16, color: INK, weight: 700 });
  f.restore();

  // the drag: a file card and the cursor
  if (t >= EV.grab - 0.3 && !dropped) {
    const u = ease.inOutCubic(seg(t, EV.grab, EV.drop - 0.1));
    const x = lerp(900, PREV.cx + 30, u), y = lerp(1500, PREV.cy + 20, u) - Math.sin(u * Math.PI) * 120;
    const held = t >= EV.grab;
    if (held) {
      f.save();
      f.translate(x - 60, y - 70);
      f.rotate(-0.08 + u * 0.08);
      f.shadowColor = 'rgba(0,0,0,0.25)'; f.shadowBlur = 20; f.shadowOffsetY = 10;
      f.fillStyle = '#fff'; rrect(f, 0, 0, 120, 150, 8); f.fill();
      f.shadowColor = 'transparent';
      f.drawImage(S.mineCanvas, 8, 8, 104, 104 * 364 / 300 * 0.95);
      mono(f, 'my-cat.png', 60, 142, { size: 11, color: INK, align: 'center' });
      f.restore();
    }
    cursor(f, x, y, held && u < 0.05);
  } else if (dropped && t < 50.2) {
    cursor(f, PREV.cx + 30 + (t - EV.drop) * 200, PREV.cy + 20 + (t - EV.drop) * 150, false);
  }
  // title
  display(f, 'MAKE ONE', W / 2, 1110, { size: 64, color: INK, alpha: seg(t, 48.3, 48.6) });
  display(f, "THAT'S YOURS.", W / 2, 1180, { size: 64, color: BLUE, alpha: seg(t, 48.5, 48.8) });

  // the flight from the preview to the dock
  if (t >= 51.75) {
    const u = ease.inExpo(seg(t, 51.75, EV.snap2));
    const p = S.hoodie.panels[0]!.state;
    p.art = S.artMine;
    const lx = (PREV.cx - (W / 2 + HX)) / HS, ly = -(PREV.cy - (H / 2 + HY + 55 * HS)) / HS;
    p.x = lerp(lx, 0, u); p.y = lerp(ly, 0, u); p.z = lerp(220, 0, u);
    p.scale = lerp(PREV.s / HS, 1, u);
    p.rz = Math.sin(u * Math.PI) * 0.1;
    p.zip = 0;
  }
  S.post.vignette = 0.2;
  S.post.grain = 0.04;
  S.post.flash = clamp(1 - (t - 48) / 0.35) * 0.9;
  S.post.flashColor.set('#F6F1E6');
}

function worldPart(S: Stage, t: number, age: number) {
  WORLDS.mine!(S.bgc(), t, age, 'yours.');
  placeHoodie(S, { x: 0, y: 270, s: 0.98, walk: 1, punch: 0.06 * pulse(age, 9) });
  const p = S.hoodie.panels[0]!.state;
  p.art = S.artMine;
  landed(p, age, 18, 0.45);
  S.hoodie.mat.uniforms.uDockGlow!.value = 1.2 * pulse(age, 4);
  S.light.uKey.value.setRGB(1.1, 1.07, 1.0);
  S.light.uAmb.value.setRGB(0.36, 0.34, 0.33);
  S.light.uRim.value.setRGB(0.3, 0.1, 0.08);
  const f = S.fgc();
  mono(f, 'MADE BY YOU', SAFE.left, SAFE.top + 20, { color: INK, size: 20, weight: 700 });
  mono(f, 'ZIPPED ON.', SAFE.right, SAFE.top + 20, { color: BLUE, size: 20, weight: 700, align: 'right', alpha: seg(age, 0.45, 0.6) });
  S.post.flash = 0.5 * pulse(age, 10);
  S.post.flashColor.set('#FFFFFF');
  S.post.vignette = 0.25;
}
