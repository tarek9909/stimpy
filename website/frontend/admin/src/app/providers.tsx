import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { ToastProvider, UIProvider } from '@stimpy/ui';

/**
 * `@stimpy/ui` renders every internal link through the injected component. In the dashboard that
 * is React Router's `Link` (no full page reloads, router state preserved).
 */
const AppLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function AppLink(
  { href, ...rest },
  ref,
) {
  return <RouterLink ref={ref} to={href} {...rest} />;
});

/** UI provider (links), toasts (error toasts persist in the dashboard) and TanStack Query. */
export function Providers({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <UIProvider link={AppLink}>
      <ToastProvider persistErrors>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ToastProvider>
    </UIProvider>
  );
}
