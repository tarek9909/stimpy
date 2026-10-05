import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Modal, Skeleton, Switch, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { FileUpload } from '../../components/FileUpload';
import { AdminForm } from '../../components/form/AdminForm';
import { SelectField, SwitchField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useOnline } from '../../lib/hooks';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useEveryDrop } from '../drops/api';
import { useContentBlock, useReviewMutations, useReviews, useSaveContent, type AdminReview, type HomepageBlock } from './api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';

const heroSchema = z.object({
  heroHeadline: z.string().trim().min(1, 'Enter a headline.').max(80, 'Use at most 80 characters.'),
  heroSubheadline: z.string().max(300, 'Use at most 300 characters.'),
  heroVideoUrl: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
  featuredDropSlug: z.string(),
});
type HeroValues = z.infer<typeof heroSchema>;
const toHero = (h: HomepageBlock): HeroValues => ({ ...h, featuredDropSlug: h.featuredDropSlug ?? '' });
export const toHomepageBody = (v: HeroValues): HomepageBlock => ({
  heroHeadline: v.heroHeadline.trim(),
  heroSubheadline: v.heroSubheadline.trim(),
  heroVideoUrl: v.heroVideoUrl,
  heroImageUrl: v.heroImageUrl,
  featuredDropSlug: v.featuredDropSlug === '' ? null : v.featuredDropSlug,
});

function HeroForm({ initial }: { initial: HomepageBlock }) {
  const toast = useToast();
  const save = useSaveContent('homepage');
  const drops = useEveryDrop();
  const form = useForm<HeroValues>({ resolver: zodResolver(heroSchema), defaultValues: useMemo(() => toHero(initial), [initial]), reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const [uploading, setUploading] = useState(false);
  const options = [{ value: '', label: 'Automatic: current live drop' }, ...(drops.data?.items ?? []).filter((d) => d.state !== 'ENDED').map((d) => ({ value: d.slug, label: d.name }))];
  // A saved slug that is no longer in the list (ended drop) must still be shown, not silently dropped.
  const current = initial.featuredDropSlug;
  if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
  return (
    <>
      {draft.banner}
      <AdminForm
        id="homepage-form"
        form={form}
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={async (v) => {
          const saved = await save.mutateAsync(toHomepageBody(v));
          draft.clear();
          form.reset(toHero(saved));
          toast.success('Homepage saved.');
        }}
      >
        <FormSection title="Hero">
          <TextField name="heroHeadline" label="Headline" required maxLength={80} autoComplete="off" />
          <TextAreaField name="heroSubheadline" label="Subheadline" rows={3} maxLength={300} showCount optional />
          <Controller control={form.control} name="heroVideoUrl" render={({ field }) => <FileUpload variant="video" label="Hero video (optional)" hint="MP4 or WebM up to 100 MB." value={field.value} onChange={(r) => field.onChange(r?.url ?? null)} onBusyChange={setUploading} />} />
          <Controller control={form.control} name="heroImageUrl" render={({ field }) => <FileUpload variant="image" label="Hero image (optional)" hint="Shown as the poster and as the fallback when there is no video." value={field.value} onChange={(r) => field.onChange(r?.url ?? null)} onBusyChange={setUploading} />} />
          <SelectField name="featuredDropSlug" label="Featured drop" options={options} hint="Which drop the home page highlights." />
        </FormSection>
        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending} disabled={uploading}>Save homepage</Button>
        </div>
      </AdminForm>
      {guard.dialog}
    </>
  );
}

const reviewSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  text: z.string().trim().min(1, 'Enter the review text.').max(2000, 'Use at most 2000 characters.'),
  mediaUrl: z.string().nullable(),
  visible: z.boolean(),
});
type ReviewValues = z.infer<typeof reviewSchema>;

