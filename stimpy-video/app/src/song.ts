// The timing map written by song/synth.py. The video reads every hit from here.
import song from './song.json';

export type Click = { t: number; kind: 'world' | 'detach' | 'swap' | 'final'; i: number };

export const SONG = song as {
  bpm: number;
  beat: number;
  bar: number;
  bars: number;
  duration: number;
  sections: { name: string; start: number; end: number }[];
  kicks: number[];
  claps: number[];
  hearts: number[];
  clicks: Click[];
  impacts: number[];
  riffle: number[];
};

export const BEAT = SONG.beat;
export const BAR = SONG.bar;
export const T = (bar: number, beat = 0, step = 0) => bar * BAR + beat * BEAT + step * (BEAT / 4);
export const DURATION = SONG.duration;

/** Seconds since the most recent event at or before t (Infinity if none). */
export function since(list: number[], t: number): number {
  let best = Infinity;
  for (const e of list) {
    if (e <= t + 1e-6) best = t - e;
    else break;
  }
  return best;
}

/** Decaying pulse after each event. */
export const pulse = (list: number[], t: number, tau: number) => {
  const s = since(list, t);
  return s === Infinity ? 0 : Math.exp(-s / tau);
};

export const sectionAt = (t: number) => {
  for (const s of SONG.sections) if (t < s.end) return s;
  return SONG.sections[SONG.sections.length - 1];
};

export const clickTimes = (kinds: Click['kind'][]) => SONG.clicks.filter((c) => kinds.includes(c.kind)).map((c) => c.t);
