import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuilderStage2D, DecodedImageCache, type Stage2DArt, type Stage2DColor } from '../src';

interface FakeAnim {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
  finish: () => void;
  finished: Promise<unknown>;
  cancel: () => void;
}

let animations: FakeAnim[] = [];

function installAnimate() {
  animations = [];
  Element.prototype.animate = function animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    let resolve!: () => void;
    let reject!: (e: unknown) => void;
    const finished = new Promise<unknown>((res, rej) => {
      resolve = () => res(undefined);
      reject = rej;
    });
    finished.catch(() => undefined);
    const a: FakeAnim = {
      keyframes,
      options,
      cancelled: false,
      finish: () => resolve(),
      finished,
      cancel: () => {
        a.cancelled = true;
        reject(new DOMException('cancel', 'AbortError'));
      },
    };
    animations.push(a);
    return a as unknown as Animation;
  } as typeof Element.prototype.animate;
}

const color = (key: number, extra: Partial<Stage2DColor> = {}): Stage2DColor => ({
  key,
  hoodieSrc: `http://api.test/h${key}.webp`,
  overlaySrc: null,
  placement: { x: 0.5, y: 0.46, width: 0.36, rotation: 10 },
  alt: `Colour ${key} Stimpy hoodie, back view`,
  ...extra,
});
const art = (key: number): Stage2DArt => ({ key, src: `http://api.test/a${key}.webp`, alt: `Art ${key} Stimpie` });

const fakeImg = () => ({ decoding: '', src: '', decode: () => Promise.resolve() }) as unknown as HTMLImageElement;
const makeCache = () => new DecodedImageCache(5, fakeImg);
const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
  });
};

beforeEach(() => installAnimate());
afterEach(() => {
  // @ts-expect-error restore jsdom default (no WAAPI)
  delete Element.prototype.animate;
});

describe('BuilderStage2D layers (builder.md 4.1)', () => {
  it('renders hoodie, panel, overlay and the Preview chip with the documented alt text', () => {
    render(<BuilderStage2D color={color(1, { overlaySrc: 'http://api.test/shade.webp' })} art={art(1)} priority cache={makeCache()} />);
    const hoodie = screen.getByAltText('Colour 1 Stimpy hoodie, back view');
    expect(hoodie).toHaveAttribute('data-layer', 'hoodie');
    expect(hoodie).toHaveAttribute('fetchpriority', 'high');
    expect(hoodie).toHaveAttribute('width', '1000');
    expect(hoodie).toHaveAttribute('height', '1250');
    expect(screen.getByAltText('Art 1 Stimpie')).toHaveAttribute('data-layer', 'stimpie-new');
    expect(document.querySelector('[data-layer="overlay"]')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(document.querySelector('[data-layer="zip-line"]')).toBeNull(); // only during a swap
  });
  it('the overlay is only drawn where one is set (test 27f)', () => {
    const { unmount } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={makeCache()} />);
    expect(document.querySelector('[data-layer="overlay"]')).toBeNull();
    unmount();
    render(<BuilderStage2D color={color(2, { overlaySrc: 'x.webp' })} art={art(1)} cache={makeCache()} />);
    expect(document.querySelector('[data-layer="overlay"]')).toBeInTheDocument();
  });
  it('placement: centred on x,y, 36% wide, aspect 16/25, rotated 10 degrees clockwise (test 27e)', () => {
    render(<BuilderStage2D color={color(1)} art={art(1)} cache={makeCache()} />);
    const panel = document.querySelector('[data-layer="panel"]') as HTMLElement;
    expect(panel.style.left).toBe('50%');
    expect(panel.style.top).toBe('46%');
    expect(panel.style.width).toBe('36%');
    expect(panel.style.aspectRatio).toMatch(/16\s*\/\s*25/);
    expect(panel.style.transform).toBe('translate(-50%, -50%) rotate(10deg)');
  });
  it('reserves space from the first byte (aspect-ratio 4 / 5, CLS 0) and non-priority images are lazy', () => {
    render(<BuilderStage2D color={color(1)} art={art(1)} cache={makeCache()} />);
    const stage = document.querySelector('[data-builder-stage="2d"]') as HTMLElement;
    expect(stage.style.aspectRatio).toMatch(/4\s*\/\s*5/);
    expect(screen.getByAltText('Colour 1 Stimpy hoodie, back view')).toHaveAttribute('loading', 'lazy');
  });
  it('a colour without a 2D image shows an empty stage, not an error', () => {
    render(<BuilderStage2D color={color(1, { hoodieSrc: null, placement: null })} art={art(1)} cache={makeCache()} />);
    expect(document.querySelector('[data-layer="hoodie"]')).toBeNull();
    expect(document.querySelector('[data-layer="panel"]')).toBeNull();
  });
});

