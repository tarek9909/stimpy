// 16–22 s — THE ZIP. The dock lights up (a glow chases round it with the build), a Stimpie tumbles in
// from the dark, hovers, slams home on the drop and zips on — a light runs round its edge.
// MULTIPLE IDENTITIES.
import type { Stage } from '../engine/stage';
import { W, H, DIST, SAFE } from '../engine/gl';
import { seg, ease, pulse, wobble, clamp, lerp } from '../engine/util';
import { EV, BONE, BLUE, studio, placeHoodie, landed, mono, display, peelOff, beatOf } from './common';

const HY = 250, HS = 1.0;

export function snap(S: Stage, t: number) {
  const age = t - EV.snap;
  const hit = age >= 0;
  const c = S.bgc();
  studio(c, { top: hit ? '#2A2F6E' : '#26262C', bottom: '#08080A', cy: H * 0.55, r: 1400, floorY: H * 0.84 });
  if (hit) {
    // shockwave ring on the wall
    const r = ease.outExpo(age / 1.2) * 1700;
    c.save();
    c.strokeStyle = `rgba(90,110,255,${0.5 * (1 - seg(age, 0, 1.2))})`;
    c.lineWidth = 60 * (1 - seg(age, 0, 1.2)) + 2;
    c.beginPath(); c.arc(W / 2, H / 2 + HY + 55 * HS, r, 0, Math.PI * 2); c.stroke();
    c.restore();
    // the words above the hoodie
    const u = ease.outExpo(age / 0.5);
    c.save();
    c.globalAlpha = clamp(age / 0.05);
    c.translate(W / 2, 560);
    c.scale(1.25 - 0.25 * u, 1.25 - 0.25 * u);
    display(c, 'MULTIPLE', 0, -150, { size: 200, color: BONE, family: 'ArchivoC', track: -0.02 });
    display(c, 'IDENTITIES.', 0, 40, { size: 200, color: '#8C97FF', family: 'ArchivoC', track: -0.02 });
    c.restore();
  }

  const shake = hit ? wobble(age, 11, 7) : 0;
  const push = ease.inOutCubic(seg(t, 19.5, 22));
  placeHoodie(S, { x: 0, y: HY, s: HS, punch: hit ? 0.05 * pulse(age, 9) : 0, walk: hit ? seg(t, 18.6, 19.4) : 0 });
  S.cam({ dist: DIST * (1 - 0.14 * push), ty: -60 * push, roll: shake * 0.012, tx: shake * 6 });
  S.light.uRim.value.setRGB(0.12, 0.16, 0.5);

  // the dock arms: a light chases round it, faster toward the drop, pulsing in 16ths
  const h = S.hoodie;
  const build = seg(t, 16, 18);
  const sixteenth = pulse((beatOf(t) * (build > 0.5 ? 4 : 2)) % 1 / 4, 3);
  h.mat.uniforms.uDockGlow!.value = hit ? 1.6 * pulse(age, 3) : (0.15 + 0.6 * build) * (0.5 + 0.5 * sixteenth);
  h.mat.uniforms.uChase!.value = ((t - 16) * (0.5 + build * 1.5)) % 1;
  if (hit) { h.mat.uniforms.uRipAge!.value = age; h.mat.uniforms.uRipAmp!.value = 0.9; }

  // the Stimpie's flight: tumble in from the top, hover, slam
  const p = h.panels[0]!.state;
  p.art = S.art[2]!;
  if (!hit) {
    const fly = ease.outCubic(seg(t, 16.0, 17.5));
    const hover = Math.sin((t - 17.5) * 9) * 6 * seg(t, 17.5, 17.6);
    const slam = ease.inExpo(seg(t, 17.84, 18.0));
    const zHover = lerp(1800, 260, fly) + 30 * seg(t, 17.6, 17.84);
    p.z = lerp(zHover + hover, 0, slam);
    p.x = lerp(500, 0, fly);
    p.y = lerp(1300, 0, fly);
    p.ry = lerp(-Math.PI * 3, 0, ease.outCubic(seg(t, 16.0, 17.6)));
    p.rx = lerp(0.8, 0, fly) + 0.05 * Math.sin(t * 5) * (1 - slam);
    p.rz = lerp(-0.7, 0, fly);
    p.shadow = clamp(fly * 1.4);
    p.zip = 0;
  } else {
    landed(p, age, 20, 0.5);
  }
  // hand-off into the identities: the first swap peels this one off
  if (t > 21.65) {
    const q = h.panels[1]!.state;
    Object.assign(q, { ...p });
    q.art = S.art[2]!;
    q.z = 1.2;
    peelOff(q, seg(t, 21.65, 22.0));
    p.art = S.art[0]!;
    p.ripAge = -1; p.ripAmp = 0; p.scale = 1; p.flash = 0; p.zipGlow = 0;
  }

  const f = S.fgc();
  if (!hit) {
    mono(f, 'DOCK OPEN', SAFE.left, SAFE.top + 20, { size: 20, weight: 700, color: '#7C89FF', alpha: seg(t, 16.05, 16.2) });
    mono(f, 'READY TO ZIP ON', SAFE.left, SAFE.top + 52, { size: 20, alpha: seg(t, 16.05, 16.2) });
  } else {
    // zip readout while the light runs round
    const z = Math.min(1, age / 0.5);
    mono(f, z < 1 ? `ZIPPING ON — ${String(Math.floor(z * 100)).padStart(3, '0')}%` : 'ZIPPED ON.', SAFE.left, SAFE.top + 20, { size: 20, weight: 700, color: '#7C89FF' });
    f.fillStyle = 'rgba(237,232,222,0.25)'; f.fillRect(SAFE.left, SAFE.top + 36, 320, 6);
    f.fillStyle = '#5A6BFF'; f.fillRect(SAFE.left, SAFE.top + 36, 320 * ease.inOutCubic(z), 6);
    mono(f, S.designs[2]!.name, SAFE.right, SAFE.top + 20, { size: 20, align: 'right', alpha: seg(age, 0.3, 0.5) });
    display(f, 'ONE HOODIE.', W / 2, SAFE.bottom - 10, { size: 70, alpha: seg(age, 1.0, 1.3) });
  }
  S.post.flash = hit ? 0.75 * pulse(age, 10) : 0;
  S.post.flashColor.setRGB(0.75, 0.8, 1.0);
  S.post.ca = hit ? 0.6 + 4 * pulse(age, 6) : 0.6;
  S.post.vignette = 0.5;
  void BLUE;
}
