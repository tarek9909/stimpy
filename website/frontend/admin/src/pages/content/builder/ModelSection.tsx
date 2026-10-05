import { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Banner, Button, FormField, Input, RadioGroup, Select, Spinner } from '@stimpy/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { FileUpload } from '../../../components/FileUpload';
import { formatBytes } from '../../../lib/upload';
import { GLB_LIMITS, gradeBudget } from '../../../lib/glbValidator';
import { DEFAULT_CAMERA, meshProblem, type AdminBuilder, type BuilderModel, type FormErrors, type Lighting } from '../builderForm';
import type { GlbState } from './useGlb';

const NUM_RE = /^-?\d*\.?\d+$/;

/** Camera number: keeps what is typed, commits when it is a finite number. */
function NumInput({ label, value, onCommit, id }: { label: string; value: number; onCommit: (n: number) => void; id: string }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : String(value);
  return (
    <FormField label={label} name={id}>
      <Input
        inputMode="decimal"
        value={shown}
        autoComplete="off"
        onFocus={() => { setText(String(value)); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          if (NUM_RE.test(e.target.value.trim())) onCommit(Number(e.target.value));
        }}
      />
    </FormField>
  );
}

function Grade({ level }: { level: 'ok' | 'warn' | 'bad' }) {
  if (level === 'ok') return <span className="inline-flex items-center gap-1 font-medium"><CheckCircle2 size={16} aria-hidden="true" className="text-success" /> OK</span>;
  if (level === 'warn') return <span className="inline-flex items-center gap-1 font-medium"><AlertTriangle size={16} aria-hidden="true" /> Over target</span>;
  return <span className="inline-flex items-center gap-1 font-medium text-fg-danger"><XCircle size={16} aria-hidden="true" /> Over the limit</span>;
}

