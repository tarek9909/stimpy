import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, MapPin, MessageCircle, Phone, Plus } from 'lucide-react';
import { Banner, Button, CopyButton, Modal, Skeleton, StatusPill, Switch, TextLink, useToast } from '@stimpy/ui';
import { AdminForm } from '../../components/form/AdminForm';
import { TextAreaField, TextField } from '../../components/form/Field';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { NotFoundState, QueryBoundary } from '../../components/QueryBoundary';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { useFormatters } from '../../lib/format';
import { mailtoHref, telHref, whatsappDigitsLink } from '../../lib/links';
import { optionalEmailSchema } from '../../lib/schemas';
import { saveBlob } from '../../lib/download';
import { zonedInputToIso } from '../../lib/time';
import { useNotifyError } from '../../api/errors';
import { OrderNumber } from '../orders/parts';
import type { AdminOrderSummary } from '../orders/api';
import {
  useCustomerProfile,
  useCustomerTimeline,
  useCustomerTagCatalog,
  useCustomerTags,
  useAddCustomerTag,
  useRemoveCustomerTag,
  useCustomerNotes,
  useAddCustomerNote,
  useCustomerFollowUps,
  useCreateCustomerFollowUp,
  useUpdateCustomerFollowUp,
  useDeleteCustomerFollowUp,
  exportCustomerData,
  useAnonymiseCustomer,
  useUpdateCustomer,
  type CustomerProfile as Customer,
} from './api';
import { CustomerTagsPanel } from './crm/CustomerTagsPanel';
import { CustomerNotesPanel } from './crm/CustomerNotesPanel';
import { CustomerFollowUpsPanel } from './crm/CustomerFollowUpsPanel';
import { CustomerPrivacyActions } from './crm/CustomerPrivacyActions';
import { CustomerConsentPanel } from './crm/CustomerConsentPanel';

export function CustomerDetailPage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const valid = Number.isInteger(id) && id > 0;
  const query = useCustomerProfile(valid ? id : 0);
  if (!valid) return <NotFoundState what="customer" backTo="/customers" backLabel="Back to customers" />;
  return (
    <QueryBoundary query={query} skeleton={<Skeleton variant="rect" className="h-64" />} notFoundWhat="customer" notFoundBackTo="/customers" notFoundBackLabel="Back to customers">
      {(c) => <CustomerView customer={c} />}
    </QueryBoundary>
  );
}

function ContactRow({ label, children, actions }: { label: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm text-fg-muted">{label}</p>
        <div className="break-words">{children}</div>
      </div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  subtext,
  swatch,
}: {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  swatch?: string | null;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-base bg-surface-base p-3">
      <span className="text-body-sm text-fg-muted">{label}</span>
      <div className="mt-1 flex items-center gap-1.5">
        {swatch ? (
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-line"
            style={{ backgroundColor: swatch }}
            aria-hidden="true"
          />
        ) : null}
        <span className="truncate text-h5 font-bold tabular-nums text-fg" title={typeof value === 'string' ? value : undefined}>
          {value}
        </span>
      </div>
      {subtext ? <span className="mt-0.5 text-xs text-fg-muted">{subtext}</span> : <span className="h-4" />}
    </div>
  );
}

