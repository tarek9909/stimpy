'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { FloatingWhatsApp } from '@stimpy/ui';

/** Floating chat button (website-pages 3.5). Hidden on /checkout (it would cover the sticky Place order bar). */
export function FloatingWhatsAppGate({ number }: { number: string | null }) {
  const pathname = usePathname();
  return <FloatingWhatsApp number={number} hidden={pathname === '/checkout' || (pathname ?? '').startsWith('/checkout/')} />;
}

/**
 * Render on pages with a sticky bottom bar (hoodie detail). Sets `--stimpy-sticky-offset` so toasts and the floating
 * WhatsApp button sit above the bar (HANDOFF UI package section 2).
 */
export function StickyBarOffset({ px = 72 }: { px?: number }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--stimpy-sticky-offset', `${px}px`);
    return () => {
      root.style.removeProperty('--stimpy-sticky-offset');
    };
  }, [px]);
  return null;
}
