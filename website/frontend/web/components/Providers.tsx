'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { ServerClockProvider, ToastProvider, UIProvider, type RenderImage } from '@stimpy/ui';
import { useServerClockOffset } from '@/lib/server-clock';
import { NavigationLink } from './NavigationLink';

/**
 * `next/image` with `fill`: the parent box is `relative` and already has its aspect ratio (Stimpie 0.64, hoodie 4:5),
 * so there is no layout shift. The API upload host is in `images.remotePatterns`. Pass `priority` only to the single
 * LCP image of a page.
 */
const renderImage: RenderImage = ({ src, alt, sizes, priority, className, onError }) => (
  <Image
    src={src}
    alt={alt}
    fill
    sizes={sizes ?? '(min-width: 1024px) 25vw, 50vw'}
    priority={priority}
    className={className}
    onError={onError}
  />
);

export function Providers({ children }: { children: ReactNode }) {
  const { offsetMs, uncertain } = useServerClockOffset();
  return (
    <UIProvider link={NavigationLink} renderImage={renderImage}>
      <ServerClockProvider offsetMs={offsetMs} uncertain={uncertain}>
        <ToastProvider>{children}</ToastProvider>
      </ServerClockProvider>
    </UIProvider>
  );
}
