'use client';

import { useEffect, useRef, useState } from 'react';
import { cn, prefersReducedMotion } from '@stimpy/ui';
import { isDataSaver } from '@/lib/useSaveData';
import { Pause, Play } from './icons';

/**
 * Muted looping video for content steps. Loads lazily (`preload="none"` until visible), never autoplays on Data Saver or
 * under reduced motion, and always offers a pause control. Decorative: the step text carries the meaning.
 */
export function LoopVideo({ src, ratio, label, className }: { src: string; ratio: number | string; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [auto, setAuto] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const allowed = !isDataSaver() && !prefersReducedMotion();
    setAuto(allowed);
    const el = ref.current;
    if (!el || !allowed || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting) void el.play().catch(() => undefined);
      else el.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-cream', className)} style={{ aspectRatio: String(ratio).replace('/', ' / ') }}>
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload={auto ? 'metadata' : 'none'}
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
