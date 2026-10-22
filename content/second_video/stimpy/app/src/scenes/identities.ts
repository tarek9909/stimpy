// 22–40 s — IDENTITIES. The hoodie walks; on each swap the Stimpie peels away and a new one lands, and
// the whole world changes with it. The swaps accelerate from every two bars to every half-beat.
import type { Stage } from '../engine/stage';
import { DIST, SAFE } from '../engine/gl';
import { lastEvent, pulse, clamp, ease } from '../engine/util';
import { WORLDS } from '../art/worlds';
import { EV, placeHoodie, landed, peelOff, mono } from './common';
import * as THREE from 'three';

/** Design index per swap: static, bloom, night, heat, acid, orbit — twice. */
export const ORDER = [0, 1, 3, 4, 5, 2, 0, 1, 3, 4, 5, 2];

const LIGHT: Record<string, { key: string; rim: string; amb: string }> = {
  static: { key: '#FFF6EC', rim: '#FF3B1F', amb: '#4A4744' },
  bloom: { key: '#FFE9EC', rim: '#FF8FA6', amb: '#5A3F46' },
  night: { key: '#9FB0FF', rim: '#FFD66B', amb: '#1C2250' },
  heat: { key: '#FFD2A0', rim: '#FFD23F', amb: '#5A2A18' },
  acid: { key: '#F4FFD0', rim: '#D4FF3A', amb: '#2E3514' },
  orbit: { key: '#E8ECFF', rim: '#FF6A2B', amb: '#1E2A8A' },
};

const tmp = new THREE.Color();

export function identities(S: Stage, t: number) {
  const swaps = EV.swaps;
  const [k0, t0] = lastEvent(swaps, t);
  const k = Math.max(0, k0);
  const age = t - t0;
  const d = S.designs[ORDER[k]!]!;
  const next = swaps[k + 1] ?? 40;
  const interval = next - t0;

  WORLDS[d.id]!(S.bgc(), t, age, d.word);

  const fast = t >= 34;
  placeHoodie(S, { x: 0, y: 270, s: fast ? 1.02 : 0.98, walk: 1, punch: 0.05 * pulse(age, 12) });
  const lt = LIGHT[d.id]!;
  S.light.uKey.value.copy(tmp.set(lt.key)).multiplyScalar(1.1);
  S.light.uRim.value.copy(tmp.set(lt.rim)).multiplyScalar(0.35);
  S.light.uAmb.value.copy(tmp.set(lt.amb)).multiplyScalar(0.9);

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
  // tiny camera kick per swap
  S.cam({ roll: (k % 2 ? 1 : -1) * 0.012 * pulse(age, 6), dist: DIST * (1 - 0.03 * pulse(age, 7)) });
  void ease;
}
