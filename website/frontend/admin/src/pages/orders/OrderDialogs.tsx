import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Modal, useToast } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { AdminForm } from '../../components/form/AdminForm';
import { SelectField, TextAreaField, TextField } from '../../components/form/Field';
import { useAreas } from '../../lib/refdata';
import { optionalEmailSchema } from '../../lib/schemas';
import {
  useExtendHold,
  useSendEmail,
  useSetDeliveryNumber,
  useUpdateContact,
  useUpdateDelivery,
  type AdminOrder,
  type OrderWarning,
} from './api';
import { DELIVERY_NUMBER_REQUIRED_TEXT, DeliveryNumberField, DuplicateDeliveryNotice, useDuplicateDeliveryCheck } from './DeliveryNumberField';

function FormModal({
  open,
  onClose,
  title,
  formId,
  submitLabel,
  submitting,
  children,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  formId: string;
  submitLabel: string;
  submitting: boolean;
  children: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

/* ------------------------------------------------------------------------------ edit contact */

const contactSchema = z.object({
  email: optionalEmailSchema(),
  phone: z.string().trim().min(1, 'Enter a phone number.').max(40, 'That number is too long.'),
  whatsapp: z.string().trim().min(1, 'Enter a WhatsApp number.').max(40, 'That number is too long.'),
});
type ContactValues = z.infer<typeof contactSchema>;

/** `PATCH /admin/orders/:id/contact`: only changed fields are sent; the server's normalised values come back. Allowed in every status. */
export function EditContactDialog({ order, open, onClose }: { order: AdminOrder; open: boolean; onClose: () => void }) {
  const update = useUpdateContact(order.id);
  const toast = useToast();
  const initial: ContactValues = { email: order.contact.email ?? '', phone: order.contact.phone, whatsapp: order.contact.whatsapp };
  const form = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <FormModal open={open} onClose={onClose} title="Edit contact" formId="edit-contact-form" submitLabel="Save contact" submitting={form.formState.isSubmitting}>
      <AdminForm
        form={form}
        id="edit-contact-form"
        autoComplete="off"
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const body: { email?: string | null; phone?: string; whatsapp?: string } = {};
          if (v.email !== initial.email) body.email = v.email === '' ? null : v.email;
          if (v.phone !== initial.phone) body.phone = v.phone;
          if (v.whatsapp !== initial.whatsapp) body.whatsapp = v.whatsapp;
          if (Object.keys(body).length === 0) {
            onClose();
            return;
          }
          await update.mutateAsync(body);
          toast.success('Contact updated.');
          onClose();
        }}
        apiErrors={{ map: (p) => p.replace(/^contact\./, '') }}
      >
        <TextField name="email" label="Email" type="email" inputMode="email" optional placeholder="name@example.com" />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" required hint="03 123 456 or +961 3 123 456" />
        <TextField name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" required />
        <p className="text-body-sm text-fg-muted">This change is logged on the timeline.</p>
      </AdminForm>
    </FormModal>
  );
}

/* ---------------------------------------------------------------------------- edit delivery */

const deliverySchema = z.object({
  areaId: z.string(),
  areaName: z.string().trim().min(1, 'Enter the area.').max(120, 'Use at most 120 characters.'),
  address: z.string().trim().min(5, 'Enter the full address (at least 5 characters).').max(300, 'Use at most 300 characters.'),
  notes: z.string().trim().max(300, 'Use at most 300 characters.'),
});
type DeliveryValues = z.infer<typeof deliverySchema>;

