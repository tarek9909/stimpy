import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Modal, SegmentedControl, Select, useToast } from '@stimpy/ui';
import { AdminForm } from '../../components/form/AdminForm';
import { ComboboxField, MoneyField, TextAreaField } from '../../components/form/Field';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { DateTimeInput } from '../../components/DateTimeInput';
import { Pagination } from '../../components/Pagination';
import { RangeSelector, type RangeState } from '../../components/RangeSelector';
import { centsToDollarString, useFormatters } from '../../lib/format';
import { parseDollarsToCents } from '@stimpy/ui';
import { dollarsToCents } from '../../lib/schemas';
import { enumParam, paginationParams, stringParam, useUrlState } from '../../lib/urlState';
import { useAdSpend, useCostMutations, useExpenses, type AdSpend, type CostKind, type Expense } from './api';

const EXPENSE_CATEGORIES = ['Printing', 'Packaging', 'Ads', 'Shipping supplies', 'Shoots', 'Other'];
const AD_CHANNELS = ['Instagram', 'Meta Ads', 'TikTok', 'Other'];

type Row = (Expense & { label: string }) | (AdSpend & { label: string });

const costSchema = (kind: CostKind, today: string) =>
  z.object({
    label: z.string().trim().min(1, kind === 'expenses' ? 'Enter a category.' : 'Enter a channel.').max(80, 'Use at most 80 characters.'),
    amount: z.string().trim().refine((v) => parseDollarsToCents(v) !== null, 'Enter an amount above $0.').refine((v) => (parseDollarsToCents(v) ?? 1) > 0, 'Enter an amount above $0.'),
    note: z.string().max(255, 'Use at most 255 characters.'),
    spentOn: z.string().nullable().refine((v) => !!v, 'Choose the date.').refine((v) => !v || v <= today, 'The date cannot be in the future.'),
  });
type CostValues = { label: string; amount: string; note: string; spentOn: string | null };

