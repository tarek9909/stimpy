import '@stimpy/ui/fonts.css';
import '@stimpy/ui/tokens.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { getEnv } from './env';
import { Providers } from './app/providers';
import { createQueryClient } from './app/queryClient';
import { createAppRouter, preloadPages } from './app/router';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// After a deploy the old chunk names are gone: reload once to pick up the new build instead of leaving dead links.
window.addEventListener('vite:preloadError', () => {
  try {
    const key = 'stimpy-chunk-reload';
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
});

function showPlainMessage(text: string): void {
  const p = document.createElement('p');
  p.style.cssText = 'font-family:system-ui,sans-serif;padding:24px;max-width:40rem;white-space:pre-wrap';
  p.textContent = text;
  root!.replaceChildren(p);
}

// Clickjacking belt and braces (auth-and-sessions 6.4): the real protection is the
// `frame-ancestors 'none'` header set by the host. Never render the app inside a frame.
if (window.top !== window.self) {
  showPlainMessage("This page can't be shown in a frame.");
} else {
  try {
    getEnv(); // fail fast with a readable message on a bad configuration
    const queryClient = createQueryClient();
    const router = createAppRouter();
    createRoot(root).render(
      <StrictMode>
        <Providers queryClient={queryClient}>
          <RouterProvider router={router} />
        </Providers>
      </StrictMode>,
    );
    preloadPages();
  } catch (e) {
    showPlainMessage(e instanceof Error ? e.message : 'The dashboard could not start.');
  }
}
