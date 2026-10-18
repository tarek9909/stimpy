import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Banner, Button, Pill, TextLink } from '@stimpy/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { FileUpload } from '../../../components/FileUpload';
import type { AdminColor } from '../../products/api';
import { Disclosure } from '../shared';
import type { AdminBuilder, BuilderColorEntry, FormErrors } from '../builderForm';
import { PlacementEditor, type SampleStimpie } from './PlacementEditor';
import type { Placement } from '../placement';

/** Hoodie flat images are 4:5 (builder.md 7.3); a different shape is flagged, not blocked. */
export const HOODIE_IMAGE_RATIO = 4 / 5;
export function hoodieImageWarning(w: number | null | undefined, h: number | null | undefined): boolean {
  if (!w || !h) return false;
  return Math.abs(w / h - HOODIE_IMAGE_RATIO) / HOODIE_IMAGE_RATIO > 0.02;
}
function StatusChip({ ok, okText, missingText }: { ok: boolean; okText: string; missingText: string }) {
  return (
    <Pill tone={ok ? 'success' : 'cream'} size="sm" icon={ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}>
      {ok ? okText : missingText}
    </Pill>
  );
}

function ColourCard({
  colour,
  entry,
  update,
  samples,
  error,
  otherCount,
  onCopyAll,
  setBusy,
}: {
  colour: AdminColor;
  entry: BuilderColorEntry;
  update: (patch: Partial<BuilderColorEntry>) => void;
  samples: SampleStimpie[];
  error?: string;
  otherCount: number;
  onCopyAll: (p: Placement) => void;
  setBusy: (busy: boolean) => void;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ready2d = !!entry.hoodieImage2d && !!entry.placement2d;
  const missing = !entry.hoodieImage2d ? '2D image missing' : '2D placement missing';
  return (
    <Disclosure
      title={colour.name}
      defaultOpen={false}
      summary={
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border border-ink/30" style={{ backgroundColor: colour.hex }} />
          <StatusChip ok={ready2d} okText="2D ready" missingText={missing} />
          <span className="text-body-sm text-fg-muted">{colour.builderTint ? '3D uses tint' : '3D tint not set'}</span>
          {!colour.active ? <Pill tone="neutral" size="sm">Hidden</Pill> : null}
        </span>
      }
    >
      <div data-testid={`colour-card-${colour.id}`} className="flex flex-col gap-4">
        <FileUpload
          variant="image"
          label="Flat back-view image (2D)"
          value={entry.hoodieImage2d}
          hint="JPG, PNG, WebP or SVG. 4:5 portrait (for example 1000 x 1250), same framing for every colour."
          onBusyChange={setBusy}
          onChange={(r) => {
            setDims(r?.width && r.height ? { w: r.width, h: r.height } : null);
            update({ hoodieImage2d: r?.url ?? null });
          }}
        />
        {dims && hoodieImageWarning(dims.w, dims.h) ? (
          <Banner variant="warning" live title="This image is not 4:5">
            It is {dims.w} &times; {dims.h} ({(dims.w / dims.h).toFixed(2)}). The Builder stage is 4:5 (0.80), so the hoodie may look squashed or have empty bands.
          </Banner>
        ) : null}

        <div>
          <h4 className="mb-2 text-body font-medium">Placement</h4>
          <PlacementEditor imageUrl={entry.hoodieImage2d} placement={entry.placement2d} onChange={(p) => update({ placement2d: p })} samples={samples} error={error} />
          {entry.placement2d && otherCount > 0 ? (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>Copy placement to all colours</Button>
            </div>
          ) : null}
        </div>

        <FileUpload
          variant="image"
          label="2D shading overlay (optional)"
          value={entry.overlay2d}
          hint="A transparent PNG or WebP drawn over the Stimpie panel to fake fabric shading and seams."
          onBusyChange={setBusy}
          onChange={(r) => update({ overlay2d: r?.url ?? null })}
        />

        <dl className="grid grid-cols-1 gap-2 rounded-md bg-cream p-3 text-body-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">Tint (3D)</dt>
            <dd className="flex items-center gap-2">
              {colour.builderTint ? <><span aria-hidden="true" className="inline-block h-5 w-5 rounded-full border border-ink/30" style={{ backgroundColor: colour.builderTint }} /><span className="font-mono">{colour.builderTint}</span></> : 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Fabric texture (3D)</dt>
            <dd>{colour.builderTexture ? <img src={colour.builderTexture} alt="" className="h-10 w-10 rounded-sm border border-base object-cover" /> : 'Not set'}</dd>
          </div>
          <p className="sm:col-span-2 text-fg-muted">Read-only here. <TextLink href="/products?tab=options">Edit in Options</TextLink>.</p>
        </dl>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Copy this placement to all colours?"
        description={`Overwrite the placement of ${otherCount} other ${otherCount === 1 ? 'colour' : 'colours'}? They keep their own images.`}
        confirmLabel="Overwrite"
        onConfirm={() => { if (entry.placement2d) onCopyAll(entry.placement2d); }}
      />
    </Disclosure>
  );
}

/** One card per active colour; hidden colours are listed collapsed (dashboard-pages 13.5 section 3). */
export function ColourCards({
  form,
  colours,
  update,
  copyAll,
  samples,
  errors,
  setBusy,
}: {
  form: AdminBuilder;
  colours: AdminColor[];
  update: (colorId: number, patch: Partial<BuilderColorEntry>) => void;
  copyAll: (fromColorId: number, p: Placement) => void;
  samples: SampleStimpie[];
  errors: FormErrors;
  setBusy: (busy: boolean) => void;
}) {
  const active = colours.filter((c) => c.active);
  const hidden = colours.filter((c) => !c.active);
  const render = (c: AdminColor) => {
    const i = form.colors.findIndex((e) => e.colorId === c.id);
    const entry = form.colors[i];
    if (!entry) return null;
    return (
      <ColourCard
        key={c.id}
        colour={c}
        entry={entry}
        update={(patch) => update(c.id, patch)}
        samples={samples}
        error={errors[`colors.${i}.placement2d`]}
        otherCount={form.colors.filter((e) => e.colorId !== c.id).length}
        onCopyAll={(p) => copyAll(c.id, p)}
        setBusy={setBusy}
      />
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {active.length === 0 ? <p className="text-body-sm text-fg-muted">No active colours. Add colours in Products &rarr; Options.</p> : active.map(render)}
      {hidden.length > 0 ? (
        <details className="rounded-lg border border-dashed border-control">
          <summary className="min-h-12 cursor-pointer px-4 py-3 text-body font-medium">Hidden colours ({hidden.length})</summary>
          <div className="flex flex-col gap-3 p-3">{hidden.map(render)}</div>
        </details>
      ) : null}
    </div>
  );
}
