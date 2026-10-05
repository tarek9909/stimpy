import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, Logo } from '@stimpy/ui';
import { NEW_ORDER_PATH } from '../app/navigation';
import { useCan } from '../auth/roles';
import { useIsMdUp } from '../lib/hooks';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

/** Top bar: global search, + New order, notification bell, user menu (dashboard-pages 2.3). */
export function TopBar() {
  const isMd = useIsMdUp();
  const canOrder = useCan('orders');
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-base bg-surface-base px-3 md:h-16 md:gap-3 md:px-6">
      {!isMd ? (
        <Link to="/" aria-label="Stimpy dashboard home" className="inline-flex shrink-0 no-underline">
          <Logo variant="icon" surface="white" width={20} clearSpace={false} />
        </Link>
      ) : null}
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        {canOrder ? (
          isMd ? (
            <Button href={NEW_ORDER_PATH} variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />}>
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
