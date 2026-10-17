import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Button, Logo } from '@stimpy/ui';
import { NAV_ITEMS, NEW_ORDER_PATH, isNavActive } from '../app/navigation';
import { useCan } from '../auth/roles';
import { useIsMdUp } from '../lib/hooks';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

/** Top bar: global search, + New order, notification bell, user menu (dashboard-pages 2.3). */
export function TopBar() {
  const isMd = useIsMdUp();
  const canOrder = useCan('orders');
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((item) => isNavActive(item, pathname));
  return (
    <header className="admin-topbar no-print sticky top-0 z-30 flex items-center gap-2 border-b border-base px-3 md:gap-4 md:px-6">
      {!isMd ? (
        <Link to="/" aria-label="Stimpy dashboard home" className="inline-flex shrink-0 no-underline">
          <Logo variant="icon" surface="white" width={20} clearSpace={false} />
        </Link>
      ) : null}
      {isMd ? <div className="admin-location"><span>{current?.group ?? 'Workspace'}</span><ChevronRight size={12} aria-hidden="true" /><strong>{current?.label ?? 'Store'}</strong></div> : null}
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        {canOrder && !pathname.startsWith('/orders') ? (
          isMd ? (
            <Button href={NEW_ORDER_PATH} variant="primary" leftIcon={<Plus size={16} aria-hidden="true" />}>
              New order
            </Button>
          ) : (
            <Button href={NEW_ORDER_PATH} variant="primary" iconOnly aria-label="New order">
              <Plus size={22} aria-hidden="true" />
            </Button>
          )
        ) : null}
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
