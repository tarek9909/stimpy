import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Input, Skeleton, Textarea, TextLink, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { FileUpload } from '../../components/FileUpload';
import { QueryBoundary } from '../../components/QueryBoundary';
import { moveItem } from '../../lib/reorder';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useContentBlock, useSaveContent, type HowItWorksBlock, type PoliciesBlock } from './api';
import { Disclosure, EditPreview } from './shared';

type DirtyMap = Record<string, boolean>;

function useDirtyReport(id: string, dirty: boolean, report: (id: string, dirty: boolean) => void) {
  useEffect(() => {
    report(id, dirty);
    return () => report(id, false);
  }, [id, dirty, report]);
}

function PolicySection({ field, title, data, report }: { field: keyof PoliciesBlock; title: string; data: PoliciesBlock; report: (id: string, dirty: boolean) => void }) {
  const save = useSaveContent('policies');
  const toast = useToast();
  const [value, setValue] = useState(data[field]);
  const dirty = value !== data[field];
  useDirtyReport(`policy-${field}`, dirty, report);
  return (
    <Disclosure title={title} dirty={dirty} summary={`${data[field].length} characters`}>
      <EditPreview label={title} value={value} onChange={setValue} rows={10} maxLength={20000} id={`policy-${field}`} />
      <div>
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={async () => {
            // The API replaces the whole block: send the other sections as last saved.
            await save.mutateAsync({ ...data, [field]: value });
            toast.success(`${title} saved.`);
          }}
        >
          Save {title}
        </Button>
      </div>
    </Disclosure>
  );
}

function AboutSection({ about, report }: { about: string; report: (id: string, dirty: boolean) => void }) {
  const save = useSaveContent('about');
  const toast = useToast();
  const [value, setValue] = useState(about);
  const dirty = value !== about;
  useDirtyReport('about', dirty, report);
  return (
    <Disclosure title="About" dirty={dirty} summary="The About page text">
      <EditPreview label="About" value={value} onChange={setValue} rows={10} maxLength={20000} id="about-text" />
      <div>
        <Button variant="primary" loading={save.isPending} onClick={async () => { await save.mutateAsync({ about: value }); toast.success('About saved.'); }}>
          Save About
        </Button>
      </div>
    </Disclosure>
  );
}

/** A list of strings or records with add, remove and Move up / Move down (How it works). */
function Row({ children, onUp, onDown, onRemove, index, count, label }: { children: React.ReactNode; onUp: () => void; onDown: () => void; onRemove: () => void; index: number; count: number; label: string }) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-base p-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="sm" iconOnly aria-label={`Move ${label} up`} disabled={index === 0} onClick={onUp}><ArrowUp size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={onDown}><ArrowDown size={16} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" iconOnly aria-label={`Remove ${label}`} onClick={onRemove}><Trash2 size={16} aria-hidden="true" /></Button>
      </div>
    </li>
  );
}

