// 8–16 s — HOW IT WORKS. Blueprint. The camera swings to three-quarters and the hoodie comes apart into
// its three layers — shell, zip track, Stimpie — each labelled. The track zips home; the Stimpie
// lifts off and leaves (it will come back in the snap).
import type { Stage } from '../engine/stage';
import { W, H, DIST, SAFE } from '../engine/gl';
import { seg, ease, clamp, pulse } from '../engine/util';
import { DOCK } from '../engine/hoodie';
import { EV, BONE, placeHoodie, mono, display, leader, riseText } from './common';

function blueprint(c: CanvasRenderingContext2D, t: number) {
  c.fillStyle = '#2233E0';
  c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W * 0.4, H * 0.5, 100, W * 0.5, H * 0.5, 1200);
  g.addColorStop(0, 'rgba(90,110,255,0.55)'); g.addColorStop(1, 'rgba(10,20,120,0.6)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(237,232,222,0.1)';
  c.lineWidth = 1;
  const off = (t * 6) % 40;
  for (let x = -off; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = -off; y < H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = 'rgba(237,232,222,0.22)';
  for (let x = -off; x < W; x += 200) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = -off; y < H; y += 200) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
}

export function explode(S: Stage, t: number) {
  blueprint(S.bgc(), t);
  placeHoodie(S, { x: 0, y: -10, s: 0.86 });

  // camera: swing to three-quarters, then back to front for the take-off
  const swing = ease.inOutCubic(seg(t, EV.tilt, EV.tilt + 1.2)) * (1 - ease.inOutCubic(seg(t, 14.2, 15.6)));
  S.cam({ tx: -60 * swing, ty: 10, yaw: -0.6 * swing, pitch: 0.22 * swing, dist: DIST * (1 - 0.12 * swing) });
  S.light.uL.value.set(-0.5, 0.6, 0.65).normalize();
  S.light.uAmb.value.setRGB(0.24, 0.26, 0.4);
  S.light.uRim.value.setRGB(0.15, 0.2, 0.6);

  // layer separation (outBack) and collapse of the dock at 14.0
  const sep = ease.outBack(seg(t, EV.separate, EV.separate + 0.8), 1.4);
  const dockBack = ease.inCubic(seg(t, 13.5, EV.collapse));
  const fz = 230 * sep * (1 - dockBack);
  const h = S.hoodie;
  h.frame.visible = t < EV.collapse + 0.02;
  h.frame.position.z = 1.5 + fz;
  h.fmat.uniforms.uGlow!.value = 0.25 + 0.9 * pulse(t - EV.collapse, 5) * (t >= EV.collapse ? 1 : 0) + 0.3 * seg(t, 10.9, 11.3);
  h.fmat.uniforms.uChase!.value = (t * 0.6) % 1;
  h.mat.uniforms.uDockGlow!.value = t >= EV.collapse ? 0.9 * pulse(t - EV.collapse, 3) + 0.25 * seg(t, 15.2, 16) : 0;
  h.mat.uniforms.uChase!.value = ease.inOutCubic(seg(t, EV.collapse, EV.collapse + 0.8));
  if (t >= EV.collapse) { h.mat.uniforms.uRipAge!.value = t - EV.collapse; h.mat.uniforms.uRipAmp!.value = 0.6; }

  // the Stimpie: highest layer, then flies off at 15
  const p = h.panels[0]!.state;
  p.art = S.art[1]!;
  const away = ease.inCubic(seg(t, EV.away - 0.25, EV.away + 0.6));
  p.z = 460 * sep + away * 900;
  p.y = away * 900;
  p.x = away * 300;
  p.rz = -away * 0.6;
  p.ry = -away * 1.2;
  p.shadow = 1 - away;
  p.opacity = t < EV.away + 0.6 ? 1 : 0;
  p.zip = 0; // apart: the two halves of the zipper are open

  // labels, anchored to the projected layers
  const f = S.fgc();
  mono(f, 'FIG. 01', SAFE.left, SAFE.top + 20, { size: 20, weight: 700, alpha: seg(t, 8.2, 8.5) });
  riseText(f, seg(t, 8.3, 8.9), SAFE.left, SAFE.top + 120, 90, (dy) => display(f, 'HOW IT WORKS', SAFE.left - 6, SAFE.top + 120 + dy, { size: 86, align: 'left' }));
  const fade = 1 - seg(t, 13.3, 13.6);
  const bx = DOCK.w / 2, by = DOCK.h / 2;
  const labels: [string, string, number, number, number][] = [
    // title, detail, layer z, anchor y (dock-local), label row
    ['03 — STIMPIE', '100% COTTON PRINT PANEL · 41 × 50 CM', 460 * sep + 2.5, -by + 30, 0],
    ['02 — ZIP DOCK', 'ZIPS ON AND OFF — HIDDEN IN THE SEAM', fz, -by + 20, 1],
    ['01 — SHELL', '400 GSM HEAVYWEIGHT FLEECE', 0, -by - 60, 2],
  ];
  labels.forEach(([title, detail, z, ay, row], i) => {
    const k = seg(t, EV.labels[i]!, EV.labels[i]! + 0.5) * fade;
    if (k <= 0) return;
    const [ax, ay2] = S.projectDock(bx - 20, ay, z);
    const lx = SAFE.left, ly = 1270 + row * 96;
    leader(f, ax, ay2, W - 150, ly - 30, k);
    f.save(); f.globalAlpha = k;
    f.fillStyle = BONE; f.fillRect(lx, ly - 30, (W - 150 - lx) * ease.outCubic(k), 1.5);
    display(f, title, lx, ly + 8, { size: 34, align: 'left', track: -0.02 });
    mono(f, detail, lx, ly + 38, { size: 17 });
    f.restore();
  });
  // dimension lines on the Stimpie
  const dk = seg(t, 12.4, 12.9) * fade;
  if (dk > 0) {
    const z = 460 * sep + 2.5;
    const a = S.projectDock(-bx, by + 26, z), b = S.projectDock(bx, by + 26, z);
    const c2 = S.projectDock(-bx - 26, by, z), d2 = S.projectDock(-bx - 26, -by, z);
    f.save();
    f.strokeStyle = BONE; f.globalAlpha = dk; f.lineWidth = 1.2;
    for (const [p0, p1] of [[a, b], [c2, d2]] as const) {
      f.beginPath(); f.moveTo(p0[0], p0[1]); f.lineTo(p0[0] + (p1[0] - p0[0]) * ease.outCubic(dk), p0[1] + (p1[1] - p0[1]) * ease.outCubic(dk)); f.stroke();
    }
    f.restore();
    mono(f, '41 CM', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 10, { size: 14, align: 'center', alpha: dk });
    mono(f, '50 CM', (c2[0] + d2[0]) / 2 - 12, (c2[1] + d2[1]) / 2, { size: 14, align: 'right', alpha: dk });
  }
  // the track goes home
  const ck = seg(t, EV.collapse, EV.collapse + 0.1) * (1 - seg(t, 14.9, 15.2));
  if (ck > 0) {
    display(f, 'ZIPPED.', W / 2, 1400, { size: 90, alpha: ck });
  }
  S.post.flash = 0.25 * pulse(t - EV.collapse, 14) * (t >= EV.collapse ? 1 : 0);
  S.post.flashColor.setRGB(0.6, 0.7, 1);
  S.post.vignette = 0.45;
  S.post.fade = 1 - clamp((t - 8) / 0.12);
}
