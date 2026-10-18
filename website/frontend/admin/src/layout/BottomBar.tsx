import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { BottomSheet, cn } from '@stimpy/ui';
import { BOTTOM_BAR_AREAS, NAV_ITEMS, isNavActive, type NavItem } from '../app/navigation';
import { canAccess } from '../auth/roles';
import { useSession } from '../auth/session';
import { useNavBadges } from './navBadges';

/** True while the on-screen keyboard is open (the visual viewport shrinks): the bar hides then. */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const check = () => setOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener('resize', check);
    check();
    return () => vv.removeEventListener('resize', check);
  }, []);
  return open;
}

function BarLink({ item, active }: { item: NavItem; active: boolean }) {
  const badges = useNavBadges();
  const badge = badges[item.area];
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-caption no-underline',
        active ? 'font-medium text-fg' : 'text-fg-muted',
      )}
    >
      <span className={cn('relative inline-flex h-7 w-12 items-center justify-center rounded-md', active && 'bg-action/10 text-action')}>
        <Icon size={22} aria-hidden="true" />
        {badge ? (
          <span className="absolute -right-0.5 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-ink px-1 text-caption tabular-nums text-white" aria-label={`${badge} new`}>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/** Phone navigation: Overview, Orders, Stock and a More sheet (dashboard-pages 2.2). */
export function BottomBar() {
  const { pathname } = useLocation();
  const { user } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const keyboardOpen = useKeyboardOpen();

  const allowed = NAV_ITEMS.filter((i) => canAccess(user.role, i.area));
  const main = BOTTOM_BAR_AREAS.map((a) => allowed.find((i) => i.area === a)).filter((i): i is NavItem => !!i);
  const more = allowed.filter((i) => !BOTTOM_BAR_AREAS.includes(i.area));
  const moreActive = more.some((i) => isNavActive(i, pathname));

  // Close the sheet when the route changes.
  useEffect(() => setMoreOpen(false), [pathname]);

  if (keyboardOpen) return null;
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-base bg-surface-base pb-[env(safe-area-inset-bottom)] md:hidden no-print"
      >
        {main.map((item) => (
          <BarLink key={item.area} item={item} active={isNavActive(item, pathname)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-caption', moreActive ? 'font-medium text-fg' : 'text-fg-muted')}
        >
          <span className={cn('inline-flex h-7 w-12 items-center justify-center rounded-md', moreActive && 'bg-action/10 text-action')}>
            <MoreHorizontal size={22} aria-hidden="true" />
          </span>
          <span>More</span>
        </button>
      </nav>
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="flex flex-col pb-2">
          {more.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <li key={item.area}>
                <Link
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex min-h-12 items-center gap-3 rounded-md px-3 text-body no-underline', active ? 'bg-action/10 font-medium text-action' : 'text-fg hover:bg-surface')}
                >
                  <Icon size={22} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </>
  );
}
