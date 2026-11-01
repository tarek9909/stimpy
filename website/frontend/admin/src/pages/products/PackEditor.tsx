import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Banner, Button, Checkbox, RadioGroup, Skeleton, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { AdminForm } from '../../components/form/AdminForm';
import { MoneyField, SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { centsToDollarString, formatMoney } from '../../lib/format';
import { dollarsToCents, moneySchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { invalidateFor, useAllStimpies, usePack, usePacks, type AdminPack } from './api';
import { DeleteOrHide, EditorFrame, EditorQuery } from './shared';
import type { EditorProps } from './HoodieEditor';

const MAX_OFFER_COUNT = 1_000_000;

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  description: z.string().max(2000, 'Use at most 2000 characters.'),
  type: z.enum(['HOODIE_SET', 'STIMPIE_ONLY']),
  stimpieCount: z.string().regex(/^\d+$/, 'Enter a whole number of Stimpies.'),
  eligibility: z.enum(['all', 'selected']),
  eligibleStimpieIds: z.array(z.number().int().positive()),
  price: moneySchema(),
  badge: z.string().trim().max(30, 'Use at most 30 characters.'),
  active: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.eligibility === 'selected' && value.eligibleStimpieIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['eligibleStimpieIds'], message: 'Select at least one eligible design.' });
  }
  const maxCount = value.type === 'HOODIE_SET' ? 5 : MAX_OFFER_COUNT;
  if (Number(value.stimpieCount) < 1 || Number(value.stimpieCount) > maxCount) {
    ctx.addIssue({ code: 'custom', path: ['stimpieCount'], message: `Enter a count from 1 to ${maxCount.toLocaleString()}.` });
  }
  if (value.type === 'HOODIE_SET' && value.eligibility === 'selected' && value.eligibleStimpieIds.length < Number(value.stimpieCount)) {
    ctx.addIssue({ code: 'custom', path: ['eligibleStimpieIds'], message: `Select at least ${value.stimpieCount} designs so every Stimpie in the set can be different.` });
  }
});
type Values = z.infer<typeof schema>;

const newValues = (type: Values['type'] = 'HOODIE_SET'): Values => ({ name: '', description: '', type, stimpieCount: '1', eligibility: 'all', eligibleStimpieIds: [], price: '', badge: '', active: true });
const toValues = (p: AdminPack): Values => ({
  name: p.name,
  description: p.description,
  type: p.type,
  stimpieCount: String(p.stimpieCount),
  eligibility: p.eligibleStimpieIds === null ? 'all' : 'selected',
  eligibleStimpieIds: p.eligibleStimpieIds ?? [],
  price: centsToDollarString(p.priceCents),
  badge: p.badge ?? '',
  active: p.active,
});
const MAP: Record<string, string> = { priceCents: 'price' };

export function PackEditor({ id, onClose }: EditorProps) {
  const [searchParams] = useSearchParams();
  const q = usePack(id);
  const requestedType = searchParams.get('type') === 'STIMPIE_ONLY' ? 'STIMPIE_ONLY' : 'HOODIE_SET';
  const crumbs = [{ label: 'Products', to: '/products' }, { label: 'Packs', to: '/products?tab=packs' }, { label: id === null ? requestedType === 'STIMPIE_ONLY' ? 'New Stimpie-only offer' : 'New pack' : 'Edit pack' }];
  if (id === null) return <PackForm key={requestedType} initial={null} requestedType={requestedType} onClose={onClose} crumbs={crumbs} />;
  return (
    <EditorQuery query={q} title="Edit pack" crumbs={crumbs} onClose={onClose} skeleton={<Skeleton variant="rect" className="h-80" />} notFoundWhat="pack" notFoundBackTo="/products?tab=packs" notFoundBackLabel="Back to packs">
      {(p) => <PackForm initial={p} requestedType={p.type} onClose={onClose} crumbs={crumbs} />}
    </EditorQuery>
  );
}

