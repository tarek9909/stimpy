// Helpers shared by the scenes: backdrops, the walk cycle, panel choreography, labels.
import type { Stage } from '../engine/stage';
import type { PanelState } from '../engine/hoodie';
import type { Ctx } from '../engine/draw2d';
import { text } from '../engine/draw2d';
import { W, H } from '../engine/gl';
import { clamp, ease, pulse, wobble } from '../engine/util';
import music from '../music.json';

export const BEAT = music.beat;
export const EV = music.events;
export const INK = '#0E0E10', BONE = '#EDE8DE', BLUE = '#2B3DFF', BLUE_GLOW = '#3346FF';

/** Seconds → beats since the start of the song. */
export const beatOf = (t: number) => t / BEAT;

/** Soft studio backdrop: a radial pool of light on a dark wall with a floor shadow under the hoodie. */
export function studio(c: Ctx, o: { top?: string; bottom?: string; cx?: number; cy?: number; r?: number; floorY?: number; shadow?: number } = {}) {
  const { top = '#48484E', bottom = '#121214', cx = W / 2, cy = H * 0.42, r = 1050, floorY = H * 0.93, shadow = 0.55 } = o;
  const g = c.createRadialGradient(cx, cy, 40, cx, cy + 80, r);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  if (shadow > 0) floorShadow(c, cx, floorY, 420, shadow);
}

export function floorShadow(c: Ctx, x: number, y: number, w: number, a: number) {
  c.save();
  c.translate(x, y);
  c.scale(1, 0.09);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, w, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Places the hoodie: screen-centre offset (logical px, y down), scale, plus a walk cycle and a beat punch. */
export function placeHoodie(S: Stage, o: { x?: number; y?: number; s?: number; walk?: number; t?: number; punch?: number; rz?: number; ry?: number; rx?: number; z?: number }) {
  const { x = 0, y = 0, s = 1, walk = 0, t = S.t, punch = 0, rz = 0, ry = 0, rx = 0, z = 0 } = o;
  const b = beatOf(t);
  const step = Math.abs(Math.sin(Math.PI * b));
  const g = S.hoodie.group;
  g.position.set(x, -y - walk * (1 - step) * 14 + walk * 4, z);
  g.rotation.set(rx, ry + walk * Math.sin(Math.PI * b) * 0.035, rz + walk * Math.sin(Math.PI * b) * 0.018);
  g.scale.set(s * (1 + punch), s * (1 + punch) * (1 - walk * (1 - step) * 0.008), 1);
}

/** The Stimpie lands `age` seconds ago (negative: still in flight) and zips itself shut in `zipDur` seconds. */
export function landed(p: PanelState, age: number, amp = 14, zipDur = 0.28) {
  p.ripAge = age;
  p.ripAmp = age >= 0 ? amp : 0;
  p.scale = age >= 0 ? 1 + 0.035 * wobble(age, 6, 9) : 1;
  p.flash = age >= 0 ? 0.35 * pulse(age, 18) : 0;
  const z = clamp(age / zipDur);
  p.zip = ease.inOutCubic(z);
  p.zipGlow = age < 0 ? 0 : z < 1 ? 1 : pulse(age - zipDur, 6);
}

/** Peel `p` off along a diagonal: 0 → attached, 1 → curled over and lifting away. */
export function peelOff(p: PanelState, u: number, dir = (3 * Math.PI) / 4) {
  const k = ease.inOutCubic(u);
  p.peel = k * 0.82;
  p.peelAngle = dir;
  const away = ease.inCubic(clamp((u - 0.45) / 0.55));
  p.z = away * 260;
  p.x = Math.cos(dir) * away * 420;
  p.y = Math.sin(dir) * away * 420;
  p.rz = away * 0.5 * Math.sign(Math.cos(dir) || 1) * -1;
  p.opacity = 1 - clamp((u - 0.8) / 0.2);
}

/** Small monospace annotation. */
export function mono(c: Ctx, s: string, x: number, y: number, o: { color?: string; size?: number; align?: CanvasTextAlign; alpha?: number; weight?: number } = {}) {
  text(c, s, x, y, { size: o.size ?? 15, family: 'Plex', weight: o.weight ?? 500, color: o.color ?? BONE, align: o.align, track: 0.12, alpha: o.alpha });
}

/** Big display word. */
export function display(c: Ctx, s: string, x: number, y: number, o: { size: number; color?: string; align?: CanvasTextAlign; family?: 'ArchivoX' | 'Archivo' | 'ArchivoC' | 'Corm'; italic?: boolean; weight?: number; track?: number; alpha?: number }) {
  text(c, s, x, y, { size: o.size, family: o.family ?? 'ArchivoX', weight: o.weight ?? 900, color: o.color ?? BONE, align: o.align ?? 'center', italic: o.italic, track: o.track ?? -0.03, alpha: o.alpha, baseline: 'alphabetic' });
}

/** Clip-reveal a line of text from below (u: 0..1). */
export function riseText(c: Ctx, u: number, x: number, y: number, h: number, draw: (dy: number) => void) {
  if (u <= 0) return;
  c.save();
  c.beginPath();
  c.rect(0, y - h, W, h * 1.25);
  c.clip();
  draw((1 - ease.outExpo(u)) * h * 1.1);
  c.restore();
}

/** Thin leader line with a dot at the anchor. */
export function leader(c: Ctx, x0: number, y0: number, x1: number, y1: number, u: number, color = BONE) {
  if (u <= 0) return;
  const k = ease.outCubic(u);
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(x0, y0, 4, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
  c.stroke();
  c.restore();
}

/** Perspective floor grid scrolling toward the horizon: the "walk". */
export function walkFloor(c: Ctx, t: number, color: string, alpha = 0.35, horizon = H * 0.62, speed = 1.2) {
  c.save();
  c.strokeStyle = color;
  c.globalAlpha = alpha;
  c.lineWidth = 1.2;
  const vx = W / 2;
  for (let i = -14; i <= 14; i++) {
    c.beginPath();
    c.moveTo(vx + i * 12, horizon);
    c.lineTo(vx + i * 260, H + 40);
    c.stroke();
  }
  const ph = (t * speed) % 1;
  for (let k = 0; k < 14; k++) {
    const z = (k + 1 - ph);
    const y = horizon + (H - horizon) * (1.6 / z) * 0.6;
    if (y > H + 10 || y < horizon) continue;
    c.globalAlpha = alpha * Math.min(1, (y - horizon) / 60);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.restore();
}
