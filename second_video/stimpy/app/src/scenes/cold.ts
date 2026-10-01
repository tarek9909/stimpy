// 0–4 s — COLD OPEN. Eight beats, eight Stimpies: the back slams to a new identity on every beat while
// the question builds above it, word by word. Hard cut to silence at 4.0.
import type { Stage } from '../engine/stage';
import { W, H, DIST, SAFE } from '../engine/gl';
import { lastEvent, pulse, ease, clamp } from '../engine/util';
import { EV, BONE, placeHoodie, landed, mono, display } from './common';

const WORDS = ['WHO', 'ARE', 'YOU', 'TODAY?'];

export function cold(S: Stage, t: number) {
  const [k, t0] = lastEvent(EV.coldSwaps, t);
  const i = Math.max(0, k);
  const age = t - t0;
  const alt = i >= 6;
  const d = S.designs[[0, 1, 2, 3, 4, 5, 2, 0][i]!]!;
  const pal = d.pal;
  const ink = alt ? BONE : pal.fg;

  const c = S.bgc();
  c.fillStyle = alt ? '#0E0E10' : pal.bg;
  c.fillRect(0, 0, W, H);
  // one flat colour field per beat with a hard diagonal cut of the accent colour
  c.fillStyle = pal.accent;
  c.globalAlpha = 0.9;
  c.beginPath();
  const sweep = ease.outExpo(age / 0.25);
  c.moveTo(W, H * (1 - sweep * 0.55));
  c.lineTo(W, H);
  c.lineTo(W * (1 - sweep * 0.9), H);
  c.fill();
  c.globalAlpha = 1;

  // hoodie: lower half, punching on the beat, alternating tilt
  const side = i % 2 ? 1 : -1;
  placeHoodie(S, { x: 0, y: 330, s: 1.08, punch: 0.045 * pulse(age, 11), rz: side * 0.025 * (1 - ease.outCubic(age / 0.3)) });
  const p = S.hoodie.panels[0]!.state;
  p.art = alt ? S.artAlt[[2, 0][i - 6]!]! : S.art[[0, 1, 2, 3, 4, 5][i]!]!;
  landed(p, age, 12, 0.22);
  p.z = 70 * (1 - ease.outCubic(age / 0.07));
  S.light.uRim.value.set(pal.accent).multiplyScalar(0.25);

  // the question, one word per two beats, stacked above the hoodie
  const f = S.fgc();
  const wi = Math.floor(i / 2);
  for (let w = 0; w <= wi; w++) {
    const wa = t - EV.coldSwaps[w * 2]!;
    const u = ease.outExpo(wa / 0.3);
    f.save();
    f.globalAlpha = w === wi ? 1 : 0.3;
    f.translate(-70 * (1 - u), 0);
    display(f, WORDS[w]!, SAFE.left - 6, 440 + w * 132, { size: 150, color: ink, align: 'left', track: -0.04 });
    f.restore();
  }
  mono(f, `Nº${d.no} — ${d.name}`, SAFE.left, SAFE.top + 20, { color: ink, size: 20 });
  mono(f, `${String(i + 1).padStart(2, '0')} / 08`, SAFE.right, SAFE.top + 20, { color: ink, size: 20, align: 'right' });

  S.post.flash = (i === 0 ? 0.6 : 0.18) * pulse(age, 22);
  S.post.flashColor.set(pal.accent).lerp(S.post.flashColor.set('#ffffff'), 0.5);
  S.post.vignette = 0.2;
  // the final half-beat pushes in toward the panel
  const push = ease.inCubic(clamp((t - 3.6) / 0.4));
  S.cam({ dist: DIST * (1 - push * 0.4), ty: -330 * push });
}
