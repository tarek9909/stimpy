'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, prefersReducedMotion } from '@stimpy/ui';
import { isDataSaver } from '@/lib/useSaveData';
import { Pause, Play } from './icons';

/**
 * Muted looping video for content steps. Attaches its source only when visible, never autoplays on Data Saver or
 * under reduced motion, and always offers a pause control. Decorative: the step text carries the meaning.
 */
export function LoopVideo({ src, ratio, label, className }: { src: string; ratio: number | string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const wantsPlayback = useRef(false);
  const manuallyPaused = useRef(false);
  const visible = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const allowed = !isDataSaver() && !prefersReducedMotion();
    const el = ref.current;
    if (!el) return;
    // Without visibility information keep the video available through its play button.
    if (typeof IntersectionObserver === 'undefined') {
      visible.current = true;
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      visible.current = entry.isIntersecting;
      if (!entry.isIntersecting) {
        el.pause();
      } else if (allowed && !manuallyPaused.current && !document.hidden) {
        wantsPlayback.current = true;
        setLoaded(true);
        if (el.getAttribute('src')) void el.play().catch(() => undefined);
      }
    });
    io.observe(el);
    const onVisibilityChange = () => {
      if (document.hidden) el.pause();
      else if (visible.current && wantsPlayback.current && el.getAttribute('src')) void el.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      el.pause();
    };
  }, []);

  useEffect(() => {
    if (loaded && wantsPlayback.current && visible.current && !document.hidden) {
      void ref.current?.play().catch(() => undefined);
    }
  }, [loaded, src]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (!loaded) {
      manuallyPaused.current = false;
      wantsPlayback.current = true;
      setLoaded(true);
    } else if (el.paused) {
      manuallyPaused.current = false;
      wantsPlayback.current = true;
      void el.play().catch(() => undefined);
    } else {
      manuallyPaused.current = true;
      wantsPlayback.current = false;
      el.pause();
    }
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-cream', className)} style={{ aspectRatio: String(ratio).replace('/', ' / ') }}>
      <video
        ref={ref}
        src={loaded ? src : undefined}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause video: ${label}` : `Play video: ${label}`}
        className="absolute bottom-3 left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white"
      >
        {playing ? <Pause width={20} height={20} aria-hidden="true" /> : <Play width={20} height={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
