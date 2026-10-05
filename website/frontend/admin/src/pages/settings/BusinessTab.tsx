import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, isValidTimeZone, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminForm } from '../../components/form/AdminForm';
import { applyApiErrors } from '../../components/form/apiErrors';
import { ComboboxField, MoneyField, SwitchField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { centsToDollarString } from '../../lib/format';
import { dollarsToCents, intStringSchema, moneySchema, optionalEmailSchema } from '../../lib/schemas';
import { useSaveSettings, type Settings } from '../../lib/settings';
import { listTimeZones } from '../../lib/timezones';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the business name.').max(120, 'Use at most 120 characters.'),
  whatsappNumber: z.string().trim().max(40, 'That number is too long.'),
  supportEmail: optionalEmailSchema(),
  instagramUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https:\/\/\S+$/i.test(v), 'The link must start with https://'),
  timezone: z.string().refine((v) => isValidTimeZone(v), 'Choose a time zone from the list.'),
  numberPrefix: z
    .string()
    .trim()
    .min(1, 'Enter a prefix.')
    .max(8, 'Use at most 8 characters.')
    .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only.'),
  firstNumber: intStringSchema({ min: 1, label: 'a whole number' }),
  stockHoldHours: intStringSchema({ min: 1, max: 168, label: 'a number of hours' }),
  autoExpireUnconfirmed: z.boolean(),
  lowStockThreshold: intStringSchema({ min: 0, max: 1000, label: 'a number' }),
  hardwareCost: moneySchema(),
});
type Values = z.infer<typeof schema>;

export function toValues(s: Settings): Values {
  return {
    name: s.business.name,
    whatsappNumber: s.business.whatsappNumber ?? '',
    supportEmail: s.business.supportEmail ?? '',
    instagramUrl: s.business.instagramUrl ?? '',
    timezone: s.business.timezone,
    numberPrefix: s.orders.numberPrefix,
    firstNumber: String(s.orders.firstNumber),
    stockHoldHours: String(s.orders.stockHoldHours),
    autoExpireUnconfirmed: s.orders.autoExpireUnconfirmed,
    lowStockThreshold: String(s.orders.lowStockThreshold),
    hardwareCost: centsToDollarString(s.orders.hardwareCostCents),
  };
}

const MAP: Record<string, string> = {
  'business.name': 'name',
  'business.whatsappNumber': 'whatsappNumber',
  'business.supportEmail': 'supportEmail',
  'business.instagramUrl': 'instagramUrl',
  'business.timezone': 'timezone',
  'orders.numberPrefix': 'numberPrefix',
  'orders.firstNumber': 'firstNumber',
  'orders.stockHoldHours': 'stockHoldHours',
  'orders.autoExpireUnconfirmed': 'autoExpireUnconfirmed',
  'orders.lowStockThreshold': 'lowStockThreshold',
  'orders.hardwareCostCents': 'hardwareCost',
};

/**
 * Settings -> Business (dashboard-pages 15.2): the business group and the order-numbering and
 * stock rules, saved together with `PATCH /admin/settings { business, orders }`. Changing the order
 * prefix or first number asks for confirmation. Nullable fields send `null` when empty (the server
 * never turns an empty string into null). The server's normalised values (E.164 WhatsApp number)
 * replace the form after saving.
 */
