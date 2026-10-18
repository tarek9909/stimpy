import { useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Banner, Button, Checkbox, EmptyState, Select, Skeleton, TextLink, useToast } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { QueryBoundary } from '../../components/QueryBoundary';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminForm } from '../../components/form/AdminForm';
import { FormSection } from '../../components/form/FormSection';
import { TextField } from '../../components/form/Field';
import { DateTimeInput } from '../../components/DateTimeInput';
import { SearchField } from '../../components/SearchField';
import { useFormatters } from '../../lib/format';
import { paginationParams, useUrlState } from '../../lib/urlState';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useNotifyError } from '../../api/errors';
import { useHoodies, useAllStimpies, usePacks } from '../products/api';
import { usePromotion, usePromotionMutations, usePromotions, type AdminPromotion, type PromotionTarget } from './api';
import { emptyPromotion, promotionDiscountLabel, promotionFormSchema, toPromotionBody, toPromotionValues, type PromotionFormValues } from './promotionForm';

const listParams = { ...paginationParams };

function stateLabel(promotion: AdminPromotion) {
  return promotion.state === 'ACTIVE' ? 'Active' : promotion.state === 'SCHEDULED' ? 'Scheduled' : promotion.state === 'ENDED' ? 'Ended' : 'Paused';
}

function stateClass(promotion: AdminPromotion) {
  return promotion.state === 'ACTIVE' ? 'bg-success text-white' : promotion.state === 'SCHEDULED' ? 'bg-sky text-ink' : 'bg-surface text-fg-muted';
}

function PromotionList() {
  const [{ page, pageSize }, setPage] = useUrlState(listParams);
  const q = usePromotions(page, pageSize);
  const f = useFormatters();
  const navigate = useNavigate();
  const columns: Column<AdminPromotion>[] = [
    { id: 'name', header: 'Promotion', priority: 'primary', cell: (p) => <TextLink href={`/promotions/${p.id}`} className="font-medium">{p.name}</TextLink> },
    { id: 'discount', header: 'Discount', priority: 'primary', cell: promotionDiscountLabel },
    { id: 'products', header: 'Products', cell: (p) => p.allProducts ? 'All products' : `${p.targets.length} selected` },
    { id: 'schedule', header: 'Schedule', cell: (p) => `${p.startsAt ? f.dateTime(p.startsAt) : 'Starts now'}${p.endsAt ? ` - ${f.dateTime(p.endsAt)}` : ' - No end date'}` },
    { id: 'state', header: 'Status', cell: (p) => <span className={`inline-flex rounded-full px-2.5 py-1 text-body-sm font-medium ${stateClass(p)}`}>{stateLabel(p)}</span> },
    { id: 'edit', header: 'Manage', mobileLabel: '', cell: (p) => <Button variant="secondary" size="sm" href={`/promotions/${p.id}`}>Edit</Button> },
  ];

  return <>
    <PageHeader
      title="Promotions"
      description="Set a sale price for any product, pack, or your entire catalog. Discounts are applied automatically at checkout."
      actions={<Button href="/promotions/new" variant="primary" leftIcon={<Plus size={18} aria-hidden="true" />}>New promotion</Button>}
    />
    <div className="pt-6">
      <DataTable
        caption="Promotions"
        columns={columns}
        rows={q.data?.items}
        getRowId={(p) => p.id}
        rowLabel={(p) => p.name}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={(p) => navigate(`/promotions/${p.id}`)}
        empty={<EmptyState title="No promotions yet" text="Create a discount for selected products or your full catalog." action={<Button href="/promotions/new" variant="primary">New promotion</Button>} />}
        footer={<Pagination page={page} pageSize={pageSize} total={q.data?.total ?? 0} onPageChange={(next) => setPage({ page: next })} onPageSizeChange={(next) => setPage({ pageSize: next })} busy={q.isFetching} />}
      />
    </div>
    {/* Status changes are explicit. The edit page has the current enabled state and handles this action. */}
  </>;
}

type ProductChoice = { productType: PromotionTarget['productType']; productId: number; name: string; priceCents: number; active: boolean };

function targetKey(target: PromotionTarget) { return `${target.productType}:${target.productId}`; }