function PackForm({ initial, requestedType, onClose, crumbs }: { initial: AdminPack | null; requestedType: Values['type']; onClose: () => void; crumbs: { label: string; to?: string }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const packs = usePacks();
  const stimpies = useAllStimpies();
  const defaults = useMemo(() => (initial ? toValues(initial) : newValues(requestedType)), [initial, requestedType]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [price, count, type, eligibility, selectedIds] = form.watch(['price', 'stimpieCount', 'type', 'eligibility', 'eligibleStimpieIds']);
  const body = (v: Values) => ({
    name: v.name,
    description: v.description,
    type: v.type,
    stimpieCount: Number(v.stimpieCount),
    eligibleStimpieIds: v.eligibility === 'all' ? null : v.eligibleStimpieIds,
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

  // Information only: compare like-for-like offers with one fewer Stimpie.
  const info = useMemo(() => {
    const n = Number(count);
    const cents = /^\d+(\.\d{1,2})?$/.test(price.trim()) ? dollarsToCents(price) : null;
    const lower = packs.data?.items.find((p) => p.type === type && p.stimpieCount === n - 1 && p.id !== initial?.id);
    if (cents === null || !lower) return null;
    return `${formatMoney(cents - lower.priceCents)} more than "${lower.name}" (${formatMoney(lower.priceCents)}) for the extra Stimpie.`;
  }, [count, price, packs.data, initial, type]);

  const actions = (
    <>
      {initial ? (
        <DeleteOrHide
          noun={initial.type === 'STIMPIE_ONLY' ? 'offer' : 'pack'}
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
      <Button type="submit" form="pack-form" variant="primary" loading={form.formState.isSubmitting || save.isPending}>{initial ? type === 'STIMPIE_ONLY' ? 'Save offer' : 'Save pack' : type === 'STIMPIE_ONLY' ? 'Create offer' : 'Create pack'}</Button>
    </>
  );

  return (
    <EditorFrame title={initial ? `Edit ${initial.name}` : type === 'STIMPIE_ONLY' ? 'New Stimpie-only offer' : 'New hoodie set'} crumbs={crumbs} onClose={onClose} actions={actions}>
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
          toast.success(type === 'STIMPIE_ONLY' ? 'Offer saved.' : 'Pack saved.');
          form.reset(toValues(saved));
          guard.bypass(onClose);
        }}
      >
        <FormSection title="Offer type" description="Stimpie-only offers contain Stimpies without a hoodie. Existing packs stay hoodie sets unless you change their type.">
          <Controller control={form.control} name="type" render={({ field }) => (
            <RadioGroup
              name="pack-type"
              aria-label="Offer type"
              value={field.value}
              onChange={(value) => field.onChange(value)}
              options={[
                { value: 'HOODIE_SET', label: 'Hoodie + Stimpies' },
                { value: 'STIMPIE_ONLY', label: 'Stimpies only' },
              ]}
            />
          )} />
        </FormSection>
        <FormSection title={type === 'STIMPIE_ONLY' ? 'Stimpie-only offer' : 'Hoodie set'}>
          <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
          <TextAreaField name="description" label="Description" rows={3} maxLength={2000} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="stimpieCount" label={type === 'STIMPIE_ONLY' ? 'Stimpie count' : 'Stimpies in the set'} required type="number" min={1} max={type === 'STIMPIE_ONLY' ? MAX_OFFER_COUNT : 5} step={1} inputMode="numeric" hint={type === 'STIMPIE_ONLY' ? `Enter any whole number from 1 to ${MAX_OFFER_COUNT.toLocaleString()}.` : 'Enter a whole number from 1 to 5.'} />
            <TextField name="badge" label="Badge" optional maxLength={30} placeholder="e.g. Two looks" />
          </div>
        </FormSection>
        <FormSection title="Eligible designs" description="Choose which Stimpie designs can be used in this offer.">
          <Controller control={form.control} name="eligibility" render={({ field }) => (
            <RadioGroup
              name="pack-eligibility"
              aria-label="Eligible designs"
              value={field.value}
              onChange={(value) => field.onChange(value)}
              options={[
                { value: 'all', label: 'All Stimpie designs' },
                { value: 'selected', label: 'Selected designs only' },
              ]}
            />
          )} />
          {eligibility === 'selected' ? (
            <div>
              {stimpies.isPending ? <Skeleton variant="rect" className="h-16" /> : null}
              {stimpies.isError ? <Banner variant="error">Couldn&apos;t load Stimpies. <Button type="button" size="sm" variant="secondary" onClick={() => void stimpies.refetch()}>Try again</Button></Banner> : null}
              {stimpies.data ? <div className="max-h-80 divide-y divide-base overflow-y-auto rounded-md border border-base">
                {stimpies.data.items.map((stimpie) => {
                  const checked = selectedIds.includes(stimpie.id);
                  return <div key={stimpie.id} className="flex items-center gap-3 px-3">
                    {stimpie.artworkUrl ? <img src={stimpie.artworkUrl} alt="" className="h-11 w-8 rounded object-cover" loading="lazy" /> : null}
                    <Checkbox
                      label={<span className="font-medium">{stimpie.name}{stimpie.active ? '' : <span className="ml-2 text-caption text-fg-muted">Hidden</span>}</span>}
                      checked={checked}
                      onChange={(event) => form.setValue('eligibleStimpieIds', event.target.checked ? [...selectedIds, stimpie.id] : selectedIds.filter((id) => id !== stimpie.id), { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                      className="min-w-0 flex-1"
                    />
                  </div>;
                })}
              </div> : null}
              {form.formState.errors.eligibleStimpieIds?.message ? <p role="alert" className="text-body-sm font-medium text-fg-danger">{form.formState.errors.eligibleStimpieIds.message}</p> : null}
              <p className="mt-2 text-body-sm text-fg-muted">{selectedIds.length} designs selected.</p>
            </div>
          ) : <p className="text-body-sm text-fg-muted">Any Stimpie design can be selected for this offer, including designs added later.</p>}
        </FormSection>
        <FormSection title="Price">
          <MoneyField name="price" label="Price" required hint={type === 'STIMPIE_ONLY' ? 'Total price for the Stimpie-only offer. No hoodie is included.' : 'Total price of the hoodie plus its Stimpies.'} />
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
