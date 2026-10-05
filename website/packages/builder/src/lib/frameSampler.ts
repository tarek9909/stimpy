/** Frame-time sampling (builder.md 6.3). */

export const SAMPLE_MIN_FRAMES = 60;
export const SAMPLE_MIN_MS = 1500;
export const SAMPLE_SKIP_FRAMES = 5;

export interface FrameStats {
  count: number;
  median: number;
  p95: number;
}

export type FrameVerdict = 'stay' | 'drop-tier' | 'switch-2d';

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx] as number;
}

export function frameStats(deltas: readonly number[]): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  return { count: sorted.length, median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95) };
}

/**
 * Collects frame deltas (ms). The first 5 frames (shader compile) are ignored; the window ends after 60 counted
 * frames AND 1.5 s of counted time, whichever is later.
 */
export class FrameTimeSampler {
  private readonly deltas: number[] = [];
  private seen = 0;
  private elapsed = 0;

  constructor(
    private readonly minFrames = SAMPLE_MIN_FRAMES,
    private readonly minMs = SAMPLE_MIN_MS,
    private readonly skip = SAMPLE_SKIP_FRAMES,
  ) {}

  /** Add one frame delta. Returns true once the window is complete. */
  push(deltaMs: number): boolean {
    this.seen += 1;
    if (this.seen <= this.skip) return false;
    this.deltas.push(deltaMs);
    this.elapsed += deltaMs;
    return this.done;
  }

  get done(): boolean {
    return this.deltas.length >= this.minFrames && this.elapsed >= this.minMs;
  }

  stats(): FrameStats {
    return frameStats(this.deltas);
  }

  reset(): void {
    this.deltas.length = 0;
    this.seen = 0;
    this.elapsed = 0;
  }
}

/**
 * Median <= 20 ms stays. 20..33 ms drops one DPR tier (once), then samples again. Above 33 ms median or above
 * 50 ms p95 after the drop (or when no tier is left to drop) switches to 2D.
 * `afterDrop` is true for the second sampling window.
 */
export function frameVerdict(stats: FrameStats, opts: { canDropTier: boolean; afterDrop: boolean }): FrameVerdict {
  const { median, p95 } = stats;
  if (opts.afterDrop || !opts.canDropTier) {
    if (median > 33 || p95 > 50) return 'switch-2d';
    return 'stay';
  }
  if (median <= 20) return 'stay';
  return 'drop-tier';
}

/** Runtime tier drop for the DPR cap (builder.md 5.8). */
export function nextLowerTier(tier: 'high' | 'mid' | 'low'): 'mid' | 'low' | null {
  if (tier === 'high') return 'mid';
  if (tier === 'mid') return 'low';
  return null;
}
