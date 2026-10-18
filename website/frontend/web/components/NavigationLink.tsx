'use client';

import { useRef, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import Link, { useLinkStatus } from 'next/link';
import { useRouter } from 'next/navigation';
import { isDataSaver } from '@/lib/useSaveData';

/** Warm a destination when someone points at, focuses or touches its link. */
export function NavigationLink({
  href,
  prefetch,
  children,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: ComponentProps<typeof Link>) {
  const router = useRouter();
  const warmed = useRef<{ href: string; at: number } | null>(null);
  const warm = () => {
    if (prefetch === false || isDataSaver() || typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return;
    if (warmed.current?.href === href && Date.now() - warmed.current.at < 30_000) return;
    warmed.current = { href, at: Date.now() };
    router.prefetch(href);
  };

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch ?? false}
      onMouseEnter={(event) => { onMouseEnter?.(event); if (!event.defaultPrevented) warm(); }}
      onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) warm(); }}
      onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) warm(); }}
    >
      {children}
      <NavigationFeedback />
    </Link>
  );
}

/** Next owns the pending state, including cancelled navigations and query changes. */
function NavigationFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div role="status" aria-label="Loading page" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-coral motion-safe:animate-pulse">
      <span className="sr-only">Loading page…</span>
    </div>,
    document.body,
  );
}
