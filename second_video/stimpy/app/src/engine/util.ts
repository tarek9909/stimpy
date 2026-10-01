// Small math kit. Everything in the video is a pure function of time, so these are all stateless.
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t: number) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
/** 0..1 progress of t through [a, b], clamped. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const fract = (x: number) => x - Math.floor(x);
export const TAU = Math.PI * 2;

export const ease = {
  inQuad: (t: number) => clamp(t) ** 2,
  outQuad: (t: number) => 1 - (1 - clamp(t)) ** 2,
  inCubic: (t: number) => clamp(t) ** 3,
  outCubic: (t: number) => 1 - (1 - clamp(t)) ** 3,
  inOutCubic: (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; },
  inOutQuint: (t: number) => { t = clamp(t); return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2; },
  outExpo: (t: number) => { t = clamp(t); return t >= 1 ? 1 : 1 - 2 ** (-10 * t); },
  inExpo: (t: number) => { t = clamp(t); return t <= 0 ? 0 : 2 ** (10 * t - 10); },
  inOutExpo: (t: number) => { t = clamp(t); if (t <= 0 || t >= 1) return t; return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2; },
  outBack: (t: number, s = 1.70158) => { t = clamp(t) - 1; return 1 + (s + 1) * t ** 3 + s * t ** 2; },
  inBack: (t: number, s = 1.70158) => { t = clamp(t); return (s + 1) * t ** 3 - s * t ** 2; },
};

/** Damped spring response to a unit step at age 0 (0 → 1 with overshoot). */
export function spring(age: number, freq = 4, damp = 0.35) {
  if (age <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damp * w * age) * Math.cos(w * Math.sqrt(1 - damp * damp) * age);
}
/** Decaying oscillation kicked at age 0 (0 → ±1 → 0). */
export function wobble(age: number, freq = 5, decay = 6) {
  if (age < 0) return 0;
  return Math.sin(TAU * freq * age) * Math.exp(-decay * age);
}
/** Exponential decay pulse, 1 at age 0. */
export const pulse = (age: number, k = 8) => (age < 0 ? 0 : Math.exp(-k * age));

export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Smooth 1D value noise. */
export function noise1(x: number) {
  const i = Math.floor(x), f = x - i;
  return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f)) * 2 - 1;
}

/** Last event time ≤ t in a sorted list, with its index (−1 if none). */
export function lastEvent(times: number[], t: number): [number, number] {
  let k = -1;
  for (let i = 0; i < times.length; i++) if (times[i]! <= t) k = i;
  return [k, k >= 0 ? times[k]! : -Infinity];
}