function PromotionProductPicker({
  value,
  onChange,
  error,
}: {
  value: PromotionTarget[];
  onChange: (targets: PromotionTarget[]) => void;
  error?: string;
}) {
  const hoodies = useHoodies();
  const stimpies = useAllStimpies();
  const packs = usePacks();
  const f = useFormatters();
  const [search, setSearch] = useState('');
  const groups: Array<{ type: PromotionTarget['productType']; label: string; rows: ProductChoice[]; loading: boolean; failed: boolean; retry: () => void }> = [
    { type: 'HOODIE', label: 'Hoodies', rows: (hoodies.data?.items ?? []).map((p) => ({ productType: 'HOODIE', productId: p.id, name: p.name, priceCents: p.priceCents, active: p.active })), loading: hoodies.isPending, failed: hoodies.isError, retry: () => void hoodies.refetch() },
    { type: 'STIMPIE', label: 'Stimpies', rows: (stimpies.data?.items ?? []).map((p) => ({ productType: 'STIMPIE', productId: p.id, name: p.name, priceCents: p.priceCents, active: p.active })), loading: stimpies.isPending, failed: stimpies.isError, retry: () => void stimpies.refetch() },
    { type: 'PACK', label: 'Packs', rows: (packs.data?.items ?? []).map((p) => ({ productType: 'PACK', productId: p.id, name: p.name, priceCents: p.priceCents, active: p.active })), loading: packs.isPending, failed: packs.isError, retry: () => void packs.refetch() },
  ];
  const selected = new Set(value.map(targetKey));
  const catalogReady = groups.every((group) => !group.loading && !group.failed);
  const availableKeys = new Set(groups.flatMap((group) => group.rows.map(targetKey)));
  const unavailableTargets = catalogReady ? value.filter((target) => !availableKeys.has(targetKey(target))) : [];
  const needle = search.trim().toLocaleLowerCase();
  return (
    <div className="flex flex-col gap-3">
      <SearchField label="Search products" placeholder="Search products and packs" value={search} onChange={setSearch} />
      <p className="text-body-sm text-fg-muted" aria-live="polite">{value.length} selected</p>
      {error ? <p role="alert" className="text-body-sm font-medium text-fg-danger">{error}</p> : null}
      {unavailableTargets.length > 0 ? <div className="rounded-md border border-base bg-butter/30 p-3">
        <p className="text-body-sm font-medium">Some selected products are no longer in the catalog. Remove them before saving.</p>
        <ul className="mt-2 flex flex-col gap-1">
          {unavailableTargets.map((target) => <li key={targetKey(target)} className="flex items-center justify-between gap-3 text-body-sm">
            <span>{target.productType === 'HOODIE' ? 'Hoodie' : target.productType === 'STIMPIE' ? 'Stimpie' : 'Pack'} #{target.productId}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((item) => targetKey(item) !== targetKey(target)))}>Remove</Button>
          </li>)}
        </ul>
      </div> : null}
      <div className="max-h-[32rem] divide-y divide-base overflow-y-auto rounded-md border border-base">
        {groups.map((group) => {
          const rows = needle ? group.rows.filter((row) => row.name.toLocaleLowerCase().includes(needle)) : group.rows;
          const visibleKeys = new Set(rows.map((row) => `${row.productType}:${row.productId}`));
          const allSelected = visibleKeys.size > 0 && [...visibleKeys].every((key) => selected.has(key));
          return <section key={group.type} className="p-3" aria-label={group.label}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-body font-semibold">{group.label} <span className="font-normal text-fg-muted">({group.rows.length})</span></h3>
              <Button type="button" variant="ghost" size="sm" disabled={rows.length === 0} onClick={() => {
                if (allSelected) {
                  onChange(value.filter((target) => !visibleKeys.has(targetKey(target))));
                } else {
                  const selectedKeys = new Set(value.map(targetKey));
                  onChange([...value, ...rows.filter((row) => !selectedKeys.has(`${row.productType}:${row.productId}`)).map(({ productType, productId }) => ({ productType, productId }))]);
                }
              }}>{allSelected ? 'Clear matching' : 'Select matching'}</Button>
            </div>
            {group.loading ? <Skeleton variant="rect" className="h-12" /> : null}
            {group.failed ? <Banner variant="error">Couldn&apos;t load {group.label.toLowerCase()}. <Button type="button" size="sm" variant="secondary" onClick={group.retry}>Try again</Button></Banner> : null}
            {!group.loading && !group.failed && rows.length === 0 ? <p className="px-2 py-3 text-body-sm text-fg-muted">{group.rows.length ? 'No matching products.' : `No ${group.label.toLowerCase()} yet.`}</p> : null}
            <ul className="divide-y divide-base">
              {rows.map((row) => {
                const target = { productType: row.productType, productId: row.productId };
                const checked = selected.has(targetKey(target));
                return <li key={targetKey(target)} className="flex items-center gap-3 px-2">
                  <Checkbox
                    label={<span className="font-medium">{row.name}{row.active ? '' : <span className="ml-2 text-caption text-fg-muted">Hidden</span>}</span>}
                    checked={checked}
                    onChange={(event) => onChange(event.target.checked ? [...value, target] : value.filter((item) => targetKey(item) !== targetKey(target)))}
                    className="min-w-0 flex-1"
                  />
                  <span className="shrink-0 text-body-sm tabular-nums text-fg-muted">{f.money(row.priceCents)}</span>
                </li>;
              })}
            </ul>
          </section>;
        })}
      </div>
      <p className="text-body-sm text-fg-muted">Hidden products can be selected for later use. Only products currently available on the storefront can be purchased.</p>
    </div>
  );
}

