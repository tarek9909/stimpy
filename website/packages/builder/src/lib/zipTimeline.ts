/**
 * The zip-wipe timeline of builder.md 4.3, as pure functions. 2D turns it into Web Animations keyframes, 3D reads
 * the same numbers to drive the shader uniforms, tests sample it frame by frame.
 *
 *   0-50 ms     zip line fades in
 *   50-400 ms   line travels top to bottom, new art revealed above it (clip-path in lock-step)
 *   300-450 ms  settle: wrapper scales 1 -> 1.012 -> 1
 *   400-450 ms  zip line fades out
 */
export const ZIP_TOTAL_MS = 450;
export const ZIP_LINE_IN_MS = 50;
export const ZIP_WIPE_END_MS = 400;
export const ZIP_SETTLE_START_MS = 300;
export const ZIP_SETTLE_PEAK_MS = 375;
export const ZIP_SETTLE_SCALE = 1.012;
/** Shortened swap after two consecutive slow swaps (builder.md 4.4). */
export const CROSSFADE_MS = 200;
export const COLOR_FADE_MS = 150;
export const ZIP_EASING_CSS = 'cubic-bezier(0.65, 0, 0.35, 1)';
export const EASE_OUT_CSS = 'cubic-bezier(0, 0, 0.58, 1)';
/** Panel pop-out in 3D: 0 -> 3 mm -> 0. */
export const POP_METRES = 0.003;

/** Cubic-bezier easing as a function (Newton + bisection solve for x). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const zipEase = cubicBezier(0.65, 0, 0.35, 1);
export const easeOut = cubicBezier(0, 0, 0.58, 1);

export interface ZipFrame {
  /** Zip line opacity 0..1. */
  lineOpacity: number;
  /** Eased travel of the line and of the reveal, 0 (top) .. 1 (bottom). */
  progress: number;
  /** `inset(0 0 X% 0)` bottom inset of the new art, 100 -> 0. */
  clipBottomPct: number;
  /** Wrapper scale (settle). */
  scale: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** State of the swap at `tMs` since frame 0. */
export function zipFrame(tMs: number): ZipFrame {
  const t = Math.min(ZIP_TOTAL_MS, Math.max(0, tMs));
  let lineOpacity: number;
  if (t < ZIP_LINE_IN_MS) lineOpacity = t / ZIP_LINE_IN_MS;
  else if (t <= ZIP_WIPE_END_MS) lineOpacity = 1;
  else lineOpacity = 1 - (t - ZIP_WIPE_END_MS) / (ZIP_TOTAL_MS - ZIP_WIPE_END_MS);

  const progress = t <= ZIP_LINE_IN_MS ? 0 : t >= ZIP_WIPE_END_MS ? 1 : zipEase((t - ZIP_LINE_IN_MS) / (ZIP_WIPE_END_MS - ZIP_LINE_IN_MS));

  let scale = 1;
  if (t > ZIP_SETTLE_START_MS && t <= ZIP_SETTLE_PEAK_MS) {
    scale = 1 + (ZIP_SETTLE_SCALE - 1) * easeOut((t - ZIP_SETTLE_START_MS) / (ZIP_SETTLE_PEAK_MS - ZIP_SETTLE_START_MS));
  } else if (t > ZIP_SETTLE_PEAK_MS) {
    scale = 1 + (ZIP_SETTLE_SCALE - 1) * (1 - easeOut((t - ZIP_SETTLE_PEAK_MS) / (ZIP_TOTAL_MS - ZIP_SETTLE_PEAK_MS)));
  }
  return { lineOpacity: clamp01(lineOpacity), progress, clipBottomPct: (1 - progress) * 100, scale };
}

/** Pop-out in metres at `tMs` (0 -> 3 mm -> 0 over the swap). */
export function popOffset(tMs: number): number {
  const x = clamp01(tMs / ZIP_TOTAL_MS);
  return POP_METRES * Math.sin(Math.PI * x);
}

export interface ZipKeyframes {
  /** On the new art: clip-path reveal. */
  clip: Keyframe[];
  /** On the zip line: opacity and travel (px, measured at swap start). */
  line: Keyframe[];
  /** On the swap wrapper: settle scale. */
  wrapper: Keyframe[];
}

const off = (ms: number) => ms / ZIP_TOTAL_MS;

/** Web Animations keyframes for the 450 ms wipe. `panelHeightPx` is the measured wrapper height. */
export function zipKeyframes(panelHeightPx: number): ZipKeyframes {
  return {
    clip: [
      { offset: 0, clipPath: 'inset(0 0 100% 0)', easing: 'linear' },
      { offset: off(ZIP_LINE_IN_MS), clipPath: 'inset(0 0 100% 0)', easing: ZIP_EASING_CSS },
      { offset: off(ZIP_WIPE_END_MS), clipPath: 'inset(0 0 0% 0)', easing: 'linear' },
      { offset: 1, clipPath: 'inset(0 0 0% 0)' },
    ],
    line: [
      { offset: 0, opacity: 0, transform: 'translateY(0px)', easing: 'linear' },
      { offset: off(ZIP_LINE_IN_MS), opacity: 1, transform: 'translateY(0px)', easing: ZIP_EASING_CSS },
      { offset: off(ZIP_WIPE_END_MS), opacity: 1, transform: `translateY(${panelHeightPx}px)`, easing: 'linear' },
      { offset: 1, opacity: 0, transform: `translateY(${panelHeightPx}px)` },
    ],
    wrapper: [
      { offset: 0, transform: 'scale(1)', easing: 'linear' },
      { offset: off(ZIP_SETTLE_START_MS), transform: 'scale(1)', easing: EASE_OUT_CSS },
      { offset: off(ZIP_SETTLE_PEAK_MS), transform: `scale(${ZIP_SETTLE_SCALE})`, easing: EASE_OUT_CSS },
      { offset: 1, transform: 'scale(1)' },
    ],
  };
}
