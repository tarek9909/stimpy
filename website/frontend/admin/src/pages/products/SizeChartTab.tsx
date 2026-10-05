import { useMemo, useRef, useState } from 'react';
import { useForm, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Button, Input, RichText, Skeleton, Switch, TextLink, useToast, cn } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminForm } from '../../components/form/AdminForm';
import { TextAreaField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { invalidateFor, useSizeChart, type AdminSizeChart } from './api';

const MAX_COLUMNS = 12;
const CELL_MAX = 30;

const schema = z
  .object({
    columns: z.array(z.object({ key: z.string(), id: z.number().nullable(), label: z.string().trim().min(1, 'Enter a column name.').max(40, 'Use at most 40 characters.'), unit: z.string().trim().min(1, 'Enter a unit.').max(10, 'Use at most 10 characters.') })).min(1, 'Keep at least one measurement column.').max(MAX_COLUMNS, `Use at most ${MAX_COLUMNS} columns.`),
    cells: z.record(z.string(), z.record(z.string(), z.string().max(CELL_MAX, `Use at most ${CELL_MAX} characters.`))),
    howToMeasure: z.string().max(20000, 'Use at most 20000 characters.'),
  })
  .superRefine((v, ctx) => {
    const seen = new Map<string, number>();
    v.columns.forEach((c, i) => {
      const k = c.label.trim().toLowerCase();
      if (!k) return;
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['columns', i, 'label'], message: 'Column names must be different.' });
      seen.set(k, i);
    });
  });
type Values = z.infer<typeof schema>;

let counter = 0;
const newKey = () => `c${(counter += 1)}`;

export function chartToValues(chart: AdminSizeChart): Values {
  const columns = [...chart.columns].sort((a, b) => a.position - b.position).map((c) => ({ key: `c${c.id}`, id: c.id, label: c.label, unit: c.unit }));
  const cells: Values['cells'] = {};
  for (const row of chart.rows) {
    cells[`s${row.sizeId}`] = Object.fromEntries(columns.map((c) => [c.key, row.values[String(c.id)] ?? '']));
  }
  return { columns, cells, howToMeasure: chart.howToMeasure };
}

/**
 * The PUT body. Columns keep array order as `position`. A column that already exists is keyed by
 * its id; a new column (no id) is keyed `new:<index in the columns array>` (DECISIONS: size chart).
 */
export function valuesToBody(v: Values, rows: Array<{ sizeId: number; label: string }>) {
  const keyFor = (c: Values['columns'][number], i: number) => (c.id !== null ? String(c.id) : `new:${i}`);
  return {
    columns: v.columns.map((c, i) => ({ ...(c.id !== null ? { id: c.id } : {}), label: c.label.trim(), unit: c.unit.trim(), position: i })),
    rows: rows.map((r) => ({
      sizeId: r.sizeId,
      values: Object.fromEntries(v.columns.map((c, i) => [keyFor(c, i), (v.cells[`s${r.sizeId}`]?.[c.key] ?? '').trim()]).filter(([, val]) => val !== '')),
    })),
    howToMeasure: v.howToMeasure,
  };
}

export function SizeChartTab() {
  const q = useSizeChart();
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-80" />}>
      {(chart) => <SizeChartForm chart={chart} />}
    </QueryBoundary>
  );
}