function PromotionEditor({ initial }: { initial: AdminPromotion | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const notify = useNotifyError();
  const f = useFormatters();
  const { create, update, remove } = usePromotionMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const defaults = initial ? toPromotionValues(initial) : emptyPromotion;
  const form = useForm<PromotionFormValues>({ resolver: zodResolver(promotionFormSchema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const discountType = form.watch('discountType');
  const allProducts = form.watch('allProducts');

  const submit = async (value: PromotionFormValues) => {
    const body = toPromotionBody(value);
    const saved = initial
      ? await update.mutateAsync({ id: initial.id, body })
      : await create.mutateAsync(body);
    form.reset(toPromotionValues(saved));
    toast.success(initial ? 'Promotion saved.' : 'Promotion created.');
    guard.bypass(() => navigate('/promotions'));
  };

  const setEnabled = async () => {
    if (!initial) return;
    const saved = await update.mutateAsync({ id: initial.id, body: { enabled: !initial.enabled } });
    toast.success(saved.enabled ? 'Promotion resumed.' : 'Promotion paused.');
  };

  return <>
    <PageHeader
      title={initial ? 'Edit promotion' : 'New promotion'}
      breadcrumbs={[{ label: 'Promotions', to: '/promotions' }, { label: initial ? initial.name : 'New promotion' }]}
      description="Discounts apply automatically to the selected products while this promotion is active."
    />
    <div className="max-w-3xl pt-6">
      {initial && !initial.enabled ? <Banner variant="warning" title="Promotion paused">The promotion is not applied to checkout while paused.</Banner> : null}
      <AdminForm form={form} onSubmit={submit} className="flex flex-col gap-6" apiErrors={{ map: (path) => path }}>
        <FormSection title="Discount">
          <TextField name="name" label="Promotion name" required maxLength={120} autoComplete="off" placeholder="Summer sale" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={form.control} name="discountType" render={({ field, fieldState }) => (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="promotion-discount-type" className="text-body font-medium">Discount type</label>
                <Select id="promotion-discount-type" value={field.value} onChange={(event) => { field.onChange(event.target.value); form.setValue('discountValue', event.target.value === 'FIXED' ? '5.00' : '10', { shouldDirty: true }); }} aria-invalid={fieldState.error ? true : undefined}>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </Select>
                {fieldState.error ? <p role="alert" className="text-body-sm text-fg-danger">{fieldState.error.message}</p> : null}
              </div>
            )} />
            <TextField
              name="discountValue"
              label={discountType === 'PERCENTAGE' ? 'Percentage off' : 'Amount off'}
              required
              type="number"
              inputMode="decimal"
              min={discountType === 'PERCENTAGE' ? 1 : 0.01}
              max={discountType === 'PERCENTAGE' ? 100 : undefined}
              step={discountType === 'PERCENTAGE' ? 1 : 0.01}
              suffixText={discountType === 'PERCENTAGE' ? '%' : 'USD'}
              hint={discountType === 'PERCENTAGE' ? 'Enter a whole number from 1 to 100.' : 'Deducted from each selected item; the final price cannot go below $0.'}
            />
          </div>
          {initial ? <p className="text-body-sm text-fg-muted">Current status: <strong>{stateLabel(initial)}</strong>{initial.startsAt ? ` · Starts ${f.dateTime(initial.startsAt)}` : ' · Starts immediately'}{initial.endsAt ? ` · Ends ${f.dateTime(initial.endsAt)}` : ' · No end date'}</p> : null}
        </FormSection>

        <FormSection title="Products">
          <Controller control={form.control} name="allProducts" render={({ field }) => (
            <Checkbox
              label={<span className="font-medium">Apply to all products</span>}
              description="Includes all hoodies, Stimpies and packs, including products added later."
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
            />
          )} />
          {!allProducts ? <Controller control={form.control} name="targets" render={({ field, fieldState }) => (
            <PromotionProductPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
          )} /> : <p className="text-body-sm text-fg-muted">This promotion will include every product and pack in the catalog.</p>}
          <p className="text-body-sm text-fg-muted">If a product matches multiple active promotions, it gets the lowest resulting price.</p>
        </FormSection>

        <FormSection title="Schedule" description="Leave the start empty to begin as soon as you save. Leave the end empty to keep it running until you pause it.">
          <Controller control={form.control} name="startsAt" render={({ field, fieldState }) => (
            <DateTimeInput label="Start (optional)" value={field.value} onChange={field.onChange} error={fieldState.error?.message ?? null} hint="Uses the business time zone." />
          )} />
          <Controller control={form.control} name="endsAt" render={({ field, fieldState }) => (
            <DateTimeInput label="End (optional)" value={field.value} onChange={field.onChange} error={fieldState.error?.message ?? null} hint="Leave empty for no end date." />
          )} />
        </FormSection>

        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col-reverse gap-2 border-t border-base bg-surface-base px-4 py-3 md:static md:mx-0 md:flex-row md:justify-end md:border-0 md:bg-transparent md:p-0">
          {initial ? <Button type="button" variant="secondary" className="!border-danger !text-fg-danger md:mr-auto" onClick={() => setConfirmDelete(true)}>Delete promotion</Button> : null}
          {initial && initial.state !== 'ENDED' ? <Button type="button" variant="secondary" loading={update.isPending} onClick={() => { void setEnabled().catch((error) => notify(error, { fallback: 'Could not update the promotion.' })); }}>{initial.enabled ? 'Pause promotion' : 'Resume promotion'}</Button> : null}
          <Button type="button" variant="secondary" onClick={() => navigate('/promotions')}>Cancel</Button>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>{initial ? 'Save promotion' : 'Create promotion'}</Button>
        </div>
      </AdminForm>
      {guard.dialog}
      {initial ? <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        tone="destructive"
        title={`Delete '${initial.name}'?`}
        description="The promotion will be removed and its discount will stop applying."
        notUndoable
        confirmLabel="Delete promotion"
        onConfirm={async () => {
          await remove.mutateAsync(initial.id);
          toast.success('Promotion deleted.');
          guard.bypass(() => navigate('/promotions'));
        }}
      /> : null}
    </div>
  </>;
}

function PromotionEditorRoute() {
  const { id: rawId } = useParams();
  if (!rawId || rawId === 'new') return <PromotionEditor initial={null} />;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return <EmptyState title="Promotion not found" text="That promotion does not exist." action={<Button href="/promotions" variant="secondary">Back to promotions</Button>} />;
  return <PromotionEditorForId id={id} />;
}

function PromotionEditorForId({ id }: { id: number }) {
  const q = usePromotion(id);
  return <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />} notFoundWhat="promotion" notFoundBackTo="/promotions" notFoundBackLabel="Back to promotions">
    {(promotion) => <PromotionEditor key={promotion.id} initial={promotion} />}
  </QueryBoundary>;
}

export default function PromotionsPage() {
  return <Routes>
    <Route index element={<PromotionList />} />
    <Route path="new" element={<PromotionEditorRoute />} />
    <Route path=":id" element={<PromotionEditorRoute />} />
  </Routes>;
}
