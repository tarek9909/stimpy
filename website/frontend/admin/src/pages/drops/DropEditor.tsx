import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, Checkbox, Skeleton, TextLink, useToast, cn } from '@stimpy/ui';
import { AdminForm } from '../../components/form/AdminForm';
import { SwatchRadio } from './SwatchRadio';
import { TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DateTimeInput } from '../../components/DateTimeInput';
import { FileUpload } from '../../components/FileUpload';
import { SearchField } from '../../components/SearchField';
import { asApiError } from '../../api/errors';
import { slugify } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useFormatters } from '../../lib/format';
import { useAssignableStimpies, useDropMutations, useEveryDrop, type AdminDrop } from './api';
import { ACCENTS, NEW_DROP, dropControls, dropSchema, launchInPast, overlappingLive, toDropValues, type DropFormValues } from './dropForm';

interface Props {
  initial: AdminDrop | null;
  onDone: () => void;
}

/** Assignable Stimpies: multi-select with search; quantities are read-only here (dashboard-pages 9.1). */
function StimpiePicker({ value, onChange, disabled, dropId }: { value: number[]; onChange: (ids: number[]) => void; disabled: boolean; dropId: number | null }) {
  const q = useAssignableStimpies();
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const all = [...(q.data?.items ?? [])].sort((a, b) => Number(a.type === 'CORE' || (a.dropId !== null && a.dropId !== dropId)) - Number(b.type === 'CORE' || (b.dropId !== null && b.dropId !== dropId)));
    const needle = search.trim().toLowerCase();
    return needle ? all.filter((s) => s.name.toLowerCase().includes(needle)) : all;
  }, [q.data, search, dropId]);
  if (q.isPending) return <Skeleton variant="rect" className="h-40" />;
  if (q.isError) return <Banner variant="error">Couldn&apos;t load the Stimpies. <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>Try again</Button></Banner>;
  const selected = new Set(value);
  return (
    <div className="flex flex-col gap-3">
      <SearchField label="Search Stimpies" placeholder="Search Stimpies" value={search} onChange={setSearch} />
      <p className="text-body-sm text-fg-muted" aria-live="polite">{value.length} selected</p>
      <ul className="max-h-80 divide-y divide-base overflow-y-auto rounded-md border border-base" aria-label="Stimpies to include">
        {rows.length === 0 ? <li className="p-4 text-body-sm text-fg-muted">No Stimpies match.</li> : null}
        {rows.map((s) => {
          const elsewhere = s.dropId !== null && s.dropId !== dropId;
          const core = s.type === 'CORE';
          const blocked = (core || elsewhere) && !selected.has(s.id);
          const note = core ? 'Core: always available, cannot join a drop' : elsewhere ? 'Already in another drop' : null;
          return (
            <li key={s.id} className={cn('flex items-center gap-3 px-3', blocked && 'opacity-60')}>
              <Checkbox
                label={<span className="font-medium">{s.name}</span>}
                description={note ?? undefined}
                checked={selected.has(s.id)}
                disabled={disabled || blocked}
                onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-body-sm tabular-nums text-fg-muted">{s.quantity} in stock</span>
            </li>
          );
        })}
      </ul>
      <p className="text-body-sm text-fg-muted">
        New Stimpies are created in <TextLink href="/products/stimpies/new">Products</TextLink> (Create a Stimpie). Quantities are set on the Stimpie or in <TextLink href="/stock?tab=stimpies">Stock</TextLink>.
      </p>
    </div>
  );
}

