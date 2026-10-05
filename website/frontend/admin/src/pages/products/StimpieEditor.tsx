import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Banner, Button, RadioGroup, Skeleton, TextLink, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { AdminForm } from '../../components/form/AdminForm';
import { Field, MoneyField, SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { ImageListField } from '../../components/form/ListFields';
import { useFormDraft } from '../../components/form/useFormDraft';
import { FileUpload } from '../../components/FileUpload';
import { QueryBoundary } from '../../components/QueryBoundary';
import { Select } from '@stimpy/ui';
import { centsToDollarString } from '../../lib/format';
import { dollarsToCents, intStringSchema, moneySchema, slugify, slugSchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { STIMPIE_PANEL_ASPECT, artworkAspectWarning } from '../../lib/upload';
import { invalidateFor, useAllDrops, useStimpie, type AdminStimpie } from './api';
import { DeleteOrHide, EditorFrame } from './shared';
import type { EditorProps } from './HoodieEditor';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  slug: slugSchema,
  type: z.enum(['CORE', 'LIMITED']),
  dropId: z.string(),
  price: moneySchema(),
  cost: moneySchema(),
  quantity: intStringSchema({ min: 0, label: 'a whole number' }),
  story: z.string().max(2000, 'Use at most 2000 characters.'),
  images: z.array(z.string()),
  artworkUrl: z.string().min(1, 'Upload the artwork. The Builder needs it.'),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

const NEW_DEFAULTS: Values = { name: '', slug: '', type: 'CORE', dropId: '', price: '10.00', cost: '6.00', quantity: '0', story: '', images: [], artworkUrl: '', active: true };
const toValues = (s: AdminStimpie): Values => ({
  name: s.name,
  slug: s.slug,
  type: s.type,
  dropId: s.dropId === null ? '' : String(s.dropId),
  price: centsToDollarString(s.priceCents),
  cost: centsToDollarString(s.costCents),
  quantity: '0',
  story: s.story,
  images: s.images,
  artworkUrl: s.artworkUrl,
  active: s.active,
});
const MAP: Record<string, string> = { priceCents: 'price', costCents: 'cost' };

export function StimpieEditor({ id, onClose }: EditorProps) {
  const q = useStimpie(id);
  const crumbs = [{ label: 'Products', to: '/products' }, { label: 'Stimpies', to: '/products?tab=stimpies' }, { label: id === null ? 'New Stimpie' : 'Edit Stimpie' }];
  if (id === null) return <StimpieForm initial={null} onClose={onClose} crumbs={crumbs} />;
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />} notFoundWhat="Stimpie" notFoundBackTo="/products?tab=stimpies" notFoundBackLabel="Back to Stimpies">
      {(s) => <StimpieForm initial={s} onClose={onClose} crumbs={crumbs} />}
    </QueryBoundary>
  );
}

