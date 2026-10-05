import { LruCache } from './lru';

export const DECODE_TIMEOUT_MS = 400;
/** At most this many decoded Stimpie images are referenced (builder.md 4.4: selected, +/-1, previous, one spare). */
export const MAX_DECODED_IMAGES = 5;

export type DecodeStatus = 'decoded' | 'timeout' | 'error';

export interface DecodeResult {
  status: DecodeStatus;
  img: HTMLImageElement | null;
}

/**
 * Decode an image off screen. Resolves `decoded` once `img.decode()` settles, `timeout` after `timeoutMs`
 * (the caller then swaps without animation instead of stalling), `error` when the image cannot load.
 */
export function decodeImage(
  src: string,
  timeoutMs: number = DECODE_TIMEOUT_MS,
  make: () => HTMLImageElement = () => new Image(),
): Promise<DecodeResult> {
  return new Promise((resolve) => {
    let settled = false;
    const img = make();
    const finish = (status: DecodeStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, img: status === 'error' ? null : img });
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    img.decoding = 'async';
    img.src = src;
    if (typeof img.decode === 'function') {
      img.decode().then(
        () => finish('decoded'),
        () => finish('error'),
      );
    } else {
      img.onload = () => finish('decoded');
      img.onerror = () => finish('error');
    }
  });
}

/** Bounded set of decoded images (the browser keeps the decoded bitmap alive while we hold the element). */
export class DecodedImageCache {
  private readonly lru: LruCache<string, HTMLImageElement>;
  private readonly inflight = new Map<string, Promise<DecodeResult>>();

  constructor(
    max: number = MAX_DECODED_IMAGES,
    private readonly make?: () => HTMLImageElement,
  ) {
    this.lru = new LruCache(max);
  }

  get size(): number {
    return this.lru.size;
  }

  has(src: string): boolean {
    return this.lru.has(src);
  }

  keys(): string[] {
    return this.lru.keys();
  }

  /** Decode (or reuse) `src`; the entry becomes most recently used. */
  load(src: string, timeoutMs: number = DECODE_TIMEOUT_MS): Promise<DecodeResult> {
    const hit = this.lru.get(src);
    if (hit) return Promise.resolve({ status: 'decoded', img: hit });
    const running = this.inflight.get(src);
    if (running) return running;
    const p = decodeImage(src, timeoutMs, this.make).then((r) => {
      this.inflight.delete(src);
      if (r.status === 'decoded' && r.img) this.lru.set(src, r.img);
      return r;
    });
    this.inflight.set(src, p);
    return p;
  }

  /** Decode without keeping the image (hoodie photos: they are not part of the 5-image budget). */
  decodeOnly(src: string, timeoutMs: number = DECODE_TIMEOUT_MS): Promise<DecodeResult> {
    return decodeImage(src, timeoutMs, this.make);
  }

  clear(): void {
    this.lru.clear();
    this.inflight.clear();
  }
}

/** Run `fn` when the browser is idle (fallback: 200 ms timer). Returns a cancel function. */
export function whenIdle(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  if (typeof w.requestIdleCallback === 'function') {
    const h = w.requestIdleCallback(fn, { timeout: 1500 });
    return () => w.cancelIdleCallback?.(h);
  }
  const t = setTimeout(fn, 200);
  return () => clearTimeout(t);
}
