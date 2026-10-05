import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, useToast } from '@stimpy/ui';
import { AdminForm } from '../../components/form/AdminForm';
import { SwitchField, TextAreaField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { isEmail } from '../../lib/schemas';
import { useSaveSettings, type Settings } from '../../lib/settings';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';

/** Splits "a@x.com, b@y.com" (commas, semicolons, spaces or new lines) into addresses. */
const splitAddresses = (raw: string): string[] => raw.split(/[\s,;]+/).filter(Boolean);

const schema = z
  .object({
    founderEmail: z
      .string()
      .max(1000)
      .refine((v) => splitAddresses(v).every(isEmail), 'Enter valid email addresses separated by commas.')
      .refine((v) => splitAddresses(v).length <= 10, 'Use at most 10 addresses.'),
    onNewOrder: z.boolean(),
    onLowStock: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.onNewOrder || v.onLowStock) && v.founderEmail === '') {
      ctx.addIssue({ code: 'custom', path: ['founderEmail'], message: 'Enter at least one email to send alerts to.' });
    }
  });
type Values = z.infer<typeof schema>;

function toValues(s: Settings): Values {
  return { founderEmail: s.notifications.founderEmail ?? '', onNewOrder: s.notifications.onNewOrder, onLowStock: s.notifications.onLowStock };
}

/** Settings -> Notifications (dashboard-pages 15.3): founder e-mail alerts. */
export function NotificationsTab({ settings }: { settings: Settings }) {
  const toast = useToast();
  const save = useSaveSettings();
  const initial = useMemo(() => toValues(settings), [settings]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);

  return (
    <>
      {draft.banner}
      <AdminForm
        form={form}
        className="flex max-w-2xl flex-col gap-4"
        apiErrors={{ map: (p) => p.replace(/^notifications\./, '') }}
        onSubmit={async (v) => {
          const updated = await save.mutateAsync({
            notifications: { founderEmail: splitAddresses(v.founderEmail).length === 0 ? null : [...new Set(splitAddresses(v.founderEmail))].join(', '), onNewOrder: v.onNewOrder, onLowStock: v.onLowStock },
          });
          form.reset(toValues(updated));
          draft.clear();
          toast.success('Notification settings saved.');
        }}
      >
        <FormSection title="Email alerts" description="Sent to the inboxes below. WhatsApp alerts are not available yet.">
          <TextAreaField
            name="founderEmail"
            label="Send alerts to"
            rows={2}
            maxLength={1000}
            placeholder="you@example.com, partner@example.com"
            hint="One or more addresses, separated by commas or new lines (up to 10). Each gets its own copy. Required when an alert is switched on."
          />
          <SwitchField name="onNewOrder" label="Email me for each new order" />
          <SwitchField name="onLowStock" label="Email me when stock is low" />
          <p className="text-body-sm text-fg-muted">The bell, sound and browser notifications in the top bar are per browser. Set them from the bell.</p>
        </FormSection>
        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>
            Save notifications
          </Button>
        </div>
      </AdminForm>
      {guard.dialog}
    </>
  );
}
