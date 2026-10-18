import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, Eye } from 'lucide-react';
import type { BuilderHandle, BuilderStimpie, OptionColor, ThrottleSimulator } from '@stimpy/builder';
import { Banner, Button, Pill, RadioGroup, Select, Skeleton, Spinner, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../../api/client';
import { asApiError, useNotifyError } from '../../../api/errors';
import { queryKeys } from '../../../api/queryKeys';
import { QueryBoundary } from '../../../components/QueryBoundary';
import { getEnv } from '../../../env';
import { useDebouncedValue, useOnline } from '../../../lib/hooks';
import { useUnsavedChangesGuard } from '../../../lib/unsavedChanges';
import { useAllStimpies, useColors, useHoodies, useSizes, type AdminColor, type AdminHoodie, type AdminSize, type AdminStimpie } from '../../products/api';
import { useAdminBuilder } from '../api';
import { Disclosure } from '../shared';
import {
  builderOptionScope,
  effectiveModeOf,
  formFingerprint,
  modeNotes,
  readinessOf,
  toPreviewData,
  toPutBody,
  validateBuilder,
  withAllColors,
  type AdminBuilder,
  type BuilderColorEntry,
  type FormErrors,
} from '../builderForm';
import type { Placement } from '../placement';
import { ColourCards } from './ColourCards';

const PreviewPanel = lazy(() => import('./PreviewPanel'));

const THROTTLES: Array<{ value: string; label: string; sim: ThrottleSimulator }> = [
  { value: 'none', label: 'None (this device)', sim: 'none' },
  { value: 'no-webgl', label: 'No WebGL', sim: 'no-webgl' },
  { value: 'slow-3g', label: 'Slow 3G', sim: 'slow-3g' },
  { value: 'slow-2g', label: 'Slow 2G', sim: 'slow-2g' },
  { value: 'low-tier', label: 'Low-tier phone', sim: 'low-tier' },
];

function toBuilderStimpie(s: AdminStimpie): BuilderStimpie {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    type: s.type,
    priceCents: s.priceCents,
    artworkUrl: s.artworkUrl,
    artworkWidth: s.artworkWidth,
    artworkHeight: s.artworkHeight,
    drop: null,
    status: 'AVAILABLE',
    remaining: null,
    purchasable: true,
  };
}
const toOptionColor = (c: AdminColor): OptionColor => ({ id: c.id, name: c.name, hex: c.hex, position: c.position, images: c.images });

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Pill tone={ok ? 'success' : 'cream'} size="sm" icon={ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}>
      {children}
    </Pill>
  );
}