function StimpieForm({ initial, onClose, crumbs }: { initial: AdminStimpie | null; onClose: () => void; crumbs: { label: string; to?: string }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const drops = useAllDrops();
  const defaults = useMemo(() => (initial ? toValues(initial) : NEW_DEFAULTS), [initial]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [uploading, setUploading] = useState(false);
  const [dims, setDims] = useState<{ w: number | null; h: number | null }>({ w: initial?.artworkWidth ?? null, h: initial?.artworkHeight ?? null });
  const slugTouched = useRef(initial !== null);
  const name = useWatch({ control: form.control, name: 'name' });
  const type = useWatch({ control: form.control, name: 'type' });
  const dropId = useWatch({ control: form.control, name: 'dropId' });
  const artworkUrl = useWatch({ control: form.control, name: 'artworkUrl' });

  useEffect(() => {
    if (!slugTouched.current) form.setValue('slug', slugify(name));
  }, [name, form]);

  const warn = artworkUrl !== '' && artworkAspectWarning(dims.w, dims.h);

  const common = (v: Values) => ({
    name: v.name,
    slug: v.slug,
    type: v.type,
    dropId: v.dropId === '' ? null : Number(v.dropId),
    priceCents: dollarsToCents(v.price),
    costCents: dollarsToCents(v.cost),
    story: v.story,
    images: v.images,
    artworkUrl: v.artworkUrl,
    active: v.active,
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      initial
        ? unwrap(api.PATCH('/api/v1/admin/stimpies/{id}', { params: { path: { id: initial.id } }, body: common(v) }))
        : unwrap(api.POST('/api/v1/admin/stimpies', { body: { ...common(v), quantity: Number(v.quantity) } })),
  });
  const hide = useMutation({ mutationFn: () => unwrap(api.PATCH('/api/v1/admin/stimpies/{id}', { params: { path: { id: (initial as AdminStimpie).id } }, body: { active: false } })) });
  const remove = useMutation({ mutationFn: () => api.DELETE('/api/v1/admin/stimpies/{id}', { params: { path: { id: (initial as AdminStimpie).id } } }) });

  const actions = (
    <>
      {initial ? (
        <DeleteOrHide
          noun="Stimpie"
          disabled={save.isPending}
          onDelete={async () => {
            await remove.mutateAsync();
            invalidateFor(qc, 'stimpies');
            toast.success('Stimpie deleted.');
            draft.clear();
            guard.bypass(onClose);
          }}
          onHide={async () => {
            await hide.mutateAsync();
            invalidateFor(qc, 'stimpies');
            toast.success('Stimpie hidden.');
            guard.bypass(onClose);
          }}
        />
      ) : null}
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="stimpie-form" variant="primary" loading={form.formState.isSubmitting || save.isPending} disabled={uploading}>
        {initial ? 'Save Stimpie' : 'Create Stimpie'}
      </Button>
    </>
  );

  return (
    <EditorFrame title={initial ? `Edit ${initial.name}` : 'New Stimpie'} crumbs={crumbs} onClose={onClose} actions={actions}>
      {draft.banner}
      <AdminForm
        id="stimpie-form"
        form={form}
        className="flex flex-col gap-4"
        apiErrors={{ map: (p) => MAP[p] ?? p }}
        onSubmit={async (v) => {
          const saved = await save.mutateAsync(v);
          invalidateFor(qc, 'stimpies');
          qc.setQueryData(queryKeys.stimpie(saved.id), saved);
          draft.clear();
          toast.success(initial ? 'Stimpie saved.' : 'Stimpie created.');
          form.reset(toValues(saved));
          guard.bypass(onClose);
        }}
      >
        <FormSection title="Details">
          <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
          <div onChange={() => { slugTouched.current = true; }}>
            <TextField name="slug" label="Slug" required autoComplete="off" hint="Lowercase letters, numbers and hyphens." />
          </div>
          <Field name="type" label="Type" required hint="Core is always available. Limited is never restocked.">
            {(p) => (
              <RadioGroup
                name="type"
                aria-label="Type"
                value={p.value as string}
                onChange={(v) => p.onChange(v)}
                options={[
                  { value: 'CORE', label: 'Core', description: 'Always available.' },
                  { value: 'LIMITED', label: 'Limited', description: 'Never restocked.' },
                ]}
              />
            )}
          </Field>
          <Field name="dropId" label="Drop" optional hint={type === 'LIMITED' && dropId === '' ? 'A Limited Stimpie usually belongs to a drop.' : undefined}>
            {(p) => (
              <Select
                id={p.id}
                value={(p.value as string) ?? ''}
                onChange={(e) => p.onChange(e.target.value)}
                invalid={p.invalid}
                aria-describedby={p['aria-describedby']}
                options={[{ value: '', label: 'No drop' }, ...(drops.data?.items ?? []).map((d) => ({ value: String(d.id), label: d.name }))]}
              />
            )}
          </Field>
          <TextAreaField name="story" label="Story line" rows={3} maxLength={2000} showCount optional />
        </FormSection>

        <FormSection title="Pricing and stock">
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField name="price" label="Price" required />
            <MoneyField name="cost" label="Cost" required />
          </div>
          {initial ? (
            <p className="text-body-sm text-fg-muted">
              Stock changes go through <TextLink href="/stock?tab=stimpies">Stock &rarr; Adjust</TextLink>.
            </p>
          ) : (
            <TextField name="quantity" label="Initial quantity" inputMode="numeric" required autoComplete="off" hint="How many you have now. Later changes go through Stock." />
          )}
        </FormSection>

        <FormSection title="Images">
          <Field name="artworkUrl" label="Artwork" required hint="Used as the back panel in the Builder. Aim for 0.64 wide to tall (for example 800 by 1250).">
            {(p) => (
              <FileUpload
                variant="image"
                label="Artwork file"
                value={(p.value as string) || null}
                id={p.id}
                onBusyChange={setUploading}
                hint="JPG, PNG, WebP or SVG, up to 10 MB. Images larger than 2000 px are resized."
                onChange={(r) => {
                  p.onChange(r?.url ?? '');
                  setDims({ w: r?.width ?? null, h: r?.height ?? null });
                }}
              />
            )}
          </Field>
          {warn && dims.w && dims.h ? (
            <Banner variant="warning" live title="This artwork is not the expected shape">
              It is {dims.w} &times; {dims.h} ({(dims.w / dims.h).toFixed(2)}). The Builder panel is {STIMPIE_PANEL_ASPECT} wide to tall, so it will crop this image and may cut off the small split-S mark in the corner.
            </Banner>
          ) : null}
          <ImageListField name="images" label="Gallery images" onBusyChange={setUploading} />
        </FormSection>

        <FormSection title="Visibility">
          <SwitchField name="active" label="Show on the website" />
        </FormSection>
      </AdminForm>
      {guard.dialog}
    </EditorFrame>
  );
}
