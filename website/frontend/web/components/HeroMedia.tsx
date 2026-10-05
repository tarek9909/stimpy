'use client';

import { useEffect, useRef, useState } from 'react';
import { Media, cn, prefersReducedMotion } from '@stimpy/ui';
import { isDataSaver } from '@/lib/useSaveData';
import { Pause, Play } from './icons';

export interface HeroMediaProps {
  videoUrl?: string | null;
  imageUrl?: string | null;
  /** Alt text of the poster image ("" when the headline already says it). */
  alt: string;
  ratio: number | string;
  /** Poster is the LCP image. */
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** Extra classes for the image box (e.g. `md:!aspect-video` to change the ratio from `md`). */
  mediaClassName?: string;
  /** Accessible name of the video control group. */
  label?: string;
}

interface NetworkInformationLike extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

function mayAutoplay(): boolean {
  if (isDataSaver() || typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return !['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '');
}

function scheduleIdle(callback: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(callback, { timeout: 1200 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 200);
  return () => window.clearTimeout(id);
}

/**
 * Keeps the poster as the server-rendered LCP image. The video gets no `src` until the hero is visible and the main
 * thread is idle; `preload="none"` prevents an off-screen metadata request. Autoplay is skipped on reduced motion,
 * Data Saver, and 2G/3G. A deliberate play tap can load it on any connection.
 */
export function HeroMedia({ videoUrl, imageUrl, alt, ratio, priority, sizes, className, mediaClassName, label = 'Background video' }: HeroMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wantsPlayback = useRef(false);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [autoplayAllowed, setAutoplayAllowed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!videoUrl) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    const update = () => {
      setReduced(motion.matches || prefersReducedMotion());
      setAutoplayAllowed(mayAutoplay());
    };
    update();
    motion.addEventListener?.('change', update);
    connection?.addEventListener?.('change', update);
    return () => {
      motion.removeEventListener?.('change', update);
      connection?.removeEventListener?.('change', update);
    };
  }, [videoUrl]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Defer even the video element/source until visible and idle. The uploaded asset is expected to meet the documented
  // mobile budget (<= 1.5 MB, 720p); no source request competes with the poster/LCP before this point.
  useEffect(() => {
    if (!videoUrl || !visible || !autoplayAllowed || reduced || loaded) return;
    return scheduleIdle(() => {
      wantsPlayback.current = true;
      setLoaded(true);
    });
  }, [videoUrl, visible, autoplayAllowed, reduced, loaded]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !loaded) return;
    if (!visible) {
      el.pause();
      return;
    }
    if (wantsPlayback.current || (autoplayAllowed && !reduced)) {
      wantsPlayback.current = true;
      void el.play().catch(() => {
        wantsPlayback.current = false;
        setPlaying(false);
      });
    }
  }, [loaded, visible, autoplayAllowed, reduced]);

  function toggle() {
    const el = videoRef.current;
    if (!loaded || !el) {
      wantsPlayback.current = true;
      setLoaded(true);
      return;
    }
    if (el.paused) {
      wantsPlayback.current = true;
      void el.play().catch(() => {
        wantsPlayback.current = false;
        setPlaying(false);
      });
    } else {
      wantsPlayback.current = false;
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden rounded-xl bg-cream', className)}>
      <Media src={imageUrl} alt={alt} ratio={ratio} priority={priority} sizes={sizes} className={mediaClassName} />
      {videoUrl && loaded ? (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          loop
          playsInline
          autoPlay={false}
          preload="none"
          poster={imageUrl ?? undefined}
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => {
            setPlaying(true);
            setReady(true);
          }}
          onPause={() => setPlaying(false)}
          className={cn('absolute inset-0 h-full w-full object-cover', ready ? 'opacity-100' : 'opacity-0')}
        />
      ) : null}
      {videoUrl ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`}
          className="absolute bottom-3 left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white"
        >
          {playing ? <Pause width={20} height={20} aria-hidden="true" /> : <Play width={20} height={20} aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}
