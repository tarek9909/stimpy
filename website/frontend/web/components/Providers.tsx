'use client';

import type { ComponentProps, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ServerClockProvider, ToastProvider, UIProvider, type RenderImage } from '@stimpy/ui';
import { useServerClockOffset } from '@/lib/server-clock';

/** Every internal link of @stimpy/ui goes through here. Prefetch is opt-in (primary nav only: state-and-errors 15.5). */
function AppLink({ prefetch = false, ...props }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...props} />;
}

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
    <UIProvider link={AppLink} renderImage={renderImage}>
      <ServerClockProvider offsetMs={offsetMs} uncertain={uncertain}>
        <ToastProvider>{children}</ToastProvider>
      </ServerClockProvider>
    </UIProvider>
  );
}
