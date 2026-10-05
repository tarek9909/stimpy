import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Section, ZIP_DURATION, ZipWipe, type ZipWipeHandle } from '../src';

function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

interface Call {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

let calls: Call[] = [];
let gates: Array<() => void> = [];
let hold = false;

function installAnimate() {
  calls = [];
  gates = [];
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ el: this, keyframes, options });
      let reject: (e: unknown) => void = () => undefined;
      const finished = hold
        ? new Promise<Animation>((res, rej) => {
            reject = rej;
            gates.push(() => res({} as Animation));
          })
        : Promise.resolve({} as Animation);
      finished.catch(() => undefined);
      // Like the real API, cancel() rejects `finished` with an AbortError.
      return { finished, cancel: () => reject(new DOMException('cancelled', 'AbortError')) } as unknown as Animation;
    },
  });
}

function removeAnimate() {
  // @ts-expect-error cleanup of the test double
  delete HTMLElement.prototype.animate;
}

/** Call play() inside act (so effects run), then let the animation chain settle. */
async function play(ref: React.RefObject<ZipWipeHandle | null>): Promise<void> {
  let p: Promise<void> = Promise.resolve();
  act(() => {
    p = ref.current?.play() ?? Promise.resolve();
  });
  await act(async () => {
    await p;
  });
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('ZipWipe reduced motion', () => {
  beforeEach(() => {
    installAnimate();
    mockMatchMedia(true);
    class IO {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    // @ts-expect-error minimal double
    globalThis.IntersectionObserver = IO;
  });
  afterEach(() => {
    removeAnimate();
    // @ts-expect-error cleanup
    delete globalThis.IntersectionObserver;
  });

  it('renders no cover and no line (instant swap) and reports done', () => {
    const onDone = vi.fn();
    const { container } = render(
      <ZipWipe onDone={onDone}>
        <p>Hello</p>
      </ZipWipe>,
    );
    expect(container.querySelector('[data-zip-cover]')).toBeNull();
    expect(container.querySelector('[data-zip-line]')).toBeNull();
    expect(screen.getByText('Hello')).toBeVisible();
    expect(container.firstElementChild).toHaveAttribute('data-zip-phase', 'done');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('manual play() resolves immediately and animates nothing', async () => {
    const ref = createRef<ZipWipeHandle>();
    const onDone = vi.fn();
    render(
      <ZipWipe ref={ref} trigger="manual" onDone={onDone}>
        <p>Swap</p>
      </ZipWipe>,
    );
    let resolved = false;
    let p: Promise<void> = Promise.resolve();
    act(() => {
      p = (ref.current as ZipWipeHandle).play().then(() => {
        resolved = true;
      });
    });
    await act(async () => {
      await p;
    });
    expect(resolved).toBe(true);
    expect(calls).toHaveLength(0);
    expect(document.querySelector('[data-zip-cover]')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('can opt into a 120 ms cross-fade instead (opacity only)', async () => {
    const ref = createRef<ZipWipeHandle>();
    render(
      <ZipWipe ref={ref} trigger="manual" reducedMotion="fade">
        <p>Swap</p>
      </ZipWipe>,
    );
    await play(ref);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(calls[0]?.options.duration).toBe(120);
  });
});

describe('ZipWipe normal motion', () => {
  beforeEach(() => {
    hold = false;
    installAnimate();
    mockMatchMedia(false);
  });
  afterEach(() => {
    removeAnimate();
    // @ts-expect-error cleanup
    delete globalThis.IntersectionObserver;
  });

  it('without IntersectionObserver or the Web Animations API it just shows the content (no hidden content)', () => {
    removeAnimate();
    const { container } = render(
      <ZipWipe>
        <p>Always readable</p>
      </ZipWipe>,
    );
    expect(container.querySelector('[data-zip-cover]')).toBeNull();
    expect(screen.getByText('Always readable')).toBeVisible();
  });

  it('manual play: cover and line are aria-hidden, inert and non-interactive; content stays accessible; only clip-path and transform animate', async () => {
    const ref = createRef<ZipWipeHandle>();
    const onDone = vi.fn();
    hold = true;
    const { container } = render(
      <ZipWipe ref={ref} trigger="manual" color="coral" durationMs={450} direction="down" onDone={onDone}>
        <p>Incoming content</p>
      </ZipWipe>,
    );
    expect(container.querySelector('[data-zip-cover]')).toBeNull(); // nothing before play

    let played = false;
    act(() => {
      void ref.current?.play().then(() => {
        played = true;
      });
    });
    await flush();

    const cover = container.querySelector('[data-zip-cover]') as HTMLElement;
    const line = container.querySelector('[data-zip-line]') as HTMLElement;
    expect(cover).not.toBeNull();
    expect(line).not.toBeNull();
    for (const el of [cover, line]) {
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el.className).toContain('pointer-events-none');
    }
    expect(cover).toHaveAttribute('inert');
    expect(cover.className).toContain('bg-coral');

    // content is still in the DOM, readable, and not inside any aria-hidden subtree
    const content = screen.getByText('Incoming content');
    expect(content).toBeInTheDocument();
    expect(content.closest('[aria-hidden="true"]')).toBeNull();

    // only clip-path and transform animate, with the zip easing and the requested duration
    expect(calls).toHaveLength(2);
    const coverCall = calls.find((c) => c.el === cover) as Call;
    const lineCall = calls.find((c) => c.el === line) as Call;
    expect(Object.keys(coverCall.keyframes[0] ?? {})).toEqual(['clipPath']);
    expect(Object.keys(lineCall.keyframes[0] ?? {})).toEqual(['transform']);
    expect(coverCall.options.duration).toBe(450);
    expect(coverCall.options.easing).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
    expect(coverCall.keyframes[1]).toEqual({ clipPath: 'inset(100% 0 0 0)' });
    expect(cover.style.willChange).toBe('clip-path');

    // finish
    await act(async () => {
      gates.splice(0).forEach((g) => g());
      await Promise.resolve();
    });
    await flush();
    expect(played).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-zip-cover]')).toBeNull(); // removed: no lingering will-change layer
  });

  it('uses 600 ms for sections by default and 450 ms for the Builder', async () => {
    expect(ZIP_DURATION).toEqual({ builder: 450, section: 600 });
    const ref = createRef<ZipWipeHandle>();
    render(
      <ZipWipe ref={ref} trigger="manual">
        <p>x</p>
      </ZipWipe>,
    );
    await play(ref);
    expect(calls[0]?.options.duration).toBe(600);
  });

  it('direction maps to the right clip-path and axis', async () => {
    const results: Record<string, string> = {};
    for (const direction of ['down', 'up', 'ltr', 'rtl'] as const) {
      calls = [];
      const ref = createRef<ZipWipeHandle>();
      const { container, unmount } = render(
        <ZipWipe ref={ref} trigger="manual" direction={direction}>
          <p>x</p>
        </ZipWipe>,
      );
      await play(ref);
      results[direction] = String((calls[0]?.keyframes[1] as Keyframe | undefined)?.clipPath);
      void container;
      unmount();
    }
    expect(results).toEqual({
      down: 'inset(100% 0 0 0)',
      up: 'inset(0 0 100% 0)',
      ltr: 'inset(0 0 0 100%)',
      rtl: 'inset(0 100% 0 0)',
    });
  });

  it('plays only one wipe at a time: the second waits for the first', async () => {
    const a = createRef<ZipWipeHandle>();
    const b = createRef<ZipWipeHandle>();
    hold = true;
    render(
      <>
        <ZipWipe ref={a} trigger="manual">
          <p>A</p>
        </ZipWipe>
        <ZipWipe ref={b} trigger="manual">
          <p>B</p>
        </ZipWipe>
      </>,
    );
    act(() => {
      void a.current?.play();
      void b.current?.play();
    });
    await flush();
    expect(calls).toHaveLength(2); // only A's cover + line started
    await act(async () => {
      gates.splice(0).forEach((g) => g());
      await Promise.resolve();
    });
    await flush();
    await flush();
    expect(calls).toHaveLength(4); // now B
  });

  it('renders the outgoing scene inside the cover', async () => {
    const ref = createRef<ZipWipeHandle>();
    hold = true;
    const { container } = render(
      <ZipWipe ref={ref} trigger="manual" outgoing={<span>Old panel</span>}>
        <span>New panel</span>
      </ZipWipe>,
    );
    act(() => {
      void ref.current?.play();
    });
    await flush();
    const cover = container.querySelector('[data-zip-cover]') as HTMLElement;
    expect(cover).toHaveTextContent('Old panel');
    expect(screen.getByText('New panel').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('inView: arms with a cover, plays once when visible, then removes the cover', async () => {
    let trigger: (entry: Partial<IntersectionObserverEntry>) => void = () => undefined;
    class IO {
      constructor(cb: IntersectionObserverCallback) {
        trigger = (entry) => cb([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    // @ts-expect-error minimal double
    globalThis.IntersectionObserver = IO;
    const onDone = vi.fn();
    const { container } = render(
      <ZipWipe onDone={onDone}>
        <p>Section</p>
      </ZipWipe>,
    );
    expect(container.querySelector('[data-zip-cover]')).not.toBeNull(); // armed
    expect(container.firstElementChild).toHaveAttribute('data-zip-phase', 'armed');
    expect(calls).toHaveLength(0);

    // 10% visible is not enough
    act(() => trigger({ isIntersecting: true, intersectionRatio: 0.1, intersectionRect: { height: 10 } as DOMRectReadOnly, rootBounds: { height: 800 } as DOMRectReadOnly }));
    await flush();
    expect(calls).toHaveLength(0);

    // 40% is
    act(() => trigger({ isIntersecting: true, intersectionRatio: 0.4, intersectionRect: { height: 200 } as DOMRectReadOnly, rootBounds: { height: 800 } as DOMRectReadOnly }));
    await flush();
    await flush();
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-zip-cover]')).toBeNull();
  });

  it('inView: a section taller than the viewport still plays once 35% of the viewport is covered', async () => {
    let trigger: (entry: Partial<IntersectionObserverEntry>) => void = () => undefined;
    class IO {
      constructor(cb: IntersectionObserverCallback) {
        trigger = (entry) => cb([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    // @ts-expect-error minimal double
    globalThis.IntersectionObserver = IO;
    const onDone = vi.fn();
    render(
      <ZipWipe onDone={onDone}>
        <p>Tall</p>
      </ZipWipe>,
    );
    act(() => trigger({ isIntersecting: true, intersectionRatio: 0.1, intersectionRect: { height: 400 } as DOMRectReadOnly, rootBounds: { height: 800 } as DOMRectReadOnly }));
    await flush();
    await flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Section zipIn wraps the section in a ZipWipe and keeps the heading readable', () => {
    const { container } = render(
      <Section tone="black" heading="The idea in three steps" zipIn>
        <p>Body</p>
      </Section>,
    );
    expect(container.querySelector('[data-zip-phase]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'The idea in three steps' })).toBeInTheDocument();
  });
});
