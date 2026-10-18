import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Modal, Select, Switch, useToast } from '@stimpy/ui';
import { api } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { AdminForm } from '../../components/form/AdminForm';
import { ComboboxField, SwitchField, TextField } from '../../components/form/Field';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useOnline } from '../../lib/hooks';
import { MAX_ORDERABLE_ITEMS, moveToPosition } from '../../lib/reorder';
import { Skeleton } from '@stimpy/ui';
import { faqGroups, filterFaqs, moveInView, normalizeGroup, UNGROUPED } from './faqLogic';
import { useFaqMutations, useFaqs, type AdminFaq } from './api';
import { EditPreview } from './shared';

const schema = z.object({
  question: z.string().trim().min(1, 'Enter the question.').max(200, 'Use at most 200 characters.'),
  answer: z.string().trim().min(1, 'Enter the answer.').max(2000, 'Use at most 2000 characters.'),
  group: z.string().max(60, 'Use at most 60 characters.'),
  showOnHome: z.boolean(),
});
type Values = z.infer<typeof schema>;

function FaqDialog({ faq, groups, onClose }: { faq: AdminFaq | null; groups: string[]; onClose: () => void }) {
  const toast = useToast();
  const { create, update } = useFaqMutations();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { question: faq?.question ?? '', answer: faq?.answer ?? '', group: faq?.group ?? '', showOnHome: faq?.showOnHome ?? false },
  });
  const answer = useWatch({ control: form.control, name: 'answer' });
  void answer;
  return (
    <Modal
      open
      onClose={onClose}
      title={faq ? 'Edit question' : 'Add question'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="faq-form" variant="primary" loading={form.formState.isSubmitting}>{faq ? 'Save question' : 'Add question'}</Button>
        </>
      }
    >
      <AdminForm
        id="faq-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const body = { question: v.question.trim(), answer: v.answer.trim(), group: normalizeGroup(v.group), showOnHome: v.showOnHome };
          if (faq) await update.mutateAsync({ id: faq.id, body });
          else await create.mutateAsync(body);
          toast.success(faq ? 'Question saved.' : 'Question added.');
          onClose();
        }}
      >
        <TextField name="question" label="Question" required maxLength={200} autoComplete="off" />
        <Controller
          control={form.control}
          name="answer"
          render={({ field, fieldState }) => (
            <div>
              <EditPreview label="Answer" value={field.value} onChange={field.onChange} rows={6} maxLength={2000} id="field-answer" />
              {fieldState.error ? <p role="alert" className="mt-1 text-body-sm font-medium text-fg-danger">{fieldState.error.message}</p> : null}
            </div>
          )}
        />
        <ComboboxField name="group" label="Group" options={groups.map((g) => ({ value: g, label: g }))} allowCustom clearable placeholder="Ungrouped" hint="A label such as Ordering or Sizing. Leave blank for no group." />
        <SwitchField name="showOnHome" label="Show on the home page" />
      </AdminForm>
    </Modal>
  );
}

/** Content -> FAQ (dashboard-pages 13.2): one global order, optional group labels, optimistic reorder. */
export function FaqTab() {
  const q = useFaqs();
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-72" />}>
      {(page) => <FaqList faqs={page.items} total={page.total} />}
    </QueryBoundary>
  );
}