export function BusinessTab({ settings }: { settings: Settings }) {
  const toast = useToast();
  const notifyError = useNotifyError();
  const save = useSaveSettings();
  const initial = useMemo(() => toValues(settings), [settings]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [pending, setPending] = useState<Values | null>(null);
  const zones = useMemo(() => listTimeZones(settings.business.timezone).map((z) => ({ value: z, label: z })), [settings.business.timezone]);

  const send = async (v: Values) => {
    const updated = await save.mutateAsync({
      business: {
        name: v.name,
        whatsappNumber: v.whatsappNumber === '' ? null : v.whatsappNumber,
        supportEmail: v.supportEmail === '' ? null : v.supportEmail,
        instagramUrl: v.instagramUrl === '' ? null : v.instagramUrl,
        timezone: v.timezone,
      },
      orders: {
        numberPrefix: v.numberPrefix.toUpperCase(),
        firstNumber: Number(v.firstNumber),
        stockHoldHours: Number(v.stockHoldHours),
        autoExpireUnconfirmed: v.autoExpireUnconfirmed,
        lowStockThreshold: Number(v.lowStockThreshold),
        hardwareCostCents: dollarsToCents(v.hardwareCost),
      },
    });
    form.reset(toValues(updated));
    draft.clear();
    toast.success('Business settings saved.');
  };

  const numberingChanged = (v: Values) => v.numberPrefix.toUpperCase() !== initial.numberPrefix || v.firstNumber !== initial.firstNumber;

  const confirmText = (v: Values) => {
    const firstChanged = v.firstNumber !== initial.firstNumber;
    const prefix = v.numberPrefix.toUpperCase();
    return firstChanged
      ? `New orders will start at ${prefix}-${v.firstNumber}.`
      : `New orders will use the prefix ${prefix}. Existing orders keep their numbers.`;
  };

  return (
    <>
      {draft.banner}
      <AdminForm
        form={form}
        className="flex max-w-3xl flex-col gap-4"
        apiErrors={{ map: (path) => MAP[path] ?? null }}
        onSubmit={async (v) => {
          if (numberingChanged(v)) {
            setPending(v);
            return;
          }
          await send(v);
        }}
      >
        <FormSection title="Business">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="name" label="Business name" required maxLength={120} autoComplete="organization" />
            <TextField
              name="whatsappNumber"
              label="WhatsApp number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              hint="Customers' WhatsApp confirmation opens a chat with this number. Saved as +961XXXXXXXX."
            />
            <TextField name="supportEmail" label="Support email" type="email" inputMode="email" optional autoComplete="email" />
            <TextField name="instagramUrl" label="Instagram link" type="url" inputMode="url" optional placeholder="https://instagram.com/..." hint="Must start with https://" />
          </div>
          <ComboboxField name="timezone" label="Time zone" required options={zones} hint="Dates, 'today' and date ranges in the dashboard and website use this time zone." />
        </FormSection>

        <FormSection title="Orders and stock" description="Rules the shop applies to every new order.">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              name="numberPrefix"
              label="Order number prefix"
              required
              maxLength={8}
              autoComplete="off"
              transform={(v) => v.toUpperCase()}
              hint="Applies to new orders only. Existing orders keep their numbers."
            />
            <TextField
              name="firstNumber"
              label="First order number"
              required
              inputMode="numeric"
              autoComplete="off"
              hint="Can't go below the current counter."
            />
            <TextField name="stockHoldHours" label="Stock hold (hours)" required inputMode="numeric" autoComplete="off" hint="How long a New order keeps its stock. 1 to 168." />
            <TextField name="lowStockThreshold" label="Low-stock threshold" required inputMode="numeric" autoComplete="off" hint="At or below this many units a variant shows as Low." />
            <MoneyField name="hardwareCost" label="Hardware cost per hoodie" required hint="Zippers and velcro added to each hoodie's cost." />
          </div>
          <SwitchField
            name="autoExpireUnconfirmed"
            label="Cancel unconfirmed orders automatically"
            description="Off: expired New orders are only flagged. On: they are cancelled automatically."
          />
        </FormSection>

        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>
            Save business settings
          </Button>
        </div>
      </AdminForm>

      <ConfirmDialog
        open={pending !== null}
        title="Change order numbering?"
        description={pending ? confirmText(pending) : null}
        notUndoable
        confirmLabel="Save settings"
        reportErrors={false}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (!pending) return;
          try {
            await send(pending);
          } catch (e) {
            const applied = applyApiErrors(form, e, { map: (path) => MAP[path] ?? null });
            if (!applied.handled) notifyError(e);
          }
        }}
      />
      {guard.dialog}
    </>
  );
}