function SizeChartForm({ chart }: { chart: AdminSizeChart }) {
  const qc = useQueryClient();
  const toast = useToast();
  const defaults = useMemo(() => chartToValues(chart), [chart]);
  const rows = useMemo(() => chart.rows.map((r) => ({ sizeId: r.sizeId, label: r.label })), [chart]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const cols = useFieldArray({ control: form.control, name: 'columns', keyName: 'rid' });
  const columns = useWatch({ control: form.control, name: 'columns' });
  const cells = useWatch({ control: form.control, name: 'cells' });
  const [removeAt, setRemoveAt] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const howTo = useWatch({ control: form.control, name: 'howToMeasure' });
  const lastBody = useRef<ReturnType<typeof valuesToBody> | null>(null);

  const save = useMutation({ mutationFn: (body: ReturnType<typeof valuesToBody>) => unwrap(api.PUT('/api/v1/admin/size-chart', { body })) });

  const filledIn = (key: string) => rows.filter((r) => (cells?.[`s${r.sizeId}`]?.[key] ?? '').trim() !== '').length;

  /** API path -> form field: `columns.N.label` as is; `rows.N.values.K` -> `cells.s<sizeId>.<columnKey>`. */
  const mapPath = (path: string): string | null => {
    const m = /^rows\.(\d+)\.values\.(.+)$/.exec(path);
    if (!m) return path.startsWith('columns.') ? path : null;
    const row = rows[Number(m[1])];
    if (!row) return null;
    const k = m[2] as string;
    const col = k.startsWith('new:') ? columns[Number(k.slice(4))] : columns.find((c) => String(c.id) === k);
    return col ? `cells.s${row.sizeId}.${col.key}` : null;
  };

  const move = (i: number, d: -1 | 1) => cols.move(i, i + d);

  return (
    <>
      {draft.banner}
      <AdminForm
        form={form}
        className="flex flex-col gap-4"
        apiErrors={{ map: mapPath, known: columns.flatMap((c) => rows.map((r) => `cells.s${r.sizeId}.${c.key}`)) }}
        onSubmit={async (v) => {
          const body = valuesToBody(v, rows);
          lastBody.current = body;
          const saved = await save.mutateAsync(body);
          qc.setQueryData(['size-chart'], saved);
          invalidateFor(qc, 'sizeChart');
          draft.clear();
          form.reset(chartToValues(saved));
          toast.success("Size chart saved. It's live on the website.");
        }}
      >
        <FormSection
          title="Measurements"
          description="One row per size, taken from Options. To remove a size, hide it in Options."
          aside={<TextLink href="/products?tab=options">Add a size</TextLink>}
        >
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[32rem] border-collapse text-left">
              <caption className="sr-only">Size chart measurements</caption>
              <thead>
                <tr className="align-bottom">
                  <th scope="col" className="sticky left-0 bg-surface-base px-2 py-2 text-body-sm font-medium text-fg-muted">Size</th>
                  {cols.fields.map((f, i) => (
                    <th key={f.rid} scope="col" className="min-w-36 px-2 py-2 align-top">
                      <ColumnHeader index={i} count={cols.fields.length} onMove={move} onRemove={() => (filledIn(f.key) > 0 ? setRemoveAt(i) : cols.remove(i))} />
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 align-top">
                    <Button variant="secondary" size="sm" disabled={cols.fields.length >= MAX_COLUMNS} leftIcon={<Plus size={16} aria-hidden="true" />} onClick={() => cols.append({ key: newKey(), id: null, label: '', unit: 'cm' })}>
                      Add column
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sizeId} className="border-t border-base">
                    <th scope="row" className="sticky left-0 bg-surface-base px-2 py-2 text-body font-medium">{r.label}</th>
                    {cols.fields.map((f) => (
                      <td key={f.rid} className="px-2 py-1.5">
                        <CellInput sizeId={r.sizeId} colKey={f.key} label={`${r.label} ${columns.find((c) => c.key === f.key)?.label ?? ''}`} />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            {cols.fields.map((f, i) => (
              <div key={f.rid} className="rounded-lg border border-base p-3">
                <ColumnHeader index={i} count={cols.fields.length} onMove={move} onRemove={() => (filledIn(f.key) > 0 ? setRemoveAt(i) : cols.remove(i))} />
              </div>
            ))}
            <Button variant="secondary" disabled={cols.fields.length >= MAX_COLUMNS} leftIcon={<Plus size={16} aria-hidden="true" />} onClick={() => cols.append({ key: newKey(), id: null, label: '', unit: 'cm' })}>
              Add column
            </Button>
            {rows.map((r) => (
              <fieldset key={r.sizeId} className="rounded-lg border border-base p-3">
                <legend className="px-1 text-body font-medium">Size {r.label}</legend>
                <div className="grid gap-2">
                  {cols.fields.map((f) => (
                    <label key={f.rid} className="flex items-center justify-between gap-3 text-body-sm">
                      <span>{columns.find((c) => c.key === f.key)?.label || 'Column'} ({columns.find((c) => c.key === f.key)?.unit})</span>
                      <CellInput sizeId={r.sizeId} colKey={f.key} label={`${r.label} ${columns.find((c) => c.key === f.key)?.label ?? ''}`} narrow />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {rows.length === 0 ? <p className="text-body-sm text-fg-muted">No sizes yet. Add sizes in Options first.</p> : null}
        </FormSection>

        <FormSection title="How to measure" description="Plain text. Leave a blank line between paragraphs. **bold** and '- ' lists are supported. This is the only place this text is edited.">
          <Switch label="Preview" checked={preview} onChange={setPreview} onText="On" offText="Off" />
          {preview ? <div className="rounded-lg border border-base p-4"><RichText text={howTo} /></div> : <TextAreaField name="howToMeasure" label="How to measure" rows={6} maxLength={20000} showCount />}
        </FormSection>

        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-base bg-surface-base px-4 py-3 md:static md:mx-0 md:border-0 md:p-0">
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>Save size chart</Button>
          <Button variant="secondary" disabled={!form.formState.isDirty} onClick={() => { form.reset(defaults); draft.clear(); }}>Discard changes</Button>
          {form.formState.isDirty ? <span className="text-body-sm text-fg-muted" role="status">Unsaved changes</span> : null}
        </div>
      </AdminForm>

      <ConfirmDialog
        open={removeAt !== null}
        title={`Remove '${removeAt !== null ? (columns[removeAt]?.label || 'this column') : ''}'?`}
        description={removeAt !== null ? `This also removes its ${filledIn(columns[removeAt]?.key ?? '')} values.` : null}
        tone="destructive"
        confirmLabel="Remove column"
        onClose={() => setRemoveAt(null)}
        onConfirm={() => { if (removeAt !== null) cols.remove(removeAt); }}
      />
      {guard.dialog}
    </>
  );
}

function ColumnHeader({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (i: number, d: -1 | 1) => void; onRemove: () => void }) {
  const { register, formState } = useFormContext<Values>();
  const err = formState.errors.columns?.[index];
  return (
    <div className="flex flex-col gap-1.5">
      <label className="sr-only" htmlFor={`field-columns.${index}.label`}>Column {index + 1} name</label>
      <Input id={`field-columns.${index}.label`} {...register(`columns.${index}.label`)} placeholder="Chest" invalid={!!err?.label} aria-describedby={err?.label ? `col-${index}-err` : undefined} autoComplete="off" />
      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor={`field-columns.${index}.unit`}>Column {index + 1} unit</label>
        <Input id={`field-columns.${index}.unit`} {...register(`columns.${index}.unit`)} placeholder="cm" invalid={!!err?.unit} className="!w-20" autoComplete="off" />
        <Button variant="ghost" iconOnly size="sm" aria-label={`Move column ${index + 1} left`} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowLeft size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" iconOnly size="sm" aria-label={`Move column ${index + 1} right`} disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowRight size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" iconOnly size="sm" aria-label={`Remove column ${index + 1}`} disabled={count <= 1} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></Button>
      </div>
      {err?.label?.message || err?.unit?.message ? <p id={`col-${index}-err`} className="text-caption font-medium text-fg-danger">{err?.label?.message ?? err?.unit?.message}</p> : null}
    </div>
  );
}

function CellInput({ sizeId, colKey, label, narrow }: { sizeId: number; colKey: string; label: string; narrow?: boolean }) {
  const { register, formState } = useFormContext<Values>();
  const name = `cells.s${sizeId}.${colKey}` as const;
  const err = formState.errors.cells?.[`s${sizeId}`]?.[colKey]?.message;
  return (
    <div>
      <Input id={`field-${name}`} aria-label={label} {...register(name)} inputMode="decimal" maxLength={CELL_MAX} autoComplete="off" invalid={!!err} className={cn(narrow && '!w-28')} />
      {err ? <p className="mt-1 text-caption font-medium text-fg-danger">{err}</p> : null}
    </div>
  );
}
