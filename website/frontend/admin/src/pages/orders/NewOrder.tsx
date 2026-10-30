import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, UserSearch } from 'lucide-react';
import { z } from 'zod';
import { Button, Checkbox, FormField, Input, Modal, QuantityStepper, RadioGroup, SegmentedControl, Select, useToast } from '@stimpy/ui';
import { asApiError } from '../../api/errors';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { AdminForm } from '../../components/form/AdminForm';
import { SelectField, TextAreaField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { PageHeader } from '../../components/PageHeader';
import { useNotifications } from '../../layout/notifications';
import { useFormatters } from '../../lib/format';
import { useDebouncedValue } from '../../lib/hooks';
import { useAreas } from '../../lib/refdata';
import { optionalEmailSchema } from '../../lib/schemas';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { invalidateOrderCaches } from './api';
import { useCatalogHoodie, useCatalogHoodies, useCatalogPacks, useCatalogStimpies, useDeliveryFees } from './catalog';
import { SOURCES, SOURCE_LABEL } from './status';
import type { Pack, Stimpie } from '@stimpy/api-client';

type Kind = 'hoodie_set' | 'hoodie' | 'stimpie_pack' | 'stimpie';

interface DesignQuantity {
  stimpieId: string;
  qty: number;
}

interface Line {
  kind: Kind;
  packId: string;
  stimpiePackId: string;
  hoodieId: string;
  colorId: string;
  sizeId: string;
  stimpieIds: string[];
  stimpies: DesignQuantity[];
  stimpieId: string;
  qty: number;
}

interface Values {
  source: 'INSTAGRAM' | 'WHATSAPP' | 'MANUAL';
  customer: { name: string; email: string; phone: string; whatsappSameAsPhone: boolean; whatsapp: string };
  delivery: { areaId: string; areaName: string; address: string; notes: string };
  items: Line[];
  initialStatus: 'CONFIRMED' | 'NEW';
  sendEmail: boolean;
}

const blankLine = (): Line => ({ kind: 'hoodie', packId: '', stimpiePackId: '', hoodieId: '', colorId: '', sizeId: '', stimpieIds: [], stimpies: [], stimpieId: '', qty: 1 });

function makeSchema(packs: Pack[]) {
  return z
    .object({
      source: z.enum(['INSTAGRAM', 'WHATSAPP', 'MANUAL']),
      customer: z.object({
        name: z.string().trim().min(2, "Enter the customer's name (at least 2 characters).").max(80, 'Use at most 80 characters.'),
        email: optionalEmailSchema(),
        phone: z.string().trim().min(1, 'Enter a phone number.').max(40, 'That number is too long.'),
        whatsappSameAsPhone: z.boolean(),
        whatsapp: z.string().trim().max(40, 'That number is too long.'),
      }),
      delivery: z.object({
        areaId: z.string(),
        areaName: z.string().trim().min(1, 'Enter the area.').max(120, 'Use at most 120 characters.'),
        address: z.string().trim().min(5, 'Enter the full address (at least 5 characters).').max(300, 'Use at most 300 characters.'),
        notes: z.string().trim().max(300, 'Use at most 300 characters.'),
      }),
      items: z
        .array(
          z.object({
            kind: z.enum(['hoodie_set', 'hoodie', 'stimpie_pack', 'stimpie']),
            packId: z.string(),
            stimpiePackId: z.string(),
            hoodieId: z.string(),
            colorId: z.string(),
            sizeId: z.string(),
            stimpieIds: z.array(z.string()),
            stimpies: z.array(z.object({ stimpieId: z.string(), qty: z.number().int().min(1).max(1_000_000) })),
            stimpieId: z.string(),
            qty: z.number().int().min(1).max(10),
          }),
        )
        .min(1, 'Add at least one item.')
        .max(20, 'An order can have at most 20 items.'),
      initialStatus: z.enum(['CONFIRMED', 'NEW']),
      sendEmail: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (!v.customer.whatsappSameAsPhone && v.customer.whatsapp.trim() === '') {
        ctx.addIssue({ code: 'custom', path: ['customer', 'whatsapp'], message: 'Enter a WhatsApp number or tick "Same as phone".' });
      }
      v.items.forEach((line, i) => {
        const need = (field: 'packId' | 'stimpiePackId' | 'hoodieId' | 'colorId' | 'sizeId' | 'stimpieId', msg: string) => {
          if (line[field] === '') ctx.addIssue({ code: 'custom', path: ['items', i, field], message: msg });
        };
        if (line.kind === 'stimpie') {
          need('stimpieId', 'Choose a Stimpie.');
          return;
        }
        if (line.kind === 'stimpie_pack') {
          need('stimpiePackId', 'Choose a Stimpie-only offer.');
          const offer = packs.find((p) => String(p.id) === line.stimpiePackId && p.type === 'STIMPIE_ONLY');
          if (!offer) return;
          const selectedIds = line.stimpies.map((item) => item.stimpieId);
          const selectedCount = line.stimpies.reduce((sum, item) => sum + item.qty, 0);
          if (selectedIds.length === 0) ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpies'], message: 'Choose at least one Stimpie design.' });
          if (new Set(selectedIds).size !== selectedIds.length) ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpies'], message: 'Choose each design once and set its quantity.' });
          if (selectedCount !== offer.stimpieCount) ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpies'], message: `Choose exactly ${offer.stimpieCount} Stimpies across the selected designs.` });
          if (offer.eligibleStimpieIds !== null && line.stimpies.some((item) => !offer.eligibleStimpieIds!.includes(Number(item.stimpieId)))) {
            ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpies'], message: 'Choose designs allowed by this offer.' });
          }
          return;
        }
        if (line.kind === 'hoodie_set') need('packId', 'Choose a hoodie set.');
        need('hoodieId', 'Choose a hoodie.');
        need('colorId', 'Choose a colour.');
        need('sizeId', 'Choose a size.');
        if (line.kind === 'hoodie_set') {
          const pack = packs.find((p) => String(p.id) === line.packId && p.type === 'HOODIE_SET');
          if (pack) {
            const chosen = line.stimpieIds.filter(Boolean);
            if (chosen.length !== pack.stimpieCount) ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpieIds'], message: `Choose exactly ${pack.stimpieCount} different Stimpies.` });
            if (new Set(chosen).size !== chosen.length) {
              chosen.forEach((id, j) => {
                if (chosen.indexOf(id) !== j) ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpieIds', j], message: 'Pick different Stimpies: a pack has no repeats.' });
              });
            }
            if (pack.eligibleStimpieIds !== null && chosen.some((id) => !pack.eligibleStimpieIds!.includes(Number(id)))) {
              ctx.addIssue({ code: 'custom', path: ['items', i, 'stimpieIds'], message: 'Choose designs allowed by this pack.' });
            }
          }
        }
      });
    });
}

interface Problem {
  itemIndex: number;
  name: string;
  text: string;
}

const REASON_TEXT: Record<string, string> = { INACTIVE: 'Hidden', DROP_NOT_STARTED: "Drop hasn't started", DROP_ENDED: 'Drop has ended' };

type CustomerHit = { id: number; name: string; email: string | null; phone: string; whatsapp: string };

/** Manual order (dashboard-pages 5.6): `POST /admin/orders`. The same availability rules as customers apply. */
export function NewOrder() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const f = useFormatters();
  const notifications = useNotifications();
  const packsQ = useCatalogPacks();
  const hoodiesQ = useCatalogHoodies();
  const stimpiesQ = useCatalogStimpies();
  const feesQ = useDeliveryFees();
  const areasQ = useAreas();
  const packs = useMemo(() => packsQ.data ?? [], [packsQ.data]);
  const schema = useMemo(() => makeSchema(packs), [packs]);

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      source: 'WHATSAPP',
      customer: { name: '', email: '', phone: '', whatsappSameAsPhone: true, whatsapp: '' },
      delivery: { areaId: '', areaName: '', address: '', notes: '' },
      items: [blankLine()],
      initialStatus: 'CONFIRMED',
      sendEmail: true,
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const draft = useFormDraft(form);
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [dialog, setDialog] = useState<{ kind: 'SOLD_OUT' | 'NOT_PURCHASABLE'; problems: Problem[] } | null>(null);

  // `?customerId=` pre-fills from a customer (also used by "New order for this customer").
  const customerId = Number(search.get('customerId'));
  const prefilled = useRef(false);
  const customerQ = useQuery({
    queryKey: queryKeys.customerDetail(customerId),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers/{id}', { params: { path: { id: customerId } } })),
    enabled: Number.isInteger(customerId) && customerId > 0,
  });
  useEffect(() => {
    if (customerQ.data && !prefilled.current) {
      prefilled.current = true;
      applyCustomer(customerQ.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerQ.data]);

  function applyCustomer(c: CustomerHit) {
    const opts = { shouldDirty: true } as const;
    form.setValue('customer.name', c.name, opts);
    form.setValue('customer.email', c.email ?? '', opts);
    form.setValue('customer.phone', c.phone, opts);
    const same = !c.whatsapp || c.whatsapp === c.phone;
    form.setValue('customer.whatsappSameAsPhone', same, opts);
    form.setValue('customer.whatsapp', same ? '' : c.whatsapp, opts);
  }

  const areaOptions = [{ value: '', label: 'Choose an area (optional)' }, ...(areasQ.data?.items ?? []).filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name }))];
  const areaId = form.watch('delivery.areaId');
  useEffect(() => {
    const area = areasQ.data?.items.find((a) => String(a.id) === areaId);
    if (area) form.setValue('delivery.areaName', area.name, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const email = form.watch('customer.email');
  const same = form.watch('customer.whatsappSameAsPhone');
  const hasEmail = email.trim() !== '';

  // Live estimate (the server sets the final prices).
  const items = useWatch({ control: form.control, name: 'items' });
  const estimate = useMemo(() => {
    const hoodies = hoodiesQ.data ?? [];
    let subtotal = 0;
    items.forEach((l) => {
      let unit = 0;
      if (l.kind === 'hoodie_set') unit = packs.find((p) => String(p.id) === l.packId)?.priceCents ?? 0;
      else if (l.kind === 'stimpie_pack') unit = packs.find((p) => String(p.id) === l.stimpiePackId)?.priceCents ?? 0;
      else if (l.kind === 'hoodie') unit = hoodies.find((h) => String(h.id) === l.hoodieId)?.priceCents ?? 0;
      else unit = stimpiesQ.data?.find((s) => String(s.id) === l.stimpieId)?.priceCents ?? 0;
      subtotal += unit * (l.qty || 1);
    });
    const fees = feesQ.data;
    const area = fees?.areas.find((a) => String(a.id) === areaId);
    const delivery = fees ? (area?.feeCents ?? fees.defaultFeeCents) : 0;
    return { subtotal, delivery, total: subtotal + delivery };
  }, [items, packs, hoodiesQ.data, stimpiesQ.data, feesQ.data, areaId]);

  const submit = async (v: Values) => {
    setProblems([]);
    const body = {
      source: v.source,
      initialStatus: v.initialStatus,
      sendEmail: hasEmail && v.sendEmail,
      customer: {
        name: v.customer.name,
        phone: v.customer.phone,
        whatsappSameAsPhone: v.customer.whatsappSameAsPhone,
        ...(v.customer.whatsappSameAsPhone ? {} : { whatsapp: v.customer.whatsapp }),
        ...(v.customer.email.trim() ? { email: v.customer.email.trim() } : {}),
      },
      delivery: {
        ...(v.delivery.areaId ? { areaId: Number(v.delivery.areaId) } : {}),
        areaName: v.delivery.areaName,
        address: v.delivery.address,
        ...(v.delivery.notes.trim() ? { notes: v.delivery.notes.trim() } : {}),
      },
      items: v.items.map((l) =>
        l.kind === 'hoodie_set'
          ? ({ kind: 'pack' as const, packId: Number(l.packId), hoodieId: Number(l.hoodieId), colorId: Number(l.colorId), sizeId: Number(l.sizeId), stimpieIds: l.stimpieIds.map(Number), qty: l.qty })
          : l.kind === 'stimpie_pack'
            ? ({ kind: 'stimpie_pack' as const, packId: Number(l.stimpiePackId), stimpies: l.stimpies.map((item) => ({ stimpieId: Number(item.stimpieId), qty: item.qty })), qty: l.qty })
            : l.kind === 'hoodie'
            ? ({ kind: 'hoodie' as const, hoodieId: Number(l.hoodieId), colorId: Number(l.colorId), sizeId: Number(l.sizeId), qty: l.qty })
            : ({ kind: 'stimpie' as const, stimpieId: Number(l.stimpieId), qty: l.qty }),
      ),
    };
    try {
      const order = await unwrap(api.POST('/api/v1/admin/orders', { body }));
      // The dashboard created this order itself: the poller must not announce it.
      notifications.ignoreOrder(order.id);
      qc.setQueryData(queryKeys.orderDetail(order.id), order);
      invalidateOrderCaches(qc, { keepId: order.id });
      void qc.invalidateQueries({ queryKey: ['order-form'] });
      toast.success(`Order ${order.number} created.`);
      draft.clear();
      guard.bypass(() => navigate(`/orders/${order.id}`));
    } catch (e) {
      const apiErr = asApiError(e);
      const raw = apiErr && typeof apiErr.details === 'object' && apiErr.details !== null ? (apiErr.details as { items?: unknown }).items : null;
      if ((apiErr?.code === 'SOLD_OUT' || apiErr?.code === 'NOT_PURCHASABLE') && Array.isArray(raw)) {
        const list: Problem[] = (raw as Array<Record<string, unknown>>).map((p) => ({
          itemIndex: typeof p.itemIndex === 'number' ? p.itemIndex : -1,
          name: typeof p.name === 'string' ? p.name : 'Item',
          text:
            apiErr.code === 'SOLD_OUT'
              ? `Requested ${String(p.requested)}, available ${String(p.available)}`
              : (REASON_TEXT[String(p.reason)] ?? 'Not available'),
        }));
        setProblems(list);
        setDialog({ kind: apiErr.code, problems: list });
        void qc.invalidateQueries({ queryKey: ['order-form'] });
        return;
      }
      throw e;
    }
  };

  return (
    <>
      <PageHeader title="New order" breadcrumbs={[{ label: 'Orders', to: '/orders' }, { label: 'New order' }]} />
      {draft.banner}
      <AdminForm form={form} onSubmit={submit} autoComplete="off" className="mx-auto flex max-w-3xl flex-col gap-4">
        <FormSection title="Source" description="Where did this order come from?">
          <Controller
            control={form.control}
            name="source"
            render={({ field }) => (
              <RadioGroup
                name="source"
                aria-label="Source"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'INSTAGRAM', label: SOURCE_LABEL.INSTAGRAM },
                  { value: 'WHATSAPP', label: SOURCE_LABEL.WHATSAPP },
                  { value: 'MANUAL', label: SOURCE_LABEL.MANUAL },
                ]}
              />
            )}
          />
        </FormSection>

        <FormSection title="Customer">
          <CustomerFinder onPick={applyCustomer} />
          <TextField name="customer.name" label="Name" required autoComplete="off" />
          <TextField name="customer.phone" label="Phone" type="tel" inputMode="tel" required hint="03 123 456 or +961 3 123 456" />
          <TextField name="customer.email" label="Email" type="email" inputMode="email" optional hint="Needed to email the customer about this order." />
          <Controller
            control={form.control}
            name="customer.whatsappSameAsPhone"
            render={({ field }) => <Checkbox label="WhatsApp number is the same as the phone" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
          />
          {!same ? <TextField name="customer.whatsapp" label="WhatsApp number" type="tel" inputMode="tel" required /> : null}
        </FormSection>

        <FormSection title="Delivery">
          <SelectField name="delivery.areaId" label="Area" options={areaOptions} optional />
          <TextField name="delivery.areaName" label="Area name" required hint="Filled from the area above; edit it if needed." />
          <TextAreaField name="delivery.address" label="Address" required rows={3} maxLength={300} />
          <TextAreaField name="delivery.notes" label="Delivery notes" optional rows={2} maxLength={300} />
        </FormSection>

        <FormSection title="Items" aside={<span className="text-body-sm text-fg-muted">Sold-out sizes and Stimpies are disabled.</span>}>
          {fields.map((field, index) => (
            <LineEditor key={field.id} index={index} packs={packs} problem={problems.find((p) => p.itemIndex === index)} canRemove={fields.length > 1} onRemove={() => remove(index)} />
          ))}
          <div>
            <Button variant="secondary" leftIcon={<Plus size={18} aria-hidden="true" />} onClick={() => append(blankLine())}>
              Add another item
            </Button>
          </div>
          {form.formState.errors.items?.message ? <p className="text-body-sm font-medium text-fg-danger">{String(form.formState.errors.items.message)}</p> : null}
        </FormSection>

        <FormSection title="Order">
          <Controller
            control={form.control}
            name="initialStatus"
            render={({ field }) => (
              <FormField label="Start as" name="initialStatus" hint={field.value === 'CONFIRMED' ? 'Confirmed: stock is reserved and the customer is emailed "Order confirmed".' : 'New: the order waits for you to confirm it.'}>
                {(a11y) => (
                  <SegmentedControl
                    aria-label="Start as"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'CONFIRMED', label: 'Confirmed' },
                      { value: 'NEW', label: 'New' },
                    ]}
                    name={a11y.id}
                  />
                )}
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="sendEmail"
            render={({ field }) => (
              <Checkbox
                label="Email the customer"
                description={hasEmail ? undefined : 'Enter an email address to turn this on.'}
                disabled={!hasEmail}
                checked={hasEmail && field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              />
            )}
          />
        </FormSection>

        <section aria-label="Order summary" className="rounded-lg border border-base bg-cream p-4 md:p-6" data-testid="order-estimate">
          <h2 className="text-h5">Summary</h2>
          <p className="mb-2 text-body-sm text-fg-muted">Uses the configured offer prices; the server validates final prices.</p>
          <dl className="space-y-1 text-body">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{f.money(estimate.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery fee</dt><dd className="tabular-nums">{f.money(estimate.delivery)}</dd></div>
            <div className="flex justify-between text-h5 font-bold"><dt>Total</dt><dd className="tabular-nums">{f.money(estimate.total)}</dd></div>
          </dl>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
            Create order
          </Button>
          <Button variant="secondary" href="/orders">
            Cancel
          </Button>
        </div>
      </AdminForm>
      {guard.dialog}
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'SOLD_OUT' ? 'Some items are sold out' : "Some items can't be sold right now"}
        size="md"
        footer={
          <Button variant="dark" onClick={() => setDialog(null)}>
            Back to the form
          </Button>
        }
      >
        <p className="mb-3 text-body-sm text-fg-muted">
          {dialog?.kind === 'SOLD_OUT' ? 'Nothing was reserved. Change the quantity or the item, or add stock first.' : 'Nothing was reserved. To sell it anyway, end the drop or unhide the item first.'}
        </p>
        <ul className="divide-y divide-line rounded-md border border-base">
          {dialog?.problems.map((p, i) => (
            <li key={`${p.itemIndex}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body-sm">
              <span className="font-medium">{p.name}</span>
              <span className="text-fg-muted">{p.text}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------------- customer finder */

function CustomerFinder({ onPick }: { onPick: (c: CustomerHit) => void }) {
  const [text, setText] = useState('');
  const q = useDebouncedValue(text.trim(), 300);
  const hits = useQuery({
    queryKey: queryKeys.customers({ finder: q }),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers', { params: { query: { q, pageSize: 5 } } })),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface p-3">
      <FormField label="Find an existing customer" optional hint="Choosing one fills the fields below. The customer is matched by phone when the order is saved.">
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, phone or email" autoComplete="off" />
      </FormField>
      {q.length >= 2 && hits.data ? (
        hits.data.items.length === 0 ? (
          <p className="text-body-sm text-fg-muted">No customer found. Fill the fields below to create one.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-base bg-surface-base" aria-label="Matching customers">
            {hits.data.items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(c);
                    setText('');
                  }}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-body-sm hover:bg-surface"
                >
                  <span className="inline-flex items-center gap-2 font-medium">
                    <UserSearch size={16} aria-hidden="true" /> {c.name}
                  </span>
                  <span className="tabular-nums text-fg-muted">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------- line editor */

function LineEditor({ index, packs, problem, canRemove, onRemove }: { index: number; packs: Pack[]; problem?: Problem; canRemove: boolean; onRemove: () => void }) {
  const { control, setValue, formState } = useFormContext<Values>();
  const line = useWatch({ control, name: `items.${index}` }) as Line;
  const hoodiesQ = useCatalogHoodies();
  const stimpiesQ = useCatalogStimpies();
  const slug = hoodiesQ.data?.find((h) => String(h.id) === line.hoodieId)?.slug ?? null;
  const detail = useCatalogHoodie(slug);
  const errors = formState.errors.items?.[index];
  const hoodiePack = packs.find((p) => String(p.id) === line.packId && p.type === 'HOODIE_SET');
  const stimpiePack = packs.find((p) => String(p.id) === line.stimpiePackId && p.type === 'STIMPIE_ONLY');
  const stimpies = stimpiesQ.data ?? [];

  const colorOptions = (detail.data?.colors ?? []).map((c) => {
    const anyStock = (detail.data?.variants ?? []).some((v) => v.colorId === c.id && v.inStock);
    return {
      value: String(c.id),
      label: anyStock ? c.name : `${c.name} (Sold out)`,
      disabled: !anyStock,
      icon: (
        <span
          className="inline-block h-3.5 w-3.5 rounded-full border border-base/40 shrink-0"
          style={{ backgroundColor: c.hex }}
        />
      ),
    };
  });
  const sizeOptions = (detail.data?.sizes ?? []).map((s) => {
    const v = detail.data?.variants.find((x) => String(x.colorId) === line.colorId && x.sizeId === s.id);
    const out = line.colorId !== '' && !(v?.inStock ?? false);
    return { value: String(s.id), label: out ? `${s.label} (Sold out)` : s.label, disabled: out };
  });
  const stimpieOptions = (taken: string[], current: string) => [
    { value: '', label: 'Choose a Stimpie' },
    ...stimpies.map((s: Stimpie) => {
      const unavailable = !s.purchasable;
      const label = s.status === 'SOLD_OUT' ? `${s.name} (Sold out)` : unavailable ? `${s.name} (Not available)` : s.name;
      return {
        value: String(s.id),
        label,
        disabled: unavailable || (taken.includes(String(s.id)) && String(s.id) !== current),
        image: s.artworkUrl || s.images?.[0] || null,
      };
    }),
  ];

  const set = <K extends keyof Line>(key: K, value: Line[K]) => setValue(`items.${index}.${key}` as never, value as never, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  const eligibleStimpies = stimpies.filter((stimpie) =>
    (!hoodiePack || hoodiePack.eligibleStimpieIds === null || hoodiePack.eligibleStimpieIds.includes(stimpie.id)) &&
    (!stimpiePack || stimpiePack.eligibleStimpieIds === null || stimpiePack.eligibleStimpieIds.includes(stimpie.id)),
  );
  const selectedTotal = line.stimpies.reduce((total, item) => total + item.qty, 0);

  const err = (path: string): string | null => {
    const parts = path.split('.');
    let cur: unknown = errors;
    for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
    return (cur as { message?: string } | undefined)?.message ?? null;
  };

  return (
    <div className={`rounded-lg border p-4 ${problem ? 'border-2 border-danger' : 'border-base'}`} data-testid={`order-line-${index}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-h5">Item {index + 1}</h3>
        {canRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove} leftIcon={<Trash2 size={16} aria-hidden="true" />} aria-label={`Remove item ${index + 1}`}>
            Remove
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        <SegmentedControl
          aria-label={`Kind of item ${index + 1}`}
          name={`kind-${index}`}
          value={line.kind}
          onChange={(v) => set('kind', v as Kind)}
          options={[
            { value: 'hoodie_set', label: 'Hoodie + Stimpies' },
            { value: 'hoodie', label: 'Hoodie only' },
            { value: 'stimpie_pack', label: 'Stimpies only' },
            { value: 'stimpie', label: 'Single Stimpie' },
          ]}
          fullWidth
        />
        {line.kind === 'hoodie_set' ? (
          <FormField label="Hoodie + Stimpies offer" name={`items.${index}.packId`} required error={err('packId')}>
            <Select
              value={line.packId}
              onChange={(e) => {
                set('packId', e.target.value);
                set('stimpieIds', []);
              }}
              options={[{ value: '', label: 'Choose a hoodie set' }, ...packs.filter((p) => p.type === 'HOODIE_SET').map((p) => ({ value: String(p.id), label: `${p.name} · ${p.stimpieCount} Stimpies` }))]}
            />
          </FormField>
        ) : null}
        {line.kind === 'stimpie_pack' ? (
          <FormField label="Stimpie-only offer" name={`items.${index}.stimpiePackId`} required error={err('stimpiePackId')}>
            <Select
              value={line.stimpiePackId}
              onChange={(e) => {
                set('stimpiePackId', e.target.value);
                set('stimpies', []);
              }}
              options={[{ value: '', label: 'Choose a Stimpie-only offer' }, ...packs.filter((p) => p.type === 'STIMPIE_ONLY').map((p) => ({ value: String(p.id), label: `${p.name} · ${p.stimpieCount} Stimpies` }))]}
            />
          </FormField>
        ) : null}
        {line.kind === 'hoodie' || line.kind === 'hoodie_set' ? (
          <>
            <FormField label="Hoodie" name={`items.${index}.hoodieId`} required error={err('hoodieId')}>
              <Select
                value={line.hoodieId}
                onChange={(e) => {
                  set('hoodieId', e.target.value);
                  set('colorId', '');
                  set('sizeId', '');
                }}
                options={[{ value: '', label: 'Choose a hoodie' }, ...(hoodiesQ.data ?? []).map((h) => ({ value: String(h.id), label: h.name, image: h.images?.[0] || null }))]}
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Colour" name={`items.${index}.colorId`} required error={err('colorId')}>
                <Select
                  value={line.colorId}
                  onChange={(e) => {
                    set('colorId', e.target.value);
                    set('sizeId', '');
                  }}
                  options={[{ value: '', label: 'Choose a colour' }, ...colorOptions]}
                />
              </FormField>
              <FormField label="Size" name={`items.${index}.sizeId`} required error={err('sizeId')}>
                <Select value={line.sizeId} onChange={(e) => set('sizeId', e.target.value)} options={[{ value: '', label: 'Choose a size' }, ...sizeOptions]} />
              </FormField>
            </div>
          </>
        ) : null}
        {line.kind === 'hoodie_set' && hoodiePack ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body font-medium">Choose {hoodiePack.stimpieCount} different Stimpies</legend>
            <p className="text-body-sm text-fg-muted">{line.stimpieIds.length} of {hoodiePack.stimpieCount} selected.</p>
            {eligibleStimpies.filter((stimpie) => stimpie.purchasable).length < hoodiePack.stimpieCount ? <p role="alert" className="text-body-sm text-fg-danger">Not enough eligible Stimpies are currently available to fill this hoodie set.</p> : null}
            {err('stimpieIds') ? <p role="alert" className="text-body-sm text-fg-danger">{err('stimpieIds')}</p> : null}
            <div className="max-h-72 divide-y divide-base overflow-y-auto rounded-md border border-base">
              {eligibleStimpies.map((stimpie) => {
                const id = String(stimpie.id);
                const checked = line.stimpieIds.includes(id);
                return <div key={stimpie.id} className="flex items-center gap-3 px-3">
                  {stimpie.artworkUrl || stimpie.images?.[0] ? <img src={stimpie.artworkUrl || stimpie.images?.[0] || ''} alt="" className="h-11 w-8 rounded object-cover" loading="lazy" /> : null}
                  <Checkbox
                    label={<span className="font-medium">{stimpie.name}{stimpie.status === 'SOLD_OUT' ? <span className="ml-2 text-caption text-fg-muted">Sold out</span> : null}</span>}
                    checked={checked}
                    disabled={!stimpie.purchasable && !checked}
                    onChange={(event) => set('stimpieIds', event.target.checked ? [...line.stimpieIds, id] : line.stimpieIds.filter((value) => value !== id))}
                    className="min-w-0 flex-1"
                  />
                </div>;
              })}
              {eligibleStimpies.length === 0 ? <p className="p-3 text-body-sm text-fg-muted">No eligible Stimpies are currently available.</p> : null}
            </div>
          </fieldset>
        ) : null}
        {line.kind === 'stimpie_pack' && stimpiePack ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-body font-medium">Choose {stimpiePack.stimpieCount} Stimpies</legend>
            <p className="text-body-sm text-fg-muted">Set a quantity for each design. Selected: {selectedTotal} of {stimpiePack.stimpieCount}.</p>
            {err('stimpies') ? <p role="alert" className="text-body-sm text-fg-danger">{err('stimpies')}</p> : null}
            <div className="max-h-72 divide-y divide-base overflow-y-auto rounded-md border border-base">
              {eligibleStimpies.map((stimpie) => {
                const id = String(stimpie.id);
                const picked = line.stimpies.find((value) => value.stimpieId === id);
                const unavailable = !stimpie.purchasable;
                return <div key={stimpie.id} className="flex flex-wrap items-center gap-3 px-3 py-1 sm:flex-nowrap">
                  {stimpie.artworkUrl || stimpie.images?.[0] ? <img src={stimpie.artworkUrl || stimpie.images?.[0] || ''} alt="" className="h-11 w-8 rounded object-cover" loading="lazy" /> : null}
                  <Checkbox
                    label={<span className="font-medium">{stimpie.name}{stimpie.status === 'SOLD_OUT' ? <span className="ml-2 text-caption text-fg-muted">Sold out</span> : unavailable ? <span className="ml-2 text-caption text-fg-muted">Not available</span> : null}</span>}
                    checked={!!picked}
                    disabled={unavailable && !picked}
                    onChange={(event) => set('stimpies', event.target.checked ? [...line.stimpies, { stimpieId: id, qty: 1 }] : line.stimpies.filter((value) => value.stimpieId !== id))}
                    className="min-w-0 flex-1"
                  />
                  {picked ? <label className="flex items-center gap-2 pb-2 text-body-sm">Qty <Input aria-label={`Quantity of ${stimpie.name}`} type="number" min={1} max={stimpiePack.stimpieCount} step={1} value={picked.qty} className="w-20" onChange={(event) => {
                    const qty = event.target.value === '' ? 0 : Number(event.target.value);
                    set('stimpies', line.stimpies.map((value) => value.stimpieId === id ? { ...value, qty } : value));
                  }} /></label> : null}
                </div>;
              })}
              {eligibleStimpies.length === 0 ? <p className="p-3 text-body-sm text-fg-muted">No eligible Stimpies are currently available.</p> : null}
            </div>
          </fieldset>
        ) : null}
        {line.kind === 'stimpie' ? (
          <FormField label="Stimpie" name={`items.${index}.stimpieId`} required error={err('stimpieId')}>
            <Select value={line.stimpieId} onChange={(e) => set('stimpieId', e.target.value)} options={stimpieOptions([], line.stimpieId)} />
          </FormField>
        ) : null}
        {line.kind !== 'stimpie_pack' ? <div className="flex items-center gap-3">
          <span className="text-body font-medium">Quantity</span>
          <QuantityStepper label={`Quantity of item ${index + 1}`} value={line.qty} onChange={(n) => set('qty', n)} />
        </div> : <div className="flex items-center gap-3">
          <span className="text-body font-medium">Offer quantity</span>
          <QuantityStepper label={`Quantity of offer ${index + 1}`} value={line.qty} onChange={(n) => set('qty', n)} />
        </div>}
        {problem ? (
          <p role="alert" className="text-body-sm font-medium text-fg-danger">
            {problem.name}: {problem.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
