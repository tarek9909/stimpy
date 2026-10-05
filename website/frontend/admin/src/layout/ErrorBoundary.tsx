import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, ErrorState } from '@stimpy/ui';

interface Props {
  children: ReactNode;
  /** Render a smaller inline fallback instead of the full-page one (around one widget). */
  inline?: boolean;
  /** Changing this value clears the error (route key). */
  resetKey?: string;
}

interface State {
  error: Error | null;
  reference: string | null;
}

function shortId(): string {
  const bytes = new Uint8Array(4);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    return Math.random().toString(16).slice(2, 10);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Top-level error boundary (dashboard-pages 2.4): "Something broke. Reload the page." with a
 * Reload button and a short reference to quote. The error goes to the console only (no
 * third-party reporting in v1), with no request bodies or customer data.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, reference: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, reference: shortId() };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[stimpy:admin] render error', error.name, error.message, info.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, reference: null });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const copy = () => {
      void navigator.clipboard?.writeText(`${this.state.reference ?? ''} ${this.state.error?.name ?? ''}`.trim());
    };
    const body = (
      <ErrorState
        title="Something broke"
        text="Reload the page. If it keeps happening, copy the details and send them to us."
        onRetry={() => window.location.reload()}
        retryLabel="Reload"
        action={
          <Button variant="secondary" onClick={copy}>
            Copy details
          </Button>
        }
        requestId={this.state.reference}
      />
    );
    if (this.props.inline) return body;
    return <div className="flex min-h-dvh items-center justify-center bg-surface-base px-4">{body}</div>;
  }
}