function BuilderEditor({ server, colours, stimpies, hoodies, sizes }: { server: AdminBuilder; colours: AdminColor[]; stimpies: AdminStimpie[]; hoodies: AdminHoodie[]; sizes: AdminSize[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const online = useOnline();
  const colourIds = useMemo(() => colours.map((c) => c.id), [colours]);
  const [saved, setSaved] = useState<AdminBuilder>(() => withAllColors(server, colourIds));
  const [form, setForm] = useState<AdminBuilder>(saved);
  const optionScope = useMemo(() => builderOptionScope(form.hoodieId, hoodies, colours, sizes), [form.hoodieId, hoodies, colours, sizes]);
  const activeIds = useMemo(() => optionScope.colors.map((c) => c.id), [optionScope]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ warnings: string[]; at: number } | null>(null);
  const [serverErrors, setServerErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [clientErrors, setClientErrors] = useState<FormErrors>({});
  const [blocking, setBlocking] = useState<string[]>([]);
  const [throttle, setThrottle] = useState('none');
  const [previewOpen, setPreviewOpen] = useState(true);
  const handle = useRef<BuilderHandle>(null);
  const previewRef = useRef<HTMLElement>(null);

  const dirty = formFingerprint(form) !== formFingerprint(saved);
  const guard = useUnsavedChangesGuard(dirty);
  const readiness = useMemo(() => readinessOf(form, activeIds), [form, activeIds]);
  const notes = modeNotes(form, readiness);
  const savedEffective = effectiveModeOf(saved);

  const samples = useMemo(() => stimpies.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, artworkUrl: s.artworkUrl })), [stimpies]);
  const patch = useCallback((p: Partial<AdminBuilder>) => setForm((f) => ({ ...f, ...p })), []);
  const updateColour = useCallback((colorId: number, p: Partial<BuilderColorEntry>) => setForm((f) => ({ ...f, colors: f.colors.map((c) => (c.colorId === colorId ? { ...c, ...p } : c)) })), []);
  const copyAll = useCallback((fromId: number, pl: Placement) => setForm((f) => ({ ...f, colors: f.colors.map((c) => (c.colorId === fromId ? c : { ...c, placement2d: { ...pl } })) })), []);
  // Unsaved form -> what <Builder /> consumes (debounced 300 ms); tint/texture mirror the colour list (always fresh).
  const debounced = useDebouncedValue(form, 300);
  const previewData = useMemo(() => {
    const withMirrors: AdminBuilder = { ...debounced, colors: debounced.colors.map((c) => ({ ...c, tint: colours.find((x) => x.id === c.colorId)?.builderTint ?? null, texture3d: colours.find((x) => x.id === c.colorId)?.builderTexture ?? null })) };
    const scope = builderOptionScope(debounced.hoodieId, hoodies, colours, sizes);
    return toPreviewData({
      form: { ...withMirrors, hoodie: scope.hoodie ? { id: scope.hoodie.id, slug: scope.hoodie.slug, name: scope.hoodie.name } : null },
      colors: scope.colors.map(toOptionColor),
      stimpies: stimpies.filter((s) => s.active).map(toBuilderStimpie),
    });
  }, [debounced, colours, stimpies, hoodies, sizes]);

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toPutBody>) => unwrap(api.PUT('/api/v1/admin/builder', { body })),
  });

  const onSave = async () => {
    setResult(null);
    setServerErrors([]);
    const errs = validateBuilder(form);
    setClientErrors(errs);
    const problems: string[] = [];
    problems.push(...Object.values(errs));
    setBlocking(problems);
    if (problems.length) {
      document.getElementById('builder-problems')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    try {
      const res = await save.mutateAsync(toPutBody(form));
      const next = withAllColors(res, colourIds);
      setSaved(next);
      setForm(next);
      qc.setQueryData(queryKeys.builder, res);
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
      setResult({ warnings: res.warnings, at: Date.now() });
    } catch (e) {
      const a = asApiError(e);
      if (a?.code === 'VALIDATION_ERROR' && a.fields) {
        setServerErrors(Object.entries(a.fields).map(([path, message]) => ({ path, message })));
        document.getElementById('builder-problems')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else notify(e);
    }
  };

  /** One click, always available: only the mode changes, on top of what is SAVED (other unsaved edits stay in the form). */
  const switchTo2d = useMutation({
    mutationFn: () => unwrap(api.PUT('/api/v1/admin/builder', { body: toPutBody({ ...saved, mode: '2D', defaultView: '2D' }) })),
    onSuccess: (res) => {
      const next = withAllColors(res, colourIds);
      setSaved(next);
      setForm((f) => ({ ...f, mode: '2D', defaultView: '2D' }));
      qc.setQueryData(queryKeys.builder, res);
      toast.success('Switched to 2D only. It is live now.');
    },
    onError: (e) => notify(e),
  });

  const hoodieOptions = hoodies.map((h) => ({ value: String(h.id), label: h.active ? h.name : `${h.name} (Hidden)`, disabled: !h.active && h.id !== form.hoodieId }));
  const ready2d = readiness.colors2d.filter((c) => c.ready).length;
  const webBuilder = `${getEnv().siteUrl}/builder`;

  const previewBlock = (
    <section ref={previewRef} id="builder-preview" aria-labelledby="preview-heading" className="flex flex-col gap-3 rounded-lg border border-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="preview-heading" className="text-h5">Live preview</h3>
        <Pill tone="neutral" size="sm">Preview only</Pill>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <label htmlFor="throttle" className="mb-1 block text-body-sm font-medium">Simulate</label>
          <Select id="throttle" value={throttle} onChange={(e) => setThrottle(e.target.value)} options={THROTTLES.map((t) => ({ value: t.value, label: t.label }))} />
        </div>
      </div>
      <p className="text-body-sm text-fg-muted">Shows your unsaved changes. The 2D / 3D toggle appears when preview mode is Both. Select No WebGL to test the automatic 2D fallback. Not saved until you press Save.</p>
      <div className="builder-preview-frame mx-auto w-full max-w-xl overflow-x-hidden" data-testid="builder-preview">
        {previewOpen ? (
          <Suspense fallback={<div className="flex h-72 items-center justify-center"><Spinner /></div>}>
            <PreviewPanel data={previewData} throttle={THROTTLES.find((t) => t.value === throttle)?.sim ?? 'none'} handleRef={handle} debug={import.meta.env.VITE_BUILDER_DEBUG === '1'} />
          </Suspense>
        ) : (
          <p className="text-body-sm text-fg-muted">Preview hidden.</p>
        )}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Chip ok={savedEffective === saved.mode}>Live mode: {saved.mode === '2D' ? '2D only' : saved.mode === '3D' ? '3D only' : 'Both'}{savedEffective !== saved.mode ? ' (uses 2D until a model is configured in code)' : ''}</Chip>
        <Button variant="secondary" size="sm" href={webBuilder} target="_blank" rel="noreferrer" rightIcon={<ExternalLink size={16} aria-hidden="true" />}>Open /builder</Button>
        <Button variant="secondary" size="sm" loading={switchTo2d.isPending} disabled={saved.mode === '2D' || !online} onClick={() => switchTo2d.mutate()}>Switch to 2D only</Button>
        <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setPreviewOpen((o) => !o)} aria-expanded={previewOpen}>{previewOpen ? 'Collapse preview' : 'Show preview'}</Button>
        <span className="ml-auto" />
        <Button variant="primary" loading={save.isPending} disabled={busy || !online} onClick={() => void onSave()} className="hidden lg:inline-flex">Save Builder settings</Button>
      </div>

      <div id="builder-problems" aria-live="polite">
        {blocking.length || serverErrors.length ? (
          <Banner variant="error" title="Fix these before saving" role="alert">
            <ul className="list-disc pl-5">
              {blocking.map((b) => <li key={b}>{b}</li>)}
              {serverErrors.map((e) => <li key={e.path}><span className="font-mono">{e.path}</span>: {e.message}</li>)}
            </ul>
          </Banner>
        ) : null}
        {result ? (
          result.warnings.length ? (
            <Banner variant="warning" title="Saved, with warnings" data-testid="save-result">
              <ul className="list-disc pl-5">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="mt-2">Saved and live. The website picks it up within about 90 seconds (60-second page revalidation plus the API cache).</p>
            </Banner>
          ) : (
            <Banner variant="info" title="Saved" data-testid="save-result">Saved and live. The website picks it up within about 90 seconds (60-second page revalidation plus the API cache). The Builder has no draft or publish step.</Banner>
          )
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_28rem] xl:grid-cols-[minmax(0,1fr)_32rem]">
        <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
          <Disclosure title="Mode" defaultOpen summary={`Currently ${form.mode === '2D' ? '2D only' : form.mode === '3D' ? '3D only' : 'Both'}`}>
            <RadioGroup
              name="builder-mode"
              legend="Mode"
              variant="card"
              value={form.mode}
              onChange={(v) => patch({ mode: v as AdminBuilder['mode'] })}
              options={[
                { value: '2D', label: '2D only', description: `2D images: ${ready2d} of ${readiness.colors2d.length} colours ready` },
                { value: '3D', label: '3D only', description: `3D model: ${readiness.model3d ? 'ready' : 'missing'}` },
                { value: 'BOTH', label: 'Both', description: `3D model: ${readiness.model3d ? 'ready' : 'missing'}; 2D images: ${ready2d} of ${readiness.colors2d.length}` },
              ]}
            />
            <RadioGroup
              name="builder-default-view"
              legend="Default view (when Both)"
              value={form.defaultView}
              onChange={(v) => patch({ defaultView: v as AdminBuilder['defaultView'] })}
              options={[
                { value: '2D', label: '2D', disabled: form.mode !== 'BOTH' },
                { value: '3D', label: '3D', disabled: form.mode !== 'BOTH' },
              ]}
            />
            <div className="flex flex-wrap gap-2" data-testid="readiness-chips" aria-label="Asset readiness" role="group">
              <Chip ok={readiness.model3d}>3D model: {readiness.model3d ? 'ready' : 'missing'}</Chip>
              <Chip ok={ready2d === readiness.colors2d.length && ready2d > 0}>2D images: {ready2d} of {readiness.colors2d.length} colours ready</Chip>
              <Chip ok={readiness.overlays2d > 0}>2D shading overlays: {readiness.overlays2d}</Chip>
            </div>
            {notes.map((n) => (
              <p key={n} className="flex items-start gap-2 rounded-sm bg-butter px-3 py-2 text-body-sm font-medium text-ink" role="status" data-testid="mode-note">
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                {n}
              </p>
            ))}
            <div className="max-w-sm">
              <label htmlFor="hoodie-select" className="mb-1 block text-body font-medium">Hoodie sold in the Builder</label>
              <Select
                id="hoodie-select"
                value={form.hoodieId === null ? '' : String(form.hoodieId)}
                onChange={(e) => patch({ hoodieId: e.target.value === '' ? null : Number(e.target.value) })}
                options={[{ value: '', label: 'First active hoodie (default)' }, ...hoodieOptions]}
              />
              <p className="mt-1 text-body-sm text-fg-muted">The Builder sells this hoodie and offers its assigned colours and sizes. Defaults to the first active hoodie.</p>
              {optionScope.colors.length === 0 ? <p className="mt-2 text-body-sm text-fg-muted" role="status">This hoodie has no active colour and size combinations. Assign its options in Products before it can be sold in the Builder.</p> : null}
            </div>
          </Disclosure>

          <Disclosure title="Colours" defaultOpen summary={`${activeIds.length} ${activeIds.length === 1 ? 'colour' : 'colours'} assigned to this hoodie`}>
            <p className="text-body-sm text-fg-muted">The preview lets you switch among this hoodie&apos;s assigned colours for the 3D model. Model and Stimpie textures are managed in code. The controls below configure each colour&apos;s 2D images; tint and fabric texture are edited in Products &rarr; Options.</p>
            <ColourCards form={form} colours={colours} update={updateColour} copyAll={copyAll} samples={samples} errors={clientErrors} setBusy={setBusy} />
          </Disclosure>
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-4">{previewBlock}</div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-base bg-surface-base px-4 py-3 lg:hidden">
        <Button variant="secondary" iconOnly aria-label="Scroll to preview" onClick={() => { setPreviewOpen(true); previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Eye size={20} aria-hidden="true" /></Button>
        <Button variant="primary" fullWidth loading={save.isPending} disabled={busy || !online} onClick={() => void onSave()}>Save Builder settings</Button>
      </div>
      {dirty ? <p className="sr-only" role="status">You have unsaved changes.</p> : null}
      {guard.dialog}
    </div>
  );
}

/** Content -> Builder (dashboard-pages 13.5, builder.md 8). Lazy-loaded: Three.js is not in the dashboard's main bundle. */
export default function BuilderTab() {
  const q = useAdminBuilder();
  const colours = useColors();
  const hoodies = useHoodies();
  const sizes = useSizes();
  const stimpies = useAllStimpies();
  const sources = [q, colours, hoodies, sizes, stimpies];
  const pending = sources.some((x) => x.isPending);
  const failed = sources.find((x) => x.isError);
  return (
    <QueryBoundary query={(failed ?? (pending ? sources.find((x) => x.isPending) : q)) as typeof q} skeleton={<Skeleton variant="rect" className="h-[32rem]" />}>
      {() =>
        q.data && colours.data && hoodies.data && sizes.data && stimpies.data ? (
          <BuilderEditor server={q.data} colours={colours.data.items} stimpies={stimpies.data.items} hoodies={hoodies.data.items} sizes={sizes.data.items} />
        ) : null
      }
    </QueryBoundary>
  );
}
