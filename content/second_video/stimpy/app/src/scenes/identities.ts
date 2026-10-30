// 22–40 s — IDENTITIES. The hoodie walks; on each swap the Stimpie peels away and a new one lands, and
// the whole world changes with it. The swaps accelerate from every two bars to every half-beat.
import type { Stage } from '../engine/stage';
import { DIST, SAFE } from '../engine/gl';
import { lastEvent, pulse, clamp, ease, seg } from '../engine/util';
import { WORLDS } from '../art/worlds';
import { EV, placeHoodie, landed, peelOff, mono, focusWorld } from './common';
import * as THREE from 'three';
import { IDX, type Design } from '../art/designs';

/** Stimpie per swap: the six heroes (sameday, bubblegum, receipt, sabotage, unhinged, neon — in the slots
 * static, bloom, night, heat, acid, orbit held), then the other five, and SAME DAY again to close the run. */
export const ORDER = ['sameday', 'bubblegum', 'receipt', 'sabotage', 'unhinged', 'neon', 'tiger', 'ducks', 'bside', 'vhs', 'chameleon', 'sameday'].map(IDX);

const tmp = new THREE.Color();
const white = new THREE.Color(1, 1, 1);

/** Scene light from the Stimpie's colours: key tinted by its soft glow, rim in its loud glow, ambient from its world. */
function lightFor(S: Stage, d: Design) {
  S.light.uKey.value.copy(white).lerp(tmp.set(d.glow[1] ?? d.glow[0]!), 0.22).multiplyScalar(1.1);
  S.light.uRim.value.copy(tmp.set(d.glow[0]!)).multiplyScalar(0.35);
  S.light.uAmb.value.copy(tmp.set(d.pal.bg)).multiplyScalar(0.45).add(new THREE.Color(0.12, 0.12, 0.13));
}

export function identities(S: Stage, t: number) {
  const swaps = EV.swaps;
  const [k0, t0] = lastEvent(swaps, t);
  const k = Math.max(0, k0);
  const age = t - t0;
  const d = S.designs[ORDER[k]!]!;
  const next = swaps[k + 1] ?? 40;
  const interval = next - t0;

  WORLDS[d.id]!(S.bgc(), t, age, d);

  const fast = t >= 34;
  placeHoodie(S, { x: 0, y: 270, s: fast ? 1.02 : 0.98, walk: 1, punch: 0.05 * pulse(age, 12) });
  lightFor(S, d);

  const cur = S.hoodie.panels[0]!.state;
  cur.art = S.art[ORDER[k]!]!;
  landed(cur, age, fast ? 10 : 14);
  // peel off before the next swap, revealing the next Stimpie underneath
  const peelDur = Math.min(0.34, interval * 0.6);
  if (t > next - peelDur && k + 1 < ORDER.length) {
    const top = S.hoodie.panels[1]!.state;
    Object.assign(top, { ...cur });
    top.z = 1.2;
    peelOff(top, (t - (next - peelDur)) / peelDur, k % 2 ? Math.PI / 4 : (3 * Math.PI) / 4);
    cur.art = S.art[ORDER[k + 1]!]!;
    cur.ripAge = -1; cur.ripAmp = 0; cur.scale = 1; cur.flash = 0;
  } else if (t > 39.7) {
    // the last one flips away as the wall of cards arrives
    peelOff(cur, clamp((t - 39.7) / 0.3));
  }

  const f = S.fgc();
  const ink = d.pal.ink;
  mono(f, `IDENTITY ${String(k + 1).padStart(2, '0')}`, SAFE.left, SAFE.top + 20, { color: ink, size: 20, weight: 700 });
  mono(f, d.name, SAFE.right, SAFE.top + 20, { color: ink, size: 20, align: 'right', alpha: clamp(age / 0.1) });
  // progress ticks
  for (let i = 0; i < ORDER.length; i++) {
    f.fillStyle = ink;
    f.globalAlpha = i <= k ? 0.9 : 0.25;
    f.fillRect(SAFE.left + i * 16, SAFE.top + 38, 10, 10);
  }
  f.globalAlpha = 1;
  S.post.flash = (fast ? 0.35 : 0.22) * pulse(age, 18);
  S.post.flashColor.set(d.pal.accent);
  S.post.ca = 0.6 + (fast ? 2.5 : 1.2) * pulse(age, 10);
  S.post.vignette = 0.3;
  // tiny camera kick per swap; on the long holds the camera creeps in on the Stimpie's hero detail
  const creep = interval >= 1.9 ? 0.3 * ease.inOutCubic(seg(age, 0.5, interval)) : 0;
  const [fx, fy] = focusWorld(S, d);
  S.cam({ tx: fx * creep, ty: fy * creep, roll: (k % 2 ? 1 : -1) * 0.012 * pulse(age, 6), dist: DIST * (1 - 0.03 * pulse(age, 7) - 0.25 * creep) });
  void ease;
}