function CustomerTimelineSection({ customerId }: { customerId: number }) {
  const timelineQuery = useCustomerTimeline(customerId);
  const items = timelineQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const timelineItems: TimelineItem[] = items.map((item) => ({
    id: item.id,
    at: item.at,
    title: item.title,
    note: item.detail,
    marker: item.type === 'CUSTOMER_NOTE' ? 'note' : item.type === 'FOLLOW_UP' ? 'follow-up' : undefined,
  }));

  return (
    <section aria-labelledby="timeline-h" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="timeline-h" className="mb-3 text-h5">Activity timeline</h2>
      {timelineQuery.isPending ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton variant="text" className="w-3/4" />
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="text" className="w-2/3" />
        </div>
      ) : timelineQuery.isError ? (
        <p className="text-body-sm text-fg-danger">Failed to load activity timeline.</p>
      ) : (
        <>
          <Timeline items={timelineItems} empty="No activity recorded yet." />
          {timelineQuery.hasNextPage ? (
            <div className="mt-4 flex justify-center border-t border-line pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void timelineQuery.fetchNextPage()}
                loading={timelineQuery.isFetchingNextPage}
              >
                Load older activity
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function CustomerView({ customer: c }: { customer: Customer }) {
  const f = useFormatters();
  const navigate = useNavigate();
  const toast = useToast();
  const notify = useNotifyError();
  const [edit, setEdit] = useState(false);
  const tagCatalog = useCustomerTagCatalog();
  const customerTags = useCustomerTags(c.id);
  const addTag = useAddCustomerTag(c.id);
  const removeTag = useRemoveCustomerTag(c.id);
  const notePages = useCustomerNotes(c.id);
  const addNote = useAddCustomerNote(c.id);
  const followUpPages = useCustomerFollowUps({ customerId: c.id });
  const createFollowUp = useCreateCustomerFollowUp(c.id);
  const updateFollowUp = useUpdateCustomerFollowUp(c.id);
  const deleteFollowUp = useDeleteCustomerFollowUp(c.id);
  const anonymise = useAnonymiseCustomer(c.id);
  const exportData = useMutation({
    mutationFn: () => exportCustomerData(c.id),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (error) => notify(error, { fallback: 'Customer export failed. Try again.' }),
  });
  const notes = notePages.data?.pages.flatMap((page) => page.items) ?? [];
  const followUps = followUpPages.data?.pages.flatMap((page) => page.items) ?? [];
  const tel = telHref(c.phone);
  const mail = mailtoHref(c.email);
  const wa = whatsappDigitsLink(c.whatsapp);

  const columns: Column<AdminOrderSummary>[] = [
    { id: 'number', header: 'Order no.', priority: 'primary', className: 'whitespace-nowrap', cell: (o) => <TextLink href={`/orders/${o.id}`}><OrderNumber number={o.number} /></TextLink> },
    { id: 'total', header: 'Total', numeric: true, priority: 'primary', cell: (o) => f.money(o.totalCents) },
    { id: 'status', header: 'Status', priority: 'primary', cell: (o) => <StatusPill status={o.status} size="sm" /> },
    { id: 'date', header: 'Date', cell: (o) => <time dateTime={o.placedAt} title={f.dateTime(o.placedAt)} className="tabular-nums">{f.relative(o.placedAt)}</time> },
    { id: 'items', header: 'Items', className: 'max-w-[10rem]', cell: (o) => <span className="block truncate" title={o.itemsSummary}>{o.itemsSummary}</span> },
  ];

  return (
    <>
      <PageHeader
        title={c.name}
        documentTitle={`Customer ${c.name}`}
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: c.name }]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEdit(true)}>
              Edit customer
            </Button>
            <Button variant="primary" href={`/orders/new?customerId=${c.id}`} leftIcon={<Plus size={18} aria-hidden="true" />}>
              New order for this customer
            </Button>
          </>
        }
      />
      {c.warning ? (
        <Banner variant="warning" className="mb-4" title={`${c.returnedCount} returned orders`}>
          This customer has returned {c.returnedCount} orders. Consider confirming by phone before sending the next one.
        </Banner>
      ) : null}

      {/* Stat tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Orders" value={c.orderCount} />
        <StatTile label="Lifetime value" value={f.money(c.lifetimeValueCents)} />
        <StatTile label="Average order" value={f.money(c.averageOrderValueCents)} />
        <StatTile label="First order" value={c.firstOrderAt ? f.date(c.firstOrderAt) : '—'} />
        <StatTile label="Last order" value={c.lastOrderAt ? f.date(c.lastOrderAt) : '—'} />
        <StatTile label="Favourite Stimpie" value={c.favouriteStimpie ?? '—'} subtext={c.favouriteStimpieType ?? undefined} />
        <StatTile label="Favourite colour" value={c.favouriteColor ?? '—'} swatch={c.favouriteColorHex} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="contact-h" className="rounded-lg border border-base bg-surface-base p-4">
            <h2 id="contact-h" className="mb-2 text-h5">Contact</h2>
            <ContactRow label="Email" actions={c.email ? <><CopyButton text={c.email} label="Copy email" iconOnly variant="ghost" size="sm" />{mail ? <Button variant="ghost" size="sm" iconOnly href={mail} aria-label="Send an email"><Mail size={18} aria-hidden="true" /></Button> : null}</> : null}>
              {c.email ?? <span className="text-fg-muted">No email on file</span>}
            </ContactRow>
            <ContactRow label="Phone" actions={<><CopyButton text={c.phone} label="Copy phone" iconOnly variant="ghost" size="sm" />{tel ? <Button variant="ghost" size="sm" iconOnly href={tel} aria-label="Call"><Phone size={18} aria-hidden="true" /></Button> : null}</>}>
              <span className="tabular-nums">{c.phone}</span>
            </ContactRow>
            <ContactRow label="WhatsApp" actions={<><CopyButton text={c.whatsapp} label="Copy WhatsApp number" iconOnly variant="ghost" size="sm" />{wa ? <Button variant="ghost" size="sm" iconOnly href={wa} target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp chat"><MessageCircle size={18} aria-hidden="true" /></Button> : null}</>}>
              <span className="tabular-nums">{c.whatsapp}</span>
            </ContactRow>
            <ContactRow label="Area">
              {c.area ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <MapPin size={14} aria-hidden="true" className="text-fg-muted" />
                  {c.area.name}
                </span>
              ) : (
                <span className="text-fg-muted">No area on file</span>
              )}
            </ContactRow>
          </section>

          <CustomerTagsPanel
            tags={(customerTags.data ?? []).map((tag) => ({ key: String(tag.id), label: tag.name, color: tag.color }))}
            options={(tagCatalog.data ?? []).map((tag) => tag.name)}
            loading={customerTags.isPending}
            loadError={customerTags.isError && customerTags.data === undefined ? 'Could not load this customer’s tags.' : undefined}
            onRetry={() => void customerTags.refetch()}
            optionsLoading={tagCatalog.isPending}
            saving={addTag.isPending || removeTag.isPending}
            onAdd={(name) => addTag.mutateAsync(name)}
            onRemove={(key) => removeTag.mutateAsync(Number(key))}
          />

          <section aria-labelledby="optout-h" className="rounded-lg border border-base bg-surface-base p-4">
            <h2 id="optout-h" className="mb-2 text-h5">Bulk messages</h2>
            <OptOutSwitch customer={c} />
          </section>

          <CustomerConsentPanel
            channels={[
              { label: 'Email marketing', granted: c.emailConsent, updatedAt: c.consentUpdatedAt },
              { label: 'WhatsApp marketing', granted: c.whatsappConsent, updatedAt: c.consentUpdatedAt },
            ]}
            unsubscribedAt={c.unsubscribedAt}
            signups={(c.signups ?? []).map((signup) => ({ key: String(signup.id), channel: signup.channel, dropName: signup.dropName, signedUpAt: signup.signedUpAt }))}
          />

          <CustomerNotesPanel
            legacyNote={c.notes}
            notes={notes.map((note) => ({ key: String(note.id), body: note.body, author: note.userName, createdAt: note.createdAt }))}
            loading={notePages.isPending}
            loadError={notePages.isError && notePages.data === undefined ? 'Could not load customer notes.' : undefined}
            onRetry={() => void notePages.refetch()}
            hasMore={notePages.hasNextPage}
            loadingMore={notePages.isFetchingNextPage}
            onLoadMore={() => void notePages.fetchNextPage()}
            saving={addNote.isPending}
            onAdd={(body) => addNote.mutateAsync(body)}
          />

          <CustomerFollowUpsPanel
            items={followUps.map((followUp) => ({ key: String(followUp.id), dueAt: followUp.dueAt, note: followUp.note, done: followUp.doneAt !== null }))}
            loading={followUpPages.isPending}
            loadError={followUpPages.isError && followUpPages.data === undefined ? 'Could not load customer follow-ups.' : undefined}
            onRetry={() => void followUpPages.refetch()}
            hasMore={followUpPages.hasNextPage}
            loadingMore={followUpPages.isFetchingNextPage}
            onLoadMore={() => void followUpPages.fetchNextPage()}
            saving={createFollowUp.isPending || updateFollowUp.isPending || deleteFollowUp.isPending}
            onCreate={(date, note) => {
              const dueAt = zonedInputToIso(`${date}T09:00`);
              if (!dueAt) throw new Error('Choose a valid follow-up date.');
              return createFollowUp.mutateAsync({ dueAt, note });
            }}
            onSetDone={(key, done) => updateFollowUp.mutateAsync({ id: Number(key), done })}
            onDelete={(key) => deleteFollowUp.mutateAsync(Number(key))}
          />

          <section aria-labelledby="recent-orders-h" className="min-w-0 rounded-lg border border-base bg-surface-base p-4">
            <h2 id="recent-orders-h" className="mb-3 text-h5">Recent orders</h2>
            <DataTable
              caption={`Recent orders of ${c.name}`}
              columns={columns}
              rows={c.recentOrders}
              getRowId={(o) => o.id}
              stickyHeader={false}
              density="dense"
              empty={<p className="p-4 text-fg-muted">No orders yet.</p>}
            />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="acquisition-h" className="rounded-lg border border-base bg-surface-base p-4">
            <h2 id="acquisition-h" className="mb-3 text-h5">First-touch acquisition</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-body-sm text-fg-muted">Source</dt><dd className="mt-1 font-medium">{c.firstUtmSource ?? c.firstSource ?? 'Unknown'}</dd></div>
              <div><dt className="text-body-sm text-fg-muted">Campaign</dt><dd className="mt-1 font-medium">{c.firstUtmCampaign ?? 'Unknown'}</dd></div>
              <div><dt className="text-body-sm text-fg-muted">Medium</dt><dd className="mt-1 font-medium">{c.firstUtmMedium ?? 'Unknown'}</dd></div>
              <div><dt className="text-body-sm text-fg-muted">First seen</dt><dd className="mt-1 font-medium">{c.firstTouchAt ? <time dateTime={c.firstTouchAt} title={f.dateTime(c.firstTouchAt)}>{f.date(c.firstTouchAt)}</time> : 'Unknown'}</dd></div>
            </dl>
            {safeReferrer(c.firstReferrer) ? <a className="mt-3 inline-block text-body-sm text-link underline" href={safeReferrer(c.firstReferrer)!} target="_blank" rel="noopener noreferrer">Open first referrer</a> : null}
          </section>
          <CustomerTimelineSection customerId={c.id} />
        </div>
      </div>

      <CustomerPrivacyActions
        exporting={exportData.isPending}
        onExport={() => exportData.mutateAsync()}
        onAnonymise={async () => {
          await anonymise.mutateAsync();
          toast.success('Customer data anonymised. Order records remain for accounting.');
          navigate('/customers');
        }}
      />

      <EditCustomerDialog customer={c} open={edit} onClose={() => setEdit(false)} />
    </>
  );
}

function safeReferrer(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the name.').max(80, 'Use at most 80 characters.'),
  email: optionalEmailSchema(),
  whatsapp: z.string().trim().min(1, 'Enter a WhatsApp number.').max(40, 'That number is too long.'),
  notes: z.string().max(2000, 'Use at most 2000 characters.'),
});
type Values = z.infer<typeof schema>;

/** `PATCH /admin/customers/:id`. The phone is not editable: customers are matched by phone. */
function EditCustomerDialog({ customer, open, onClose }: { customer: Customer; open: boolean; onClose: () => void }) {
  const update = useUpdateCustomer(customer.id);
  const toast = useToast();
  const initial: Values = { name: customer.name, email: customer.email ?? '', whatsapp: customer.whatsapp, notes: customer.notes ?? '' };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  useEffect(() => {
    if (open) form.reset(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit customer"
      size="md"
      closeOnBackdrop={!form.formState.isSubmitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="edit-customer-form" variant="primary" loading={form.formState.isSubmitting}>
            Save customer
          </Button>
        </>
      }
    >
      <AdminForm
        form={form}
        id="edit-customer-form"
        autoComplete="off"
        className="flex flex-col gap-4"
        onSubmit={async (v) => {
          const body: { name?: string; email?: string | null; whatsapp?: string; notes?: string | null } = {};
          if (v.name !== initial.name) body.name = v.name;
          if (v.email !== initial.email) body.email = v.email === '' ? null : v.email;
          if (v.whatsapp !== initial.whatsapp) body.whatsapp = v.whatsapp;
          if (v.notes !== initial.notes) body.notes = v.notes.trim() === '' ? null : v.notes;
          if (Object.keys(body).length > 0) await update.mutateAsync(body);
          toast.success('Customer saved.');
          onClose();
        }}
      >
        <TextField name="name" label="Name" required />
        <TextField name="email" label="Email" type="email" inputMode="email" optional />
        <TextField name="whatsapp" label="WhatsApp" type="tel" inputMode="tel" required />
        <TextAreaField name="notes" label="Notes" optional rows={4} maxLength={2000} showCount hint="Internal. Plain text." />
        <p className="text-body-sm text-fg-muted">The phone number can&apos;t be changed: customers are matched by phone.</p>
      </AdminForm>
    </Modal>
  );
}

/** "Don't send bulk email or WhatsApp to this person": bulk sends skip them on the server. Order emails are unaffected. */
function OptOutSwitch({ customer }: { customer: Customer }) {
  const update = useUpdateCustomer(customer.id);
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Don't send bulk messages"
        checked={customer.optedOut}
        disabled={update.isPending}
        onChange={(optedOut) =>
          update.mutate(
            { marketingOptOut: optedOut },
            { onSuccess: () => toast.success(optedOut ? 'Opted out of bulk messages.' : 'Bulk messages allowed again.'), onError: () => toast.error("Couldn't save. Try again.") },
          )
        }
      />
      <p className="text-body-sm text-fg-muted">Turn this on when the customer asks to stop. Order updates (confirmed, out for delivery) are still sent.</p>
    </div>
  );
}