describe('BuilderStage2D swap (builder.md 4.3)', () => {
  it('mounts the new art above the old one, the outgoing image is hidden from assistive tech, and the zip line exists', async () => {
    const cache = makeCache();
    const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} />);
    rerender(<BuilderStage2D color={color(1)} art={art(2)} cache={cache} />);
    await flush();
    const old = document.querySelector('[data-layer="stimpie-old"]') as HTMLElement;
    expect(old).toHaveAttribute('alt', '');
    expect(old).toHaveAttribute('aria-hidden', 'true');
    expect(old).toHaveAttribute('src', 'http://api.test/a1.webp');
    expect(screen.getByAltText('Art 2 Stimpie')).toBeInTheDocument();
    expect(document.querySelector('[data-layer="zip-line"]')).toBeInTheDocument();
    // three animations: clip-path reveal, zip line, settle scale; 450 ms
    expect(animations).toHaveLength(3);
    expect(animations.every((a) => a.options.duration === 450)).toBe(true);
    expect(animations[0]?.keyframes[0]).toMatchObject({ clipPath: 'inset(0 0 100% 0)' });
    expect(animations[1]?.keyframes.map((k) => k.opacity)).toEqual([0, 1, 1, 0]);
    expect(animations[2]?.keyframes.some((k) => k.transform === 'scale(1.012)')).toBe(true);
    // will-change only during the swap
    expect((document.querySelector('[data-layer="swap"]') as HTMLElement).style.willChange).toBe('transform, clip-path');
    await act(async () => animations.forEach((a) => a.finish()));
    await flush();
    expect(document.querySelector('[data-layer="stimpie-old"]')).toBeNull();
    expect(document.querySelector('[data-layer="zip-line"]')).toBeNull();
    expect((document.querySelector('[data-layer="swap"]') as HTMLElement).style.willChange).toBe('');
  });

  it('rapid swapping: the running swap is completed instantly and the latest request wins (test 16)', async () => {
    const cache = makeCache();
    const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} />);
    rerender(<BuilderStage2D color={color(1)} art={art(2)} cache={cache} />);
    await flush();
    expect(animations).toHaveLength(3);
    // swap 2 is running; request 3 and 4 back to back
    rerender(<BuilderStage2D color={color(1)} art={art(3)} cache={cache} />);
    rerender(<BuilderStage2D color={color(1)} art={art(4)} cache={cache} />);
    await flush();
    expect(animations.slice(0, 3).every((a) => a.cancelled)).toBe(true); // first swap jumped to its end state
    // art 3 never played (superseded while decoding): exactly one new swap, to art 4
    expect(animations).toHaveLength(6);
    const imgs = document.querySelectorAll('[data-layer="stimpie-new"]');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('alt', 'Art 4 Stimpie');
    expect(document.querySelectorAll('[data-layer="stimpie-old"]')).toHaveLength(1); // never more than one old image
    expect(document.querySelector('[data-layer="stimpie-old"]')).toHaveAttribute('src', 'http://api.test/a2.webp');
  });

  it('reduced motion / instant: no animation at all, no zip line', async () => {
    const cache = makeCache();
    const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} instant />);
    rerender(<BuilderStage2D color={color(2)} art={art(2)} cache={cache} instant />);
    await flush();
    expect(animations).toHaveLength(0);
    expect(screen.getByAltText('Art 2 Stimpie')).toBeInTheDocument();
    expect(screen.getByAltText('Colour 2 Stimpy hoodie, back view')).toBeInTheDocument();
    expect(document.querySelector('[data-layer="stimpie-old"]')).toBeNull();
  });

  it('decode timeout (400 ms): swaps without animation instead of stalling', async () => {
    const slow = () => ({ decoding: '', src: '', decode: () => new Promise(() => undefined) }) as unknown as HTMLImageElement;
    const cache = new DecodedImageCache(5, slow);
    vi.useFakeTimers();
    try {
      const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} />);
      rerender(<BuilderStage2D color={color(1)} art={art(2)} cache={cache} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(450);
      });
      expect(animations).toHaveLength(0);
      expect(screen.getByAltText('Art 2 Stimpie')).toBeInTheDocument();
      expect(document.querySelector('[data-layer="stimpie-old"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a colour change cross-fades the hoodie for 150 ms and keeps the Stimpie (no zip wipe)', async () => {
    const cache = makeCache();
    const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} />);
    rerender(<BuilderStage2D color={color(2)} art={art(1)} cache={cache} />);
    await flush();
    expect(animations).toHaveLength(1);
    expect(animations[0]?.options.duration).toBe(150);
    expect(animations[0]?.keyframes.map((k) => k.opacity)).toEqual([0, 1]);
    expect(document.querySelector('[data-layer="hoodie-prev"]')).toHaveAttribute('src', 'http://api.test/h1.webp');
    expect(document.querySelector('[data-layer="zip-line"]')).toBeNull();
    await act(async () => animations.forEach((a) => a.finish()));
    await flush();
    expect(document.querySelector('[data-layer="hoodie-prev"]')).toBeNull();
  });

  it('two consecutive slow swaps shorten later swaps to a 200 ms cross-fade (builder.md 4.4)', async () => {
    const cache = makeCache();
    // stub rAF so frames arrive 50 ms apart (20 fps)
    let t = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      setTimeout(() => {
        t += 50;
        cb(t);
      }, 0);
      return 1;
    });
    const { rerender } = render(<BuilderStage2D color={color(1)} art={art(1)} cache={cache} />);
    for (const n of [2, 3]) {
      rerender(<BuilderStage2D color={color(1)} art={art(n)} cache={cache} />);
      await flush();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 80));
        animations.filter((a) => !a.cancelled).forEach((a) => a.finish());
      });
      await flush();
    }
    animations.length = 0;
    rerender(<BuilderStage2D color={color(1)} art={art(4)} cache={cache} />);
    await flush();
    expect(animations).toHaveLength(1);
    expect(animations[0]?.options.duration).toBe(200);
  });
});

describe('BuilderStage2D preloading', () => {
  it('decodes the neighbours on idle, but never when save-data is on', async () => {
    const make = vi.fn(fakeImg);
    const cache = new DecodedImageCache(5, make);
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 1;
    });
    render(<BuilderStage2D color={color(1)} art={art(1)} preload={['http://api.test/a0.webp', 'http://api.test/a2.webp']} cache={cache} />);
    await flush();
    expect(cache.keys()).toEqual(expect.arrayContaining(['http://api.test/a0.webp', 'http://api.test/a2.webp']));
    vi.unstubAllGlobals();

    const make2 = vi.fn(fakeImg);
    const cache2 = new DecodedImageCache(5, make2);
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
      cb();
      return 1;
    });
    render(<BuilderStage2D color={color(1)} art={art(1)} preload={['http://api.test/a9.webp']} cache={cache2} />);
    await flush();
    expect(cache2.keys()).not.toContain('http://api.test/a9.webp');
    // @ts-expect-error cleanup of the test connection stub
    delete navigator.connection;
    vi.unstubAllGlobals();
  });
});
