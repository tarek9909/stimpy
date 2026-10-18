'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, cn } from '@stimpy/ui';
import { cartItemCount } from '@/features/cart/helpers';
import { cartStore, useCart } from '@/features/cart/store';
import { PRIMARY_NAV, isActivePath } from '@/lib/nav';
import { track } from '@/lib/track';
import { useSaveData } from '@/lib/useSaveData';
import { Menu, ShoppingBag } from '../icons';

const MobileMenu = dynamic(() => import('./MobileMenu').then((module) => module.MobileMenu), { ssr: false });

/** Count shown in the badge: capped at "9+" visually; the accessible name carries the real number. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count);
}

export function cartLabel(count: number): string {
  return `Cart, ${count} ${count === 1 ? 'item' : 'items'}`;
}

/** Fixed-height sticky navigation keeps shopping controls stable while scrolling. */
export function Header() {
  const pathname = usePathname();
  const hydrated = useCart((s) => s.hydrated);
  const count = useCart((s) => cartItemCount(s.lines));
  const saveData = useSaveData();
  const [compact, setCompact] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cartButton = useRef<HTMLButtonElement>(null);
  const shown = hydrated ? count : 0;

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setCompact(window.scrollY > 40);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The mobile menu closes on navigation.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header
      className={cn(
        'store-header sticky top-0 z-30 h-16 border-b border-base bg-white lg:h-20',
        compact && 'store-header-scrolled',
      )}
    >
      <div className="container flex h-full items-center justify-between gap-4">
        <Link href="/" aria-label="Stimpy home" className="inline-flex items-center no-underline hover:no-underline">
          <Logo variant="full" surface="white" width={124} clearSpace={false} alt="Stimpy" />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-8">
            {PRIMARY_NAV.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={saveData ? false : undefined}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => track('nav_click', { item: item.href })}
                    className={cn(
                      'store-nav-link inline-flex min-h-11 items-center text-body-sm font-medium text-fg underline-offset-8 decoration-coral decoration-2 hover:underline',
                      active && 'underline',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2 lg:gap-6">
          <Link href="/track" className="hidden min-h-11 items-center text-body-sm text-fg-muted hover:text-fg lg:inline-flex">Track order</Link>
          <button
            ref={cartButton}
            type="button"
            aria-label={cartLabel(shown)}
            aria-haspopup="dialog"
            title="Open shopping bag"
            onClick={() => cartStore.getState().openDrawer()}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-fg hover:bg-cream"
          >
            <ShoppingBag width={24} height={24} aria-hidden="true" />
            {shown > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-0 top-0 inline-flex min-w-5 items-center justify-center rounded-full bg-coral px-1 text-caption font-bold leading-5 text-ink"
              >
                {badgeText(shown)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-label="Open menu"
            title="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg hover:bg-cream lg:hidden"
          >
            <Menu width={24} height={24} aria-hidden="true" />
          </button>
        </div>
      </div>

      {menuOpen ? <MobileMenu open onClose={() => setMenuOpen(false)} pathname={pathname} /> : null}
    </header>
  );
}
