import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, Logo, Button } from '@stimpy/ui';
import { asApiError } from '../api/errors';
import { loginUrl } from './returnTo';
import { sessionQueryOptions } from './session';

/** Full-screen branded splash: logo on white, no chrome, no text (avoids flicker under 400 ms). */
export function Splash() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-dvh items-center justify-center bg-surface-base"
      data-testid="splash"
    >
      <span className="sr-only">Loading</span>
      <Logo variant="full" surface="white" width={160} />
    </div>
  );
}

export function ServerUnreachable({ onRetry, retrying, requestId }: { onRetry: () => void; retrying: boolean; requestId?: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-base px-4">
      <ErrorState
        title="Can't reach the server"
        text="Check your connection and that the API is running, then try again. You are not logged out."
        onRetry={onRetry}
        retryLoading={retrying}
        requestId={requestId}
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload the page
          </Button>
        }
      />
    </div>
  );
}

/**
 * Guard for every route except `/login` (auth-and-sessions 2.1, 5.3). Nothing protected mounts and
 * no other query fires until `GET /auth/me` has answered:
 *   pending        -> splash
 *   200            -> the shell and page (Outlet)
 *   401            -> `<Navigate to="/login?returnTo=..." replace />`
 *   network / 5xx  -> "Can't reach the server" with Try again (NOT the login page)
 */
export function RequireAuth() {
  const location = useLocation();
  const session = useQuery(sessionQueryOptions);

  if (session.isPending) return <Splash />;
  if (session.isError) {
    const err = asApiError(session.error);
    return <ServerUnreachable onRetry={() => void session.refetch()} retrying={session.isFetching} requestId={err?.reference} />;
  }
  if (!session.data) {
    return <Navigate to={loginUrl(`${location.pathname}${location.search}`)} replace />;
  }
  return <Outlet />;
}
