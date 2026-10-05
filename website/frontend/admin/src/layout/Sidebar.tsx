import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Logo, cn } from '@stimpy/ui';
import { NAV_ITEMS, isNavActive } from '../app/navigation';
import { useCan, type Area } from '../auth/roles';
import { useIsLgUp } from '../lib/hooks';
import { useNavBadges } from './navBadges';

const STORAGE_KEY = 'stimpy.sidebar';
type Pref = 'collapsed' | 'expanded';

function readPref(): Pref | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'collapsed' || v === 'expanded' ? v : null;
  } catch {
    return null;
  }
}

function writePref(pref: Pref): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* a per-viewer convenience only: storage may be blocked */
  }
}

/** Collapsed state: the saved preference, else collapsed on tablets (md) and expanded from `lg`. */
export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  const isLg = useIsLgUp();
  const [pref, setPref] = useState<Pref | null>(() => readPref());
  const collapsed = pref ? pref === 'collapsed' : !isLg;
  return {
    collapsed,
    toggle: () => {
      const next: Pref = collapsed ? 'expanded' : 'collapsed';
      writePref(next);
      setPref(next);
    },
  };
}

function SidebarLink({ area, path, label, icon: Icon, end, collapsed }: { area: Area; path: string; label: string; icon: (typeof NAV_ITEMS)[number]['icon']; end?: boolean; collapsed: boolean }) {
  const { pathname } = useLocation();
  const allowed = useCan(area);
  const badges = useNavBadges();
  if (!allowed) return null;
  const active = isNavActive({ area, path, label, icon: Icon, end }, pathname);
  const badge = badges[area];
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm no-underline transition-colors duration-fast',
        collapsed && 'justify-center px-0',
        active ? 'bg-coral font-medium text-ink' : 'text-fg hover:bg-surface',
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-1 rounded-r-sm bg-ink" /> : null}
      <Icon size={22} aria-hidden="true" className="shrink-0" />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{label}</span>
      {badge ? (
        <span
          className={cn(
            'inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-caption tabular-nums text-white',
            collapsed && 'absolute right-1 top-1 min-w-4 px-1',
          )}
          aria-label={`${badge} ${area === 'orders' ? 'new' : 'to check'}`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Desktop and tablet navigation. Below `md` the bottom bar replaces it. */
export function Sidebar() {
  const { collapsed, toggle } = useSidebarCollapsed();
  // Keep the page width stable: the shell reads this attribute for its layout.
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
  }, [collapsed]);
  return (
    <>
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-base bg-surface-base transition-[width] duration-fast md:flex print:hidden',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 items-center border-b border-base md:h-16', collapsed ? 'justify-center' : 'px-4')}>
          <Link to="/" aria-label="Stimpy dashboard home" className="inline-flex no-underline">
            {collapsed ? <Logo variant="icon" surface="white" width={20} clearSpace={false} /> : <Logo variant="full" surface="white" width={112} clearSpace={false} />}
          </Link>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.area}>
                <SidebarLink {...item} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-base p-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            className={cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-body-sm text-fg-muted hover:bg-surface hover:text-fg', collapsed && 'justify-center px-0')}
          >
            {collapsed ? <PanelLeftOpen size={22} aria-hidden="true" /> : <PanelLeftClose size={22} aria-hidden="true" />}
            <span className={cn(collapsed && 'sr-only')}>Collapse</span>
          </button>
        </div>
      </aside>
      {/* Flow spacer so main content doesn't slip underneath the fixed sidebar */}
      <div
        aria-hidden="true"
        className={cn(
          'hidden shrink-0 transition-[width] duration-fast md:block print:hidden',
          collapsed ? 'w-[72px]' : 'w-60',
        )}
      />
    </>
  );
}
