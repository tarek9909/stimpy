// 4–8 s — THE BLANK. Silence, a single boom. The clean hoodie in studio light: the base everything
// else plugs into. A light sweep crosses the fleece and catches the dock welt.
import type { Stage } from '../engine/stage';
import { W, H, SAFE } from '../engine/gl';
import { seg, ease, lerp, clamp } from '../engine/util';
import { BONE, BLUE, studio, placeHoodie, mono, display, riseText } from './common';

export function blank(S: Stage, t: number) {
  const u = seg(t, 4, 8);
  const c = S.bgc();
  studio(c, { top: '#3A3A40', bottom: '#0C0C0E', cx: W / 2, cy: H * 0.6, r: 1300, floorY: H * 0.83 });

  placeHoodie(S, { x: 0, y: 270, s: lerp(0.9, 0.97, ease.outCubic(u)) });
  // light sweeps left → right across the garment
  const a = lerp(-1.1, 0.9, ease.inOutCubic(seg(t, 4.2, 7.8)));
  S.light.uL.value.set(Math.sin(a), 0.5, Math.cos(a) * 0.9 + 0.2).normalize();
  S.light.uKey.value.setRGB(1.15, 1.1, 1.04);
  S.light.uRim.value.setRGB(0.12, 0.14, 0.3);
  S.hoodie.mat.uniforms.uWelt!.value = 2.2;
  // a light runs once round the dock right before the cut
  S.hoodie.mat.uniforms.uDockGlow!.value = 0.45 * Math.max(0, Math.sin(Math.PI * seg(t, 6.9, 7.9))) + 0.5 * seg(t, 7.75, 8);
  S.hoodie.mat.uniforms.uChase!.value = ease.inOutCubic(seg(t, 6.9, 7.9));

  const f = S.fgc();
  const x = SAFE.left;
  mono(f, 'STIMPY — BASE 01', x, SAFE.top + 40, { color: BLUE, size: 20, weight: 700, alpha: seg(t, 4.6, 4.9) });
  riseText(f, seg(t, 5.0, 5.6), x, 450, 140, (dy) => display(f, 'ONE', x - 6, 450 + dy, { size: 150, color: BONE, align: 'left' }));
  riseText(f, seg(t, 5.2, 5.8), x, 590, 140, (dy) => display(f, 'HOODIE.', x - 6, 590 + dy, { size: 150, color: BONE, align: 'left' }));
  const specs = ['400 GSM HEAVYWEIGHT FLEECE', 'OVERSIZED · DROPPED SHOULDER', 'ZIP-ON BACK PANEL'];
  specs.forEach((s, i) => {
    const k = seg(t, 6.0 + i * 0.3, 6.3 + i * 0.3);
    if (k <= 0) return;
    f.save();
    f.fillStyle = BONE;
    f.globalAlpha = 0.5 * k;
    f.fillRect(x, 628 + i * 38, 560 * ease.outExpo(k), 1);
    f.restore();
    mono(f, s, x, 654 + i * 38, { size: 19, alpha: k, color: i === 2 ? '#7C89FF' : BONE });
  });
  S.post.fade = 1 - clamp((t - 4.0) / 0.5);
  S.post.vignette = 0.5;
}
