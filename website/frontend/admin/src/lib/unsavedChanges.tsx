import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useLatest } from './hooks';

export interface UnsavedChangesGuard {
  /** Render this somewhere in the page. It is the "Discard changes?" confirmation. */
  dialog: ReactNode;
  /** True while the discard dialog is showing. */
  blocked: boolean;
  /**
   * Run `navigate` without the prompt (after a successful save, or when the user explicitly
   * discards). `guard.bypass(() => navigate('/products'))`.
   */
  bypass: (navigate: () => void) => void;
}

export interface UnsavedChangesOptions {
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
}

/**
 * Unsaved-changes guard for every dirty form (dashboard-pages 1.7, 7.6): blocks in-app navigation
 * (sidebar, back button, links, tab switches that change the URL) with a "Discard changes?" dialog
 * and the browser's own prompt on reload/close. Pass the form's `isDirty`:
 *
 *   const guard = useUnsavedChangesGuard(form.formState.isDirty);
 *   return <>{... form ...}{guard.dialog}</>;
 *
 * Requires a data router (`createBrowserRouter`), which the app and the tests use.
 */
export function useUnsavedChangesGuard(dirty: boolean, options: UnsavedChangesOptions = {}): UnsavedChangesGuard {
  const dirtyRef = useLatest(dirty);
  const bypassing = useRef(false);
  const proceeded = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (!dirtyRef.current || bypassing.current) return false;
    return currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search;
  });

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // If the form is no longer dirty while a block is pending (e.g. it was saved), let the navigation through.
  useEffect(() => {
    if (!dirty && blocker.state === 'blocked') blocker.proceed();
  }, [dirty, blocker]);

  const bypass = useCallback((navigate: () => void) => {
    bypassing.current = true;
    try {
      navigate();
    } finally {
      // Navigation is evaluated synchronously by the router; release on the next tick.
      setTimeout(() => {
        bypassing.current = false;
      }, 0);
    }
  }, []);

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title={options.title ?? 'Discard changes?'}
      description={options.description ?? 'You have unsaved changes. If you leave this page they will be lost.'}
      confirmLabel={options.confirmLabel ?? 'Discard changes'}
      cancelLabel="Keep editing"
      tone="destructive"
      onConfirm={() => {
        proceeded.current = true;
        blocker.proceed?.();
      }}
      onClose={() => {
        if (!proceeded.current && blocker.state === 'blocked') blocker.reset?.();
        proceeded.current = false;
      }}
      reportErrors={false}
    />
  );

  return { dialog, blocked: blocker.state === 'blocked', bypass };
}
