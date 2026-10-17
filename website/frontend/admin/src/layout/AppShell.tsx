import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SkipLink, Skeleton, SkeletonGroup } from '@stimpy/ui';
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
  // Keep toasts above the phone navigation.
  useEffect(() => {
    document.documentElement.style.setProperty('--stimpy-sticky-offset', isMd ? '0px' : '72px');
    return () => {
      document.documentElement.style.removeProperty('--stimpy-sticky-offset');
    };
  }, [isMd]);
  return null;
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
      <div className="admin-shell min-h-dvh md:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="no-print">
            <ConnectionBanners />
            <SessionExpiryHint />
          </div>
          <main id="main-content" tabIndex={-1} className="admin-page mx-auto w-full max-w-admin flex-1 px-4 pb-28 outline-none md:px-6 md:pb-10">
            <ErrorBoundary inline resetKey={pathname}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <BottomBar />
      <ShortcutsHost />
    </NotificationsProvider>
  );
}
