import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { Button, EmptyState, ErrorState } from '@stimpy/ui';
import { SearchX } from 'lucide-react';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { Can, type Area } from '../auth/roles';
import { PageHeader } from '../components/PageHeader';
import { AppShell } from '../layout/AppShell';
import { RootLayout } from './RootLayout';

/**
 * Pages are lazy chunks (dashboard route chunks <= 100 KB each; Three.js, charts and editors stay
 * out of the first load). `pages/<area>/index.tsx` default-exports the WHOLE area and receives
 * every sub-path (`orders/*`), so an area owner declares nested routes inside it
 * (`/orders/new`, `/orders/:id`) without touching this file.
 */
const pages: Record<Area, React.LazyExoticComponent<ComponentType>> = {
  overview: lazy(() => import('../pages/overview')),
  orders: lazy(() => import('../pages/orders')),
  products: lazy(() => import('../pages/products')),
  stock: lazy(() => import('../pages/stock')),
  drops: lazy(() => import('../pages/drops')),
  customers: lazy(() => import('../pages/customers')),
  finance: lazy(() => import('../pages/finance')),
  insights: lazy(() => import('../pages/insights')),
  content: lazy(() => import('../pages/content')),
  deliveries: lazy(() => import('../pages/deliveries')),
  settings: lazy(() => import('../pages/settings')),
};

function areaRoute(area: Area, path: string): RouteObject {
  const Page = pages[area];
  return {
    path,
    element: (
      <Can area={area}>
        <Page />
      </Can>
    ),
  };
}

/** 404 inside the shell, so navigation still works (dashboard-pages 2.4). */
export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={<SearchX size={32} />}
        title="Page not found"
        text="That page doesn't exist or has moved."
        headingLevel={2}
        action={
          <Button href="/" variant="dark">
            Go to Overview
          </Button>
        }
      />
    </>
  );
}

/** Router-level failures (a lazy chunk that did not load, an exception outside a page). */
export function RouteError() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-base px-4">
      <ErrorState title="Something broke" text="Reload the page." onRetry={() => window.location.reload()} retryLabel="Reload" />
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: areaRoute('overview', '').element },
              areaRoute('orders', 'orders/*'),
              areaRoute('products', 'products/*'),
              areaRoute('stock', 'stock/*'),
              areaRoute('drops', 'drops/*'),
              areaRoute('customers', 'customers/*'),
              areaRoute('finance', 'finance/*'),
              areaRoute('insights', 'insights/*'),
              areaRoute('content', 'content/*'),
              areaRoute('deliveries', 'deliveries/*'),
              areaRoute('settings', 'settings/*'),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}

/** Tests: the same route table in memory. */
export function createTestRouter(initialEntries: string[] = ['/']) {
  return createMemoryRouter(routes, { initialEntries });
}
