'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { MAX_TOASTS, TOAST_DURATION_MS } from '../constants';
import { AlertCircle, CheckCircle2, Info, X } from '../icons';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastOptions {
  /** Auto-dismiss delay. Default 4000. Pass `0` to keep it until dismissed. */
  durationMs?: number;
  /** An action button inside the toast ("Undo", "Open"). Clicking it runs `onClick` and dismisses the toast. */
  action?: { label: string; onClick: () => void };
}

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  durationMs: number;
  action?: { label: string; onClick: () => void };
  /** Bumped when an identical toast is shown again, to restart its timer. */
  nonce: number;
}

export interface ToastApi {
  success(message: string, options?: ToastOptions): number;
  info(message: string, options?: ToastOptions): number;
  error(message: string, options?: ToastOptions): number;
  dismiss(id: number): void;
  dismissAll(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /**
   * Admin: error toasts do not auto-dismiss (the founder may look away).
   * Website: errors are inline/banner, but if one is toasted it dismisses like the others.
   */
  persistErrors?: boolean;
}

export function ToastProvider({ children, persistErrors = false }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-stimpy-live', '');
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const dismissAll = useCallback(() => setToasts([]), []);

  const push = useCallback(
    (tone: ToastTone, message: string, options?: ToastOptions): number => {
      const durationMs = options?.durationMs ?? (tone === 'error' && persistErrors ? 0 : TOAST_DURATION_MS);
      const created = nextId.current;
      let id = created;
      setToasts((current) => {
        // Identical message and tone: refresh the existing toast instead of stacking a copy.
        const dup = current.find((t) => t.tone === tone && t.message === message);
        if (dup) {
          id = dup.id;
          return current.map((t) => (t.id === dup.id ? { ...t, durationMs, action: options?.action, nonce: t.nonce + 1 } : t));
        }
        return [...current, { id: created, tone, message, durationMs, action: options?.action, nonce: 0 }].slice(-MAX_TOASTS);
      });
      nextId.current += 1;
      return id;
    },
    [persistErrors],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push('success', m, o),
      info: (m, o) => push('info', m, o),
      error: (m, o) => push('error', m, o),
      dismiss,
      dismissAll,
    }),
    [push, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {host
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem_+_env(safe-area-inset-bottom)_+_var(--stimpy-sticky-offset,0px))] z-toast flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:items-end md:px-0"
            >
              {toasts.map((t) => (
                <ToastView key={t.id} toast={t} onDismiss={dismiss} />
              ))}
            </div>,
            host,
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.durationMs <= 0 || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, toast.nonce, paused, onDismiss]);

  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertCircle : Info;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-stimpy-fade-in items-start gap-3 rounded-md px-4 py-3 text-body-sm font-medium text-white shadow-float md:w-auto md:min-w-72',
        toast.tone === 'success' && 'bg-success',
        toast.tone === 'info' && 'bg-ink',
        toast.tone === 'error' && 'bg-danger',
      )}
    >
      <Icon width={20} height={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 py-0.5">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="-my-1 inline-flex min-h-11 shrink-0 items-center rounded-md px-3 font-bold underline underline-offset-4 hover:brightness-90"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="-my-2 -mr-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:brightness-90"
      >
        <X width={20} height={20} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Toast API. Throws outside <ToastProvider> so a missing provider is caught in development. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() needs <ToastProvider> above it.');
  return ctx;
}

/** Same as useToast() but returns null when there is no provider (used by CopyButton). */
export function useOptionalToast(): ToastApi | null {
  return useContext(ToastContext);
}
