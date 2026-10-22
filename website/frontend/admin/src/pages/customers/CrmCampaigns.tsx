import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, Input, Select, useToast } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FilterBar } from '../../components/FilterBar';
import { PageHeader } from '../../components/PageHeader';
import { useFormatters } from '../../lib/format';
import { isSafeWhatsAppUrl } from '../../lib/links';
import { fetchAllPages } from '../../lib/pagination';
import { useAreas } from '../../lib/refdata';
import { useAllDrops } from '../products/api';
import { useCustomerTagCatalog } from './api';

export type CrmSegmentFilters = {
  tagIds: number[];
  orderCountMin?: number; orderCountMax?: number;
  lifetimeValueMinCents?: number; lifetimeValueMaxCents?: number;
  lastOrderBefore?: string; lastOrderAfter?: string;
  areaId?: number; subscribedToDropId?: number;
  subscribedNeverOrdered?: boolean; hasEmail?: boolean;
};
type Segment = { id: number; name: string; filters: CrmSegmentFilters; createdAt: string; updatedAt: string };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
type Channel = 'EMAIL' | 'WHATSAPP';
type Audience = { matched: number; eligible: number; skipped: { noContact: number; noConsent: number; optedOut: number }; cap: number; overCap: number; sample: { id: number; name: string; to: string }[]; segmentId: number | null };
type Mode = 'segments' | 'campaigns';

const emptyFilters = (): CrmSegmentFilters => ({ tagIds: [] });
const activeFilterCount = (filters: CrmSegmentFilters): number => Object.entries(filters).filter(([key, value]) => key === 'tagIds' ? Array.isArray(value) && value.length > 0 : value !== undefined).length;
const cleanFilters = (filters: CrmSegmentFilters): CrmSegmentFilters => ({
  tagIds: filters.tagIds,
  ...(filters.orderCountMin === undefined ? {} : { orderCountMin: filters.orderCountMin }),
  ...(filters.orderCountMax === undefined ? {} : { orderCountMax: filters.orderCountMax }),
  ...(filters.lifetimeValueMinCents === undefined ? {} : { lifetimeValueMinCents: filters.lifetimeValueMinCents }),
  ...(filters.lifetimeValueMaxCents === undefined ? {} : { lifetimeValueMaxCents: filters.lifetimeValueMaxCents }),
  ...(filters.lastOrderBefore ? { lastOrderBefore: filters.lastOrderBefore } : {}),
  ...(filters.lastOrderAfter ? { lastOrderAfter: filters.lastOrderAfter } : {}),
  ...(filters.areaId === undefined ? {} : { areaId: filters.areaId }),
  ...(filters.subscribedToDropId === undefined ? {} : { subscribedToDropId: filters.subscribedToDropId }),
  ...(filters.subscribedNeverOrdered === undefined ? {} : { subscribedNeverOrdered: filters.subscribedNeverOrdered }),
  ...(filters.hasEmail === undefined ? {} : { hasEmail: filters.hasEmail }),
});

function NumberControl({ label, value, onChange, cents = false }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void; cents?: boolean }) {
  return <label className="flex min-w-36 flex-col gap-1 text-body-sm font-medium">{label}<Input type="number" min="0" value={value === undefined ? '' : String(cents ? value / 100 : value)} prefixText={cents ? '$' : undefined} onChange={(event) => { const n = event.target.value === '' ? undefined : Number(event.target.value); onChange(n !== undefined && Number.isFinite(n) && n >= 0 ? cents ? Math.round(n * 100) : Number.isInteger(n) ? n : undefined : undefined); }} /></label>;
}

