// The soundtrack synthesiser. Each film writes its score against the same clock its visuals use, and it is
// rendered offline (OfflineAudioContext) at boot: the preview plays the buffer, the exporter muxes it.
// Nothing is sampled: drums, synths and every sound effect are generated here, deterministically.
//
// The zip sound (the brand's sound logo) is built sample by sample from the motion of the pull: one
// click per tooth passing the slider, plus fabric friction that follows the pull's speed.
import { mulberry, clamp, ease, lerp } from '../engine/util';

export const SR = 48000;

export type Bus = 'music' | 'sfx';
interface Route { bus?: Bus; pan?: number; verb?: number; delay?: number }

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
/** 'F#3' → MIDI number. */
export function n(s: string) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad note ${s}`);
  return NOTE[m[1]!]! + (parseInt(m[2]!) + 1) * 12;
}
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const chord = (...s: string[]) => s.map(n);

export class Score {
  readonly ctx: OfflineAudioContext;
  readonly duration: number;
  private pre: GainNode;
  private musicIn: GainNode;
  private musicDuck: GainNode;
  private musicGate: GainNode;
  private musicLP: BiquadFilterNode;
  private sfxIn: GainNode;
  private verbIn: GainNode;
  private delayIn: GainNode;
  private noise: AudioBuffer;
  private rnd = mulberry(90210);
  private ducks: [number, number, number][] = [];
  private gates: [number, number, number][] = []; // time, value, ramp
  private lps: [number, number, number][] = [];
  private sfxBufs: { t: number; data: Float32Array[]; route: Route }[] = [];

  constructor(duration: number, o: { verbSize?: number; delayTime?: number; delayFb?: number } = {}) {
    this.duration = duration;
    const len = Math.ceil((duration + 0.02) * SR);
    const ctx = (this.ctx = new OfflineAudioContext(2, len, SR));
    this.pre = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    this.pre.connect(comp).connect(master).connect(ctx.destination);

    this.musicIn = ctx.createGain();
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000; this.musicLP.Q.value = 0.8;
    this.musicDuck = ctx.createGain();
    this.musicGate = ctx.createGain();
    this.musicIn.connect(this.musicLP).connect(this.musicDuck).connect(this.musicGate).connect(this.pre);
    this.sfxIn = ctx.createGain();
    this.sfxIn.connect(this.pre);

    // reverb: generated stereo impulse
    const verb = ctx.createConvolver();
    verb.buffer = this.makeIR(o.verbSize ?? 2.4);
    this.verbIn = ctx.createGain();
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.9;
    this.verbIn.connect(verb).connect(verbOut).connect(this.pre);
    // ping-pong delay
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2);
    dl.delayTime.value = o.delayTime ?? 0.375; dr.delayTime.value = o.delayTime ?? 0.375;
    const fb = ctx.createGain(); fb.gain.value = o.delayFb ?? 0.38;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 3800;
    const merger = ctx.createChannelMerger(2);
    this.delayIn.connect(dl);
    dl.connect(merger, 0, 0); dl.connect(dr); dr.connect(merger, 0, 1); dr.connect(lpf).connect(fb).connect(dl);
    const dOut = ctx.createGain(); dOut.gain.value = 0.5;
    merger.connect(dOut).connect(this.pre);
    dOut.connect(this.verbIn);

    // shared noise
    this.noise = ctx.createBuffer(1, SR * 2, SR);
    const d = this.noise.getChannelData(0), r = mulberry(7);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  }

  private makeIR(sec: number) {
    const len = Math.floor(sec * SR), b = this.ctx.createBuffer(2, len, SR), r = mulberry(4242);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const env = Math.exp(-t * (6.2 / sec)) * (t < 0.008 ? t / 0.008 : 1);
        lp += ((r() * 2 - 1) - lp) * (0.55 - 0.4 * (t / sec));
        d[i] = lp * env * 0.6;
      }
    }
    return b;
  }

  // ---------------------------------------------------------------- routing helpers
  private route(node: AudioNode, r: Route = {}) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(r.pan ?? 0, -1, 1);
    node.connect(p);
    p.connect(r.bus === 'sfx' ? this.sfxIn : this.musicIn);
    if (r.verb) { const g = ctx.createGain(); g.gain.value = r.verb; p.connect(g).connect(this.verbIn); }
    if (r.delay) { const g = ctx.createGain(); g.gain.value = r.delay; p.connect(g).connect(this.delayIn); }
    return p;
  }
  private env(t: number, a: number, peak: number, d: number, sus = 0, rel = 0.05, hold = 0) {
    peak = Math.max(peak, 1e-3);
    const g = this.ctx.createGain();
    const G = g.gain;
    G.setValueAtTime(0, Math.max(0, t));
    G.linearRampToValueAtTime(peak, t + a);
    if (sus > 0) {
      G.setTargetAtTime(peak * sus, t + a, d / 3);
      G.setValueAtTime(peak * sus, t + a + hold);
      G.linearRampToValueAtTime(0, t + a + hold + rel);
    } else {
      G.exponentialRampToValueAtTime(Math.max(1e-4, peak * 1e-3), t + a + d);
      G.setValueAtTime(0, t + a + d + 0.001);
    }
    return g;
  }
  private osc(type: OscillatorType, f: number, t: number, stop: number, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.start(Math.max(0, t)); o.stop(stop);
    return o;
  }
  private noiseSrc(t: number, dur: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    s.start(Math.max(0, t), this.rnd() * 1.5); s.stop(t + dur);
    return s;
  }
  private filt(type: BiquadFilterType, f: number, q = 0.8) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  // ---------------------------------------------------------------- mix automation
  /** Sidechain the music bus (a kick or an impact). */
  duck(t: number, depth = 0.55, rel = 0.14) { this.ducks.push([t, depth, rel]); }
  /** Music bus level (0..1) from time t, ramping over `ramp` seconds. */
  gate(t: number, v: number, ramp = 0.02) { this.gates.push([t, v, ramp]); }
  /** Music bus low-pass cutoff from time t, ramping over `ramp` seconds. */
  lowpass(t: number, f: number, ramp = 0.02) { this.lps.push([t, f, ramp]); }

  // ---------------------------------------------------------------- drums
  kick(t: number, g = 1, o: { duck?: number; tone?: number } = {}) {
    const s = this.osc('sine', 150, t, t + 0.6);
    s.frequency.setValueAtTime(165 * (o.tone ?? 1), t);
    s.frequency.exponentialRampToValueAtTime(46 * (o.tone ?? 1), t + 0.11);
    const e = this.env(t, 0.002, 0.95 * g, 0.42);
    this.route(s.connect(e), { bus: 'music' });
    const c = this.noiseSrc(t, 0.02), hp = this.filt('highpass', 2500), ce = this.env(t, 0.0005, 0.22 * g, 0.012);
    this.route(c.connect(hp).connect(ce), { bus: 'music' });
    if (o.duck !== 0) this.duck(t, o.duck ?? 0.6);
  }
  snare(t: number, g = 1, pan = 0) {
    const s = this.osc('triangle', 200, t, t + 0.3);
    s.frequency.setValueAtTime(210, t); s.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    this.route(s.connect(this.env(t, 0.001, 0.45 * g, 0.12)), { bus: 'music', pan });
    const nz = this.noiseSrc(t, 0.3);
    this.route(nz.connect(this.filt('bandpass', 1900, 0.7)).connect(this.env(t, 0.001, 0.8 * g, 0.2)), { bus: 'music', pan, verb: 0.18 });
  }
  clap(t: number, g = 1, pan = 0) {
    if (g <= 0) return;
    const nz = this.noiseSrc(t, 0.4);
    const bp = this.filt('bandpass', 1250, 1.3);
    const e = this.ctx.createGain();
    const G = e.gain;
    G.setValueAtTime(0, t);
    for (const [dt, v] of [[0, 1], [0.011, 0.8], [0.023, 0.9]] as const) {
      G.setValueAtTime(v * g, t + dt);
      G.exponentialRampToValueAtTime(0.05 * g, t + dt + 0.009);
    }
    G.setValueAtTime(0.85 * g, t + 0.034);
    G.exponentialRampToValueAtTime(0.001, t + 0.034 + 0.22);
    this.route(nz.connect(bp).connect(e), { bus: 'music', pan, verb: 0.3 });
  }
  hat(t: number, g = 1, open = false, pan = 0.2) {
    const nz = this.noiseSrc(t, open ? 0.4 : 0.1);
    this.route(nz.connect(this.filt('highpass', 7500, 0.7)).connect(this.env(t, 0.0005, 0.35 * g, open ? 0.26 : 0.035)), { bus: 'music', pan });
  }
  shaker(t: number, g = 1, pan = -0.25) {
    const nz = this.noiseSrc(t, 0.1);
    this.route(nz.connect(this.filt('bandpass', 5200, 1.2)).connect(this.env(t, 0.012, 0.25 * g, 0.05)), { bus: 'music', pan });
  }
  /** Reverse-cymbal swell ending at t. */
  swell(t: number, dur: number, g = 1) {
    const nz = this.noiseSrc(t - dur, dur + 0.05);
    const hp = this.filt('highpass', 3000, 0.7);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t - dur);
    e.gain.exponentialRampToValueAtTime(0.5 * g, t);
    e.gain.setValueAtTime(0, t + 0.01);
    this.route(nz.connect(hp).connect(e), { bus: 'music', verb: 0.3 });
  }

  // ---------------------------------------------------------------- tonal
  bass(t: number, midi: number, dur: number, g = 1, o: { cutoff?: number; glideFrom?: number } = {}) {
    const f = hz(midi);
    const a = this.osc('sawtooth', f, t, t + dur + 0.2);
    const b = this.osc('sine', f / 2, t, t + dur + 0.2);
    if (o.glideFrom !== undefined) { a.frequency.setValueAtTime(hz(o.glideFrom), t); a.frequency.exponentialRampToValueAtTime(f, t + 0.08); b.frequency.setValueAtTime(hz(o.glideFrom) / 2, t); b.frequency.exponentialRampToValueAtTime(f / 2, t + 0.08); }
    const lp = this.filt('lowpass', 200, 4);
    const co = o.cutoff ?? 1100;
    lp.frequency.setValueAtTime(co, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + Math.min(0.25, dur));
    const mix = this.ctx.createGain(); mix.gain.value = 0.55;
    a.connect(lp).connect(mix);
    const sg = this.ctx.createGain(); sg.gain.value = 0.9; b.connect(sg).connect(mix);
    this.route(mix.connect(this.env(t, 0.004, 0.7 * g, 0.2, 0.85, 0.05, Math.max(0.01, dur - 0.05))), { bus: 'music' });
  }
  sub(t: number, midi: number, dur: number, g = 1) {
    const s = this.osc('sine', hz(midi), t, t + dur + 0.3);
    this.route(s.connect(this.env(t, 0.01, 0.8 * g, 0.3, 0.9, 0.2, dur)), { bus: 'music' });
  }
  pluck(t: number, midi: number, dur = 0.25, g = 1, o: Route & { bright?: number } = {}) {
    const f = hz(midi);
    const lp = this.filt('lowpass', 800, 2);
    const br = o.bright ?? 1;
    lp.frequency.setValueAtTime(5200 * br, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.18);
    const m = this.ctx.createGain(); m.gain.value = 0.3;
    for (const [type, det] of [['square', -7], ['sawtooth', 7]] as const) this.osc(type, f, t, t + dur + 0.4, det).connect(lp);
    lp.connect(m);
    this.route(m.connect(this.env(t, 0.002, 0.8 * g, Math.max(0.12, dur))), { bus: o.bus ?? 'music', pan: o.pan ?? 0, verb: o.verb ?? 0.25, delay: o.delay ?? 0.18 });
  }
  /** Supersaw chord stab. */
  stab(t: number, notes: number[], dur = 0.3, g = 1, o: Route & { cutoff?: number; attack?: number } = {}) {
    const lp = this.filt('lowpass', 3000, 1.2);
    lp.frequency.setValueAtTime(o.cutoff ?? 4200, t);
    lp.frequency.exponentialRampToValueAtTime((o.cutoff ?? 4200) * 0.3, t + dur);
    const m = this.ctx.createGain(); m.gain.value = 0.11 / Math.sqrt(notes.length);
    for (const nn of notes) for (const det of [-14, 0, 13]) this.osc('sawtooth', hz(nn), t, t + dur + 0.5, det).connect(lp);
    lp.connect(m);
    this.route(m.connect(this.env(t, o.attack ?? 0.004, g, dur * 0.6, 0.5, 0.12, dur * 0.5)), { bus: o.bus ?? 'music', pan: o.pan, verb: o.verb ?? 0.3, delay: o.delay ?? 0.1 });
  }
  pad(t: number, notes: number[], dur: number, g = 1, o: Route & { cutoff?: number; attack?: number; release?: number } = {}) {
    const lp = this.filt('lowpass', o.cutoff ?? 1400, 0.7);
    const m = this.ctx.createGain(); m.gain.value = 0.07 / Math.sqrt(notes.length);
    notes.forEach((nn, i) => {
      for (const det of [-9, 8]) {
        const s = this.osc('sawtooth', hz(nn), t, t + dur + (o.release ?? 1) + 0.1, det);
        const p = this.ctx.createStereoPanner(); p.pan.value = (det > 0 ? 0.5 : -0.5) * (i % 2 ? 1 : 0.6);
        s.connect(p).connect(lp);
      }
    });
    lp.connect(m);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + (o.attack ?? 0.5));
    e.gain.setValueAtTime(g, t + dur);
    e.gain.linearRampToValueAtTime(0, t + dur + (o.release ?? 1));
    this.route(m.connect(e), { bus: o.bus ?? 'music', verb: o.verb ?? 0.45, pan: o.pan });
  }
  /** FM bell. */
  bell(t: number, midi: number, g = 1, o: Route & { decay?: number; ratio?: number } = {}) {
    const f = hz(midi);
    const car = this.osc('sine', f, t, t + (o.decay ?? 1.4) + 0.2);
    const mod = this.osc('sine', Math.min(18000, f * (o.ratio ?? 3.5)), t, t + (o.decay ?? 1.4) + 0.2);
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(f * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.6);
    mod.connect(idx).connect(car.frequency);
    this.route(car.connect(this.env(t, 0.002, 0.32 * g, o.decay ?? 1.4)), { bus: o.bus ?? 'music', pan: o.pan, verb: o.verb ?? 0.4, delay: o.delay ?? 0.2 });
  }

  // ---------------------------------------------------------------- sound design
  /** Deep hit: sub drop + filtered crash. */
  boom(t: number, g = 1, o: { verb?: number } = {}) {
    const s = this.osc('sine', 80, t, t + 1.8);
    s.frequency.setValueAtTime(90, t); s.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    this.route(s.connect(this.env(t, 0.003, 1.0 * g, 1.4)), { bus: 'sfx' });
    const nz = this.noiseSrc(t, 1.6);
    const lp = this.filt('lowpass', 5000, 0.5);
    lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    this.route(nz.connect(lp).connect(this.env(t, 0.002, 0.5 * g, 1.2)), { bus: 'sfx', verb: o.verb ?? 0.5 });
    this.duck(t, 0.85, 0.4);
  }
  /** Soft landing (fabric on floor). */
  thud(t: number, g = 1, pitch = 1, pan = 0) {
    const s = this.osc('sine', 100 * pitch, t, t + 0.4);
    s.frequency.setValueAtTime(120 * pitch, t); s.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.12);
    this.route(s.connect(this.env(t, 0.002, 0.8 * g, 0.22)), { bus: 'sfx', pan });
    const nz = this.noiseSrc(t, 0.2);
    this.route(nz.connect(this.filt('lowpass', 900 * pitch, 0.7)).connect(this.env(t, 0.002, 0.55 * g, 0.09)), { bus: 'sfx', pan, verb: 0.08 });
  }
  /** UI tick (counter). */
  tick(t: number, g = 1, f = 2600, pan = 0) {
    const s = this.osc('sine', f, t, t + 0.08);
    this.route(s.connect(this.env(t, 0.0005, 0.28 * g, 0.035)), { bus: 'sfx', pan });
  }
  /** Bubbly pop. */
  pop(t: number, g = 1, pitch = 1, pan = 0) {
    const s = this.osc('sine', 500 * pitch, t, t + 0.15);
    s.frequency.setValueAtTime(420 * pitch, t); s.frequency.exponentialRampToValueAtTime(1300 * pitch, t + 0.05);
    this.route(s.connect(this.env(t, 0.001, 0.35 * g, 0.07)), { bus: 'sfx', pan, verb: 0.15 });
  }
  /** A keyboard key (typing). */
  key(t: number, g = 1, pan = 0) {
    const nz = this.noiseSrc(t, 0.05);
    this.route(nz.connect(this.filt('bandpass', 3200 + this.rnd() * 800, 2.2)).connect(this.env(t, 0.0005, 0.35 * g, 0.018)), { bus: 'sfx', pan });
    const s = this.osc('sine', 170 + this.rnd() * 30, t, t + 0.06);
    this.route(s.connect(this.env(t, 0.001, 0.18 * g, 0.03)), { bus: 'sfx', pan });
  }
  /** Sharp snap (a zip snapping shut). */
  snap(t: number, g = 1, pan = 0) {
    const nz = this.noiseSrc(t, 0.05);
    this.route(nz.connect(this.filt('highpass', 1800, 0.7)).connect(this.env(t, 0.0003, 0.8 * g, 0.018)), { bus: 'sfx', pan, verb: 0.12 });
    const s = this.osc('triangle', 1100, t, t + 0.1);
    s.frequency.setValueAtTime(1400, t); s.frequency.exponentialRampToValueAtTime(500, t + 0.04);
    this.route(s.connect(this.env(t, 0.0005, 0.3 * g, 0.04)), { bus: 'sfx', pan });
  }
  /** Air movement. `dir` +1 rising, −1 falling. */
  whoosh(t: number, dur: number, g = 1, o: { from?: number; to?: number; panFrom?: number; panTo?: number } = {}) {
    const nz = this.noiseSrc(t, dur + 0.1);
    const bp = this.filt('bandpass', 600, 1.1);
    bp.frequency.setValueAtTime(o.from ?? 350, t);
    bp.frequency.exponentialRampToValueAtTime(o.to ?? 2800, t + dur * 0.65);
    bp.frequency.exponentialRampToValueAtTime((o.from ?? 350) * 1.2, t + dur);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.7 * g, t + dur * 0.6);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.setValueAtTime(o.panFrom ?? -0.3, t);
    p.pan.linearRampToValueAtTime(o.panTo ?? 0.3, t + dur);
    nz.connect(bp).connect(e).connect(p);
    this.route(p, { bus: 'sfx', verb: 0.2 });
  }
  /** Noise + pitch riser into t1. */
  riser(t0: number, t1: number, g = 1) {
    const d = t1 - t0;
    const nz = this.noiseSrc(t0, d + 0.05);
    const hp = this.filt('bandpass', 400, 1.5);
    hp.frequency.setValueAtTime(300, t0); hp.frequency.exponentialRampToValueAtTime(7000, t1);
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.5 * g, t1); e.gain.setValueAtTime(0, t1 + 0.005);
    this.route(nz.connect(hp).connect(e), { bus: 'sfx', verb: 0.3 });
    const s = this.osc('sawtooth', 200, t0, t1 + 0.01);
    s.frequency.setValueAtTime(180, t0); s.frequency.exponentialRampToValueAtTime(1400, t1);
    const lp = this.filt('lowpass', 2000, 2);
    const e2 = this.ctx.createGain();
    e2.gain.setValueAtTime(0.0001, t0); e2.gain.exponentialRampToValueAtTime(0.08 * g, t1); e2.gain.setValueAtTime(0, t1 + 0.005);
    this.route(s.connect(lp).connect(e2), { bus: 'sfx', verb: 0.3 });
  }
  /** Sparkle: a cluster of high bell pings. */
  sparkle(t: number, dur = 0.6, g = 1, root = n('C6')) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const k = 7;
    for (let i = 0; i < k; i++) this.bell(t + (i / k) * dur, root + scale[Math.floor(this.rnd() * scale.length)]!, 0.4 * g, { bus: 'sfx', pan: this.rnd() * 1.6 - 0.8, decay: 0.7, ratio: 5.1, verb: 0.5 });
  }
  /** Glassy crackle (a silhouette cracking with light). */
  crack(t: number, dur = 0.35, g = 1) {
    const k = 9;
    for (let i = 0; i < k; i++) {
      const tt = t + dur * (i / k) ** 1.6;
      const nz = this.noiseSrc(tt, 0.06);
      this.route(nz.connect(this.filt('bandpass', 2500 + this.rnd() * 5000, 3)).connect(this.env(tt, 0.0003, (0.5 + this.rnd() * 0.5) * g, 0.03)), { bus: 'sfx', pan: this.rnd() * 1.2 - 0.6, verb: 0.3 });
    }
  }
  /** Mechanical clock tick-tock. */
  clockTick(t: number, g = 1, hi = true) {
    const nz = this.noiseSrc(t, 0.04);
    this.route(nz.connect(this.filt('bandpass', hi ? 4200 : 2800, 6)).connect(this.env(t, 0.0003, 0.6 * g, 0.022)), { bus: 'sfx', pan: hi ? 0.15 : -0.15, verb: 0.12 });
  }

  /**
   * A zipper. `pos(u)` is the pull's position 0..1 along its track at normalised time u ∈ [0, 1] over
   * [t0, t1]; `teeth` teeth pass the slider over the full track. `stop` adds the end clack.
   */
  zip(t0: number, t1: number, pos: (u: number) => number, teeth: number, g = 1, o: Route & { stop?: boolean; bright?: number } = {}) {
    const dur = t1 - t0;
    const len = Math.ceil((dur + 0.12) * SR);
    const L = new Float32Array(len), R = new Float32Array(len);
    const r = mulberry(Math.floor(t0 * 1000) + teeth);
    // tooth crossing times (and speed there)
    const N = 1200;
    let prev = pos(0);
    const br = o.bright ?? 1;
    let fricLP = 0;
    for (let i = 1; i <= N; i++) {
      const u = i / N, p = pos(u);
      const speed = Math.abs(p - prev) * N / dur; // track lengths per second
      const k0 = Math.floor(Math.min(prev, p) * teeth), k1 = Math.floor(Math.max(prev, p) * teeth);
      for (let k = k0 + 1; k <= k1; k++) {
        const frac = (k / teeth - prev) / ((p - prev) || 1);
        const ts = ((i - 1 + clamp(frac)) / N) * dur;
        this.zipClick(L, R, Math.floor(ts * SR), g * (0.35 + 0.65 * clamp(speed * 0.9)) * (0.8 + 0.4 * r()), r, br);
      }
      // friction noise between samples of this step, following the speed
      const s0 = Math.floor(((i - 1) / N) * dur * SR), s1 = Math.floor((i / N) * dur * SR);
      const amp = 0.06 * g * clamp(speed * 0.8);
      for (let s = s0; s < s1; s++) {
        const w = r() * 2 - 1;
        fricLP += (w - fricLP) * 0.35;
        const v = (w - fricLP) * amp;
        L[s]! += v; R[s]! += v;
      }
      prev = p;
    }
    if (o.stop !== false) {
      const s = Math.floor(dur * SR);
      this.zipClick(L, R, s, 1.4 * g, r, 0.55, 0.012);
      // body thump of the slider stopping
      for (let i = 0; i < 0.06 * SR && s + i < len; i++) { const v = Math.sin((2 * Math.PI * 190 * i) / SR) * Math.exp(-i / (0.012 * SR)) * 0.35 * g; L[s + i]! += v; R[s + i]! += v; }
    }
    this.sfxBufs.push({ t: t0, data: [L, R], route: { bus: 'sfx', pan: o.pan, verb: o.verb ?? 0.12 } });
  }
  private zipClick(L: Float32Array, R: Float32Array, s: number, a: number, r: () => number, bright: number, ringDecay = 0.0016) {
    const f = (2600 + r() * 1800) * bright;
    const fb = 420 + r() * 160;
    const n = Math.floor(0.012 * SR);
    const pan = (r() - 0.5) * 0.3;
    for (let i = 0; i < n && s + i < L.length; i++) {
      const t = i / SR;
      const v = a * ((r() * 2 - 1) * Math.exp(-t / 0.0005) * 0.7 + Math.sin(2 * Math.PI * f * t) * Math.exp(-t / ringDecay) * 0.45 + Math.sin(2 * Math.PI * fb * t) * Math.exp(-t / 0.003) * 0.25);
      L[s + i]! += v * (1 - pan); R[s + i]! += v * (1 + pan);
    }
  }
  /** The signature zip: the brand's sound logo (fixed length and shape). */
  signatureZip(t: number, g = 1) {
    this.zip(t, t + SIGNATURE_ZIP, (u) => ease.inOutCubic(u) , 64, g, { stop: true });
  }

  // ---------------------------------------------------------------- render
  async render(): Promise<AudioBuffer> {
    const ctx = this.ctx, D = this.duration;
    // sfx buffers
    for (const b of this.sfxBufs) {
      const buf = ctx.createBuffer(2, b.data[0]!.length, SR);
      buf.copyToChannel(b.data[0]! as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(b.data[1]! as Float32Array<ArrayBuffer>, 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.start(Math.max(0, b.t));
      this.route(src, b.route);
    }
    // sidechain curve
    const K = 400, n = Math.ceil(D * K) + 1;
    const curve = new Float32Array(n).fill(1);
    for (const [t, depth, rel] of this.ducks) {
      for (let i = Math.max(0, Math.floor(t * K)); i < n; i++) {
        const age = i / K - t;
        if (age < 0) continue;
        const v = 1 - depth * Math.exp(-age / rel);
        if (age > rel * 6) break;
        curve[i] = Math.min(curve[i]!, v);
      }
    }
    // smooth the attack a hair to avoid clicks
    for (let i = 1; i < n; i++) if (curve[i]! < curve[i - 1]! - 0.2) curve[i] = curve[i - 1]! - 0.2;
    this.musicDuck.gain.setValueCurveAtTime(curve, 0, D);
    // gate + filter automation
    const G = this.musicGate.gain;
    G.setValueAtTime(1, 0);
    let lastG = 1;
    for (const [t, v, ramp] of [...this.gates].sort((a, b) => a[0] - b[0])) { G.setValueAtTime(lastG, t); G.linearRampToValueAtTime(v, t + ramp); lastG = v; }
    const F = this.musicLP.frequency;
    F.setValueAtTime(20000, 0);
    let last = 20000;
    for (const [t, f, ramp] of [...this.lps].sort((a, b) => a[0] - b[0])) { F.setValueAtTime(last, t); F.exponentialRampToValueAtTime(f, t + ramp); last = f; }
    const out = await ctx.startRendering();
    // normalise to −1 dBFS
    let peak = 0;
    for (let ch = 0; ch < out.numberOfChannels; ch++) { const d = out.getChannelData(ch); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!)); }
    const k = peak > 0 ? 0.89 / peak : 1;
    for (let ch = 0; ch < out.numberOfChannels; ch++) { const d = out.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i]! *= k; }
    return out;
  }
}

/** Length of the signature zip (seconds). */
export const SIGNATURE_ZIP = 0.62;

/** 16-bit PCM WAV of an AudioBuffer. */
export function toWav(b: AudioBuffer) {
  const ch = b.numberOfChannels, len = b.length, bytes = 44 + len * ch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = [...Array(ch)].map((_, i) => b.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { v.setInt16(o, Math.max(-1, Math.min(1, data[c]![i]!)) * 32767, true); o += 2; }
  return new Uint8Array(v.buffer);
}

export { lerp };
