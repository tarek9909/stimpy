import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Switch, TextLink, useToast } from '@stimpy/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminForm } from '../../components/form/AdminForm';
import { TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { emailSchema } from '../../lib/schemas';
import { useSaveSettings, type Settings } from '../../lib/settings';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';


const schema = z.object({
  enabled: z.boolean(),
  senderName: z.string().trim().min(1, 'Enter the sender name.').max(120, 'Use at most 120 characters.'),
  senderAddress: emailSchema(),
  replyTo: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.')
    .optional(),
  smtpPassword: z.string().max(255, 'Use at most 255 characters.').optional(),
  footerText: z.string().max(2000, 'Use at most 2000 characters.'),
  campaignRecipientCap: z.coerce.number().int().min(1, 'Use at least 1 recipient.').max(5000, 'Use at most 5,000 recipients.'),
});
type Values = z.output<typeof schema>;
type InputValues = z.input<typeof schema>;

function toValues(s: Settings): Values {
  const e = s.email;
  return {
    enabled: e.enabled,
    senderName: e.senderName,
    senderAddress: e.senderAddress,
    replyTo: e.replyTo && e.replyTo !== e.senderAddress ? e.replyTo : '',
    smtpPassword: e.smtpPassword ?? '',
    footerText: e.footerText,
    campaignRecipientCap: e.campaignRecipientCap,
  };
}

/**
 * Settings -> Customer email (dashboard-pages 15.4): sender email, app password, display name,
 * reply-to, and footer text. SMTP host and port 587 are static.
 */
export function CustomerEmailTab({ settings }: { settings: Settings }) {
  const toast = useToast();
  const save = useSaveSettings();
  const initial = useMemo(() => toValues(settings), [settings]);
  const form = useForm<InputValues, unknown, Values>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const enabled = useWatch({ control: form.control, name: 'enabled' });
  const [confirmOff, setConfirmOff] = useState(false);

  return (
    <>
      {draft.banner}
      <AdminForm
        form={form}
        className="flex max-w-2xl flex-col gap-4"
        apiErrors={{ map: (p) => p.replace(/^email\./, '') }}
        onSubmit={async (v) => {
          const appPassword = v.smtpPassword?.trim() || null;
          const replyTo = v.replyTo?.trim() ? v.replyTo.trim() : v.senderAddress;
          const payload = {
            enabled: v.enabled,
            senderName: v.senderName,
            senderAddress: v.senderAddress,
            replyTo,
            footerText: v.footerText,
            campaignRecipientCap: v.campaignRecipientCap,
            smtpHost: appPassword ? (settings.email.smtpHost || 'smtp.gmail.com') : null,
            smtpPort: appPassword ? 587 : null,
            smtpUser: appPassword ? v.senderAddress : null,
            smtpPassword: appPassword,
            smtpSecure: false,
          };
          const updated = await save.mutateAsync({ email: payload });
          form.reset(toValues(updated));
          draft.clear();
          toast.success('Email settings saved.');
        }}
      >
        <FormSection
          title="Customer email & delivery"
          description="Send order confirmation and status updates to customers. Host is static on port 587 — enter the sender email and your app password."
        >
          <Switch
            id="field-enabled"
            label="Send automatic emails to customers"
            description="Order received, confirmed, on its way, delivered and cancelled."
            checked={enabled}
            onChange={(on) => {
              if (on) form.setValue('enabled', true, { shouldDirty: true });
              else setConfirmOff(true);
            }}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              name="senderName"
              label="Sender display name"
              required
              autoComplete="off"
              hint="Shown as the display name in the customer inbox (e.g. Stimpy)."
            />
            <TextField
              name="senderAddress"
              label="Sender email"
              type="email"
              inputMode="email"
              required
              autoComplete="off"
              hint="Emails will appear from this address (e.g. yourname@gmail.com)."
            />
            <TextField
              name="smtpPassword"
              label="App password"
              type="password"
              autoComplete="new-password"
              hint="16-character App Password (e.g. from Google Account > App Passwords). Port 587 is static."
            />
            <TextField
              name="replyTo"
              label="Reply-to address (optional)"
              type="email"
              inputMode="email"
              autoComplete="off"
              hint="Replies to customer emails go here. Leave blank to use the sender email."
            />
          </div>
          <TextAreaField
            name="footerText"
            label="Footer text"
            rows={3}
            maxLength={2000}
            showCount
            hint="Shown at the bottom of every customer email. The email layout and logo are fixed."
          />
          <TextField
            name="campaignRecipientCap"
            label="Maximum campaign recipients"
            type="number"
            inputMode="numeric"
            required
            hint="Safety limit applied by the server to each confirmed email or WhatsApp campaign. Default: 200."
          />
          <p className="text-body-sm">
            Wording of each email: <TextLink href="/content?tab=emails">Edit email templates</TextLink>
          </p>
        </FormSection>
        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>
            Save email settings
          </Button>
        </div>
      </AdminForm>

      <ConfirmDialog
        open={confirmOff}
        title="Stop sending emails?"
        description="Customers will stop receiving order updates by email."
        confirmLabel="Turn off emails"
        tone="destructive"
        onClose={() => setConfirmOff(false)}
        onConfirm={() => form.setValue('enabled', false, { shouldDirty: true })}
      />
      {guard.dialog}
    </>
  );
}
