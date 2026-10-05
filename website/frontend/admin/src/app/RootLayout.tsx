import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { SessionFlowProvider } from '../auth/SessionFlowContext';
import { subscribeAuthEvents } from '../auth/broadcast';
import { configureSessionExpiry } from '../auth/expiry';
import { createSessionFlow } from '../auth/sessionFlow';
import { useLatest } from '../lib/hooks';

/**
 * Root route element. Creates the session flow once (expiry, logout, other-tab logout), wires the
 * global 401 handler to it and listens to the multi-tab channel (auth-and-sessions 2.3-2.5).
 * Navigation and location are read through refs so the flow (and its "handled once" flag) is not
 * recreated on every route change.
 */
export function RootLayout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const navigateRef = useLatest(navigate);
  const locationRef = useLatest(location);

  const flow = useMemo(
    () =>
      createSessionFlow({
        queryClient,
        navigate: (to, options) => void navigateRef.current(to, options),
        getLocation: () => locationRef.current,
      }),
    [queryClient, navigateRef, locationRef],
  );

  useEffect(() => {
    configureSessionExpiry({ onExpired: (info) => flow.expire(info) });
    const unsubscribe = subscribeAuthEvents((type) => flow.receive(type));
    return () => {
      unsubscribe();
      configureSessionExpiry(null);
    };
  }, [flow]);

  return (
    <SessionFlowProvider value={flow}>
      <Outlet />
    </SessionFlowProvider>
  );
}
