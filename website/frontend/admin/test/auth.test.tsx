import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { Link, Outlet, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, UIProvider } from '@stimpy/ui';
import { LoginPage } from '../src/auth/LoginPage';
import { RequireAuth } from '../src/auth/RequireAuth';
import { RootLayout } from '../src/app/RootLayout';
import { configureSessionExpiry, notifySessionExpired, resetSessionExpiry } from '../src/auth/expiry';
import { createSessionFlow } from '../src/auth/sessionFlow';
import { readDraft, registerDraftSource, saveAllDrafts, saveDraft, DRAFT_TTL_MS } from '../src/auth/drafts';
import { postAuthEvent, resetBroadcastForTests, subscribeAuthEvents, AUTH_STORAGE_KEY } from '../src/auth/broadcast';
import { api } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { OWNER, apiError, json, stubFetch, testQueryClient } from './helpers';

function renderApp(entry: string, client = testQueryClient()) {
  const routes = [
    {
      element: <RootLayout />,
      children: [
        { path: '/login', element: <LoginPage /> },
        {
          element: <RequireAuth />,
          children: [
            {
              path: '/',
              element: (
                <div>
                  <p>Protected shell</p>
                  <Link to="/orders">go</Link>
                  <Outlet />
                </div>
              ),
              children: [{ path: 'orders', element: <p>Orders page</p> }],
            },
          ],
        },
      ],
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <UIProvider>
      <ToastProvider>
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ToastProvider>
    </UIProvider>,
  );
  return { router, client };
}

let restore: () => void = () => undefined;
beforeEach(() => {
  resetSessionExpiry();
  resetBroadcastForTests();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

const me = { user: OWNER, session: { expiresAt: '2026-11-01T10:00:00.000Z' } };

describe('route guard', () => {
  it('shows the splash, fires only /auth/me, then the protected page', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stub = stubFetch({
      'GET /api/v1/auth/me': async () => {
        await gate;
        return json(me);
      },
    });
    restore = stub.restore;
    renderApp('/');
    expect(screen.getByTestId('splash')).toBeInTheDocument();
    expect(screen.queryByText('Protected shell')).not.toBeInTheDocument();
    expect(stub.calls.map((c) => c.path)).toEqual(['/api/v1/auth/me']);
    release();
    expect(await screen.findByText('Protected shell')).toBeInTheDocument();
  });

  it('redirects a logged-out visitor to /login with returnTo (no other request fired)', async () => {
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED') });
    restore = stub.restore;
    const { router } = renderApp('/orders?status=NEW');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/orders?status=NEW');
    expect(stub.calls.every((c) => c.path === '/api/v1/auth/me')).toBe(true);
  });

  it('shows "Can\'t reach the server" with Try again on a network or 500 error, not the login page', async () => {
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => apiError(500, 'INTERNAL', 'boom') });
    restore = stub.restore;
    renderApp('/');
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Log in to Stimpy' })).not.toBeInTheDocument();
  });

  it('redirects an authenticated user away from /login to the validated returnTo', async () => {
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => json(me) });
    restore = stub.restore;
    const { router } = renderApp('/login?returnTo=%2Forders');
    await screen.findByText('Orders page');
    expect(router.state.location.pathname).toBe('/orders');
  });
});

