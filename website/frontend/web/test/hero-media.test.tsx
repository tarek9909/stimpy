import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';

vi.mock('@stimpy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stimpy/ui')>();
  return {
    ...actual,
    Media: ({ src, alt }: { src?: string | null; alt: string }) => <div data-testid="poster" data-src={src ?? ''} aria-label={alt} />,
    cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
    prefersReducedMotion: () => false,
  };
});

import { HeroMedia } from '@/components/HeroMedia';

function makeVisible() {
  class Observer {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [0];
  }
  vi.stubGlobal('IntersectionObserver', Observer as unknown as typeof IntersectionObserver);
}

function setupMotionPreference() {
  window.matchMedia = (() => ({ matches: false, media: '', onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe('hero media network behavior', () => {
  it('keeps the poster first and adds the video source only after visibility and idle', async () => {
    makeVisible();
    setupMotionPreference();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const view = render(<HeroMedia videoUrl="https://cdn.example.test/hero.mp4" imageUrl="https://cdn.example.test/poster.webp" alt="" ratio="9 / 16" />);
    expect(view.getByTestId('poster')).toHaveAttribute('data-src', 'https://cdn.example.test/poster.webp');
    expect(view.container.querySelector('video')).toBeNull();
    await waitFor(() => expect(view.container.querySelector('video')).toHaveAttribute('preload', 'none'));
    expect(view.container.querySelector('video')).toHaveAttribute('src', 'https://cdn.example.test/hero.mp4');
  });

  it('does not request video automatically on Data Saver and allows an explicit play tap', async () => {
    makeVisible();
    setupMotionPreference();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '2g' } });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const view = render(<HeroMedia videoUrl="https://cdn.example.test/hero.mp4" imageUrl="https://cdn.example.test/poster.webp" alt="" ratio="9 / 16" />);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(view.container.querySelector('video')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Play background video' }));
    await waitFor(() => expect(view.container.querySelector('video')).toHaveAttribute('preload', 'none'));
    expect(view.container.querySelector('video')).toHaveAttribute('src', 'https://cdn.example.test/hero.mp4');
  });
});
