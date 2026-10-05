'use client';

/**
 * Last-resort boundary for failures in the root layout. Self-contained: no providers, no layout, no @stimpy/ui styles
 * (they may be what failed), so it carries its own minimal inline styling in the brand colours.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#111111', color: '#FFFFFF' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>Something went wrong.</h1>
          <p style={{ margin: 0, maxWidth: 420 }}>Reload the page. If it keeps happening, message us on WhatsApp.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 48, padding: '0 24px', borderRadius: 12, border: 0, background: '#2E63FF', color: '#FFFFFF', fontSize: 16, fontWeight: 500, cursor: 'pointer' }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