/** `PATCH /admin/orders/:id { delivery }`. Fees and totals are fixed at placement and never recomputed. */
export function EditDeliveryDialog({ order, open, onClose }: { order: AdminOrder; open: boolean; onClose: () => void }) {
  const update = useUpdateDelivery(order.id);
  const areas = useAreas();
  const toast = useToast();
  const initial: DeliveryValues = {
    areaId: order.delivery.areaId === null ? '' : String(order.delivery.areaId),
    areaName: order.delivery.areaName,
    address: order.delivery.address,
    notes: order.delivery.notes ?? '',
  };
  const form = useForm<DeliveryValues>({ resolver: zodResolver(deliverySchema), defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const areaOptions = [{ value: '', label: 'No area chosen' }, ...(areas.data?.items ?? []).map((a) => ({ value: String(a.id), label: a.name }))];
  const areaId = form.watch('areaId');
  useEffect(() => {
    // Picking an area fills its name (still editable).
    const picked = areas.data?.items.find((a) => String(a.id) === areaId);
    if (picked && picked.name !== form.getValues('areaName') && String(order.delivery.areaId ?? '') !== areaId) form.setValue('areaName', picked.name, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  return (
    <FormModal open={open} onClose={onClose} title="Edit delivery" formId="edit-delivery-form" submitLabel="Save delivery" submitting={form.formState.isSubmitting} description="Delivery fee and totals do not change.">
      <AdminForm
        form={form}
        id="edit-delivery-form"
        autoComplete="off"
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          await update.mutateAsync({ areaId: v.areaId === '' ? null : Number(v.areaId), areaName: v.areaName, address: v.address, notes: v.notes === '' ? null : v.notes });
          toast.success('Delivery details updated.');
          onClose();
        }}
        apiErrors={{ map: (p) => p.replace(/^delivery\./, '') }}
      >
        <SelectField name="areaId" label="Area" options={areaOptions} optional />
        <TextField name="areaName" label="Area name" required />
        <TextAreaField name="address" label="Address" required rows={3} maxLength={300} />
        <TextAreaField name="notes" label="Delivery notes" optional rows={2} maxLength={300} />
      </AdminForm>
    </FormModal>
  );
}

/* ---------------------------------------------------------------------- delivery number edit */

/**
 * Correct the delivery number of an order that is already out (`POST /admin/orders/:id/delivery`).
 * The customer's tracking page updates; no new email is sent (use Resend in Emails sent).
 */
export function EditDeliveryNumberDialog({
  order,
  open,
  onClose,
  onWarnings,
}: {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
  onWarnings?: (w: OrderWarning[]) => void;
}) {
  const set = useSetDeliveryNumber(order.id);
  const toast = useToast();
  const notify = useNotifyError();
  const dup = useDuplicateDeliveryCheck(order.id);
  const [value, setValue] = useState(order.deliveryNumber ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(order.deliveryNumber ?? '');
      setError(null);
      dup.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const v = value.trim();
    if (!v) return setError(DELIVERY_NUMBER_REQUIRED_TEXT);
    if (v.length > 60) return setError('Use at most 60 characters.');
    if (v === order.deliveryNumber) return onClose();
    setBusy(true);
    try {
      await dup.check(v);
      const updated = await set.mutateAsync({ deliveryNumber: v });
      toast.success('Delivery number updated.');
      if (updated.warnings.length > 0) onWarnings?.(updated.warnings);
      onClose();
    } catch (e) {
      const api = asApiError(e);
      if (api?.code === 'DELIVERY_NUMBER_REQUIRED') setError(DELIVERY_NUMBER_REQUIRED_TEXT);
      else if (api?.code === 'VALIDATION_ERROR' && api.fields?.deliveryNumber) setError(api.fields.deliveryNumber);
      else notify(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit delivery number"
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEsc={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save delivery number
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body-sm text-fg-muted">
          Correct the delivery number. The customer&apos;s tracking page updates; no new email is sent. Use <strong>Resend</strong> in Emails sent if the customer needs the new number.
        </p>
        <DeliveryNumberField
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          onBlur={() => void dup.check(value)}
          error={error}
          autoFocus
        />
        <DuplicateDeliveryNotice duplicates={dup.duplicates} current={value} />
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------------------- extend hold */

const holdSchema = z.object({
  hours: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a whole number of hours from 1 to 168.')
    .refine((v) => Number(v) >= 1 && Number(v) <= 168, 'Enter a whole number of hours from 1 to 168.'),
});
type HoldValues = z.infer<typeof holdSchema>;

/** `POST /admin/orders/:id/extend-hold { hours }`: the hold becomes now + hours. */
export function ExtendHoldDialog({ order, open, onClose }: { order: AdminOrder; open: boolean; onClose: () => void }) {
  const extend = useExtendHold(order.id);
  const toast = useToast();
  const form = useForm<HoldValues>({ resolver: zodResolver(holdSchema), defaultValues: { hours: '12' } });
  useEffect(() => {
    if (open) form.reset({ hours: '12' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <FormModal open={open} onClose={onClose} title="Extend hold" formId="extend-hold-form" submitLabel="Extend hold" submitting={form.formState.isSubmitting}>
      <AdminForm
        form={form}
        id="extend-hold-form"
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          await extend.mutateAsync({ hours: Number(v.hours) });
          toast.success(`Hold extended by ${v.hours} ${v.hours === '1' ? 'hour' : 'hours'}.`);
          onClose();
        }}
      >
        <p className="text-body-sm text-fg-muted">The stock stays reserved for {order.number} until now plus the hours you enter.</p>
        <TextField name="hours" label="Hours" required inputMode="numeric" hint="1 to 168 hours. The hold becomes now + hours." suffixText="hours" />
      </AdminForm>
    </FormModal>
  );
}

/* ---------------------------------------------------------------------------------- email */

const EMAIL_SHAPE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
/** Splits "a@x.com, b@y.com" (commas, semicolons, spaces or new lines) into addresses. */
const splitAddresses = (raw: string): string[] => raw.split(/[\s,;]+/).filter(Boolean);

const emailSchema = z.object({
  to: z
    .string()
    .max(2000)
    .refine((v) => splitAddresses(v).every((a) => EMAIL_SHAPE.test(a)), 'Enter valid addresses separated by commas.')
    .refine((v) => splitAddresses(v).length <= 20, 'Use at most 20 addresses.'),
  subject: z.string().trim().min(1, 'Enter a subject.').max(200, 'Use at most 200 characters.'),
  body: z.string().trim().min(1, 'Write the message.').max(5000, 'Use at most 5000 characters.'),
});
type EmailValues = z.infer<typeof emailSchema>;

/** Free-form email to the customer and any extra addresses: `POST /admin/orders/:id/email { subject, body, to? }`. Plain text. */
export function SendEmailDialog({ order, open, onClose }: { order: AdminOrder; open: boolean; onClose: () => void }) {
  const send = useSendEmail(order.id);
  const toast = useToast();
  const form = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { to: '', subject: '', body: '' } });
  useEffect(() => {
    if (open) form.reset({ to: '', subject: '', body: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Send email"
      formId="send-email-form"
      submitLabel="Send email"
      submitting={form.formState.isSubmitting}
      description={`${order.contact.email ? `Sent to ${order.contact.email}` : 'This order has no email address'}${order.contact.email ? ' and any addresses you add' : '; add the addresses below'}. Plain text only.`}
    >
      <AdminForm
        form={form}
        id="send-email-form"
        autoComplete="off"
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const to = [...new Set(splitAddresses(v.to))];
          await send.mutateAsync({ subject: v.subject, body: v.body, ...(to.length > 0 ? { to } : {}) });
          toast.success(to.length > 0 ? 'Emails queued.' : 'Email queued.');
          onClose();
        }}
      >
        <TextAreaField
          name="to"
          label="More recipients"
          rows={2}
          maxLength={2000}
          hint="Optional. Separate addresses with commas or new lines. Each person gets their own copy."
          placeholder="name@example.com, other@example.com"
        />
        <TextField name="subject" label="Subject" required maxLength={200} />
        <TextAreaField name="body" label="Message" required rows={6} maxLength={5000} showCount />
      </AdminForm>
    </FormModal>
  );
}

/* ------------------------------------------------------------------------------- exchange */

/** There is no exchange feature in v1: this documents the workflow and links the two real actions. */
export function ExchangeHelpDialog({
  order,
  open,
  onClose,
  onMarkReturned,
}: {
  order: AdminOrder;
  open: boolean;
  onClose: () => void;
  onMarkReturned?: () => void;
}) {
  const canReturn = useMemo(() => order.allowedTransitions.includes('RETURNED'), [order.allowedTransitions]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="How to handle an exchange"
      size="md"
      footer={
        <>
          {canReturn && onMarkReturned ? (
            <Button variant="secondary" onClick={onMarkReturned}>
              Mark returned
            </Button>
          ) : null}
          <Button variant="primary" href={`/orders/new?customerId=${order.customer.id}`}>
            New order for this customer
          </Button>
        </>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 text-body">
        <li>Mark this order as Returned (choose whether to restock).</li>
        <li>Create a new manual order for the replacement.</li>
      </ol>
    </Modal>
  );
}
