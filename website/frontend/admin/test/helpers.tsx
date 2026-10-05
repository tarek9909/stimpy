import type { ReactNode } from 'react';
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, UIProvider } from '@stimpy/ui';
import { vi } from 'vitest';
import { Link as RouterLink } from 'react-router-dom';
import { forwardRef, type AnchorHTMLAttributes } from 'react';

const TestLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(function TestLink({ href, ...rest }, ref) {
  return <RouterLink ref={ref} to={href} {...rest} />;
});

export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity }, mutations: { retry: false } } });
}

/** Providers every admin component needs: UI links, toasts, query client. */
export function Wrapper({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const qc = client ?? testQueryClient();
  return (
    <UIProvider link={TestLink}>
      <ToastProvider persistErrors>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </ToastProvider>
    </UIProvider>
  );
}

/** Renders `routes` in a memory router inside the providers. */
export function TestApp({ routes, entries = ['/'], client }: { routes: RouteObject[]; entries?: string[]; client?: QueryClient }) {
  const router = createMemoryRouter(routes, { initialEntries: entries });
  return (
    <Wrapper client={client}>
      <RouterProvider router={router} />
    </Wrapper>
  );
}

export interface FetchCall {
  method: string;
  url: string;
  path: string;
}

type Handler = (req: Request) => Response | Promise<Response>;

/** Stubs `fetch` with `handlers` keyed `"GET /api/v1/auth/me"`. Unknown requests fail the test loudly. */
export function stubFetch(handlers: Record<string, Handler>): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = (typeof input === 'object' && 'method' in input && 'url' in input ? input : new Request(input as string, init)) as Request;
    const url = new URL(req.url);
    calls.push({ method: req.method, url: req.url, path: url.pathname });
    const handler = handlers[`${req.method} ${url.pathname}`];
    if (!handler) throw new Error(`Unexpected request: ${req.method} ${url.pathname}`);
    return handler(req);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export const apiError = (status: number, code: string, message = 'Nope.', extra: Record<string, unknown> = {}) =>
  json({ error: { code, message, details: null, requestId: 'req-12345678-aaaa', ...extra } }, status);

export const OWNER = { id: 1, email: 'owner@stimpy.local', name: 'Owner', role: 'OWNER' as const };
