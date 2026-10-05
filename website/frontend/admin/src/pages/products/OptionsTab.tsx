import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useController, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { Banner, Button, EmptyState, Modal, Skeleton, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { ColorPicker } from '../../components/ColorPicker';
import { DataTable, type Column } from '../../components/DataTable';
import { FileUpload } from '../../components/FileUpload';
import { AdminForm } from '../../components/form/AdminForm';
import { SwitchField, TextField } from '../../components/form/Field';
import { ImageListField } from '../../components/form/ListFields';
import { QueryBoundary } from '../../components/QueryBoundary';
import { MAX_ORDERABLE_ITEMS, moveItem, moveToPosition } from '../../lib/reorder';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { ActiveCell, ActiveFilter, DeleteOrHide, matchesActive, type ActiveView } from './shared';
import { invalidateFor, useActiveToggle, useColors, useReorder, useSizes, type AdminColor, type AdminSize } from './api';

/* ------------------------------------------------------------------ recently added reminder */

interface Added {
  kind: 'color' | 'size';
  id: number;
  name: string;
}
const ADDED_KEY = 'stimpy.options.added';
function readAdded(): Added[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(ADDED_KEY) ?? '[]') as Added[];
  } catch {
    return [];
  }
}
function writeAdded(list: Added[]): void {
  try {
    window.sessionStorage.setItem(ADDED_KEY, JSON.stringify(list.slice(-10)));
  } catch {
    /* storage may be blocked */
  }
}

/** Persistent strip: "N variants have zero stock" for what was just added, until stock is entered. */
function ZeroStockStrip({ added, onDismiss }: { added: Added[]; onDismiss: () => void }) {
  const stock = useQuery({
    queryKey: queryKeys.stockHoodies,
    queryFn: () => unwrap(api.GET('/api/v1/admin/stock/hoodies')),
    enabled: added.length > 0,
    staleTime: 15_000,
  });
  const zero = useMemo(() => {
    if (!stock.data) return 0;
    const colorIds = new Set(added.filter((a) => a.kind === 'color').map((a) => a.id));
    const sizeIds = new Set(added.filter((a) => a.kind === 'size').map((a) => a.id));
    return stock.data.hoodies.flatMap((h) => h.cells).filter((c) => c.available === 0 && (colorIds.has(c.colorId) || sizeIds.has(c.sizeId))).length;
  }, [stock.data, added]);
  if (added.length === 0 || zero === 0) return null;
  return (
    <Banner variant="warning" live dismissible onDismiss={onDismiss} action={<Button href="/stock" variant="secondary" size="sm">Go to Stock</Button>}>
      {zero} {zero === 1 ? 'variant has' : 'variants have'} zero stock. {zero === 1 ? 'It shows' : 'They show'} as Sold out on the website until you add stock.
    </Banner>
  );
}

/* ------------------------------------------------------------------------------- forms */

const colorSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #FF7A59.'),
  images: z.array(z.string()),
  builderTint: z.string().refine((v) => v === '' || /^#[0-9A-Fa-f]{6}$/.test(v), 'Use a colour like #FF7A59, or leave it empty.'),
  builderTexture: z.string(),
  active: z.boolean(),
});
type ColorValues = z.infer<typeof colorSchema>;
const COLOR_NEW: ColorValues = { name: '', hex: '#111111', images: [], builderTint: '', builderTexture: '', active: true };
const colorValues = (c: AdminColor): ColorValues => ({ name: c.name, hex: c.hex.toUpperCase(), images: c.images, builderTint: c.builderTint?.toUpperCase() ?? '', builderTexture: c.builderTexture ?? '', active: c.active });

function ColorField({ name, label, optional, hint }: { name: string; label: string; optional?: boolean; hint?: string }) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  return <ColorPicker id={`field-${name}`} label={label} value={(field.value as string) ?? ''} onChange={field.onChange} error={fieldState.error?.message ?? null} optional={optional} hint={hint} />;
}

