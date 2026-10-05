import { describe, expect, it, vi } from 'vitest';
import {
  COVER_TOLERANCE,
  DecodedImageCache,
  FrameTimeSampler,
  LruCache,
  SwapMonitor,
  buildShareQuery,
  buildShareUrl,
  colorsForView,
  coverCrop,
  coverFitRect,
  cubicBezier,
  frameStats,
  frameVerdict,
  joinColors,
  parseShareParams,
  placementPx,
  placementStyle,
  popOffset,
  resolveColorForView,
  sampleFromTimestamps,
  stimpieBlockReason,
  stimpieTag,
  tintFor,
  textureUrlFor,
  usable2D,
  zipFrame,
  zipKeyframes,
  nextLowerTier,
} from '../src';
import { data, stimpie } from './fixtures';

describe('join: usable colours (builder.md 2.2)', () => {
  const d = data();
  it('joins options with config on colorId, ordered by position, and hides colours without a config entry', () => {
    const joined = joinColors(d.colors, d.config);
    expect(joined.map((c) => c.id)).toEqual([1, 2, 3]); // colour 4 (Coral) has no config entry: not shown
    expect(joined[0]?.name).toBe('Black');
    expect(joined[1]?.photo).toBe('http://api.test/uploads/cream-photo.webp');
  });
  it('2D usable needs image AND placement; 3D usable needs a model', () => {
    const joined = joinColors(d.colors, d.config);
    expect(joined.filter(usable2D).map((c) => c.id)).toEqual([1, 2]);
    expect(colorsForView(joined, '2d', true).map((c) => c.id)).toEqual([1, 2]);
    expect(colorsForView(joined, '3d', true).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(colorsForView(joined, '3d', false)).toEqual([]);
  });
  it('moves the selection to the first usable colour when the view cannot render it', () => {
    const joined = joinColors(d.colors, d.config);
    expect(resolveColorForView(joined, 3, '2d', true)).toBe(1);
    expect(resolveColorForView(joined, 2, '2d', true)).toBe(2);
    expect(resolveColorForView(joined, null, '3d', true)).toBe(1);
    expect(resolveColorForView([], 1, '2d', true)).toBeNull();
  });
  it('tint falls back to Color.hex; texture override falls back to the artwork', () => {
    const joined = joinColors(d.colors, d.config);
    expect(tintFor(joined[0]!)).toBe('#111111');
    expect(tintFor(joined[1]!)).toBe('#FFF4E6');
    expect(textureUrlFor(stimpie(2), d.config.stimpieTextures)).toBe('http://api.test/uploads/tex-2.webp');
    expect(textureUrlFor(stimpie(1), d.config.stimpieTextures)).toBe('http://api.test/uploads/art-1.webp');
  });
  it('tags and block reasons', () => {
    expect(stimpieTag(stimpie(1))).toBe('Core');
    expect(stimpieTag(stimpie(1, { type: 'LIMITED' }))).toBe('Limited');
    expect(stimpieTag(stimpie(1, { status: 'LOW' }))).toBe('Last few');
    expect(stimpieTag(stimpie(1, { status: 'SOLD_OUT', purchasable: false }))).toBe('Sold out');
    expect(stimpieBlockReason(stimpie(1, { status: 'UPCOMING', purchasable: false }))).toBe('Coming soon');
    expect(stimpieBlockReason(stimpie(1))).toBeNull();
  });
});

describe('placement maths (builder.md 4.2)', () => {
  it('panel is centred on x,y with height = width / 0.64', () => {
    const p = placementPx({ x: 0.5, y: 0.46, width: 0.36, rotation: 10 }, 500, 625);
    expect(p.panelWidthPx).toBeCloseTo(180);
    expect(p.panelHeightPx).toBeCloseTo(281.25);
    expect(p.left).toBeCloseTo(250 - 90);
    expect(p.top).toBeCloseTo(625 * 0.46 - 281.25 / 2);
    expect(p.rotation).toBe(10);
  });
  it('CSS percentages express the same geometry (rotation clockwise about the centre)', () => {
    const s = placementStyle({ x: 0.5, y: 0.46, width: 0.36, rotation: 10 });
    expect(s).toEqual({ left: '50%', top: '46%', width: '36%', aspectRatio: '16 / 25', transform: 'translate(-50%, -50%) rotate(10deg)' });
  });
});

describe('cover-crop fit (builder.md 5.5 and 7.4)', () => {
  it('no fitting within 2%', () => {
    expect(coverCrop(800, 1250, 0.64).needed).toBe(false);
    expect(coverCrop(810, 1250, 0.64).needed).toBe(false); // 0.648 is 1.25% off
    expect(COVER_TOLERANCE).toBe(0.02);
  });
  it('wider art is cropped left/right and centred', () => {
    const c = coverCrop(1000, 1250, 0.64); // 0.8 aspect
    expect(c.needed).toBe(true);
    expect(c.repeatX).toBeCloseTo(0.8);
    expect(c.repeatY).toBe(1);
    expect(c.offsetX).toBeCloseTo(0.1);
  });
  it('taller art is cropped top/bottom and centred', () => {
    const c = coverCrop(640, 1600, 0.64); // 0.4 aspect
    expect(c.repeatY).toBeCloseTo(0.625);
    expect(c.offsetY).toBeCloseTo(0.1875);
    expect(c.repeatX).toBe(1);
  });
  it('unknown sizes need no fitting; 2D cover rect never leaves a gap', () => {
    expect(coverCrop(0, 0, 0.64).needed).toBe(false);
    const r = coverFitRect(1000, 1000, 160, 250);
    expect(r.h).toBeCloseTo(250);
    expect(r.w).toBeCloseTo(250);
    expect(r.x).toBeCloseTo(-45);
  });
});

describe('share link (builder.md 11)', () => {
  it('parses valid values and ignores invalid ones without error', () => {
    expect(parseShareParams(new URLSearchParams('color=2&stimpie=the-void&pack=hoodie-2&stimpie2=moth&view=3D'))).toEqual({
      colorId: 2,
      stimpie: 'the-void',
      stimpie2: 'moth',
      pack: 'hoodie-2',
      view: '3d',
    });
    expect(parseShareParams({ color: 'abc', stimpie: '../x', view: 'vr' })).toEqual({ colorId: null, stimpie: null, stimpie2: null, pack: null, view: null });
    expect(parseShareParams({ color: '0' }).colorId).toBeNull();
    expect(parseShareParams({ color: ['5', '6'] }).colorId).toBe(5);
  });
  it('builds a stable query and URL', () => {
    expect(buildShareQuery({ colorId: 2, stimpie: 'the-void', pack: 'hoodie-2' })).toBe('color=2&stimpie=the-void&pack=hoodie-2');
    expect(buildShareUrl('https://x.test/builder', { colorId: 2, stimpie: 'a', stimpie2: 'b', pack: 'p' })).toBe(
      'https://x.test/builder?color=2&stimpie=a&pack=p&stimpie2=b',
    );
    expect(buildShareUrl('https://x.test/builder', { colorId: null, stimpie: null })).toBe('https://x.test/builder');
  });
});

describe('texture LRU (builder.md 5.5)', () => {
  it('evicts the least recently used and disposes it', () => {
    const disposed: string[] = [];
    const lru = new LruCache<number, string>(4, (v) => disposed.push(v));
    [1, 2, 3, 4].forEach((n) => lru.set(n, `t${n}`));
    lru.get(1); // 1 is now most recent
    lru.set(5, 't5');
    expect(disposed).toEqual(['t2']);
    expect(lru.keys()).toEqual([3, 4, 1, 5]);
    expect(lru.size).toBe(4);
  });
  it('never evicts a pinned entry, even over capacity', () => {
    const disposed: string[] = [];
    const lru = new LruCache<number, string>(2, (v) => disposed.push(v));
    lru.set(1, 'a');
    lru.set(2, 'b');
    lru.setPinned([1, 2]);
    lru.set(3, 'c');
    expect(disposed).toEqual([]);
    expect(lru.size).toBe(3);
    lru.setPinned([3]);
    expect(disposed).toEqual(['a']); // back within capacity (2): only the oldest unpinned goes
    expect(lru.keys()).toEqual([2, 3]);
  });
  it('replacing a key disposes the old value; clear disposes everything', () => {
    const disposed: string[] = [];
    const lru = new LruCache<number, string>(4, (v) => disposed.push(v));
    lru.set(1, 'a');
    lru.set(1, 'a2');
    expect(disposed).toEqual(['a']);
    lru.clear();
    expect(disposed).toEqual(['a', 'a2']);
    expect(lru.size).toBe(0);
  });
});

describe('frame-time sampler (builder.md 6.3)', () => {
  it('skips the first 5 frames and needs 60 frames AND 1.5 s', () => {
    const s = new FrameTimeSampler();
    for (let i = 0; i < 5; i++) expect(s.push(500)).toBe(false); // shader compile frames are ignored
    let done = false;
    for (let i = 0; i < 59; i++) done = s.push(16.7);
    expect(done).toBe(false); // 59 frames
    expect(s.push(16.7)).toBe(false); // 60 frames but only ~1.0 s
    for (let i = 0; i < 40; i++) done = s.push(16.7);
    expect(done).toBe(true);
    expect(s.stats().median).toBeCloseTo(16.7);
    expect(s.stats().count).toBeGreaterThanOrEqual(60);
  });
  it('slow frames reach 1.5 s before 60 frames never ends the window early', () => {
    const s = new FrameTimeSampler();
    for (let i = 0; i < 5; i++) s.push(10);
    for (let i = 0; i < 30; i++) s.push(100); // 3 s but only 30 frames
    expect(s.done).toBe(false);
  });
  it('median and p95', () => {
    const st = frameStats([10, 10, 10, 10, 10, 10, 10, 10, 10, 90]);
    expect(st.median).toBe(10);
    expect(st.p95).toBe(90);
  });
  it('verdicts: <=20 stay; 20-33 drop a tier once; >33 or p95>50 after the drop switches to 2D', () => {
    expect(frameVerdict({ count: 60, median: 16, p95: 20 }, { canDropTier: true, afterDrop: false })).toBe('stay');
    expect(frameVerdict({ count: 60, median: 20, p95: 30 }, { canDropTier: true, afterDrop: false })).toBe('stay');
    expect(frameVerdict({ count: 60, median: 25, p95: 30 }, { canDropTier: true, afterDrop: false })).toBe('drop-tier');
    expect(frameVerdict({ count: 60, median: 40, p95: 60 }, { canDropTier: true, afterDrop: false })).toBe('drop-tier');
    expect(frameVerdict({ count: 60, median: 25, p95: 30 }, { canDropTier: true, afterDrop: true })).toBe('stay');
    expect(frameVerdict({ count: 60, median: 34, p95: 40 }, { canDropTier: true, afterDrop: true })).toBe('switch-2d');
    expect(frameVerdict({ count: 60, median: 25, p95: 51 }, { canDropTier: true, afterDrop: true })).toBe('switch-2d');
    expect(frameVerdict({ count: 60, median: 40, p95: 45 }, { canDropTier: false, afterDrop: false })).toBe('switch-2d');
  });
  it('tier ladder', () => {
    expect(nextLowerTier('high')).toBe('mid');
    expect(nextLowerTier('mid')).toBe('low');
    expect(nextLowerTier('low')).toBeNull();
  });
});

describe('zip timeline frame by frame (builder.md 4.3)', () => {
  const at = (ms: number) => zipFrame(ms);
  it('f0: art hidden, line transparent', () => {
    const f = at(0);
    expect(f.clipBottomPct).toBe(100);
    expect(f.lineOpacity).toBe(0);
    expect(f.progress).toBe(0);
    expect(f.scale).toBe(1);
  });
  it('0-50 ms: only the line fades in, nothing else moves', () => {
    const f = at(25);
    expect(f.lineOpacity).toBeCloseTo(0.5);
    expect(f.progress).toBe(0);
    expect(f.clipBottomPct).toBe(100);
    expect(at(50).lineOpacity).toBe(1);
  });
  it('50-400 ms: line travels top to bottom, reveal in lock-step, eased', () => {
    const mid = at(225);
    expect(mid.progress).toBeCloseTo(0.5, 2); // symmetric ease-in-out
    expect(mid.clipBottomPct).toBeCloseTo(50, 0);
    expect(at(120).progress).toBeLessThan(0.2);
    expect(at(330).progress).toBeGreaterThan(0.8);
    for (let t = 50; t < 400; t += 10) expect(at(t + 10).progress).toBeGreaterThanOrEqual(at(t).progress);
    expect(at(400).progress).toBe(1);
    expect(at(400).clipBottomPct).toBe(0);
  });
  it('300-450 ms settle 1 -> 1.012 -> 1, line fades out 400-450', () => {
    expect(at(300).scale).toBe(1);
    expect(at(375).scale).toBeCloseTo(1.012, 4);
    expect(at(450).scale).toBe(1);
    expect(at(425).lineOpacity).toBeCloseTo(0.5);
    expect(at(450).lineOpacity).toBe(0);
  });
  it('samples every frame of the 27-frame timeline without leaving 0..1', () => {
    for (let f = 0; f <= 27; f++) {
      const r = at((f * 1000) / 60);
      expect(r.progress).toBeGreaterThanOrEqual(0);
      expect(r.progress).toBeLessThanOrEqual(1);
      expect(r.scale).toBeGreaterThanOrEqual(1);
      expect(r.scale).toBeLessThanOrEqual(1.0121);
    }
  });
  it('keyframes animate only transform, opacity and clip-path', () => {
    const k = zipKeyframes(300);
    const props = new Set<string>();
    for (const list of [k.clip, k.line, k.wrapper]) for (const kf of list) Object.keys(kf).forEach((p) => props.add(p));
    for (const p of props) expect(['offset', 'easing', 'clipPath', 'opacity', 'transform']).toContain(p);
    expect(k.clip[0]?.clipPath).toBe('inset(0 0 100% 0)');
    expect(k.clip.at(-1)?.clipPath).toBe('inset(0 0 0% 0)');
    expect(k.line[2]?.transform).toBe('translateY(300px)');
    expect(k.wrapper.some((f) => f.transform === 'scale(1.012)')).toBe(true);
  });
  it('3D pop-out is 0 -> 3 mm -> 0', () => {
    expect(popOffset(0)).toBe(0);
    expect(popOffset(225)).toBeCloseTo(0.003, 6);
    expect(popOffset(450)).toBeCloseTo(0, 6);
  });
  it('cubic-bezier matches the CSS curve at known points', () => {
    const e = cubicBezier(0.65, 0, 0.35, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeCloseTo(0.5, 3);
  });
});

describe('swap monitor (builder.md 4.4)', () => {
  it('two consecutive slow swaps degrade to the short cross-fade', () => {
    const m = new SwapMonitor();
    expect(m.record({ durationMs: 450, droppedFrames: 10, avgFps: 20 })).toBe(false);
    expect(m.record({ durationMs: 450, droppedFrames: 10, avgFps: 25 })).toBe(true);
    expect(m.isDegraded).toBe(true);
  });
  it('a fast swap in between resets the streak', () => {
    const m = new SwapMonitor();
    m.record({ durationMs: 450, droppedFrames: 10, avgFps: 20 });
    m.record({ durationMs: 450, droppedFrames: 0, avgFps: 60 });
    expect(m.record({ durationMs: 450, droppedFrames: 10, avgFps: 20 })).toBe(false);
  });
  it('reports the first swap and then 1 in 5', () => {
    const m = new SwapMonitor();
    const reported: number[] = [];
    for (let i = 1; i <= 11; i++) {
      m.record({ durationMs: 450, droppedFrames: 0, avgFps: 60 });
      if (m.shouldReport()) reported.push(i);
    }
    expect(reported).toEqual([1, 5, 10]);
  });
  it('turns rAF stamps into dropped frames and fps', () => {
    const s = sampleFromTimestamps([0, 16.7, 33.4, 83.4], 450); // last gap = 50 ms -> 2 dropped
    expect(s.droppedFrames).toBe(2);
    expect(s.avgFps).toBeLessThan(60);
  });
});

describe('decoded image cache (builder.md 4.4: at most 5 decoded images)', () => {
  function fakeImage(): HTMLImageElement {
    const img = { decoding: '', src: '', decode: () => Promise.resolve() } as unknown as HTMLImageElement;
    return img;
  }
  it('keeps at most 5 and reuses decoded entries', async () => {
    const made = vi.fn(fakeImage);
    const cache = new DecodedImageCache(5, made);
    for (let i = 0; i < 8; i++) await cache.load(`u${i}`);
    expect(cache.size).toBe(5);
    expect(cache.keys()).toEqual(['u3', 'u4', 'u5', 'u6', 'u7']);
    await cache.load('u7');
    expect(made).toHaveBeenCalledTimes(8);
  });
  it('times out when decode never settles, and reports errors', async () => {
    const never = () => ({ decoding: '', src: '', decode: () => new Promise(() => undefined) }) as unknown as HTMLImageElement;
    const cache = new DecodedImageCache(5, never);
    expect((await cache.load('slow', 20)).status).toBe('timeout');
    const bad = () => ({ decoding: '', src: '', decode: () => Promise.reject(new Error('x')) }) as unknown as HTMLImageElement;
    expect((await new DecodedImageCache(5, bad).load('bad')).status).toBe('error');
  });
});
