import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Banner, Button, Skeleton, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { AdminForm } from '../../components/form/AdminForm';
import { MoneyField, SelectField, SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { QueryBoundary } from '../../components/QueryBoundary';
import { centsToDollarString, formatMoney } from '../../lib/format';
import { dollarsToCents, moneySchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { invalidateFor, usePack, usePacks, type AdminPack } from './api';
import { DeleteOrHide, EditorFrame } from './shared';
import type { EditorProps } from './HoodieEditor';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  description: z.string().max(2000, 'Use at most 2000 characters.'),
  stimpieCount: z.string().regex(/^[1-5]$/, 'Choose 1 to 5 Stimpies.'),
  price: moneySchema(),
  badge: z.string().trim().max(30, 'Use at most 30 characters.'),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

const NEW_DEFAULTS: Values = { name: '', description: '', stimpieCount: '1', price: '', badge: '', active: true };
const toValues = (p: AdminPack): Values => ({
  name: p.name,
  description: p.description,
  stimpieCount: String(p.stimpieCount),
  price: centsToDollarString(p.priceCents),
  badge: p.badge ?? '',
  active: p.active,
});
const MAP: Record<string, string> = { priceCents: 'price' };

export function PackEditor({ id, onClose }: EditorProps) {
  const q = usePack(id);
  const crumbs = [{ label: 'Products', to: '/products' }, { label: 'Packs', to: '/products?tab=packs' }, { label: id === null ? 'New pack' : 'Edit pack' }];
  if (id === null) return <PackForm initial={null} onClose={onClose} crumbs={crumbs} />;
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-80" />} notFoundWhat="pack" notFoundBackTo="/products?tab=packs" notFoundBackLabel="Back to packs">
      {(p) => <PackForm initial={p} onClose={onClose} crumbs={crumbs} />}
    </QueryBoundary>
  );
}

function PackForm({ initial, onClose, crumbs }: { initial: AdminPack | null; onClose: () => void; crumbs: { label: string; to?: string }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const packs = usePacks();
  const defaults = useMemo(() => (initial ? toValues(initial) : NEW_DEFAULTS), [initial]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [price, count] = form.watch(['price', 'stimpieCount']);
  const body = (v: Values) => ({
    name: v.name,
    description: v.description,
    stimpieCount: Number(v.stimpieCount),
    priceCents: dollarsToCents(v.price),
    badge: v.badge === '' ? null : v.badge,
    active: v.active,
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      initial ? unwrap(api.PATCH('/api/v1/admin/packs/{id}', { params: { path: { id: initial.id } }, body: body(v) })) : unwrap(api.POST('/api/v1/admin/packs', { body: body(v) })),
  });
  const hide = useMutation({ mutationFn: () => unwrap(api.PATCH('/api/v1/admin/packs/{id}', { params: { path: { id: (initial as AdminPack).id } }, body: { active: false } })) });
  const remove = useMutation({ mutationFn: () => api.DELETE('/api/v1/admin/packs/{id}', { params: { path: { id: (initial as AdminPack).id } } }) });

  // Information only: price step against the pack with one Stimpie fewer.
  const info = useMemo(() => {
    const n = Number(count);
    const cents = /^\d+(\.\d{1,2})?$/.test(price.trim()) ? dollarsToCents(price) : null;
    const lower = packs.data?.items.find((p) => p.stimpieCount === n - 1 && p.id !== initial?.id);
    if (cents === null || !lower) return null;
    return `${formatMoney(cents - lower.priceCents)} more than "${lower.name}" (${formatMoney(lower.priceCents)}) for the extra Stimpie.`;
  }, [count, price, packs.data, initial]);

  const actions = (
    <>
      {initial ? (
        <DeleteOrHide
          noun="pack"
          disabled={save.isPending}
          onDelete={async () => {
            await remove.mutateAsync();
            invalidateFor(qc, 'packs');
            toast.success('Pack deleted.');
            draft.clear();
            guard.bypass(onClose);
          }}
          onHide={async () => {
            await hide.mutateAsync();
            invalidateFor(qc, 'packs');
            toast.success('Pack hidden.');
            guard.bypass(onClose);
          }}
        />
      ) : null}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="pack-form" variant="primary" loading={form.formState.isSubmitting || save.isPending}>{initial ? 'Save pack' : 'Create pack'}</Button>
    </>
  );

  return (
    <EditorFrame title={initial ? `Edit ${initial.name}` : 'New pack'} crumbs={crumbs} onClose={onClose} actions={actions}>
      {draft.banner}
      <AdminForm
        id="pack-form"
        form={form}
        className="flex flex-col gap-4"
        apiErrors={{ map: (p) => MAP[p] ?? p }}
        onSubmit={async (v) => {
          const saved = await save.mutateAsync(v);
          invalidateFor(qc, 'packs');
          draft.clear();
          toast.success('Pack saved.');
          form.reset(toValues(saved));
          guard.bypass(onClose);
        }}
      >
        <FormSection title="Pack">
          <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
          <TextAreaField name="description" label="Description" rows={3} maxLength={2000} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="stimpieCount" label="Stimpies in the pack" required options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
            <TextField name="badge" label="Badge" optional maxLength={30} placeholder="e.g. Two looks" />
          </div>
        </FormSection>
        <FormSection title="Price">
          <MoneyField name="price" label="Price" required hint="Total price of the hoodie plus its Stimpies." />
          {info ? <p className="text-body-sm text-fg-muted">{info}</p> : null}
          {initial && centsToDollarString(initial.priceCents) !== price.trim() ? <Banner variant="warning">New orders use the new price. Existing orders keep theirs.</Banner> : null}
        </FormSection>
        <FormSection title="Visibility">
          <SwitchField name="active" label="Show on the website" />
        </FormSection>
      </AdminForm>
      {guard.dialog}
    </EditorFrame>
  );
}
