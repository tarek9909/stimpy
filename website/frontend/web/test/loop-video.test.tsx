import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { LoopVideo } from '@/components/LoopVideo';

vi.mock('@stimpy/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('@stimpy/ui')>(),
  prefersReducedMotion: () => false,
}));

let intersect: (visible: boolean) => void;
let hidden = false;
let paused = true;
let play: ReturnType<typeof vi.spyOn>;
let pause: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hidden = false;
  paused = true;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      intersect = (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

describe('content video loading', () => {
  it('does not request offscreen video and attaches its source when it enters view', async () => {
    const view = render(<LoopVideo src="/large-step.mp4" ratio="4 / 3" label="Zip on" />);
    const video = view.container.querySelector('video')!;
    expect(video).not.toHaveAttribute('src');
    expect(video).toHaveAttribute('preload', 'none');
    expect(play).not.toHaveBeenCalled();
    await act(async () => intersect(true));
    await waitFor(() => expect(video).toHaveAttribute('src', '/large-step.mp4'));
    expect(play).toHaveBeenCalledOnce();
  });

  it('respects Data Saver until the user deliberately plays the video', async () => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    const view = render(<LoopVideo src="/large-step.mp4" ratio="4 / 3" label="Zip on" />);
    await act(async () => intersect(true));
    expect(view.container.querySelector('video')).not.toHaveAttribute('src');
    fireEvent.click(view.getByRole('button', { name: 'Play video: Zip on' }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    expect(view.container.querySelector('video')).toHaveAttribute('src', '/large-step.mp4');
  });

  it('pauses in a hidden tab and resumes when the visible video returns', async () => {
    render(<LoopVideo src="/step.mp4" ratio="4 / 3" label="Zip on" />);
    await act(async () => intersect(true));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    expect(pause).toHaveBeenCalledOnce();
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('keeps an explicit pause when scrolling away and back', async () => {
    const view = render(<LoopVideo src="/step.mp4" ratio="4 / 3" label="Zip on" />);
    await act(async () => intersect(true));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    fireEvent.click(view.getByRole('button', { name: 'Pause video: Zip on' }));
    await act(async () => intersect(false));
    await act(async () => intersect(true));
    expect(play).toHaveBeenCalledOnce();
  });
});
