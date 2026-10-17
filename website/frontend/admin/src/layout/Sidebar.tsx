import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, PanelLeftClose, PanelLeftOpen, Store } from 'lucide-react';
import { Logo, cn } from '@stimpy/ui';
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from '../app/navigation';
import { canAccess, useCan, type Area } from '../auth/roles';
import { useSession } from '../auth/session';
import { getEnv } from '../env';
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
  const active = isNavActive({ path, end }, pathname);
  const badge = badges[area];
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'admin-nav-link relative flex items-center gap-3 rounded-md px-3 no-underline transition-colors duration-fast',
        collapsed && 'justify-center px-0',
        active ? 'font-medium' : 'text-fg-muted',
      )}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <span className={cn('min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{label}</span>
      {badge ? (
        <span
          className={cn(
            'admin-nav-badge inline-flex items-center justify-center rounded-sm px-1.5 tabular-nums',
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
  const { user } = useSession();
  // Keep the page width stable: the shell reads this attribute for its layout.
  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
  }, [collapsed]);
  return (
    <>
      <aside
        className={cn(
          'admin-sidebar fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-fast md:flex print:hidden',
          collapsed ? 'w-[72px]' : 'w-56',
        )}
      >
        <div className={cn('admin-brand flex items-center', collapsed ? 'justify-center' : 'px-6')}>
          <Link to="/" aria-label="Stimpy dashboard home" className="inline-flex items-center gap-2.5 no-underline">
            <Logo variant="icon" surface="white" width={22} clearSpace={false} />
            {!collapsed ? <span className="admin-brand-copy"><strong>Stimpy</strong><span>Store management</span></span> : null}
          </Link>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-5 pt-3">
          {NAV_GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((item) => item.group === group && canAccess(user.role, item.area));
            if (items.length === 0) return null;
            return (
              <div key={group} className="admin-nav-group">
                {!collapsed ? <p className="admin-nav-heading">{group}</p> : null}
                <ul className="flex flex-col gap-1">
                  {items.map((item) => <li key={item.area}><SidebarLink {...item} collapsed={collapsed} /></li>)}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="admin-sidebar-footer">
          <a href={getEnv().siteUrl} target="_blank" rel="noopener noreferrer" aria-label="Open customer website" title="Open customer website" className={cn('admin-store-link', collapsed && 'justify-center !px-0')}>
            <Store size={17} aria-hidden="true" />
            {!collapsed ? <><span className="flex-1">View storefront</span><ArrowUpRight size={14} aria-hidden="true" /></> : null}
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn('mt-1 flex min-h-9 w-full items-center gap-3 rounded-md px-2.5 text-caption text-fg-muted hover:bg-surface hover:text-fg', collapsed && 'justify-center px-0')}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
            <span className={cn(collapsed && 'sr-only')}>Collapse sidebar</span>
          </button>
        </div>
      </aside>
      {/* Flow spacer so main content doesn't slip underneath the fixed sidebar */}
      <div
        aria-hidden="true"
        className={cn(
          'hidden shrink-0 transition-[width] duration-fast md:block print:hidden',
          collapsed ? 'w-[72px]' : 'w-56',
        )}
      />
    </>
  );
}