function ColorDialog({ color, onClose, onAdded }: { color: AdminColor | null; onClose: () => void; onAdded: (a: Added) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<ColorValues>({ resolver: zodResolver(colorSchema), defaultValues: color ? colorValues(color) : COLOR_NEW, reValidateMode: 'onChange' });
  const [uploading, setUploading] = useState(false);
  const guard = useUnsavedChangesGuard(false);
  const body = (v: ColorValues) => ({ name: v.name, hex: v.hex.toUpperCase(), images: v.images, builderTint: v.builderTint === '' ? null : v.builderTint.toUpperCase(), builderTexture: v.builderTexture === '' ? null : v.builderTexture, active: v.active });
  const save = useMutation({
    mutationFn: (v: ColorValues) => (color ? unwrap(api.PATCH('/api/v1/admin/colors/{id}', { params: { path: { id: color.id } }, body: body(v) })) : unwrap(api.POST('/api/v1/admin/colors', { body: body(v) }))),
  });
  const hide = useMutation({ mutationFn: () => unwrap(api.PATCH('/api/v1/admin/colors/{id}', { params: { path: { id: (color as AdminColor).id } }, body: { active: false } })) });
  const remove = useMutation({ mutationFn: () => api.DELETE('/api/v1/admin/colors/{id}', { params: { path: { id: (color as AdminColor).id } } }) });
  return (
    <Modal
      open
      onClose={onClose}
      title={color ? `Edit ${color.name}` : 'New colour'}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          {color ? (
            <DeleteOrHide
              noun="colour"
              onDelete={async () => {
                await remove.mutateAsync();
                invalidateFor(qc, 'colors');
                toast.success('Colour deleted.');
                onClose();
              }}
              onHide={async () => {
                await hide.mutateAsync();
                invalidateFor(qc, 'colors');
                toast.success('Colour hidden.');
                onClose();
              }}
            />
          ) : null}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="color-form" variant="primary" loading={form.formState.isSubmitting || save.isPending} disabled={uploading}>
            {color ? 'Save colour' : 'Add colour'}
          </Button>
        </>
      }
    >
      <AdminForm
        id="color-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const saved = await save.mutateAsync(v);
          invalidateFor(qc, 'colors');
          if (!color) onAdded({ kind: 'color', id: saved.id, name: saved.name });
          else toast.success('Colour saved.');
          onClose();
        }}
      >
        <TextField name="name" label="Name" required maxLength={120} autoComplete="off" />
        <ColorField name="hex" label="Colour" hint="The colour of the hoodie as shown on the website." />
        <ImageListField name="images" label="Hoodie photos" onBusyChange={setUploading} />
        <ColorField name="builderTint" label="Builder tint" optional hint="Used for the 3D hoodie. This is the only place it is edited." />
        <BuilderTexture onBusyChange={setUploading} />
        <SwitchField name="active" label="Show on the website" description="Hiding keeps its variants and order history." />
      </AdminForm>
      {guard.dialog}
    </Modal>
  );
}

function BuilderTexture({ onBusyChange }: { onBusyChange: (b: boolean) => void }) {
  const { control } = useFormContext();
  const { field } = useController({ name: 'builderTexture', control });
  return (
    <FileUpload
      variant="image"
      label="Builder fabric texture (optional)"
      value={(field.value as string) || null}
      onChange={(r) => field.onChange(r?.url ?? '')}
      onBusyChange={onBusyChange}
      hint="A tileable fabric image for the 3D hoodie. Edited only here."
    />
  );
}

const sizeSchema = z.object({
  label: z.string().trim().min(1, 'Enter a size label.').max(10, 'Use at most 10 characters.'),
  active: z.boolean(),
});
type SizeValues = z.infer<typeof sizeSchema>;

