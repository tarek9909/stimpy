import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { SkipLink, Skeleton, SkeletonGroup } from '@stimpy/ui';
import { NEW_ORDER_PATH } from '../app/navigation';
import { useCan } from '../auth/roles';
import { useSessionRevalidation } from '../auth/session';
import { useIsMdUp } from '../lib/hooks';
import { useStockBadgeFeed } from '../lib/refdata';
import { useBusinessTimeZoneSync } from '../lib/settings';
import { BottomBar } from './BottomBar';
import { ErrorBoundary } from './ErrorBoundary';
import { NotificationsProvider } from './notifications';
import { Sidebar } from './Sidebar';
import { ShortcutsHost } from './shortcuts';
import { ConnectionBanners, SessionExpiryHint } from './StatusBanners';
import { TopBar } from './TopBar';

function PageFallback() {
  return (
    <SkeletonGroup label="Loading page" className="space-y-4">
      <Skeleton variant="rect" className="h-10 w-64" />
      <Skeleton variant="text" lines={4} />
    </SkeletonGroup>
  );
}

function ShellEffects() {
  useBusinessTimeZoneSync();
  useSessionRevalidation();
  useStockBadgeFeed();
  const isMd = useIsMdUp();
  // Toasts and the floating buttons sit above the phone bottom bar (design: --stimpy-sticky-offset).
  useEffect(() => {
    document.documentElement.style.setProperty('--stimpy-sticky-offset', isMd ? '0px' : '72px');
    return () => {
      document.documentElement.style.removeProperty('--stimpy-sticky-offset');
    };
  }, [isMd]);
  return null;
}

/** Phone floating "+ New order" (the top bar also has "+"), hidden on the order form itself. */
function NewOrderFab() {
  const { pathname } = useLocation();
  const canOrder = useCan('orders');
  const isMd = useIsMdUp();
  // Only on top-level pages: deeper pages (forms, details) have their own action bars.
  if (isMd || !canOrder || pathname.split('/').filter(Boolean).length > 1) return null;
  return (
    <Link
      to={NEW_ORDER_PATH}
      aria-label="New order"
      className="no-print fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-action text-white shadow-float no-underline hover:brightness-90"
    >
      <Plus size={26} aria-hidden="true" />
    </Link>
  );
}

/**
 * The signed-in layout: sidebar (bottom bar below `md`), top bar, offline/session banners and the
 * page outlet. Pages render inside `<main id="main-content">` with 16 px gutters (24 px from `md`)
 * and a 1440 px maximum. Everything inside is protected: it only mounts after `GET /auth/me`.
 */
export function AppShell() {
  const { pathname } = useLocation();
  return (
    <NotificationsProvider>
      <ShellEffects />
      <SkipLink />
      <div className="min-h-dvh md:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="no-print">
            <ConnectionBanners />
            <SessionExpiryHint />
          </div>
          <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-admin flex-1 px-4 pb-28 pt-4 outline-none md:px-6 md:pb-10 md:pt-6">
            <ErrorBoundary inline resetKey={pathname}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <BottomBar />
      <NewOrderFab />
      <ShortcutsHost />
    </NotificationsProvider>
  );
}
