import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { ErrorSummary, focusFirstInvalid, type ErrorSummaryItem } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { applyApiErrors, flattenFormErrors, type ApplyApiErrorsOptions, type UnmappedError } from './apiErrors';

export interface AdminFormProps<TIn extends FieldValues, TCtx, TOut extends FieldValues> {
  form: UseFormReturn<TIn, TCtx, TOut>;
  /**
   * Runs with the validated values. Throw (or reject with) the `ApiError` to have its `fields`
   * mapped onto inputs; any other failure is toasted. Resolve normally on success.
   */
  onSubmit: (values: TOut) => unknown | Promise<unknown>;
  children: ReactNode;
  /** See `applyApiErrors`: API path -> form field. */
  apiErrors?: ApplyApiErrorsOptions;
  summaryTitle?: string;
  className?: string;
  id?: string;
  /** `off` for forms that hold customer data (auth-and-sessions 6.5). Default `on`. */
  autoComplete?: 'on' | 'off';
}

/**
 * The form shell used by every dashboard form: React Hook Form provider, `noValidate` (messages are
 * ours), an `ErrorSummary` of everything that is wrong (client AND server), focus on the first
 * invalid field after a failed submit, and the API `fields` mapping (`applyApiErrors`). A double
 * submit is ignored while the first is in flight. It never disables the submit button for an
 * invalid form: give the button `loading={form.formState.isSubmitting}`.
 *
 *   const form = useForm<In, unknown, Out>({ resolver: zodResolver(schema), defaultValues });
 *   <AdminForm form={form} onSubmit={(v) => save.mutateAsync(toBody(v))}>
 *     <TextField name="name" label="Name" required />
 *     <Button type="submit" loading={form.formState.isSubmitting}>Save</Button>
 *   </AdminForm>
 */
export function AdminForm<TIn extends FieldValues, TCtx, TOut extends FieldValues>({
  form,
  onSubmit,
  children,
  apiErrors,
  summaryTitle = 'Please fix the following',
  className,
  id,
  autoComplete = 'on',
}: AdminFormProps<TIn, TCtx, TOut>) {
  const formRef = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const notifyError = useNotifyError();
  const [unmapped, setUnmapped] = useState<UnmappedError[]>([]);
  const [summaryKey, setSummaryKey] = useState(0);

  const focusFirst = () => {
    // Wait a frame so aria-invalid is on the DOM.
    requestAnimationFrame(() => {
      if (formRef.current) focusFirstInvalid(formRef.current);
    });
  };

  const submit = form.handleSubmit(
    async (values) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setUnmapped([]);
      try {
        await onSubmit(values);
      } catch (error) {
        const applied = applyApiErrors(form, error, apiErrors);
        if (applied.handled) {
          setUnmapped(applied.unmapped);
          setSummaryKey((k) => k + 1);
          focusFirst();
        } else {
          const api = asApiError(error);
          // A 401 is handled by the global expiry flow (redirect + banner), not a toast.
          if (api?.code !== 'UNAUTHENTICATED') notifyError(error);
        }
      } finally {
        inFlight.current = false;
      }
    },
    () => {
      setUnmapped([]);
      setSummaryKey((k) => k + 1);
      focusFirst();
    },
  );

  const clientErrors = flattenFormErrors(form.formState.errors);
  const items: ErrorSummaryItem[] = [
    ...clientErrors.map((e) => ({ fieldId: `field-${e.name}`, message: e.message })),
    ...unmapped.map((e) => ({ message: e.message })),
  ];
  const showSummary = (form.formState.submitCount > 0 || unmapped.length > 0) && items.length > 0;

  return (
    <FormProvider {...(form as unknown as UseFormReturn<FieldValues>)}>
      <form
        ref={formRef}
        id={id}
        noValidate
        autoComplete={autoComplete}
        className={className}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          void submit(e);
        }}
      >
        {showSummary ? <ErrorSummary key={summaryKey} errors={items} title={summaryTitle} className="mb-4" /> : null}
        {children}
      </form>
    </FormProvider>
  );
}