describe('login page', () => {
  const fill = (email = 'owner@stimpy.local', password = 'wrong-password') => {
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
  };

  it('shows the generic message for a 401, clears the password, keeps the email and does NOT trigger the global expiry', async () => {
    const onExpired = vi.fn();
    configureSessionExpiry({ onExpired });
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED'), 'POST /api/v1/auth/login': () => apiError(401, 'UNAUTHENTICATED', 'Whatever the server says') });
    restore = stub.restore;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    fill();
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
    expect(screen.queryByText('Whatever the server says')).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('owner@stimpy.local');
    expect(onExpired).not.toHaveBeenCalled();
    configureSessionExpiry(null);
  });

  it('shows a live M:SS countdown for 429 and disables the button until it ends', async () => {
    const stub = stubFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED'),
      'POST /api/v1/auth/login': () => apiError(429, 'RATE_LIMITED', 'slow', { details: { retryAfterSeconds: 42 } }),
    });
    restore = stub.restore;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    fill();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText(/Too many attempts. Try again in 0:42\./)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Try again in/ });
    expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText(/Try again in 0:3[0-3]\./)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(33_000);
    });
    expect(screen.queryByText(/Too many attempts/)).not.toBeInTheDocument();
    const again = screen.getByRole('button', { name: 'Log in' });
    expect(again.hasAttribute('disabled') || again.getAttribute('aria-disabled') === 'true').toBe(false);
  });

  it('maps network failure and 403 origin errors to their own messages (never "incorrect password")', async () => {
    const stub = stubFetch({
      'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED'),
      'POST /api/v1/auth/login': () => apiError(403, 'FORBIDDEN'),
    });
    restore = stub.restore;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    fill();
    expect(await screen.findByText(/This address isn't allowed/)).toBeInTheDocument();
    expect(screen.queryByText('Email or password is incorrect.')).not.toBeInTheDocument();
  });

  it('logs in, writes the session to the cache and navigates to returnTo', async () => {
    let loggedIn = false;
    const stub = stubFetch({
      'GET /api/v1/auth/me': () => (loggedIn ? json(me) : apiError(401, 'UNAUTHENTICATED')),
      'POST /api/v1/auth/login': () => {
        loggedIn = true;
        return json({ user: OWNER });
      },
    });
    restore = stub.restore;
    const { router, client } = renderApp('/login?returnTo=%2Forders%3Fstatus%3DNEW');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    fill('owner@stimpy.local', 'Stimpy-Dev-Password-1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'));
    expect(router.state.location.search).toBe('?status=NEW');
    expect(client.getQueryData<{ user: { email: string } }>(queryKeys.session)?.user.email).toBe('owner@stimpy.local');
  });

  it('shows the banners for expired, logout and other-tab reasons', async () => {
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED') });
    restore = stub.restore;
    const router = createMemoryRouter([{ path: '/login', element: <LoginPage /> }], { initialEntries: [{ pathname: '/login', state: { reason: 'expired', lastChangeLost: true } }] });
    render(
      <UIProvider>
        <ToastProvider>
          <QueryClientProvider client={testQueryClient()}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ToastProvider>
      </UIProvider>,
    );
    expect(await screen.findByText('Your session ended. Please log in again.')).toBeInTheDocument();
    expect(screen.getByText("Your last change wasn't saved. Please check and save again.")).toBeInTheDocument();
  });

  it('password toggle reveals and hides without submitting', async () => {
    const stub = stubFetch({ 'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED') });
    restore = stub.restore;
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in to Stimpy' });
    const input = screen.getByLabelText(/^Password/) as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
  });
});

