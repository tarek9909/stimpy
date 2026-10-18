import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { Banner, Button, EmptyState, Input, Skeleton, Switch, useToast } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { AdminForm } from '../../components/form/AdminForm';
import { MoneyField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { QueryBoundary } from '../../components/QueryBoundary';
import { centsToDollarString, useFormatters } from '../../lib/format';
import { useAreas } from '../../lib/refdata';
import { dollarsToCents, moneySchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { parseDollarsToCents } from '@stimpy/ui';
import { useCreateArea, useDeleteArea, useDeliverySettings, useSaveDeliverySettings, useUpdateArea, type Area, type DeliverySettings } from './api';

const settingsSchema = z.object({
  defaultFee: moneySchema(),
  estimateText: z.string().trim().max(120, 'Use at most 120 characters.'),
});
type SettingsValues = z.infer<typeof settingsSchema>;

function toSettingsValues(s: DeliverySettings): SettingsValues {
  return { defaultFee: centsToDollarString(s.defaultFeeCents), estimateText: s.estimateText };
}

/** Settings -> Delivery fees: default fee + estimate text, and area fees. Changes affect new orders only. */
export function FeesTab() {
  const settings = useDeliverySettings();
  const areas = useAreas();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <QueryBoundary query={settings} skeleton={<Skeleton variant="rect" className="h-48" />}>
        {(data) => <DefaultDelivery settings={data} />}
      </QueryBoundary>
      <QueryBoundary query={areas} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {(data) => <AreaFees areas={data.items} defaultFeeCents={settings.data?.defaultFeeCents ?? null} />}
      </QueryBoundary>
      <p className="text-body-sm text-fg-muted">Changing fees affects new orders only. Existing orders keep their delivery fee.</p>
    </div>
  );
}

function DefaultDelivery({ settings }: { settings: DeliverySettings }) {
  const save = useSaveDeliverySettings();
  const toast = useToast();
  const initial = useMemo(() => toSettingsValues(settings), [settings]);
  const form = useForm<SettingsValues>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  return (
    <>
      <AdminForm
        form={form}
        apiErrors={{ map: { defaultFeeCents: 'defaultFee' } }}
        onSubmit={async (v) => {
          const updated = await save.mutateAsync({ defaultFeeCents: dollarsToCents(v.defaultFee), estimateText: v.estimateText });
          form.reset(toSettingsValues(updated));
          toast.success('Delivery settings saved.');
        }}
      >
        <FormSection title="Default delivery" description="Used for every area without its own fee.">
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyField name="defaultFee" label="Default delivery fee" required />
            <TextField name="estimateText" label="Delivery estimate" maxLength={120} placeholder="4-5 business days" hint="Shown to customers, for example '4-5 business days'." />
          </div>
          <div>
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
              Save delivery settings
            </Button>
          </div>
        </FormSection>
      </AdminForm>
      {guard.dialog}
    </>
  );
}

/* --------------------------------------------------------------------------------- areas */

function AreaFees({ areas, defaultFeeCents }: { areas: Area[]; defaultFeeCents: number | null }) {
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const create = useCreateArea();
  const update = useUpdateArea();
  const del = useDeleteArea();
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Area | null>(null);
  const [usedBy, setUsedBy] = useState<Area | null>(null);
  const placeholder = defaultFeeCents === null ? 'Default' : `Default (${f.money(defaultFeeCents)})`;

  const toggle = async (a: Area, active: boolean) => {
    try {
      await update.mutateAsync({ id: a.id, active });
    } catch (e) {
      notify(e);
    }
  };

  const columns: Column<Area>[] = [
    {
      id: 'name',
      header: 'Area',
      priority: 'primary',
      cell: (a) => (editing === a.id ? <AreaEditor area={a} placeholder={placeholder} onDone={() => setEditing(null)} /> : <span className={a.active ? 'font-medium' : 'font-medium text-fg-muted'}>{a.name}{a.active ? null : <span className="ml-2 text-caption">Hidden</span>}</span>),
    },
    { id: 'fee', header: 'Fee', numeric: true, priority: 'primary', cell: (a) => (editing === a.id ? null : a.feeCents === null ? <span className="text-fg-muted">Uses default fee</span> : f.money(a.feeCents)) },
    { id: 'est', header: 'Est. days', numeric: true, cell: (a) => (editing === a.id ? null : a.estDays === null ? <span className="text-fg-muted">Default estimate</span> : `${a.estDays} working days`) },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (a) => <Switch label={<span className="sr-only">{`${a.name} is available`}</span>} checked={a.active} onChange={(v) => void toggle(a, v)} /> },
    {
      id: 'actions',
      header: 'Actions',
      mobileLabel: '',
      align: 'right',
      cell: (a) =>
        editing === a.id ? null : (
          <span className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(a.id)} aria-label={`Edit ${a.name}`}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRemoving(a)} aria-label={`Delete ${a.name}`}>
              Delete
            </Button>
          </span>
        ),
    },
  ];

  return (
    <FormSection title="Area fees" description="Leave the fee blank to use the default fee.">
      <AddAreaRow placeholder={placeholder} onAdd={async (input) => { await create.mutateAsync(input); toast.success(`Area ${input.name} added.`); }} />
      <DataTable
        caption="Delivery areas"
        columns={columns}
        rows={areas}
        getRowId={(a) => a.id}
        rowLabel={(a) => a.name}
        stickyHeader={false}
        rowClassName={(a) => (a.active ? undefined : 'bg-surface')}
        empty={<EmptyState title="No areas yet" text="Add the first area above. Customers can still order with the default fee." />}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.name ?? 'area'}?`}
        description="Orders keep the area name they were placed with."
        confirmLabel="Delete area"
        tone="destructive"
        notUndoable
        reportErrors={false}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await del.mutateAsync(removing.id);
            toast.success('Area deleted.');
          } catch (e) {
            if (asApiError(e)?.code === 'CONFLICT') {
              setUsedBy(removing);
              return; // close this dialog; the next one explains
            }
            notify(e);
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={usedBy !== null}
        onClose={() => setUsedBy(null)}
        title="This area is in use"
        description="Used by past orders. Hide it instead."
        confirmLabel="Hide instead"
        onConfirm={async () => {
          if (usedBy) await update.mutateAsync({ id: usedBy.id, active: false });
        }}
      />
      {usedBy ? <Banner variant="info">Hiding keeps the area on past orders.</Banner> : null}
    </FormSection>
  );
}

function parseFee(raw: string): { ok: true; cents: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, cents: null };
  const cents = parseDollarsToCents(t);
  return cents === null || cents < 0 ? { ok: false } : { ok: true, cents };
}

function parseDays(raw: string): { ok: true; days: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, days: null };
  if (!/^\d+$/.test(t) || Number(t) > 30) return { ok: false };
  return { ok: true, days: Number(t) };
}

interface AreaDraft {
  name: string;
  fee: string;
  days: string;
}

function validateDraft(d: AreaDraft): { errors: Partial<Record<keyof AreaDraft, string>>; value?: { name: string; feeCents: number | null; estDays: number | null } } {
  const errors: Partial<Record<keyof AreaDraft, string>> = {};
  const name = d.name.trim();
  if (!name) errors.name = 'Enter the area name.';
  else if (name.length > 120) errors.name = 'Use at most 120 characters.';
  const fee = parseFee(d.fee);
  if (!fee.ok) errors.fee = 'Enter an amount like 3.00, or leave it blank.';
  const days = parseDays(d.days);
  if (!days.ok) errors.days = 'Enter a whole number from 0 to 30, or leave it blank.';
  if (Object.keys(errors).length > 0 || !fee.ok || !days.ok) return { errors };
  return { errors, value: { name, feeCents: fee.cents, estDays: days.days } };
}

function DraftFields({ draft, setDraft, errors, placeholder, idPrefix }: { draft: AreaDraft; setDraft: (d: AreaDraft) => void; errors: Partial<Record<keyof AreaDraft, string>>; placeholder: string; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-body-sm font-medium" htmlFor={`${idPrefix}-name`}>
        Area name
        <Input id={`${idPrefix}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} invalid={!!errors.name} maxLength={120} autoComplete="off" />
        {errors.name ? <span className="text-fg-danger">{errors.name}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-body-sm font-medium" htmlFor={`${idPrefix}-fee`}>
        Fee
        <Input id={`${idPrefix}-fee`} value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} invalid={!!errors.fee} inputMode="decimal" prefixText="$" placeholder={placeholder} autoComplete="off" />
        {errors.fee ? <span className="text-fg-danger">{errors.fee}</span> : null}
      </label>
      <label className="flex flex-col gap-1 text-body-sm font-medium" htmlFor={`${idPrefix}-days`}>
        Estimated days
        <Input id={`${idPrefix}-days`} value={draft.days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} invalid={!!errors.days} inputMode="numeric" placeholder="Default estimate" autoComplete="off" />
        {errors.days ? <span className="text-fg-danger">{errors.days}</span> : null}
      </label>
    </div>
  );
}

