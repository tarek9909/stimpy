'use client';

import Link from 'next/link';
import { Button, Drawer } from '@stimpy/ui';
import { PRIMARY_NAV, SECONDARY_NAV, isActivePath } from '@/lib/nav';
import { track } from '@/lib/track';

export function MobileMenu({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string | null }) {
  return (
    <Drawer open={open} onClose={onClose} title="Menu" className="store-mobile-menu !max-w-drawer !rounded-none">
      <nav aria-label="Mobile">
        <ul className="flex flex-col">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href} className="border-b border-base">
              <Link
                href={item.href}
                aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                onClick={() => {
                  track('nav_click', { item: item.href });
                  onClose();
                }}
                className="flex min-h-16 items-center text-h3 font-medium text-fg"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mt-6 flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
                onClick={onClose}
                className="flex min-h-12 items-center text-lead text-fg-muted"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Button
            href="/shop"
            variant="cta"
            size="lg"
            fullWidth
            onClick={() => {
              track('cta_click', { id: 'menu_order', path: pathname ?? '' });
              onClose();
            }}
          >
            Order now
          </Button>
        </div>
      </nav>
    </Drawer>
  );
}