function FaqList({ faqs, total }: { faqs: AdminFaq[]; total: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const online = useOnline();
  const { update, remove } = useFaqMutations();
  const [group, setGroup] = useState('all');
  const [dialog, setDialog] = useState<{ faq: AdminFaq | null } | null>(null);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);
  const groups = useMemo(() => faqGroups(faqs), [faqs]);
  const hasUngrouped = faqs.some((f) => !f.group?.trim());
  const view = useMemo(() => filterFaqs(faqs, group), [faqs, group]);

  const setCache = (items: AdminFaq[]) => qc.setQueryData(queryKeys.faqs, (old: { items: AdminFaq[]; total: number; page: number; pageSize: number } | undefined) => (old ? { ...old, items } : old));
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.PUT('/api/v1/admin/faqs/order', { body: { ids } }),
  });
  /** Optimistic with rollback (dashboard-pages 1.5). Always sends the FULL id list. */
  const applyOrder = async (ids: number[]) => {
    const expectedIds = new Set(faqs.map((faq) => faq.id));
    if (ids.length !== faqs.length || ids.length > MAX_ORDERABLE_ITEMS || new Set(ids).size !== expectedIds.size || ids.some((id) => !expectedIds.has(id))) {
      void qc.invalidateQueries({ queryKey: queryKeys.faqs });
      toast.error('The complete FAQ list changed. Refresh before reordering.');
      return;
    }
    const before = faqs;
    const byId = new Map(faqs.map((f) => [f.id, f]));
    setCache(ids.map((id) => byId.get(id) as AdminFaq));
    try {
      await reorder.mutateAsync(ids);
      void qc.invalidateQueries({ queryKey: queryKeys.faqs });
    } catch {
      setCache(before);
      toast.error("Couldn't save the new order. Restored.");
    }
  };
  const toggleHome = async (f: AdminFaq, value: boolean) => {
    const before = faqs;
    setCache(faqs.map((x) => (x.id === f.id ? { ...x, showOnHome: value } : x)));
    try {
      await update.mutateAsync({ id: f.id, body: { showOnHome: value } });
    } catch (e) {
      setCache(before);
      notify(e, { fallback: "Couldn't change that. Restored." });
    }
  };

  const columns: Column<AdminFaq>[] = [
    {
      id: 'question',
      header: 'Question',
      priority: 'primary',
      cell: (f) => (
        <span className="flex flex-col gap-1">
          <span className="font-medium">{f.question}</span>
          {f.group ? <span className="w-fit rounded-sm bg-cream px-2 py-0.5 text-body-sm font-medium" data-testid="faq-group">{f.group}</span> : null}
        </span>
      ),
    },
    {
      id: 'home',
      header: 'Shown on home',
      mobileLabel: '',
      cell: (f) => <Switch label={<span className="sr-only">{`Show "${f.question}" on the home page`}</span>} checked={f.showOnHome} onChange={(v) => void toggleHome(f, v)} disabled={!online} className="!min-h-0 !py-0" />,
    },
    {
      id: 'actions',
      header: 'Actions',
      mobileLabel: '',
      cell: (f) => (
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Pencil size={16} aria-hidden="true" />} aria-label={`Edit ${f.question}`} onClick={() => setDialog({ faq: f })}>Edit</Button>
          <Button variant="ghost" size="sm" leftIcon={<Trash2 size={16} aria-hidden="true" />} aria-label={`Delete ${f.question}`} onClick={() => setDeleting(f)}>Delete</Button>
        </span>
      ),
    },
  ];

  const allIds = faqs.map((f) => f.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {groups.length > 0 || hasUngrouped ? (
          <div className="w-full max-w-xs">
            <label htmlFor="faq-group-filter" className="mb-1 block text-body font-medium">Group</label>
            <Select
              id="faq-group-filter"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              options={[{ value: 'all', label: 'All questions' }, ...groups.map((g) => ({ value: g, label: g })), ...(hasUngrouped && groups.length > 0 ? [{ value: UNGROUPED, label: 'Ungrouped' }] : [])]}
            />
          </div>
        ) : <span />}
        <Button variant="primary" leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setDialog({ faq: null })}>Add question</Button>
      </div>
      <p className="text-body-sm text-fg-muted">One order for all questions; the website groups them by label. Drag a row or use Move up / Move down.{group !== 'all' ? ' Moving inside a filtered view keeps one global order.' : ''}</p>
      {faqs.length > MAX_ORDERABLE_ITEMS ? <p className="text-body-sm text-fg-muted">Reordering is unavailable because the full list exceeds the 5,000-item API limit.</p> : null}
      {total > faqs.length ? <p className="text-body-sm text-fg-muted">Showing the first {faqs.length} of {total} questions.</p> : null}
      <DataTable
        caption="Questions"
        columns={columns}
        rows={view}
        getRowId={(f) => f.id}
        rowLabel={(f) => f.question}
        reorder={{
          disabled: reorder.isPending || !online || faqs.length > MAX_ORDERABLE_ITEMS,
          onMove: (id, delta) => void applyOrder(moveInView(allIds, view.map((f) => f.id), id as number, delta)),
          onDragMove: (from, to) => void applyOrder(moveToPosition(allIds, from as number, to as number)),
        }}
        empty={<EmptyState title={faqs.length ? 'No questions in this group' : 'No questions yet'} action={<Button variant="secondary" onClick={() => setDialog({ faq: null })}>Add question</Button>} />}
      />
      {dialog ? <FaqDialog faq={dialog.faq} groups={groups} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title="Delete this question?"
        description={deleting ? `"${deleting.question}" is removed from the website.` : null}
        notUndoable
        confirmLabel="Delete question"
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success('Question deleted.');
        }}
      />
    </div>
  );
}
