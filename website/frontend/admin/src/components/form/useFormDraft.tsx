import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Banner, Button } from '@stimpy/ui';
import { clearDraft, readDraft, registerDraftSource } from '../../auth/drafts';

export interface FormDraft {
  /** A draft was loaded into the form on mount. */
  restored: boolean;
  /** Render this above the form: "We restored your unsaved changes. [Discard]". */
  banner: ReactNode;
  /** Forget the stored draft (call after a successful save). */
  clear: () => void;
}

/**
 * Keeps a form's unsaved values across a session expiry (auth-and-sessions 2.3). While the form
 * is dirty it registers itself; if the session ends, the shell writes the values to
 * `sessionStorage` (never passwords or files). After login this hook restores them on mount,
 * marks the form dirty and offers **Discard**. Drafts older than 30 minutes are ignored.
 * Mount it only once the form has its real default values (render the form component after the
 * data loaded). The draft key is the route path.
 */
export function useFormDraft<T extends FieldValues, C, O extends FieldValues>(form: UseFormReturn<T, C, O>, options: { enabled?: boolean } = {}): FormDraft {
  const { enabled = true } = options;
  const { pathname } = useLocation();
  const dirtyRef = useRef(false);
  dirtyRef.current = form.formState.isDirty;
  const formRef = useRef(form);
  formRef.current = form;
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    return registerDraftSource(pathname, () => (dirtyRef.current ? (formRef.current.getValues() as Record<string, unknown>) : null));
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return;
    const draft = readDraft(pathname);
    if (!draft) return;
    for (const [key, value] of Object.entries(draft.values)) {
      formRef.current.setValue(key as never, value as never, { shouldDirty: true });
    }
    setRestored(true);
    // Restore once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = useCallback(() => clearDraft(pathname), [pathname]);

  const banner = restored ? (
    <Banner
      variant="info"
      live
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            clearDraft(pathname);
            formRef.current.reset();
            setRestored(false);
          }}
        >
          Discard
        </Button>
      }
    >
      We restored your unsaved changes.
    </Banner>
  ) : null;

  return { restored, banner, clear };
}