function ReviewDialog({ review, onClose }: { review: AdminReview | null; onClose: () => void }) {
  const toast = useToast();
  const { create, update } = useReviewMutations();
  const form = useForm<ReviewValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { name: review?.name ?? '', text: review?.text ?? '', mediaUrl: review?.mediaUrl ?? null, visible: review?.visible ?? true },
  });
  const [uploading, setUploading] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={review ? 'Edit review' : 'Add review'}
      size="md"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="review-form" variant="primary" loading={form.formState.isSubmitting} disabled={uploading}>{review ? 'Save review' : 'Add review'}</Button>
        </>
      }
    >
      <AdminForm
        id="review-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          if (review) await update.mutateAsync({ id: review.id, body: v });
          else await create.mutateAsync(v);
          toast.success(review ? 'Review saved.' : 'Review added.');
          onClose();
        }}
      >
        <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
        <TextAreaField name="text" label="Review" rows={4} maxLength={2000} showCount required />
        <Controller control={form.control} name="mediaUrl" render={({ field }) => <FileUpload variant="image" label="Photo (customer swap, optional)" value={field.value} onChange={(r) => field.onChange(r?.url ?? null)} onBusyChange={setUploading} />} />
        <SwitchField name="visible" label="Show on the website" />
      </AdminForm>
    </Modal>
  );
}

function ReviewsSection() {
  const q = useReviews();
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const online = useOnline();
  const { update, remove } = useReviewMutations();
  const [dialog, setDialog] = useState<{ review: AdminReview | null } | null>(null);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);
  const toggle = async (r: AdminReview, visible: boolean) => {
    const before = q.data;
    qc.setQueryData(queryKeys.reviews, (old: typeof q.data) => (old ? { ...old, items: old.items.map((x) => (x.id === r.id ? { ...x, visible } : x)) } : old));
    try {
      await update.mutateAsync({ id: r.id, body: { visible } });
    } catch (e) {
      qc.setQueryData(queryKeys.reviews, before);
      notify(e, { fallback: "Couldn't change that. Restored." });
    }
  };
  const columns: Column<AdminReview>[] = [
    { id: 'name', header: 'Name', priority: 'primary', cell: (r) => <span className="font-medium">{r.name}</span> },
    { id: 'text', header: 'Review', priority: 'primary', mobileLabel: '', cell: (r) => <span className="line-clamp-3 whitespace-pre-line">{r.text}</span> },
    { id: 'media', header: 'Photo', cell: (r) => (r.mediaUrl ? <img src={r.mediaUrl} alt="" className="h-12 w-12 rounded-md border border-base object-cover" /> : <span className="text-fg-muted">&mdash;</span>) },
    { id: 'visible', header: 'Visible', mobileLabel: '', cell: (r) => <Switch label={<span className="sr-only">{`Show ${r.name}'s review`}</span>} checked={r.visible} onChange={(v) => void toggle(r, v)} disabled={!online} onText="Visible" offText="Hidden" className="!min-h-0 !py-0" /> },
    {
      id: 'actions',
      header: 'Actions',
      mobileLabel: '',
      cell: (r) => (
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Pencil size={16} aria-hidden="true" />} aria-label={`Edit review by ${r.name}`} onClick={() => setDialog({ review: r })}>Edit</Button>
          <Button variant="ghost" size="sm" leftIcon={<Trash2 size={16} aria-hidden="true" />} aria-label={`Delete review by ${r.name}`} onClick={() => setDeleting(r)}>Delete</Button>
        </span>
      ),
    },
  ];
  return (
    <section aria-labelledby="reviews-title" className="flex max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="reviews-title" className="text-h4">Customer swaps and reviews</h2>
          <p className="text-body-sm text-fg-muted">Hide a review without deleting it.</p>
        </div>
        <Button variant="secondary" leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setDialog({ review: null })}>Add review</Button>
      </div>
      <DataTable
        caption="Reviews"
        columns={columns}
        rows={q.data?.items}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.name}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={<EmptyState title="No reviews yet" text="Hidden on the website until you add some." headingLevel={3} action={<Button variant="secondary" onClick={() => setDialog({ review: null })}>Add review</Button>} />}
      />
      {dialog ? <ReviewDialog review={dialog.review} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title="Delete this review?"
        description="It is removed from the website. Hiding it instead keeps it here."
        notUndoable
        confirmLabel="Delete review"
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success('Review deleted.');
        }}
      />
    </section>
  );
}

/** Content -> Homepage (dashboard-pages 13.4): hero fields and reviews. */
export function HomepageTab() {
  const q = useContentBlock('homepage');
  return (
    <div className="flex flex-col gap-10">
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-80" />}>
        {(h) => <HeroForm initial={h} />}
      </QueryBoundary>
      <ReviewsSection />
    </div>
  );
}