function SizeDialog({ size, onClose, onAdded }: { size: AdminSize | null; onClose: () => void; onAdded: (a: Added) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<SizeValues>({ resolver: zodResolver(sizeSchema), defaultValues: size ? { label: size.label, active: size.active } : { label: '', active: true }, reValidateMode: 'onChange' });
  const save = useMutation({
    mutationFn: (v: SizeValues) => (size ? unwrap(api.PATCH('/api/v1/admin/sizes/{id}', { params: { path: { id: size.id } }, body: v })) : unwrap(api.POST('/api/v1/admin/sizes', { body: v }))),
  });
  const hide = useMutation({ mutationFn: () => unwrap(api.PATCH('/api/v1/admin/sizes/{id}', { params: { path: { id: (size as AdminSize).id } }, body: { active: false } })) });
  const remove = useMutation({ mutationFn: () => api.DELETE('/api/v1/admin/sizes/{id}', { params: { path: { id: (size as AdminSize).id } } }) });
  return (
    <Modal
      open
      onClose={onClose}
      title={size ? `Edit size ${size.label}` : 'New size'}
      size="sm"
      footer={
        <>
          {size ? (
            <DeleteOrHide
              noun="size"
              onDelete={async () => {
                await remove.mutateAsync();
                invalidateFor(qc, 'sizes');
                toast.success('Size deleted.');
                onClose();
              }}
              onHide={async () => {
                await hide.mutateAsync();
                invalidateFor(qc, 'sizes');
                toast.success('Size hidden.');
                onClose();
              }}
            />
          ) : null}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="size-form" variant="primary" loading={form.formState.isSubmitting || save.isPending}>{size ? 'Save size' : 'Add size'}</Button>
        </>
      }
    >
      <AdminForm
        id="size-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const saved = await save.mutateAsync(v);
          invalidateFor(qc, 'sizes');
          if (!size) onAdded({ kind: 'size', id: saved.id, name: saved.label });
          else toast.success('Size saved.');
          onClose();
        }}
      >
        <TextField name="label" label="Label" required maxLength={10} autoComplete="off" hint="For example S, M, L or XL." />
        <SwitchField name="active" label="Show on the website" />
      </AdminForm>
    </Modal>
  );
}

/* ------------------------------------------------------------------------------ the tab */