/** Report of the in-browser check against builder.md 7.1 (size, triangles, names, materials, skins, animations). */
export function GlbReportCard({ glb, panelMesh }: { glb: GlbState; panelMesh: string }) {
  if (glb.loading) return <p className="flex items-center gap-2 text-body-sm text-fg-muted"><Spinner size="sm" /> Checking the model...</p>;
  if (glb.failed) return <Banner variant="warning">{glb.failed}</Banner>;
  const r = glb.report;
  if (!r) return null;
  const s = r.stats;
  return (
    <section aria-labelledby="glb-report" className="flex flex-col gap-3 rounded-lg border border-base p-3" data-testid="glb-report">
      <h4 id="glb-report" className="text-h6 font-bold">Model check</h4>
      <p className="flex items-center gap-2 font-medium" data-testid="glb-verdict">
        {r.ok ? <CheckCircle2 size={18} aria-hidden="true" className="text-success" /> : <XCircle size={18} aria-hidden="true" className="text-fg-danger" />}
        {r.ok ? (r.warnings.length ? 'Usable, with warnings' : 'Passes every check') : 'Needs fixing before it can be used'}
      </p>
      <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1 text-body-sm tabular-nums">
        <dt className="text-fg-muted">File size</dt>
        <dd>{formatBytes(s.sizeBytes)} <span className="text-fg-muted">(target 2.5 MB, limit 5 MB)</span> <Grade level={gradeBudget(s.sizeBytes, GLB_LIMITS.bytesTarget, GLB_LIMITS.bytesHard)} /></dd>
        <dt className="text-fg-muted">Triangles</dt>
        <dd>{s.totalTriangles?.toLocaleString('en-US') ?? 'unknown'} <span className="text-fg-muted">(target 40,000, limit 80,000)</span> {s.totalTriangles !== undefined ? <Grade level={gradeBudget(s.totalTriangles, GLB_LIMITS.trisTarget, GLB_LIMITS.trisHard)} /> : null}</dd>
        <dt className="text-fg-muted">Materials</dt>
        <dd>{s.materials?.length ?? 0} {s.materials?.length ? `(${s.materials.join(', ')})` : ''} <span className="text-fg-muted">(exactly 2: fabric, panel)</span> <Grade level={s.materials?.length === 2 ? 'ok' : 'bad'} /></dd>
        <dt className="text-fg-muted">Skins</dt>
        <dd>{s.skins ?? 0} <Grade level={(s.skins ?? 0) === 0 ? 'ok' : 'bad'} /></dd>
        <dt className="text-fg-muted">Animations</dt>
        <dd>{s.animations ?? 0} <Grade level={(s.animations ?? 0) === 0 ? 'ok' : 'bad'} /></dd>
        <dt className="text-fg-muted">Nodes</dt>
        <dd className="break-words font-mono">{s.nodeNames?.join(', ') || 'none'}</dd>
        {s.panel ? (
          <>
            <dt className="text-fg-muted">Back panel</dt>
            <dd>{s.panel.triangles} triangles, aspect {s.panel.aspect.toFixed(3)} (needs 0.64) <Grade level={Math.abs(s.panel.aspect - 0.64) / 0.64 <= GLB_LIMITS.panelAspectTol ? 'ok' : 'bad'} /></dd>
          </>
        ) : null}
      </dl>
      {r.errors.length ? (
        <div role="alert">
          <p className="mb-1 flex items-center gap-1 text-body-sm font-bold text-fg-danger"><XCircle size={16} aria-hidden="true" /> Errors</p>
          <ul className="list-disc pl-5 text-body-sm" data-testid="glb-errors">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
      {r.warnings.length ? (
        <div>
          <p className="mb-1 flex items-center gap-1 text-body-sm font-bold"><AlertTriangle size={16} aria-hidden="true" /> Warnings</p>
          <ul className="list-disc pl-5 text-body-sm" data-testid="glb-warnings">{r.warnings.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
      <p className="text-body-sm text-fg-muted">Checked for back panel mesh &lsquo;{panelMesh}&rsquo;.</p>
    </section>
  );
}

/** 3D model, camera and lighting (builder.md 8). */
export function ModelSection({
  form,
  setModel,
  errors,
  glb,
  getCameraView,
  onUploaded,
  onRemoved,
}: {
  form: AdminBuilder;
  setModel: (m: BuilderModel | null) => void;
  errors: FormErrors;
  glb: GlbState;
  getCameraView: () => { position: readonly number[]; target: readonly number[]; fov: number } | null;
  onUploaded: (url: string, sizeBytes: number) => void;
  onRemoved: () => void;
}) {
  const m = form.model3d;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const names = glb.report?.stats.meshNodeNames ?? null;
  const meshOptions = (() => {
    const list = names ?? [];
    const withCurrent = m && m.backPanelMesh && !list.includes(m.backPanelMesh) ? [...list, m.backPanelMesh] : list;
    return withCurrent.map((n) => ({ value: n, label: n }));
  })();
  const mesh = m ? meshProblem(m.backPanelMesh, names) : null;
  const patch = (p: Partial<BuilderModel>) => m && setModel({ ...m, ...p });
  const cam = m?.camera;
  return (
    <div className="flex flex-col gap-4">
      <FileUpload
        variant="model"
        label="3D model (.glb)"
        purpose="builder-model"
        value={m?.url ?? null}
        hideRemove
        hint="Binary glTF (.glb) up to 50 MB. The Builder's own budget is far lower (2.5 MB target, 5 MB limit): the check below tells you how it measures up."
        onFilePicked={glb.pick}
        onChange={(r) => {
          if (r) {
            glb.attach(r.url);
            onUploaded(r.url, r.sizeBytes);
          }
        }}
      />
      {m ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-fg-muted tabular-nums">Saved size {formatBytes(m.sizeBytes)}. The server records the size from the upload.</p>
          <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>Remove model</Button>
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">No 3D model. The website uses the 2D view.</p>
      )}
      {m ? <GlbReportCard glb={glb} panelMesh={m.backPanelMesh} /> : null}

      {m ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Back panel mesh" name="back-panel-mesh" required error={errors['model3d.backPanelMesh'] ?? mesh} hint="The exact name of the mesh that receives the Stimpie artwork.">
              {meshOptions.length > 0 ? (
                <Select value={m.backPanelMesh} onChange={(e) => patch({ backPanelMesh: e.target.value })} options={meshOptions} placeholder="Choose the mesh" />
              ) : (
                <Input value={m.backPanelMesh} onChange={(e) => patch({ backPanelMesh: e.target.value })} autoComplete="off" />
              )}
            </FormField>
            <NumField2 label="Panel aspect" value={m.panelAspect} error={errors['model3d.panelAspect']} hint="Leave at 0.64 unless the model's back panel has a different shape." onCommit={(n) => patch({ panelAspect: n })} />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-body font-medium">Camera</legend>
            <div className="grid grid-cols-3 gap-3">
              {(['x', 'y', 'z'] as const).map((axis, i) => (
                <NumInput key={`p${axis}`} id={`cam-pos-${axis}`} label={`Position ${axis.toUpperCase()}`} value={cam?.position[i] ?? 0} onCommit={(n) => patch({ camera: { ...(cam as BuilderModel['camera']), position: (cam as BuilderModel['camera']).position.map((v, j) => (j === i ? n : v)) } })} />
              ))}
              {(['x', 'y', 'z'] as const).map((axis, i) => (
                <NumInput key={`t${axis}`} id={`cam-target-${axis}`} label={`Target ${axis.toUpperCase()}`} value={cam?.target[i] ?? 0} onCommit={(n) => patch({ camera: { ...(cam as BuilderModel['camera']), target: (cam as BuilderModel['camera']).target.map((v, j) => (j === i ? n : v)) } })} />
              ))}
            </div>
            <div className="max-w-[12rem]">
              <NumInput id="cam-fov" label="Field of view (10 to 100)" value={cam?.fov ?? 32} onCommit={(n) => patch({ camera: { ...(cam as BuilderModel['camera']), fov: n } })} />
            </div>
            {errors['model3d.camera.position'] || errors['model3d.camera.target'] || errors['model3d.camera.fov'] ? (
              <p role="alert" className="text-body-sm font-medium text-fg-danger">{errors['model3d.camera.position'] ?? errors['model3d.camera.target'] ?? errors['model3d.camera.fov']}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const v = getCameraView();
                  if (!v) {
                    setCameraNote('The preview is not showing the 3D view. Switch the preview to 3D, move the camera, then try again.');
                    return;
                  }
                  setCameraNote('Camera copied from the preview.');
                  const r = (n: number) => Math.round(n * 1000) / 1000;
                  patch({ camera: { position: v.position.map(r), target: v.target.map(r), fov: r(v.fov) } });
                }}
              >
                Use current preview view
              </Button>
              <Button variant="ghost" onClick={() => { setCameraNote(null); patch({ camera: { position: [...DEFAULT_CAMERA.position], target: [...DEFAULT_CAMERA.target], fov: DEFAULT_CAMERA.fov } }); }}>Reset</Button>
            </div>
            {cameraNote ? <p className="text-body-sm text-fg-muted" role="status" data-testid="camera-note">{cameraNote}</p> : null}
          </fieldset>

          <RadioGroup
            name="lighting"
            legend="Lighting"
            variant="card"
            value={m.lighting}
            onChange={(v) => patch({ lighting: v as Lighting })}
            options={[
              { value: 'STUDIO', label: 'Studio', description: 'Neutral, even light.' },
              { value: 'SOFT', label: 'Soft', description: 'Gentle, low contrast.' },
              { value: 'NIGHT', label: 'Night', description: 'Cool light with a coral rim.' },
            ]}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        tone="destructive"
        title="Remove the 3D model?"
        description="The website will use the 2D view until you upload another model. Nothing changes until you press Save Builder settings."
        confirmLabel="Remove model"
        onConfirm={() => onRemoved()}
      />
    </div>
  );
}

/** Decimal field for panel aspect. */
function NumField2({ label, value, onCommit, error, hint }: { label: string; value: number; onCommit: (n: number) => void; error?: string; hint?: string }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <FormField label={label} name="panel-aspect" error={error} hint={hint}>
      <Input
        inputMode="decimal"
        value={focused ? text : String(value)}
        autoComplete="off"
        onFocus={() => { setText(String(value)); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          if (NUM_RE.test(e.target.value.trim())) onCommit(Number(e.target.value));
        }}
      />
    </FormField>
  );
}
