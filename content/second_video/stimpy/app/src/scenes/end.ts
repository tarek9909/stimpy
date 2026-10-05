// 54–60 s — END. The last Stimpie peels away and leaves the clean hoodie; the camera pulls back and the
// name lands as a light runs round the zip track. Every identity flickers once through the dock, then back to the blank.
import type { Stage } from '../engine/stage';
import { W, H } from '../engine/gl';
import { seg, ease, lerp, pulse, clamp } from '../engine/util';
import { EV, BONE, BLUE, studio, placeHoodie, peelOff, mono, display } from './common';

export function end(S: Stage, t: number) {
  const c = S.bgc();
  studio(c, { top: '#34343C', bottom: '#070708', r: 1300, cy: H * 0.4, floorY: H * 0.595, shadow: 0.4 * seg(t, 54.6, 55.4) });

  const pull = ease.inOutCubic(seg(t, 54.5, 55.4));
  placeHoodie(S, { x: 0, y: lerp(200, -150, pull), s: lerp(1.15, 0.72, pull), punch: 0.05 * pulse(t - 54, 8) });
  S.light.uRim.value.setRGB(0.12, 0.14, 0.4);
  const logoAge = t - EV.logo;
  const h = S.hoodie;
  h.mat.uniforms.uDockGlow!.value = logoAge >= 0 ? 1.4 * pulse(logoAge, 2.5) : 0;
  h.mat.uniforms.uChase!.value = ease.outCubic(seg(t, EV.logo, EV.logo + 1.2));

  // the peel
  const p = h.panels[0]!.state;
  if (t < 54.75) {
    p.art = S.artMine;
    peelOff(p, seg(t, EV.peel + 0.05, EV.peel + 0.7), Math.PI / 4);
  }
  // ghost flicker: every identity passes through the dock once
  const g = seg(t, 57.0, 58.2);
  if (g > 0 && g < 1) {
    const q = h.panels[1]!.state;
    const i = Math.floor(g * 12);
    q.art = i % 2 ? S.artAlt[(i >> 1) % 6]! : S.art[(i >> 1) % 6]!;
    q.opacity = 0.9;
    q.flash = 0.15;
    q.shadow = 0.5;
  }

  const f = S.fgc();
  if (logoAge >= 0) {
    const u = ease.outExpo(logoAge / 0.5);
    f.save();
    f.translate(W / 2, 1300);
    f.scale(1.3 - 0.3 * u, 1.3 - 0.3 * u);
    display(f, 'STIMPY', 0, 0, { size: 176, color: BONE, alpha: clamp(logoAge / 0.04), track: -0.04 });
    f.restore();
  }
  const tag = seg(t, EV.tagline, EV.tagline + 0.5);
  mono(f, 'ONE HOODIE.', W / 2, 1375, { size: 26, align: 'center', alpha: tag, weight: 500 });
  mono(f, 'MULTIPLE IDENTITIES.', W / 2, 1412, { size: 26, align: 'center', alpha: seg(t, EV.tagline + 0.25, EV.tagline + 0.75), weight: 500 });
  mono(f, 'DROP 01 — COMING SOON', W / 2, 1468, { size: 19, align: 'center', color: '#6F7DFF', alpha: seg(t, 56.6, 57.0), weight: 700 });
  if (logoAge >= 0) {
    // corner marks
    f.save();
    f.strokeStyle = BLUE; f.lineWidth = 3; f.globalAlpha = seg(t, 55.2, 55.6);
    const m = 50, L = 40;
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      f.beginPath(); f.moveTo(x, y + sy * L); f.lineTo(x, y); f.lineTo(x + sx * L, y); f.stroke();
    }
    f.restore();
  }
  S.post.flash = 0.45 * pulse(t - 54, 12) + (logoAge >= 0 ? 0.5 * pulse(logoAge, 12) : 0);
  S.post.flashColor.setRGB(0.8, 0.84, 1);
  S.post.fade = seg(t, EV.fade, 59.9);
  S.post.vignette = 0.5;
}