function lookStatus(c: AdminColor): string {
  const parts = [c.builderTint ? 'Tint set' : null, c.builderTexture ? 'Texture set' : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Not set';
}

/** Products -> Options: colours and sizes (dashboard-pages 7.4). Creating either auto-creates zero-stock variants and says so. */
export function OptionsTab({ view, onViewChange }: { view: ActiveView; onViewChange: (v: ActiveView) => void }) {
  const colors = useColors();
  const sizes = useSizes();
  const toggleColor = useActiveToggle('colors');
  const toggleSize = useActiveToggle('sizes');
  const reorderColors = useReorder('colors');
  const reorderSizes = useReorder('sizes');
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<{ kind: 'color'; item: AdminColor | null } | { kind: 'size'; item: AdminSize | null } | null>(null);
  const [notice, setNotice] = useState<Added | null>(null);
  const [added, setAdded] = useState<Added[]>(() => readAdded());
  useEffect(() => writeAdded(added), [added]);

  const colorRows = useMemo(() => colors.data?.items.filter((c) => matchesActive(c.active, view)), [colors.data, view]);
  const sizeRows = useMemo(() => sizes.data?.items.filter((s) => matchesActive(s.active, view)), [sizes.data, view]);
  const colorIds = useMemo(() => (colors.data?.items ?? []).map((c) => c.id), [colors.data]);
  const sizeIds = useMemo(() => (sizes.data?.items ?? []).map((s) => s.id), [sizes.data]);

  const colorCols: Column<AdminColor>[] = [
    {
      id: 'swatch',
      header: 'Colour',
      priority: 'primary',
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-6 w-6 shrink-0 rounded-full border border-control" style={{ backgroundColor: c.hex }} aria-hidden="true" />
          <span className="font-medium">{c.name}</span>
          <span className="text-caption tabular-nums text-fg-muted">{c.hex.toUpperCase()}</span>
          {c.active ? null : <span className="text-caption text-fg-muted">Hidden</span>}
        </span>
      ),
    },
    { id: 'photos', header: 'Photos', numeric: true, cell: (c) => c.images.length },
    { id: 'look', header: 'Builder look', cell: lookStatus },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (c) => <ActiveCell active={c.active} name={c.name} onChange={(active) => toggleColor.mutate({ id: c.id, active })} /> },
    { id: 'edit', header: 'Edit', mobileLabel: '', cell: (c) => <Button variant="secondary" size="sm" aria-label={`Edit ${c.name}`} onClick={() => setDialog({ kind: 'color', item: c })}>Edit</Button> },
  ];
  const sizeCols: Column<AdminSize>[] = [
    { id: 'label', header: 'Size', priority: 'primary', cell: (s) => <span className="font-medium">{s.label}{s.active ? null : <span className="ml-2 text-caption text-fg-muted">Hidden</span>}</span> },
    { id: 'active', header: 'On website', mobileLabel: '', cell: (s) => <ActiveCell active={s.active} name={s.label} onChange={(active) => toggleSize.mutate({ id: s.id, active })} /> },
    { id: 'edit', header: 'Edit', mobileLabel: '', cell: (s) => <Button variant="secondary" size="sm" aria-label={`Edit size ${s.label}`} onClick={() => setDialog({ kind: 'size', item: s })}>Edit</Button> },
  ];

  const onAdded = (a: Added) => {
    setAdded((list) => [...list, a]);
    setNotice(a);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilter value={view} onChange={onViewChange} />
      </div>
      <ZeroStockStrip added={added} onDismiss={() => setAdded([])} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <section aria-labelledby="colors-h" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="colors-h" className="text-h3">Colours</h2>
            <Button variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />} onClick={() => setDialog({ kind: 'color', item: null })}>New colour</Button>
          </div>
          <QueryBoundary query={colors} skeleton={<Skeleton variant="rect" className="h-48" />}>
            {() => (
              <DataTable
                caption="Colours"
                columns={colorCols}
                rows={colorRows}
                getRowId={(c) => c.id}
                rowLabel={(c) => c.name}
                refreshing={colors.isFetching && !colors.isPending}
                reorder={{
                  disabled: view !== 'all' || reorderColors.isPending || colorIds.length > MAX_ORDERABLE_ITEMS,
                  onMove: (id, d) => reorderColors.mutate(moveItem(colorIds, Number(id), d)),
                  onDragMove: (a, b) => reorderColors.mutate(moveToPosition(colorIds, Number(a), Number(b))),
                }}
                empty={<EmptyState title="No colors yet" text="Add your first color so hoodies can be sold." action={<Button variant="primary" onClick={() => setDialog({ kind: 'color', item: null })}>New colour</Button>} />}
              />
            )}
          </QueryBoundary>
        </section>
        <section aria-labelledby="sizes-h" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sizes-h" className="text-h3">Sizes</h2>
            <Button variant="primary" leftIcon={<Plus size={20} aria-hidden="true" />} onClick={() => setDialog({ kind: 'size', item: null })}>New size</Button>
          </div>
          <QueryBoundary query={sizes} skeleton={<Skeleton variant="rect" className="h-48" />}>
            {() => (
              <DataTable
                caption="Sizes"
                columns={sizeCols}
                rows={sizeRows}
                getRowId={(s) => s.id}
                rowLabel={(s) => s.label}
                refreshing={sizes.isFetching && !sizes.isPending}
                reorder={{
                  disabled: view !== 'all' || reorderSizes.isPending || sizeIds.length > MAX_ORDERABLE_ITEMS,
                  onMove: (id, d) => reorderSizes.mutate(moveItem(sizeIds, Number(id), d)),
                  onDragMove: (a, b) => reorderSizes.mutate(moveToPosition(sizeIds, Number(a), Number(b))),
                }}
                empty={<EmptyState title="No sizes yet" text="Add your first size so hoodies can be sold." action={<Button variant="primary" onClick={() => setDialog({ kind: 'size', item: null })}>New size</Button>} />}
              />
            )}
          </QueryBoundary>
        </section>
      </div>
      {view !== 'all' ? <p className="text-body-sm text-fg-muted">Reordering is available when the filter is set to All.</p> : null}
      {view === 'all' && (colorIds.length > MAX_ORDERABLE_ITEMS || sizeIds.length > MAX_ORDERABLE_ITEMS) ? <p className="text-body-sm text-fg-muted">Reordering is unavailable for a list that exceeds the 5,000-item API limit.</p> : null}

      {dialog?.kind === 'color' ? <ColorDialog color={dialog.item} onClose={() => setDialog(null)} onAdded={onAdded} /> : null}
      {dialog?.kind === 'size' ? <SizeDialog size={dialog.item} onClose={() => setDialog(null)} onAdded={onAdded} /> : null}

      <Modal
        open={notice !== null}
        onClose={() => setNotice(null)}
        title={notice?.kind === 'color' ? `Colour '${notice.name}' added` : `Size '${notice?.name ?? ''}' added`}
        closeOnBackdrop={false}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNotice(null)}>Later</Button>
            <Button variant="primary" onClick={() => { setNotice(null); navigate('/stock'); }}>Go to Stock</Button>
          </>
        }
      >
        <p>
          Zero-stock variants were created for every hoodie in every active {notice?.kind === 'color' ? 'size' : 'colour'}. They show as Sold out on the website until you add stock.
        </p>
      </Modal>
    </div>
  );
}
