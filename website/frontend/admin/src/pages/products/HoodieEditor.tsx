import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Banner, Button, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { AdminForm } from '../../components/form/AdminForm';
import { MoneyField, SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { ImageListField, StringListField } from '../../components/form/ListFields';
import { useFormDraft } from '../../components/form/useFormDraft';
import { QueryBoundary } from '../../components/QueryBoundary';
import { centsToDollarString } from '../../lib/format';
import { dollarsToCents, moneySchema, slugify, slugSchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { invalidateFor, useHoodie, type AdminHoodie } from './api';
import { DeleteOrHide, EditorFrame } from './shared';
import { Skeleton } from '@stimpy/ui';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  slug: slugSchema,
  description: z.string().max(2000, 'Use at most 2000 characters.'),
  details: z.array(z.string().trim().min(1, 'Fill in or remove this line.')),
  price: moneySchema(),
  cost: moneySchema(),
  images: z.array(z.string()),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

const NEW_DEFAULTS: Values = { name: '', slug: '', description: '', details: [], price: '', cost: '10.00', images: [], active: true };

function toValues(h: AdminHoodie): Values {
  return {
    name: h.name,
    slug: h.slug,
    description: h.description,
    details: h.details,
    price: centsToDollarString(h.priceCents),
    cost: centsToDollarString(h.costCents),
    images: h.images,
    active: h.active,
  };
}

const MAP: Record<string, string> = { priceCents: 'price', costCents: 'cost' };

export interface EditorProps {
  /** `null` creates a new item. */
  id: number | null;
  onClose: () => void;
  /** After a successful create: the shell shows the "zero-stock variants" notice. */
  onCreated?: (created: { id: number; name: string }) => void;
}

export function HoodieEditor({ id, onClose, onCreated }: EditorProps) {
  const q = useHoodie(id);
  const crumbs = [{ label: 'Products', to: '/products' }, { label: 'Hoodies', to: '/products?tab=hoodies' }, { label: id === null ? 'New hoodie' : 'Edit hoodie' }];
  if (id === null) return <HoodieForm initial={null} onClose={onClose} onCreated={onCreated} crumbs={crumbs} />;
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />} notFoundWhat="hoodie" notFoundBackTo="/products?tab=hoodies" notFoundBackLabel="Back to hoodies">
      {(h) => <HoodieForm initial={h} onClose={onClose} onCreated={onCreated} crumbs={crumbs} />}
    </QueryBoundary>
  );
}

function HoodieForm({ initial, onClose, onCreated, crumbs }: { initial: AdminHoodie | null; onClose: () => void; onCreated?: EditorProps['onCreated']; crumbs: { label: string; to?: string }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const defaults = useMemo(() => (initial ? toValues(initial) : NEW_DEFAULTS), [initial]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [uploading, setUploading] = useState(false);
  const slugTouched = useRef(initial !== null);
  const name = form.watch('name');
  const priceNow = form.watch('price');

  useEffect(() => {
    if (!slugTouched.current) form.setValue('slug', slugify(name), { shouldDirty: false });
  }, [name, form]);

  const body = (v: Values) => ({
    name: v.name,
    slug: v.slug,
    description: v.description,
    details: v.details,
    priceCents: dollarsToCents(v.price),
    costCents: dollarsToCents(v.cost),
    images: v.images,
    active: v.active,
  });

  const save = useMutation({
    mutationFn: (v: Values) =>
      initial
        ? unwrap(api.PATCH('/api/v1/admin/hoodies/{id}', { params: { path: { id: initial.id } }, body: body(v) }))
        : unwrap(api.POST('/api/v1/admin/hoodies', { body: body(v) })),
  });
  const hide = useMutation({
    mutationFn: () => unwrap(api.PATCH('/api/v1/admin/hoodies/{id}', { params: { path: { id: (initial as AdminHoodie).id } }, body: { active: false } })),
  });
  const remove = useMutation({
    mutationFn: () => api.DELETE('/api/v1/admin/hoodies/{id}', { params: { path: { id: (initial as AdminHoodie).id } } }),
  });

  const finish = (fn: () => void) => guard.bypass(fn);

  const actions = (
    <>
      {initial ? (
        <DeleteOrHide
          noun="hoodie"
          disabled={save.isPending}
          onDelete={async () => {
            await remove.mutateAsync();
            invalidateFor(qc, 'hoodies');
            toast.success('Hoodie deleted.');
            draft.clear();
            finish(onClose);
          }}
          onHide={async () => {
            await hide.mutateAsync();
            invalidateFor(qc, 'hoodies');
            toast.success('Hoodie hidden.');
            finish(onClose);
          }}
        />
      ) : null}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="hoodie-form" variant="primary" loading={form.formState.isSubmitting || save.isPending} disabled={uploading}>
        {initial ? 'Save hoodie' : 'Create hoodie'}
      </Button>
    </>
  );

  return (
    <EditorFrame title={initial ? `Edit ${initial.name}` : 'New hoodie'} crumbs={crumbs} onClose={onClose} actions={actions}>
      {draft.banner}
      <AdminForm
        id="hoodie-form"
        form={form}
        className="flex flex-col gap-4"
        apiErrors={{ map: (p) => MAP[p] ?? p }}
        onSubmit={async (v) => {
          const priceChanged = initial !== null && dollarsToCents(v.price) !== initial.priceCents;
          const saved = await save.mutateAsync(v);
          invalidateFor(qc, 'hoodies');
          void qc.setQueryData(queryKeys.hoodie(saved.id), saved);
          draft.clear();
          toast.success(initial ? (priceChanged ? 'Hoodie saved. New orders use the new price. Existing orders keep theirs.' : 'Hoodie saved.') : 'Hoodie created.');
          if (!initial) onCreated?.({ id: saved.id, name: saved.name });
          form.reset(toValues(saved));
          finish(onClose);
        }}
      >
        <FormSection title="Details">
          <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
          <div onChange={() => { slugTouched.current = true; }}>
            <TextField name="slug" label="Slug" required hint="Used in the website address. Lowercase letters, numbers and hyphens." autoComplete="off" />
          </div>
          <TextAreaField name="description" label="Description" rows={4} maxLength={2000} showCount />
          <StringListField name="details" label="Details" addLabel="Add detail" placeholder="e.g. 400 gsm cotton fleece" hint="Short bullet points shown on the product page." />
        </FormSection>
        <FormSection title="Pricing">
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField name="price" label="Price" required hint="Hoodie on its own." />
            <MoneyField name="cost" label="Cost" required hint="Default $10. Hardware cost is added separately in Settings." />
          </div>
          {initial && centsToDollarString(initial.priceCents) !== priceNow.trim() ? <Banner variant="warning">New orders use the new price. Existing orders keep theirs.</Banner> : null}
        </FormSection>
        <FormSection title="Images">
          <ImageListField name="images" label="Photos" onBusyChange={setUploading} />
        </FormSection>
        <FormSection title="Visibility">
          <SwitchField name="active" label="Show on the website" description="Hidden hoodies stay in your orders and stock." />
        </FormSection>
      </AdminForm>
      {guard.dialog}
    </EditorFrame>
  );
}