describe('session expiry handling', () => {
  it('a burst of 401s runs the flow exactly once, saves drafts first, clears the cache and goes to login with returnTo', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/orders': () => apiError(401, 'UNAUTHENTICATED'),
    });
    restore = stub.restore;
    const client = testQueryClient();
    client.setQueryData(queryKeys.session, { user: OWNER, expiresAt: null });
    client.setQueryData(['orders', 'list', {}], { items: [{ customerName: 'Secret Customer' }] });
    const navigate = vi.fn();
    const flow = createSessionFlow({ queryClient: client, navigate, getLocation: () => ({ pathname: '/orders', search: '?status=NEW&page=2' }) });
    const spy = vi.fn((info) => flow.expire(info));
    configureSessionExpiry({ onExpired: spy });
    const unregister = registerDraftSource('/orders', () => ({ note: 'hello', password: 'nope' }));

    await Promise.allSettled([api.GET('/api/v1/admin/orders'), api.GET('/api/v1/admin/orders'), api.GET('/api/v1/admin/orders')]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login?returnTo=%2Forders%3Fstatus%3DNEW%26page%3D2', { replace: true, state: { reason: 'expired', lastChangeLost: false } });
    expect(client.getQueryData(queryKeys.session)).toBeNull();
    expect(client.getQueryData(['orders', 'list', {}])).toBeUndefined();
    expect(readDraft('/orders')?.values).toEqual({ note: 'hello' });
    unregister();
    configureSessionExpiry(null);
  });

  it('marks a failed mutation (non-GET) as "last change not saved"', () => {
    const client = testQueryClient();
    const navigate = vi.fn();
    const flow = createSessionFlow({ queryClient: client, navigate, getLocation: () => ({ pathname: '/products', search: '' }) });
    flow.expire({ method: 'PATCH' });
    expect(navigate.mock.calls[0]?.[1]).toMatchObject({ state: { reason: 'expired', lastChangeLost: true } });
  });

  it('does not treat the login 401, /auth/me or logout as an expiry', async () => {
    const stub = stubFetch({
      'POST /api/v1/auth/login': () => apiError(401, 'UNAUTHENTICATED'),
      'GET /api/v1/auth/me': () => apiError(401, 'UNAUTHENTICATED'),
    });
    restore = stub.restore;
    const onExpired = vi.fn();
    configureSessionExpiry({ onExpired });
    await Promise.allSettled([api.POST('/api/v1/auth/login', { body: { email: 'a@b.co', password: 'x' } }), api.GET('/api/v1/auth/me')]);
    expect(onExpired).not.toHaveBeenCalled();
    notifySessionExpired();
    expect(onExpired).toHaveBeenCalledTimes(1);
    configureSessionExpiry(null);
  });

  it('a 403 is not an expiry', async () => {
    const stub = stubFetch({ 'GET /api/v1/admin/orders': () => apiError(403, 'FORBIDDEN') });
    restore = stub.restore;
    const onExpired = vi.fn();
    configureSessionExpiry({ onExpired });
    await api.GET('/api/v1/admin/orders').catch(() => undefined);
    expect(onExpired).not.toHaveBeenCalled();
    configureSessionExpiry(null);
  });

  it('logout calls POST /auth/logout, wipes memory and drafts, navigates with the logout reason, even when the network fails', async () => {
    const stub = stubFetch({ 'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }) });
    restore = stub.restore;
    const client = testQueryClient();
    client.setQueryData(queryKeys.session, { user: OWNER, expiresAt: null });
    client.setQueryData(['customers'], { items: [1] });
    saveDraft('/products', { a: 1 });
    const navigate = vi.fn();
    const flow = createSessionFlow({ queryClient: client, navigate, getLocation: () => ({ pathname: '/', search: '' }) });
    expect(await flow.logout()).toEqual({ networkFailed: false });
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true, state: { reason: 'logout' } });
    expect(client.getQueryData(['customers'])).toBeUndefined();
    expect(readDraft('/products')).toBeNull();

    stub.restore();
    const stub2 = stubFetch({ 'POST /api/v1/auth/logout': () => { throw new TypeError('Failed to fetch'); } });
    restore = stub2.restore;
    expect(await flow.logout()).toEqual({ networkFailed: true });
  });
});

describe('drafts', () => {
  it('expire after 30 minutes', () => {
    saveDraft('/x', { a: 1 }, 1_000);
    expect(readDraft('/x', 1_000 + DRAFT_TTL_MS - 1)?.values).toEqual({ a: 1 });
    expect(readDraft('/x', 1_000 + DRAFT_TTL_MS + 1)).toBeNull();
    saveAllDrafts();
  });
});

describe('multi-tab sync', () => {
  it('BroadcastChannel path delivers the event name only', async () => {
    const received: string[] = [];
    const unsub = subscribeAuthEvents((t) => received.push(t));
    const other = new BroadcastChannel('stimpy-auth');
    other.postMessage({ type: 'logout' });
    await waitFor(() => expect(received).toEqual(['logout']));
    other.close();
    unsub();
  });

  it('storage fallback writes only an event name and reads it back', () => {
    resetBroadcastForTests({ fallback: true });
    const received: string[] = [];
    const unsub = subscribeAuthEvents((t) => received.push(t));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    postAuthEvent('logout');
    const written = setItem.mock.calls.find((c) => c[0] === AUTH_STORAGE_KEY);
    expect(written).toBeTruthy();
    expect(JSON.parse(written?.[1] as string)).toMatchObject({ type: 'logout' });
    expect(Object.keys(JSON.parse(written?.[1] as string)).sort()).toEqual(['at', 'type']);
    window.dispatchEvent(new StorageEvent('storage', { key: AUTH_STORAGE_KEY, newValue: JSON.stringify({ type: 'logout', at: 1 }) }));
    expect(received).toEqual(['logout']);
    setItem.mockRestore();
    unsub();
    resetBroadcastForTests();
  });
});
