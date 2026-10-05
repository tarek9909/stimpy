'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '../cn';
import { useUI } from '../context';
import { ImageOff } from '../icons';

export interface MediaProps {
  src?: string | null;
  /** Required. Use an empty string for purely decorative images. */
  alt: string;
  /** Number (`0.64`) or CSS ratio string (`'4 / 5'`, `'9 / 16'`). Reserved up front: no layout shift. */
  ratio: number | string;
  /** The single LCP image of a page. */
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** `object-fit`. Default `cover` (the box is already the right ratio). */
  fit?: 'cover' | 'contain';
  /** Overlay content (badges). Must carry its own solid background. */
  children?: ReactNode;
}

/** Ratio box with a solid cream placeholder (no shimmer, no blur-up) and an error tile. */
export function Media({ src, alt, ratio, priority, sizes, className, fit = 'cover', children }: MediaProps) {
  const { renderImage } = useUI();
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-cream', className)}
      style={{ aspectRatio: String(ratio).replace('/', ' / ').replace(/\s+/g, ' ') }}
    >
      {showImage
        ? renderImage({
            src: src as string,
            alt,
            sizes,
            priority,
            className: cn('absolute inset-0 h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain'),
            onError: () => setFailed(true),
          })
        : (
          <div
            className="absolute inset-0 flex items-center justify-center text-ink-55"
            role={alt ? 'img' : undefined}
            aria-label={alt || undefined}
          >
            <ImageOff width={32} height={32} aria-hidden="true" />
          </div>
        )}
      {children}
    </div>
  );
}