function CostDialog({ kind, row, today, onClose }: { kind: CostKind; row: Row | null; today: string; onClose: () => void }) {
  const toast = useToast();
  const { create, update } = useCostMutations(kind);
  const schema = useMemo(() => costSchema(kind, today), [kind, today]);
  const form = useForm<CostValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: row?.label ?? '', amount: row ? centsToDollarString(row.amountCents) : '', note: row?.note ?? '', spentOn: row?.spentOn ?? today },
  });
  const noun = kind === 'expenses' ? 'expense' : 'ad spend';
  const suggestions = (kind === 'expenses' ? EXPENSE_CATEGORIES : AD_CHANNELS).map((c) => ({ value: c, label: c }));
  const submit = async (v: CostValues) => {
    const base = { amountCents: dollarsToCents(v.amount), note: v.note.trim() === '' ? null : v.note.trim(), spentOn: v.spentOn as string };
    const body = kind === 'expenses' ? { ...base, category: v.label.trim() } : { ...base, channel: v.label.trim() };
    if (row) await update.mutateAsync({ id: row.id, body });
    else await create.mutateAsync(body);
    toast.success(row ? `${noun[0]?.toUpperCase()}${noun.slice(1)} saved.` : `${noun[0]?.toUpperCase()}${noun.slice(1)} added.`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={row ? `Edit ${noun}` : `Add ${noun}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="cost-form" variant="primary" loading={form.formState.isSubmitting}>{row ? 'Save' : `Add ${noun}`}</Button>
        </>
      }
    >
      <AdminForm id="cost-form" form={form} onSubmit={submit} className="flex flex-col gap-4" apiErrors={{ map: (p) => (p === 'category' || p === 'channel' ? 'label' : p === 'amountCents' ? 'amount' : p) }}>
        <ComboboxField name="label" label={kind === 'expenses' ? 'Category' : 'Channel'} options={suggestions} allowCustom required placeholder={kind === 'expenses' ? 'Printing, Packaging...' : 'Instagram, TikTok...'} />
        <MoneyField name="amount" label="Amount" required />
        <Controller
          control={form.control}
          name="spentOn"
          render={({ field, fieldState }) => <DateTimeInput kind="date" label="Date" required value={field.value} onChange={field.onChange} max={today} error={fieldState.error?.message ?? null} />}
        />
        <TextAreaField name="note" label="Note" rows={2} optional maxLength={255} />
      </AdminForm>
    </Modal>
  );
}

const params = { kind: enumParam(['expenses', 'ad-spend'] as const, 'expenses'), category: stringParam(), ...paginationParams };

/** Finance -> Costs: expenses and ad spend lists with add / edit / delete (dashboard-pages 11.3). */
export function CostsTab({ range }: { range: RangeState }) {
  const f = useFormatters();
  const toast = useToast();
  const [p, setP] = useUrlState(params);
  const kind: CostKind = p.kind;
  const expenses = useExpenses({ from: range.range.from, to: range.range.to, category: p.category, page: p.page, pageSize: p.pageSize });
  const adSpend = useAdSpend({ from: range.range.from, to: range.range.to, page: p.page, pageSize: p.pageSize });
  const q = kind === 'expenses' ? expenses : adSpend;
  const { remove } = useCostMutations(kind);
  const [dialog, setDialog] = useState<{ row: Row | null } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const rows: Row[] | undefined = useMemo(() => {
    if (kind === 'expenses') return expenses.data?.items.map((e) => ({ ...e, label: e.category }));
    return adSpend.data?.items.map((a) => ({ ...a, label: a.channel }));
  }, [kind, expenses.data, adSpend.data]);
  const categories = useMemo(() => {
    const seen = new Set(EXPENSE_CATEGORIES);
    for (const e of expenses.data?.items ?? []) seen.add(e.category);
    if (p.category) seen.add(p.category);
    return [...seen];
  }, [expenses.data, p.category]);

  const noun = kind === 'expenses' ? 'expense' : 'ad spend';
  useEffect(() => {
    setDialog(null);
  }, [kind]);

  const columns: Column<Row>[] = [
    { id: 'date', header: 'Date', priority: 'primary', cell: (r) => <span className="tabular-nums">{r.spentOn}</span> },
    { id: 'amount', header: 'Amount', numeric: true, priority: 'primary', cell: (r) => <span className="font-bold">{f.money(r.amountCents)}</span> },
    { id: 'label', header: kind === 'expenses' ? 'Category' : 'Channel', priority: 'primary', mobileLabel: '', cell: (r) => <span className="font-medium">{r.label}</span> },
    { id: 'note', header: 'Note', cell: (r) => r.note ?? <span className="text-fg-muted">&mdash;</span> },
    {
      id: 'actions',
      header: 'Actions',
      mobileLabel: '',
      cell: (r) => (
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Pencil size={16} aria-hidden="true" />} aria-label={`Edit ${noun} ${r.label} ${r.spentOn}`} onClick={() => setDialog({ row: r })}>Edit</Button>
          <Button variant="ghost" size="sm" leftIcon={<Trash2 size={16} aria-hidden="true" />} aria-label={`Delete ${noun} ${r.label} ${r.spentOn}`} onClick={() => setDeleting(r)}>Delete</Button>
        </span>
      ),
    },
  ];

  const total = q.data?.total ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl aria-label="Cost type" value={kind} onChange={(v) => setP({ kind: v as CostKind })} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'ad-spend', label: 'Ad spend' }]} />
        <Button variant="primary" leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => setDialog({ row: null })}>
          Add {noun}
        </Button>
      </div>
      <RangeSelector state={range} />
      {kind === 'expenses' ? (
        <div className="max-w-xs">
          <label htmlFor="cat-filter" className="mb-1 block text-body font-medium">Category</label>
          <Select id="cat-filter" value={p.category} onChange={(e) => setP({ category: e.target.value })} options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
        </div>
      ) : null}
      <DataTable
        caption={kind === 'expenses' ? 'Expenses' : 'Ad spend'}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => `${r.label} ${r.spentOn}`}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={
          <EmptyState
            title={kind === 'expenses' ? 'No expenses recorded for this range' : 'No ad spend recorded for this range'}
            text="Costs you add here are subtracted from profit."
            action={<Button variant="secondary" onClick={() => setDialog({ row: null })}>Add {noun}</Button>}
          />
        }
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={total} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={q.isFetching} />}
      />
      {q.data ? (
        <p className="text-body font-medium tabular-nums" data-testid="costs-total">
          Total for this range: {f.money(q.data.totalCents)} <span className="font-normal text-fg-muted">({total} {total === 1 ? 'entry' : 'entries'})</span>
        </p>
      ) : null}
      {dialog ? <CostDialog kind={kind} row={dialog.row} today={range.today} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title={`Delete this ${noun}?`}
        description="This changes your profit figures."
        notUndoable
        confirmLabel={`Delete ${noun}`}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          toast.success(`${noun[0]?.toUpperCase()}${noun.slice(1)} deleted.`);
        }}
      />
    </div>
  );
}