function ids(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
function reorder<T>(items: T[], index: number, delta: -1 | 1): T[] {
  return moveItem(ids(items.length), index, delta).map((i) => items[i] as T);
}

export function validateHowItWorks(b: HowItWorksBlock): string[] {
  const errs: string[] = [];
  b.steps.forEach((s, i) => { if (s.title.trim() === '') errs.push(`Step ${i + 1} needs a title.`); });
  b.promises.forEach((p, i) => { if (p.trim() === '') errs.push(`Promise ${i + 1} is empty.`); });
  b.faqs.forEach((f, i) => { if (f.question.trim() === '' || f.answer.trim() === '') errs.push(`Question ${i + 1} needs a question and an answer.`); });
  return errs;
}

function HowItWorksSection({ data, report }: { data: HowItWorksBlock; report: (id: string, dirty: boolean) => void }) {
  const save = useSaveContent('how-it-works');
  const toast = useToast();
  const notify = useNotifyError();
  const [draft, setDraft] = useState<HowItWorksBlock>(data);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(data), [draft, data]);
  useDirtyReport('how', dirty, report);
  const set = (patch: Partial<HowItWorksBlock>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <Disclosure title="How it works" dirty={dirty} summary={`${data.steps.length} steps, ${data.promises.length} promises, ${data.faqs.length} questions`}>
      {errors.length ? <Banner variant="error" title="Please fix the following"><ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Banner> : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-h6 font-bold">Steps</legend>
        <ul className="flex flex-col gap-3">
          {draft.steps.map((s, i) => (
            <Row key={i} index={i} count={draft.steps.length} label={`step ${i + 1}`}
              onUp={() => set({ steps: reorder(draft.steps, i, -1) })} onDown={() => set({ steps: reorder(draft.steps, i, 1) })} onRemove={() => set({ steps: draft.steps.filter((_, j) => j !== i) })}>
              <label className="text-body-sm font-medium" htmlFor={`step-title-${i}`}>Step {i + 1} title</label>
              <Input id={`step-title-${i}`} value={s.title} maxLength={120} onChange={(e) => set({ steps: draft.steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <label className="text-body-sm font-medium" htmlFor={`step-text-${i}`}>Step {i + 1} text</label>
              <Textarea id={`step-text-${i}`} rows={3} value={s.text} maxLength={2000} onChange={(e) => set({ steps: draft.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <FileUpload variant="image" compact label={`Step ${i + 1} image (optional)`} value={s.mediaUrl} onBusyChange={setUploading} onChange={(r) => set({ steps: draft.steps.map((x, j) => (j === i ? { ...x, mediaUrl: r?.url ?? null } : x)) })} />
            </Row>
          ))}
        </ul>
        <div><Button variant="secondary" size="sm" leftIcon={<Plus size={16} aria-hidden="true" />} disabled={draft.steps.length >= 20} onClick={() => set({ steps: [...draft.steps, { title: '', text: '', mediaUrl: null }] })}>Add step</Button></div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-h6 font-bold">Promises</legend>
        <p className="text-body-sm text-fg-muted">Short quality promises, shown as a list.</p>
        <ul className="flex flex-col gap-3">
          {draft.promises.map((p, i) => (
            <Row key={i} index={i} count={draft.promises.length} label={`promise ${i + 1}`}
              onUp={() => set({ promises: reorder(draft.promises, i, -1) })} onDown={() => set({ promises: reorder(draft.promises, i, 1) })} onRemove={() => set({ promises: draft.promises.filter((_, j) => j !== i) })}>
              <label className="sr-only" htmlFor={`promise-${i}`}>Promise {i + 1}</label>
              <Input id={`promise-${i}`} value={p} maxLength={200} onChange={(e) => set({ promises: draft.promises.map((x, j) => (j === i ? e.target.value : x)) })} />
            </Row>
          ))}
        </ul>
        <div><Button variant="secondary" size="sm" leftIcon={<Plus size={16} aria-hidden="true" />} disabled={draft.promises.length >= 20} onClick={() => set({ promises: [...draft.promises, ''] })}>Add promise</Button></div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-h6 font-bold">Questions</legend>
        <ul className="flex flex-col gap-3">
          {draft.faqs.map((f, i) => (
            <Row key={i} index={i} count={draft.faqs.length} label={`question ${i + 1}`}
              onUp={() => set({ faqs: reorder(draft.faqs, i, -1) })} onDown={() => set({ faqs: reorder(draft.faqs, i, 1) })} onRemove={() => set({ faqs: draft.faqs.filter((_, j) => j !== i) })}>
              <label className="text-body-sm font-medium" htmlFor={`hq-${i}`}>Question {i + 1}</label>
              <Input id={`hq-${i}`} value={f.question} maxLength={200} onChange={(e) => set({ faqs: draft.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
              <label className="text-body-sm font-medium" htmlFor={`ha-${i}`}>Answer {i + 1}</label>
              <Textarea id={`ha-${i}`} rows={3} value={f.answer} maxLength={2000} onChange={(e) => set({ faqs: draft.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
            </Row>
          ))}
        </ul>
        <div><Button variant="secondary" size="sm" leftIcon={<Plus size={16} aria-hidden="true" />} disabled={draft.faqs.length >= 30} onClick={() => set({ faqs: [...draft.faqs, { question: '', answer: '' }] })}>Add question</Button></div>
      </fieldset>

      <div>
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={uploading}
          onClick={async () => {
            const problems = validateHowItWorks(draft);
            setErrors(problems);
            if (problems.length) return;
            try {
              await save.mutateAsync(draft);
              toast.success('How it works saved.');
            } catch (e) {
              notify(e);
            }
          }}
        >
          Save How it works
        </Button>
      </div>
    </Disclosure>
  );
}

function PoliciesBody({ policies, about, how }: { policies: PoliciesBlock; about: string; how: HowItWorksBlock }) {
  const [dirty, setDirty] = useState<DirtyMap>({});
  const report = useMemo(() => (id: string, d: boolean) => setDirty((m) => (m[id] === d ? m : { ...m, [id]: d })), []);
  const guard = useUnsavedChangesGuard(Object.values(dirty).some(Boolean));
  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <p className="text-body-sm text-fg-muted">
        How to measure is edited with the size chart: <TextLink href="/products?tab=size-chart">Products &rarr; Size chart</TextLink>.
      </p>
      <PolicySection field="deliveryReturns" title="Delivery & returns" data={policies} report={report} />
      <PolicySection field="care" title="Care" data={policies} report={report} />
      <PolicySection field="terms" title="Terms" data={policies} report={report} />
      <PolicySection field="privacy" title="Privacy" data={policies} report={report} />
      <AboutSection about={about} report={report} />
      <HowItWorksSection data={how} report={report} />
      {guard.dialog}
    </div>
  );
}

/** Content -> Policies (dashboard-pages 13.3), plus About and How it works. */
export function PoliciesTab() {
  const p = useContentBlock('policies');
  const a = useContentBlock('about');
  const h = useContentBlock('how-it-works');
  const pending = p.isPending || a.isPending || h.isPending;
  const failed = p.isError ? p : a.isError ? a : h.isError ? h : null;
  return (
    <QueryBoundary
      query={(failed ?? (pending ? (p.isPending ? p : a.isPending ? a : h) : p)) as typeof p}
      skeleton={<Skeleton variant="rect" className="h-72" />}
    >
      {() => (a.data && h.data && p.data ? <PoliciesBody policies={p.data} about={a.data.about} how={h.data} /> : null)}
    </QueryBoundary>
  );
}