/** Drop create / edit form (dashboard-pages 9.1, 9.4). */
export function DropEditor({ initial, onDone }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const f = useFormatters();
  const { create, update, remove } = useDropMutations();
  const every = useEveryDrop();
  const ctl = initial ? dropControls(initial.state) : { canEdit: true, startsAtLocked: false, canEnd: false, canDelete: false };
  const readOnly = !ctl.canEdit;
  const defaults = useMemo(() => (initial ? toDropValues(initial) : NEW_DROP), [initial]);
  const form = useForm<DropFormValues>({ resolver: zodResolver(dropSchema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const slugTouched = useRef(initial !== null);
  const name = useWatch({ control: form.control, name: 'name' });
  const startsAt = useWatch({ control: form.control, name: 'startsAt' });
  const stimpieIds = useWatch({ control: form.control, name: 'stimpieIds' });
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(false);

  useEffect(() => {
    if (!slugTouched.current) form.setValue('slug', slugify(name));
  }, [name, form]);

  const overlap = overlappingLive(every.data?.items ?? [], initial?.id ?? null);
  const pastLaunch = !initial && launchInPast(startsAt);

  const submit = async (v: DropFormValues) => {
    if (!initial && launchInPast(v.startsAt)) {
      form.setError('startsAt', { message: 'Pick a launch time in the future.' });
      throw new Error('launch in the past');
    }
    const saved = initial ? await update.mutateAsync({ id: initial.id, values: v }) : await create.mutateAsync(v);
    draft.clear();
    form.reset(toDropValues(saved));
    toast.success(initial ? 'Drop saved.' : 'Drop created.');
    guard.bypass(() => (initial ? onDone() : navigate('/drops')));
  };

  return (
    <div className="flex flex-col gap-4">
      {draft.banner}
      {readOnly ? (
        <Banner variant="info" title="This drop is read-only">
          {initial?.state === 'ENDED' ? 'Ended drops cannot be edited.' : 'A sold-out drop cannot be edited. You can still end it.'}
        </Banner>
      ) : null}
      <AdminForm
        id="drop-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          try {
            await submit(v);
          } catch (e) {
            if (e instanceof Error && e.message === 'launch in the past') return;
            throw e;
          }
        }}
        apiErrors={{ map: (p) => p }}
      >
        <FormSection title="Details">
          <TextField name="name" label="Name" required maxLength={120} autoComplete="off" disabled={readOnly} />
          <div onChange={() => { slugTouched.current = true; }}>
            <TextField name="slug" label="Slug" required autoComplete="off" disabled={readOnly} hint="Lowercase letters, numbers and hyphens. Used in the drop's web address." />
          </div>
          <TextAreaField name="story" label="Story" rows={4} maxLength={2000} showCount optional disabled={readOnly} />
          <Controller
            control={form.control}
            name="accentColor"
            render={({ field }) => (
              <SwatchRadio legend="Accent colour" value={field.value} onChange={field.onChange} options={ACCENTS} disabled={readOnly} />
            )}
          />
        </FormSection>

        <FormSection title="Schedule" description="Before the launch time the website shows only the countdown. Stock can't be bought early.">
          <Controller
            control={form.control}
            name="startsAt"
            render={({ field, fieldState }) => (
              <DateTimeInput
                label="Launch"
                required
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message ?? null}
                disabled={readOnly || ctl.startsAtLocked}
                hint={ctl.startsAtLocked && !readOnly ? "A live drop's launch time can't be changed." : undefined}
              />
            )}
          />
          {pastLaunch ? <Banner variant="warning">That launch time has already passed, so the drop would go live immediately. Pick a future time.</Banner> : null}
          <Controller
            control={form.control}
            name="endsAt"
            render={({ field, fieldState }) => (
              <DateTimeInput label="End (optional)" value={field.value} onChange={field.onChange} error={fieldState.error?.message ?? null} disabled={readOnly} hint="Leave empty for no end date. Must be after the launch." />
            )}
          />
          {overlap && startsAt ? (
            <Banner variant="warning" title={`${overlap} is live`}>
              Two live drops at once can confuse customers. The website shows the one that started most recently.
            </Banner>
          ) : null}
        </FormSection>

        <FormSection title="Stimpies">
          <Controller
            control={form.control}
            name="stimpieIds"
            render={({ field, fieldState }) => (
              <>
                <StimpiePicker value={field.value} onChange={field.onChange} disabled={readOnly} dropId={initial?.id ?? null} />
                {fieldState.error ? <p role="alert" className="text-body-sm font-medium text-fg-danger">{fieldState.error.message}</p> : null}
              </>
            )}
          />
          {stimpieIds.length === 0 ? <p className="text-body-sm text-fg-muted">A drop with no Stimpies has nothing to sell.</p> : null}
        </FormSection>

        <FormSection title="Teaser">
          <Controller control={form.control} name="teaserImage" render={({ field }) => <FileUpload variant="image" label="Teaser image" value={field.value} onChange={(r) => field.onChange(r?.url ?? null)} onBusyChange={setUploading} disabled={readOnly} />} />
          <Controller control={form.control} name="teaserVideo" render={({ field }) => <FileUpload variant="video" label="Teaser video" value={field.value} onChange={(r) => field.onChange(r?.url ?? null)} onBusyChange={setUploading} disabled={readOnly} />} />
        </FormSection>

        {initial ? (
          <p className="text-body-sm text-fg-muted">
            Launch {f.dateTime(initial.startsAt)} ({f.timeZone}). Public page: <span className="font-mono">/drops/{initial.slug}</span>
          </p>
        ) : null}

        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-col-reverse gap-2 border-t border-base bg-surface-base px-4 py-3 md:static md:mx-0 md:flex-row md:justify-end md:border-0 md:bg-transparent md:p-0">
          {initial ? (
            <Button variant="secondary" className="!border-danger !text-fg-danger md:mr-auto" onClick={() => { setDeleteConflict(false); setConfirmDelete(true); }}>
              Delete drop
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => guard.bypass(onDone)}>{readOnly ? 'Back' : 'Cancel'}</Button>
          {!readOnly ? (
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting || create.isPending || update.isPending} disabled={uploading}>
              Save drop
            </Button>
          ) : null}
        </div>
      </AdminForm>

      {initial ? (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          tone="destructive"
          title="Delete this drop?"
          description={
            deleteConflict ? (
              <span>This drop has orders. You can&apos;t delete it.</span>
            ) : (
              <span>Its Stimpies leave the drop and are hidden from the website. Subscribers stay on your list.</span>
            )
          }
          notUndoable
          confirmLabel="Delete drop"
          confirmDisabled={deleteConflict}
          reportErrors={false}
          onConfirm={async () => {
            try {
              await remove.mutateAsync(initial.id);
            } catch (e) {
              if (asApiError(e)?.code === 'CONFLICT') {
                setDeleteConflict(true);
                throw e;
              }
              toast.error('Could not delete the drop. Try again.');
              throw e;
            }
            toast.success('Drop deleted.');
            guard.bypass(() => navigate('/drops'));
          }}
        />
      ) : null}
      {guard.dialog}
    </div>
  );
}