function AddAreaRow({ placeholder, onAdd }: { placeholder: string; onAdd: (input: { name: string; feeCents: number | null; estDays: number | null; active: boolean }) => Promise<void> }) {
  const [draft, setDraft] = useState<AreaDraft>({ name: '', fee: '', days: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof AreaDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const notify = useNotifyError();
  const submit = async () => {
    const { errors: e, value } = validateDraft(draft);
    setErrors(e);
    if (!value) return;
    setBusy(true);
    try {
      await onAdd({ ...value, active: true });
      setDraft({ name: '', fee: '', days: '' });
    } catch (err) {
      const api = asApiError(err);
      if (api?.code === 'CONFLICT') setErrors({ name: 'An area with this name already exists.' });
      else if (api?.code === 'VALIDATION_ERROR' && api.fields) setErrors({ name: api.fields.name, fee: api.fields.feeCents, days: api.fields.estDays });
      else notify(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      aria-label="Add an area"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="rounded-md bg-surface p-3"
    >
      <DraftFields draft={draft} setDraft={setDraft} errors={errors} placeholder={placeholder} idPrefix="new-area" />
      <div className="mt-3">
        <Button type="submit" variant="secondary" loading={busy} leftIcon={<Plus size={18} aria-hidden="true" />}>
          Add area
        </Button>
      </div>
    </form>
  );
}

function AreaEditor({ area, placeholder, onDone }: { area: Area; placeholder: string; onDone: () => void }) {
  const update = useUpdateArea();
  const notify = useNotifyError();
  const toast = useToast();
  const [draft, setDraft] = useState<AreaDraft>({ name: area.name, fee: centsToDollarString(area.feeCents), days: area.estDays === null ? '' : String(area.estDays) });
  const [errors, setErrors] = useState<Partial<Record<keyof AreaDraft, string>>>({});
  useEffect(() => setErrors({}), [draft]);
  const save = async () => {
    const { errors: e, value } = validateDraft(draft);
    setErrors(e);
    if (!value) return;
    try {
      await update.mutateAsync({ id: area.id, ...value });
      toast.success(`Area ${value.name} saved.`);
      onDone();
    } catch (err) {
      const api = asApiError(err);
      if (api?.code === 'CONFLICT') setErrors({ name: 'An area with this name already exists.' });
      else if (api?.code === 'VALIDATION_ERROR' && api.fields) setErrors({ name: api.fields.name, fee: api.fields.feeCents, days: api.fields.estDays });
      else notify(err);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <DraftFields draft={draft} setDraft={setDraft} errors={errors} placeholder={placeholder} idPrefix={`area-${area.id}`} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" loading={update.isPending} onClick={() => void save()}>
          Save area
        </Button>
        <Button variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
