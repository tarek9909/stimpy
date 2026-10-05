import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Check, Circle, ShieldCheck } from 'lucide-react';
import { Banner, Button, Input, Pill, useToast } from '@stimpy/ui';
import { api } from '../../api/client';
import { asApiError } from '../../api/errors';
import { postAuthEvent } from '../../auth/broadcast';
import { useSession } from '../../auth/session';
import { AdminForm } from '../../components/form/AdminForm';
import { Field } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';

export const MIN_PASSWORD_LENGTH = 12;

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string().min(1, 'Repeat the new password.'),
  })
  .superRefine((v, ctx) => {
    if (v.newPassword && v.currentPassword && v.newPassword === v.currentPassword) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'Choose a password that is different from your current one.' });
    }
    if (v.confirmPassword && v.newPassword !== v.confirmPassword) {
      ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: "The passwords don't match." });
    }
  });
type Values = z.infer<typeof schema>;

const EMPTY: Values = { currentPassword: '', newPassword: '', confirmPassword: '' };

function useSecondsUntil(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * Settings -> Account (auth-and-sessions 2.7, dashboard-pages 15.1): who is signed in and the
 * change-password form. Rules: at least 12 characters (live count, submit blocked below it), new
 * differs from current, confirm matches. Everything else the server judges (common passwords land
 * on `newPassword`). A wrong current password is `400` on `currentPassword`, never a 401, so it
 * is shown on that field and the session stays. Passwords are never stored, logged or put in URLs,
 * and the form is cleared after the request.
 */
export function AccountTab() {
  const { user } = useSession();
  const toast = useToast();
  const [deadline, setDeadline] = useState<number | null>(null);
  const secondsLeft = useSecondsUntil(deadline);
  const limited = deadline !== null && secondsLeft > 0;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const newPassword = form.watch('newPassword');

  const change = useMutation({
    mutationFn: async (v: Values) => {
      await api.POST('/api/v1/auth/change-password', { body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
    },
  });

  const lengthOk = newPassword.length >= MIN_PASSWORD_LENGTH;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <FormSection title="Your account">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-body-sm text-fg-muted">Email</dt>
            <dd className="break-all font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-body-sm text-fg-muted">Role</dt>
            <dd className="font-medium">{user.role === 'OWNER' ? 'Owner' : user.role}</dd>
          </div>
        </dl>
      </FormSection>

      <FormSection title="Change password" description="Other devices are logged out when you change it. This one stays logged in.">
        <AdminForm
          form={form}
          autoComplete="on"
          className="flex flex-col gap-4"
          apiErrors={{ messages: { currentPassword: 'Current password is incorrect.' } }}
          onSubmit={async (values) => {
            try {
              await change.mutateAsync(values);
            } catch (e) {
              const err = asApiError(e);
              if (err?.code === 'RATE_LIMITED') setDeadline(Date.now() + (err.retryAfterSeconds ?? 30) * 1000);
              // Only the current-password field is cleared after a wrong current password.
              if (err?.code === 'VALIDATION_ERROR' && err.fields?.currentPassword) form.setValue('currentPassword', '');
              throw e;
            }
            form.reset(EMPTY);
            postAuthEvent('password-changed');
            toast.success('Password changed. Other devices were logged out.');
          }}
        >
          {limited ? <Banner variant="warning" live>Too many attempts. Try again in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}.</Banner> : null}

          <Field name="currentPassword" label="Current password" required>
            {(p) => (
              <Input
                id={p.id}
                name={p.name}
                type="password"
                autoComplete="current-password"
                value={(p.value as string) ?? ''}
                onChange={(e) => p.onChange(e.target.value)}
                onBlur={p.onBlur}
                ref={p.ref as React.Ref<HTMLInputElement>}
                invalid={p.invalid}
                aria-describedby={p['aria-describedby']}
              />
            )}
          </Field>

          <Field
            name="newPassword"
            label="New password"
            required
            hint={
              <span className="inline-flex items-center gap-1.5" aria-live="polite">
                {lengthOk ? <Check size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
                At least {MIN_PASSWORD_LENGTH} characters ({newPassword.length} so far)
              </span>
            }
          >
            {(p) => (
              <Input
                id={p.id}
                name={p.name}
                type="password"
                autoComplete="new-password"
                value={(p.value as string) ?? ''}
                onChange={(e) => p.onChange(e.target.value)}
                onBlur={p.onBlur}
                ref={p.ref as React.Ref<HTMLInputElement>}
                invalid={p.invalid}
                aria-describedby={p['aria-describedby']}
              />
            )}
          </Field>

          <Field name="confirmPassword" label="Confirm new password" required>
            {(p) => (
              <Input
                id={p.id}
                name={p.name}
                type="password"
                autoComplete="new-password"
                value={(p.value as string) ?? ''}
                onChange={(e) => p.onChange(e.target.value)}
                onBlur={p.onBlur}
                ref={p.ref as React.Ref<HTMLInputElement>}
                invalid={p.invalid}
                aria-describedby={p['aria-describedby']}
              />
            )}
          </Field>

          <div>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting || change.isPending} disabled={limited}>
              Change password
            </Button>
          </div>
        </AdminForm>
      </FormSection>

      <FormSection
        title="Two-factor authentication"
        aside={<Pill tone="cream">Later</Pill>}
        description="Coming later. Two-factor login, email change and log out everywhere are not part of this version."
      >
        <p className="flex items-center gap-2 text-body-sm text-fg-muted">
          <ShieldCheck size={18} aria-hidden="true" />
          Not available yet.
        </p>
      </FormSection>
      {guard.dialog}
    </div>
  );
}
