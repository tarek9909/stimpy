/** Swap frame-rate monitoring (builder.md 4.4): two consecutive slow swaps shorten the swap to a 200 ms cross-fade. */

export const SLOW_FPS = 30;
export const SLOW_SWAPS_TO_DEGRADE = 2;
const FRAME_MS = 1000 / 60;

export interface SwapSample {
  durationMs: number;
  /** Frames the browser failed to deliver at 60 fps during the swap. */
  droppedFrames: number;
  avgFps: number;
}

/** Turn rAF timestamps into a sample. */
export function sampleFromTimestamps(stamps: readonly number[], durationMs: number): SwapSample {
  if (stamps.length < 2) return { durationMs, droppedFrames: 0, avgFps: 60 };
  let dropped = 0;
  let total = 0;
  for (let i = 1; i < stamps.length; i++) {
    const d = (stamps[i] as number) - (stamps[i - 1] as number);
    total += d;
    dropped += Math.max(0, Math.round(d / FRAME_MS) - 1);
  }
  const avg = total / (stamps.length - 1);
  return { durationMs, droppedFrames: dropped, avgFps: avg > 0 ? 1000 / avg : 60 };
}

export class SwapMonitor {
  private streak = 0;
  private degraded = false;
  private swaps = 0;

  /** Record a finished swap; returns true when the rest of the session should use the short cross-fade. */
  record(sample: SwapSample): boolean {
    this.swaps += 1;
    if (sample.avgFps < SLOW_FPS) this.streak += 1;
    else this.streak = 0;
    if (this.streak >= SLOW_SWAPS_TO_DEGRADE) this.degraded = true;
    return this.degraded;
  }

  get isDegraded(): boolean {
    return this.degraded;
  }

  /** `builder_swap_done` is sampled: the first swap and then 1 in 5. */
  shouldReport(): boolean {
    return this.swaps === 1 || this.swaps % 5 === 0;
  }
}
