import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send } from 'lucide-react';
import { Button, FormField, Input, Switch, TextLink, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminForm } from '../../components/form/AdminForm';
import { SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { emailSchema } from '../../lib/schemas';
import { useSaveSettings, type Settings } from '../../lib/settings';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';


const schema = z.object({
  enabled: z.boolean(),
  senderName: z.string().trim().min(1, 'Enter the sender name.').max(100, 'Use at most 100 characters.'),
  senderAddress: emailSchema(),
  replyTo: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address.')
    .optional(),
  smtpHost: z.string().trim().min(1, 'Enter the SMTP server.').max(255),
  smtpPort: z.coerce.number().int().min(1, 'Enter a valid port.').max(65535, 'Enter a valid port.'),
  smtpUser: z.string().trim().max(190),
  smtpSecure: z.boolean(),
  smtpPassword: z.string().max(255, 'Use at most 255 characters.').optional(),
  footerText: z.string().max(500, 'Use at most 500 characters.'),
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
    smtpHost: e.smtpHost ?? 'smtp.gmail.com',
    smtpPort: e.smtpPort ?? 587,
    smtpUser: e.smtpUser ?? e.senderAddress,
    smtpSecure: e.smtpSecure,
    smtpPassword: e.smtpPassword ?? '',
    footerText: e.footerText,
    campaignRecipientCap: e.campaignRecipientCap,
  };
}

/**
 * Settings -> Customer email (dashboard-pages 15.4): sender identity, SMTP connection, and customer email preferences.
 */
export function CustomerEmailTab({ settings }: { settings: Settings }) {
  const toast = useToast();
  const notify = useNotifyError();
  const save = useSaveSettings();
  const [testPending, setTestPending] = useState(false);
  const [testRecipient, setTestRecipient] = useState(settings.email.senderAddress);
  const [testRecipientError, setTestRecipientError] = useState<string | null>(null);
  const initial = useMemo(() => toValues(settings), [settings]);
  const form = useForm<InputValues, unknown, Values>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const enabled = useWatch({ control: form.control, name: 'enabled' });
  const [confirmOff, setConfirmOff] = useState(false);

  const saveValues = async (v: Values) => {
    const smtpPassword = v.smtpPassword?.trim() || null;
    const replyTo = v.replyTo?.trim() ? v.replyTo.trim() : v.senderAddress;
    const updated = await save.mutateAsync({
      email: {
        enabled: v.enabled,
        senderName: v.senderName,
        senderAddress: v.senderAddress,
        replyTo,
        footerText: v.footerText,
        campaignRecipientCap: v.campaignRecipientCap,
        smtpHost: smtpPassword ? v.smtpHost.trim() : null,
        smtpPort: smtpPassword ? v.smtpPort : null,
        smtpUser: smtpPassword ? (v.smtpUser.trim() || v.senderAddress) : null,
        smtpPassword,
        smtpSecure: smtpPassword ? v.smtpSecure : false,
      },
    });
    form.reset(toValues(updated));
    draft.clear();
  };

  const sendTest = async () => {
    if (testPending || form.formState.isSubmitting || save.isPending) return;
    const parsedRecipient = emailSchema().safeParse(testRecipient.trim());
    if (!parsedRecipient.success) {
      setTestRecipientError(parsedRecipient.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }
    const recipient = parsedRecipient.data;
    setTestRecipientError(null);
    setTestPending(true);
    try {
      await form.handleSubmit(async (values) => {
        if (form.formState.isDirty) await saveValues(values);
        await unwrap(api.POST('/api/v1/admin/email-templates/{key}/test', {
          params: { path: { key: 'order_received' } },
          body: { to: recipient },
        }));
        toast.success(`Test email queued to ${recipient}. Check Content → Emails for its delivery status.`);
      })();
    } catch (error) {
      notify(error);
    } finally {
      setTestPending(false);
    }
  };

  return (
    <>
      {draft.banner}
      <AdminForm
        form={form}
        className="flex max-w-2xl flex-col gap-4"
        apiErrors={{ map: (p) => p.replace(/^email\./, '') }}
        onSubmit={async (v) => {
          await saveValues(v);
          toast.success('Email settings saved.');
        }}
      >
        <FormSection
          title="Customer email & delivery"
          description="Configure the mailbox the website uses to send email. Hostinger uses smtp.hostinger.com with port 465 and SSL/TLS, or port 587 with STARTTLS."
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
              maxLength={100}
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
              hint="Emails will appear from this address (e.g. info@yourdomain.com)."
            />
            <TextField
              name="smtpHost"
              label="SMTP server"
              required
              autoComplete="off"
              placeholder="smtp.hostinger.com"
              hint="Enter the outgoing mail server provided by your email provider."
            />
            <TextField
              name="smtpPort"
              label="SMTP port"
              type="number"
              inputMode="numeric"
              min={1}
              max={65535}
              required
              hint="Hostinger: 465 for SSL/TLS, or 587 for STARTTLS."
            />
            <TextField
              name="smtpUser"
              label="SMTP username"
              autoComplete="username"
              hint="Usually your full mailbox address."
            />
            <TextField
              name="smtpPassword"
              label="SMTP password"
              type="password"
              autoComplete="new-password"
              hint="For Hostinger, use the mailbox password. For Gmail, use a Google App Password."
            />
            <SwitchField name="smtpSecure" label="Use SSL/TLS (port 465)" description="Turn off for port 587 with STARTTLS." />
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
            maxLength={500}
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
        <FormField
          label="Send test to"
          name="smtp-test-recipient"
          error={testRecipientError}
          hint="Choose any inbox you can access. This does not change the sender or order alert recipient."
        >
          <Input
            type="email"
            value={testRecipient}
            onChange={(event) => {
              setTestRecipient(event.target.value);
              setTestRecipientError(null);
            }}
            autoComplete="email"
            inputMode="email"
          />
        </FormField>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" loading={testPending || save.isPending} leftIcon={<Send size={18} aria-hidden="true" />} onClick={() => void sendTest()}>
            Send test email
          </Button>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>
            Save email settings
          </Button>
        </div>
        <p className="text-body-sm text-fg-muted">The test sends a sample order email to the address above and saves any unsaved email settings first.</p>
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