function FilterEditor({ value, onChange }: { value: CrmSegmentFilters; onChange: (next: CrmSegmentFilters) => void }) {
  const areas = useAreas();
  const drops = useAllDrops();
  const tags = useCustomerTagCatalog();
  const set = (patch: Partial<CrmSegmentFilters>) => onChange({ ...value, ...patch });
  return (
    <FilterBar activeCount={activeFilterCount(value)} onClear={() => onChange(emptyFilters())}>
      <NumberControl label="Orders from" value={value.orderCountMin} onChange={(orderCountMin) => set({ orderCountMin })} />
      <NumberControl label="Orders to" value={value.orderCountMax} onChange={(orderCountMax) => set({ orderCountMax })} />
      <NumberControl label="Lifetime value from" value={value.lifetimeValueMinCents} cents onChange={(lifetimeValueMinCents) => set({ lifetimeValueMinCents })} />
      <NumberControl label="Lifetime value to" value={value.lifetimeValueMaxCents} cents onChange={(lifetimeValueMaxCents) => set({ lifetimeValueMaxCents })} />
      <label className="flex min-w-40 flex-col gap-1 text-body-sm font-medium">Last order before<Input type="date" value={value.lastOrderBefore ?? ''} onChange={(event) => set({ lastOrderBefore: event.target.value || undefined })} /></label>
      <label className="flex min-w-40 flex-col gap-1 text-body-sm font-medium">Last order after<Input type="date" value={value.lastOrderAfter ?? ''} onChange={(event) => set({ lastOrderAfter: event.target.value || undefined })} /></label>
      <label className="flex min-w-44 flex-col gap-1 text-body-sm font-medium">Area<Select value={value.areaId?.toString() ?? ''} onChange={(event) => set({ areaId: event.target.value ? Number(event.target.value) : undefined })} options={[{ value: '', label: 'Any area' }, ...(areas.data?.items ?? []).map((area) => ({ value: String(area.id), label: area.name }))]} /></label>
      <label className="flex min-w-44 flex-col gap-1 text-body-sm font-medium">Subscribed to drop<Select value={value.subscribedToDropId?.toString() ?? ''} onChange={(event) => set({ subscribedToDropId: event.target.value ? Number(event.target.value) : undefined })} options={[{ value: '', label: 'Any drop' }, ...(drops.data?.items ?? []).map((drop) => ({ value: String(drop.id), label: drop.name }))]} /></label>
      <label className="flex min-w-44 flex-col gap-1 text-body-sm font-medium">Subscribed, never ordered<Select value={value.subscribedNeverOrdered === undefined ? '' : value.subscribedNeverOrdered ? 'yes' : 'no'} onChange={(event) => set({ subscribedNeverOrdered: event.target.value === '' ? undefined : event.target.value === 'yes' })} options={[{ value: '', label: 'Any relationship' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></label>
      <label className="flex min-w-40 flex-col gap-1 text-body-sm font-medium">Has email<Select value={value.hasEmail === undefined ? '' : value.hasEmail ? 'yes' : 'no'} onChange={(event) => set({ hasEmail: event.target.value === '' ? undefined : event.target.value === 'yes' })} options={[{ value: '', label: 'Any' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} /></label>
      <fieldset className="min-w-52 rounded-md border border-line p-2"><legend className="px-1 text-body-sm font-medium">Tags (all selected)</legend><div className="flex max-h-36 flex-col gap-1 overflow-auto">{(tags.data ?? []).map((tag) => <label key={tag.id} className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={value.tagIds.includes(tag.id)} onChange={(event) => set({ tagIds: event.target.checked ? [...value.tagIds, tag.id] : value.tagIds.filter((id) => id !== tag.id) })} />{tag.name}</label>)}{!tags.data?.length ? <span className="text-xs text-fg-muted">No tags yet.</span> : null}</div></fieldset>
    </FilterBar>
  );
}

export function CrmCampaigns({ mode, filters, onFiltersChange }: { mode: Mode; filters: CrmSegmentFilters; onFiltersChange: (filters: CrmSegmentFilters) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const [segmentName, setSegmentName] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | undefined>();
  const [segmentPage, setSegmentPage] = useState(1);
  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [templateKey, setTemplateKey] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | undefined>();
  const [campaignPage, setCampaignPage] = useState(1);
  const [recipientPage, setRecipientPage] = useState(1);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);
  const f = useFormatters();

  const segments = useQuery({ queryKey: ['crm-segments', segmentPage], queryFn: () => unwrap(api.GET('/api/v1/admin/segments', { params: { query: { page: segmentPage, pageSize: 50 } } })) });
  const allSegments = useQuery({
    queryKey: ['crm-segments', 'all'],
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/segments', { params: { query: { page, pageSize } } }))),
    enabled: mode === 'campaigns',
  });
  const selectedSegment = allSegments.data?.items.find((segment) => segment.id === selectedSegmentId)
    ?? segments.data?.items.find((segment) => segment.id === selectedSegmentId);
  const target = useMemo(
    () => mode === 'segments' || !selectedSegment ? { filters: cleanFilters(filters) } : { segmentId: selectedSegment.id },
    [filters, mode, selectedSegment],
  );
  const preview = useQuery({
    queryKey: ['crm-campaign-preview', target, channel],
    queryFn: () => unwrap(api.POST('/api/v1/admin/campaigns/preview', { body: { target, channel } })) as Promise<Audience>,
    staleTime: 0,
  });
  const templates = useQuery({
    queryKey: ['crm-campaign-templates', channel],
    queryFn: async () => channel === 'EMAIL'
      ? (await unwrap(api.GET('/api/v1/admin/email-templates'))).filter((template) => template.enabled)
      : await unwrap(api.GET('/api/v1/admin/whatsapp-templates')),
  });
  const campaigns = useQuery({ queryKey: ['crm-campaigns', campaignPage], queryFn: () => unwrap(api.GET('/api/v1/admin/campaigns', { params: { query: { page: campaignPage, pageSize: 50 } } })) });
  const detail = useQuery({ queryKey: ['crm-campaign', selectedCampaignId, recipientPage], enabled: selectedCampaignId !== undefined, queryFn: () => unwrap(api.GET('/api/v1/admin/campaigns/{id}', { params: { path: { id: selectedCampaignId! }, query: { page: recipientPage, pageSize: 100 } } })) });

  const saveSegment = useMutation({
    mutationFn: () => selectedSegment
      ? unwrap(api.PATCH('/api/v1/admin/segments/{id}', { params: { path: { id: selectedSegment.id } }, body: { name: segmentName.trim() || selectedSegment.name, filters: cleanFilters(filters) } }))
      : unwrap(api.POST('/api/v1/admin/segments', { body: { name: segmentName.trim(), filters: cleanFilters(filters) } })),
    onSuccess: (segment) => { void qc.invalidateQueries({ queryKey: ['crm-segments'] }); setSelectedSegmentId(segment.id); setSegmentName(segment.name); toast.success('Segment saved.'); },
    onError: (error) => notify(error, { fallback: 'Could not save the segment.' }),
  });
  const deleteSegment = useMutation({ mutationFn: (id: number) => unwrap(api.DELETE('/api/v1/admin/segments/{id}', { params: { path: { id } } })), onSuccess: (_, id) => { void qc.invalidateQueries({ queryKey: ['crm-segments'] }); if (id === selectedSegmentId) { setSelectedSegmentId(undefined); setSegmentName(''); } toast.success('Segment deleted.'); } });
  const createDraft = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/campaigns', { body: { target, channel, templateKey } })),
    onSuccess: (campaign) => { setSelectedCampaignId(campaign.id); setRecipientPage(1); void qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); toast.success('Campaign draft created. Review it and confirm when ready.'); },
    onError: (error) => notify(error, { fallback: 'Could not create the campaign draft.' }),
  });
  const confirmCampaign = useMutation({
    mutationFn: (id: number) => unwrap(api.POST('/api/v1/admin/campaigns/{id}/confirm', { params: { path: { id } } })),
    onSuccess: (campaign) => { setConfirmDraft(false); void qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); void qc.invalidateQueries({ queryKey: ['crm-campaign', campaign.id] }); toast.success('Campaign confirmed.'); },
  });
  const markSent = useMutation({
    mutationFn: ({ campaignId, customerId }: { campaignId: number; customerId: number }) => unwrap(api.POST('/api/v1/admin/campaigns/{id}/recipients/{customerId}/sent', { params: { path: { id: campaignId, customerId } } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['crm-campaign', selectedCampaignId] }); void qc.invalidateQueries({ queryKey: ['crm-campaigns'] }); toast.success('Recipient marked as sent.'); },
    onError: (error) => notify(error, { fallback: 'This recipient is no longer eligible to receive a WhatsApp message.' }),
  });

  const selectedDraft = selectedCampaignId === undefined ? undefined : (detail.data?.id === selectedCampaignId ? detail.data : undefined) ?? campaigns.data?.items.find((campaign) => campaign.id === selectedCampaignId);
  const audience = preview.data;
  const templateOptions = (templates.data ?? []).map((template) => ({ value: template.key, label: template.name }));
  const selectedTemplate = templates.data?.find((template) => template.key === templateKey);

  return (
    <div className="flex flex-col gap-6">
      {mode === 'segments' ? (
        <>
          <PageHeader title="Customer segments" description="Build reusable audiences and preview who qualifies before any campaign." />
          <section className="rounded-lg border border-base bg-surface-base p-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-h5">Audience filters</h2><p className="text-body-sm text-fg-muted">Every filter is combined. Marketing consent is applied separately when you choose a channel.</p></div>
              <label className="flex min-w-56 flex-col gap-1 text-body-sm font-medium">Segment name<Input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} maxLength={100} placeholder="e.g. Repeat buyers" /></label>
            </div>
            <FilterEditor value={filters} onChange={onFiltersChange} />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={!segmentName.trim() || saveSegment.isPending} loading={saveSegment.isPending} onClick={() => saveSegment.mutate()}>{selectedSegment ? 'Update segment' : 'Save segment'}</Button>
              {selectedSegment ? <Button variant="secondary" onClick={() => { setSelectedSegmentId(undefined); setSegmentName(''); }}>New segment</Button> : null}
            </div>
          </section>
          <section className="rounded-lg border border-base bg-surface-base p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-h5">Live email audience preview</h2><span className="text-body-sm text-fg-muted">Updates as filters change</span></div>
            <AudiencePreview query={preview} />
          </section>
          <section className="rounded-lg border border-base bg-surface-base p-4">
            <h2 className="mb-3 text-h5">Saved segments</h2>
            {segments.isPending ? <p className="text-body-sm text-fg-muted">Loading segments…</p> : segments.isError ? <p role="alert" className="text-body-sm text-fg-danger">Could not load saved segments.</p> : segments.data.items.length ? (
              <ul className="divide-y divide-line">{segments.data.items.map((segment) => <li key={segment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{segment.name}</p><p className="text-xs text-fg-muted">Updated {f.date(segment.updatedAt)}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setSelectedSegmentId(segment.id); setSegmentName(segment.name); onFiltersChange(segment.filters); }}>Edit / use</Button><Button size="sm" variant="ghost" onClick={() => setSegmentToDelete(segment)}>Delete</Button></div></li>)}</ul>
            ) : <p className="text-body-sm text-fg-muted">No saved segments yet.</p>}
            {segments.data && segments.data.total > segments.data.pageSize ? <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="secondary" disabled={segmentPage <= 1} onClick={() => setSegmentPage((page) => page - 1)}>Previous</Button><span className="text-xs text-fg-muted">Page {segments.data.page} of {Math.ceil(segments.data.total / segments.data.pageSize)}</span><Button size="sm" variant="secondary" disabled={segments.data.page * segments.data.pageSize >= segments.data.total} onClick={() => setSegmentPage((page) => page + 1)}>Next</Button></div> : null}
          </section>
        </>
      ) : (
        <>
          <PageHeader title="Customer campaigns" description="Preview channel consent, create a draft, then confirm to queue email or prepare manual WhatsApp links." />
          <section className="rounded-lg border border-base bg-surface-base p-4">
            <h2 className="mb-4 text-h5">Build a campaign</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-body-sm font-medium">Saved segment<Select value={selectedSegmentId?.toString() ?? ''} onChange={(event) => { const id = event.target.value ? Number(event.target.value) : undefined; setSelectedSegmentId(id); const selected = allSegments.data?.items.find((segment) => segment.id === id); if (selected) onFiltersChange(selected.filters); }} options={[{ value: '', label: 'Use current filters' }, ...(allSegments.data?.items ?? []).map((segment) => ({ value: String(segment.id), label: segment.name }))]} /></label>
              <label className="flex flex-col gap-1 text-body-sm font-medium">Channel<Select value={channel} onChange={(event) => { setChannel(event.target.value as Channel); setTemplateKey(''); }} options={[{ value: 'EMAIL', label: 'Email' }, { value: 'WHATSAPP', label: 'WhatsApp' }]} /></label>
              <label className="flex flex-col gap-1 text-body-sm font-medium">Template<Select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} options={[{ value: '', label: templates.isPending ? 'Loading templates…' : 'Choose a template' }, ...templateOptions]} /></label>
            </div>
            {templates.isError ? <p role="alert" className="mt-3 text-body-sm text-fg-danger">Could not load message templates. <button type="button" className="underline" onClick={() => void templates.refetch()}>Retry</button></p> : null}
            {selectedTemplate ? <div className="mt-4 rounded-md border border-line bg-surface-subtle p-3"><h3 className="mb-2 text-body-sm font-semibold">Template copy preview</h3><pre className="whitespace-pre-wrap break-words font-sans text-body-sm">{selectedTemplate.body}</pre><p className="mt-2 text-xs text-fg-muted">Placeholders are filled for each customer. <Link className="underline" to="/content?tab=emails">Edit templates</Link></p></div> : null}
            {!selectedSegment ? <div className="mt-4"><FilterEditor value={filters} onChange={(next) => { setSelectedSegmentId(undefined); onFiltersChange(next); }} /></div> : null}
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-3 text-body-sm font-semibold">Audience preview</h3>
              <AudiencePreview query={preview} />
              <div className="mt-4"><Button variant="primary" disabled={!templateKey || !audience?.eligible || createDraft.isPending} loading={createDraft.isPending} onClick={() => createDraft.mutate()}>Create campaign draft</Button></div>
            </div>
          </section>

          {selectedDraft?.status === 'DRAFT' ? <section className="rounded-lg border border-line bg-surface-base p-4"><h2 className="text-h5">Draft campaign #{selectedDraft.id}</h2><p className="mt-1 text-body-sm text-fg-muted">The audience and consent are rechecked on confirmation. Email messages enter the existing queue; WhatsApp messages remain manual.</p><Button className="mt-4" variant="primary" onClick={() => setConfirmDraft(true)}>Review and confirm</Button></section> : null}

          <section className="rounded-lg border border-base bg-surface-base p-4">
            <h2 className="mb-3 text-h5">Campaign history</h2>
            {campaigns.isPending ? <p className="text-body-sm text-fg-muted">Loading campaigns…</p> : campaigns.isError ? <p role="alert" className="text-body-sm text-fg-danger">Could not load campaign history.</p> : campaigns.data.items.length ? <div className="flex flex-col gap-2">{campaigns.data.items.map((campaign) => <button key={campaign.id} type="button" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3 text-left hover:bg-surface-subtle" onClick={() => { setSelectedCampaignId(campaign.id); setRecipientPage(1); }}><span><strong>#{campaign.id} · {campaign.channel}</strong><span className="ml-2 text-body-sm text-fg-muted">{campaign.templateKey}</span></span><span className="text-body-sm">{campaign.status} · {campaign.sentCount} sent · {campaign.skippedCount} skipped · {campaign.failedCount} failed</span></button>)}</div> : <p className="text-body-sm text-fg-muted">Campaigns appear here after you create a draft.</p>}
            {campaigns.data && campaigns.data.total > campaigns.data.pageSize ? <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="secondary" disabled={campaignPage <= 1} onClick={() => setCampaignPage((page) => page - 1)}>Previous</Button><span className="text-xs text-fg-muted">Page {campaigns.data.page} of {Math.ceil(campaigns.data.total / campaigns.data.pageSize)}</span><Button size="sm" variant="secondary" disabled={campaigns.data.page * campaigns.data.pageSize >= campaigns.data.total} onClick={() => setCampaignPage((page) => page + 1)}>Next</Button></div> : null}
          </section>

          {detail.data ? <section className="rounded-lg border border-base bg-surface-base p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-h5">Campaign #{detail.data.id} recipients</h2><p className="text-body-sm text-fg-muted">{detail.data.channel} · {detail.data.status}</p></div><Button variant="ghost" onClick={() => setSelectedCampaignId(undefined)}>Close details</Button></div><div className="overflow-x-auto"><table className="w-full text-left text-body-sm"><thead><tr className="border-b border-line"><th className="p-2">Customer</th><th className="p-2">Destination</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead><tbody>{detail.data.recipients.items.map((recipient) => <tr key={recipient.id} className="border-b border-line"><td className="p-2"><a className="underline" href={`/customers/${recipient.customerId}`}>{recipient.customerName}</a></td><td className="p-2">{recipient.to ?? '—'}</td><td className="p-2">{recipient.status}{recipient.error ? <span className="ml-2 text-fg-danger">{recipient.error}</span> : null}</td><td className="p-2">{detail.data.channel === 'WHATSAPP' && recipient.status === 'READY' ? <span className="flex gap-2">{recipient.whatsappUrl && isSafeWhatsAppUrl(recipient.whatsappUrl) ? <a className="rounded-md border border-line px-3 py-1 underline" href={recipient.whatsappUrl} target="_blank" rel="noopener noreferrer">Open chat</a> : null}<Button size="sm" variant="secondary" onClick={() => markSent.mutate({ campaignId: detail.data.id, customerId: recipient.customerId })} loading={markSent.isPending}>Mark sent</Button></span> : null}</td></tr>)}</tbody></table></div>{detail.data.recipients.total > detail.data.recipients.pageSize ? <div className="mt-3 flex items-center justify-between"><Button size="sm" variant="secondary" disabled={recipientPage <= 1} onClick={() => setRecipientPage((page) => page - 1)}>Previous</Button><span className="text-xs text-fg-muted">Page {detail.data.recipients.page} of {Math.ceil(detail.data.recipients.total / detail.data.recipients.pageSize)}</span><Button size="sm" variant="secondary" disabled={detail.data.recipients.page * detail.data.recipients.pageSize >= detail.data.recipients.total} onClick={() => setRecipientPage((page) => page + 1)}>Next</Button></div> : null}</section> : null}
        </>
      )}

      <ConfirmDialog open={confirmDraft} title={`Confirm campaign #${selectedDraft?.id ?? ''}?`} reportErrors={false} description={selectedDraft?.channel === 'EMAIL' ? 'Eligible customers will receive an email through the queue. Consent is checked again by the worker before delivery.' : 'This creates one WhatsApp chat link per eligible customer. Messages are never sent automatically.'} confirmLabel="Confirm campaign" onClose={() => setConfirmDraft(false)} onConfirm={async () => {
        if (!selectedDraft) return;
        try {
          await confirmCampaign.mutateAsync(selectedDraft.id);
        } catch (error) {
          notify(error, { fallback: 'Could not confirm the campaign. Preview the audience again.' });
          throw error;
        }
      }} />
      <ConfirmDialog open={segmentToDelete !== null} title={`Delete segment "${segmentToDelete?.name ?? ''}"?`} description="The saved filters are removed. Campaigns already created from it are kept." confirmLabel="Delete segment" tone="destructive" notUndoable onClose={() => setSegmentToDelete(null)} onConfirm={async () => { if (segmentToDelete) await deleteSegment.mutateAsync(segmentToDelete.id); }} />
    </div>
  );
}

function AudiencePreview({ query }: { query: ReturnType<typeof useQuery<Audience>> }) {
  if (query.isPending) return <p className="text-body-sm text-fg-muted" aria-busy="true">Calculating audience…</p>;
  if (query.isError) return <p role="alert" className="text-body-sm text-fg-danger">Could not preview this audience.</p>;
  const data = query.data;
  return <div><p className="text-body-sm">{data.eligible} eligible of {data.matched} matched · cap {data.cap} · {data.overCap} over cap</p><p className="mt-1 text-xs text-fg-muted">Skipped: {data.skipped.noConsent} without channel consent, {data.skipped.noContact} without contact details, {data.skipped.optedOut} opted out.</p><ul className="mt-3 flex flex-col gap-1">{data.sample.map((row) => <li key={row.id} className="text-body-sm">{row.name} <span className="text-fg-muted">· {row.to}</span></li>)}</ul>{data.eligible === 0 ? <p className="mt-2 text-body-sm text-fg-muted">No eligible recipients. Grant channel consent or adjust the filters first.</p> : null}</div>;
}
