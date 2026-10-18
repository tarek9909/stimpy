import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { Button, ErrorState, Select, Skeleton } from '@stimpy/ui';
import { describeError } from '../../api/errors';
import { NotFoundState } from '../../components/QueryBoundary';
import { PageHeader } from '../../components/PageHeader';
import { useFormatters } from '../../lib/format';
import { useSettings } from '../../lib/settings';
import { PRINT_CAP, useMatchingOrderIds, useOrdersByIds, type AdminOrder } from './api';
import { ordersListPath } from './parts';
import {
  PRINT_FILTER_KEYS,
  PRINT_GROUPS,
  PRINT_GROUP_LABEL,
  PRINT_VIEWS,
  PRINT_VIEW_LABEL,
  type PrintGroup,
  type PrintView,
} from './printPath';
import { SOURCES, SOURCE_LABEL, STATUS_LABEL, type OrderStatus } from './status';

function PrintBar({ title, back, controls }: { title: string; back: string; controls?: React.ReactNode }) {
  return (
    <div className="no-print">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: 'Orders', to: back }, { label: title }]}
        actions={
          <Button variant="primary" leftIcon={<Printer size={20} aria-hidden="true" />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      {controls}
    </div>
  );
}

function PrintStates({ query, children }: { query: ReturnType<typeof useOrdersByIds>; children: (orders: AdminOrder[]) => React.ReactNode }) {
  if (query.isPending) return <Skeleton variant="rect" className="h-64" />;
  if (query.isError) {
    const info = describeError(query.error, 'read');
    return <ErrorState title="Couldn't load the orders" text={info.message} requestId={info.unexpected ? info.reference : null} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

/** One shipping label (dashboard-pages 6.2): order number large, name, phone, address, delivery number, cash to collect. */
function LabelCard({ order, compact = false }: { order: AdminOrder; compact?: boolean }) {
  const f = useFormatters();
  return (
    <article
      className={`print-page rounded-lg border-2 border-ink text-ink ${compact ? 'break-inside-avoid p-4 print:p-3' : 'mx-auto max-w-xl p-6 print:p-4'}`}
      aria-label={`Label for ${order.number}`}
    >
      <p className="text-caption uppercase tracking-wide">Order number</p>
      <p className={`font-mono font-bold tabular-nums ${compact ? 'text-h2' : 'text-display'}`}>{order.number}</p>
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
        <span className="text-caption uppercase tracking-wide">Delivery number</span>
        {order.deliveryNumber ? (
          <span className={`font-mono font-bold ${compact ? 'text-h3' : 'text-h2'}`}>{order.deliveryNumber}</span>
        ) : (
          <span className="text-body-sm text-fg-muted print:text-ink">Assigned when sent out for delivery</span>
        )}
      </p>
      <hr className="my-3 border-ink" />
      <p className="text-h3 font-bold">{order.customer.name}</p>
      <p className="text-h5 tabular-nums">{order.contact.phone}</p>
      <p className="mt-2 whitespace-pre-wrap text-h5">{order.delivery.address}</p>
      <p className="text-h5">{order.delivery.areaName}</p>
      {order.delivery.notes ? <p className="mt-2 whitespace-pre-wrap text-body">Note: {order.delivery.notes}</p> : null}
      <hr className="my-3 border-ink" />
      <p className="text-caption uppercase tracking-wide">Cash to collect</p>
      <p className={`font-bold tabular-nums ${compact ? 'text-h2' : 'text-display'}`}>{f.money(order.totalCents)}</p>
    </article>
  );
}

/** One invoice, always on its own page: business, order and customer details, item lines, totals, cash on delivery. */
function InvoiceCard({ order }: { order: AdminOrder }) {
  const f = useFormatters();
  const business = useSettings().data?.business;
  return (
    <article
      className="print-page mx-auto mb-8 max-w-3xl rounded-lg border border-base p-6 text-ink print:mb-0 print:max-w-none print:border-0 print:p-0"
      aria-label={`Invoice ${order.number}`}
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
        <div>
          <p className="text-h2 font-bold">{business?.name ?? 'Invoice'}</p>
          {business?.supportEmail ? <p className="text-body-sm">{business.supportEmail}</p> : null}
          {business?.whatsappNumber ? <p className="text-body-sm tabular-nums">{business.whatsappNumber}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-caption uppercase tracking-wide">Invoice</p>
          <p className="font-mono text-h2 font-bold tabular-nums">{order.number}</p>
          <p className="text-body-sm">{f.date(order.placedAt)}</p>
        </div>
      </header>
      <section className="mt-4 grid grid-cols-2 gap-4 text-body-sm">
        <div>
          <p className="text-caption uppercase tracking-wide">Billed to</p>
          <p className="font-bold">{order.customer.name}</p>
          <p className="tabular-nums">{order.contact.phone}</p>
          {order.contact.email ? <p>{order.contact.email}</p> : null}
        </div>
        <div>
          <p className="text-caption uppercase tracking-wide">Deliver to</p>
          <p className="whitespace-pre-wrap">{order.delivery.address}</p>
          <p>{order.delivery.areaName}</p>
          {order.deliveryNumber ? (
            <p>
              Delivery no. <span className="font-mono">{order.deliveryNumber}</span>
            </p>
          ) : null}
        </div>
      </section>
      <table className="mt-5 w-full border-collapse text-left text-body-sm">
        <caption className="sr-only">Items on invoice {order.number}</caption>
        <thead className="border-b-2 border-ink">
          <tr>
            <th scope="col" className="py-2 pr-2">Item</th>
            <th scope="col" className="px-2 py-2 text-right">Qty</th>
            <th scope="col" className="px-2 py-2 text-right">Unit price</th>
            <th scope="col" className="py-2 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => {
            const details = [it.details.hoodie, it.details.color, it.details.size, ...it.details.stimpies].filter(Boolean).join(' · ');
            return (
              <tr key={it.id} className="break-inside-avoid border-b border-line align-top">
                <td className="py-2 pr-2">
                  {it.name}
                  {details ? <span className="block text-fg-muted print:text-ink">{details}</span> : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{it.qty}</td>
                <td className="px-2 py-2 text-right tabular-nums">{f.money(it.unitPriceCents)}</td>
                <td className="py-2 pl-2 text-right tabular-nums">{f.money(it.lineTotalCents)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="tabular-nums">
          <tr>
            <td colSpan={3} className="pt-3 text-right">Subtotal</td>
            <td className="pt-3 text-right">{f.money(order.subtotalCents)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-right">Delivery</td>
            <td className="text-right">{f.money(order.deliveryFeeCents)}</td>
          </tr>
          <tr className="font-bold">
            <td colSpan={3} className="border-t-2 border-ink pt-2 text-right">Total to pay</td>
            <td className="border-t-2 border-ink pt-2 text-right">{f.money(order.totalCents)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-4 text-body-sm">Payment: cash on delivery.{order.delivery.notes ? ` Note: ${order.delivery.notes}` : ''}</p>
    </article>
  );
}

/** Invoice for one order (`/orders/:id/invoice`). */
export function PrintInvoice() {
  const { id } = useParams();
  const orderId = Number(id);
  const valid = Number.isInteger(orderId) && orderId > 0;
  const query = useOrdersByIds(valid ? [orderId] : []);
  if (!valid) return <NotFoundState what="order" backTo="/orders" backLabel="Back to orders" />;
  return (
    <>
      <PrintBar title="Print invoice" back={ordersListPath()} />
      <PrintStates query={query}>
        {([order]) => (order ? <InvoiceCard order={order} /> : <NotFoundState what="order" backTo="/orders" backLabel="Back to orders" />)}
      </PrintStates>
    </>
  );
}

/** Print label for one order (`/orders/:id/label`). */
export function PrintLabel() {
  const { id } = useParams();
  const orderId = Number(id);
  const valid = Number.isInteger(orderId) && orderId > 0;
  const query = useOrdersByIds(valid ? [orderId] : []);
  if (!valid) return <NotFoundState what="order" backTo="/orders" backLabel="Back to orders" />;
  return (
    <>
      <PrintBar title="Print label" back={ordersListPath()} />
      <PrintStates query={query}>
        {([order]) => (order ? <LabelCard order={order} /> : <NotFoundState what="order" backTo="/orders" backLabel="Back to orders" />)}
      </PrintStates>
    </>
  );
}

/**
 * Batch print (`/orders/print`): either `?ids=1,2,3` (a selection) or the list filters
 * (`?status=PACKED&areaId=3`, every match up to PRINT_CAP). `view` picks the delivery sheet or
 * labels; `group` splits the run into one page per area, status, source, date or delivery number.
 */
export function PrintSheet() {
  const [search, setSearch] = useSearchParams();
  const viewParam = search.get('view') ?? '';
  const groupParam = search.get('group') ?? '';
  const view: PrintView = (PRINT_VIEWS as readonly string[]).includes(viewParam) ? (viewParam as PrintView) : 'sheet';
  const group: PrintGroup = (PRINT_GROUPS as readonly string[]).includes(groupParam) ? (groupParam as PrintGroup) : 'none';
  const ids = useMemo(
    () =>
      (search.get('ids') ?? '')
        .split(',')
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0)
        .slice(0, 100),
    [search],
  );
  const byFilter = ids.length === 0 && PRINT_FILTER_KEYS.some((k) => search.has(k));
  const filters = useMemo(() => {
    if (!byFilter) return null;
    const num = (k: string) => (search.has(k) && Number.isInteger(Number(search.get(k))) ? Number(search.get(k)) : undefined);
    const source = search.get('source');
    return {
      status: search.get('status') || undefined,
      source: SOURCES.find((s) => s === source),
      areaId: num('areaId'),
      dropId: num('dropId'),
      from: search.get('from') || undefined,
      to: search.get('to') || undefined,
      deliveryNumber: search.get('deliveryNumber') || undefined,
      q: search.get('q') || undefined,
      holdExpired: search.get('holdExpired') === 'true' || undefined,
    };
  }, [byFilter, search]);
  const matching = useMatchingOrderIds(filters);
  const printIds = byFilter ? (matching.data?.ids ?? []) : ids;
  const query = useOrdersByIds(printIds);

  const setParam = (key: 'view' | 'group', value: string) =>
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'sheet' || value === 'none') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const truncated = byFilter && matching.data !== undefined && matching.data.total > PRINT_CAP;
  const controls = (
    <div className="flex flex-wrap items-end gap-4 pb-4">
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Print
        <Select value={view} onChange={(e) => setParam('view', e.target.value)} options={PRINT_VIEWS.map((v) => ({ value: v, label: PRINT_VIEW_LABEL[v] }))} />
      </label>
      <label className="flex flex-col gap-1 text-body-sm font-medium">
        Group by
        <Select value={group} onChange={(e) => setParam('group', e.target.value)} options={PRINT_GROUPS.map((g) => ({ value: g, label: PRINT_GROUP_LABEL[g] }))} />
      </label>
      {truncated ? (
        <p role="status" className="text-body-sm text-danger">
          {matching.data!.total} orders match; printing the first {PRINT_CAP}. Narrow the filters to print the rest.
        </p>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (!byFilter && ids.length === 0) {
    body = <NotFoundState what="print run" backTo="/orders" backLabel="Back to orders" />;
  } else if (byFilter && matching.isPending) {
    body = <Skeleton variant="rect" className="h-64" />;
  } else if (byFilter && matching.isError) {
    const info = describeError(matching.error, 'read');
    body = <ErrorState title="Couldn't load the orders" text={info.message} requestId={info.unexpected ? info.reference : null} onRetry={() => void matching.refetch()} />;
  } else if (byFilter && printIds.length === 0) {
    body = <NotFoundState what="matching orders" backTo="/orders" backLabel="Back to orders" />;
  } else {
    body = <PrintStates query={query}>{(orders) => <PrintBatch orders={orders} view={view} group={group} />}</PrintStates>;
  }
  return (
    <>
      <PrintBar title={PRINT_VIEW_LABEL[view]} back={ordersListPath()} controls={controls} />
      {body}
    </>
  );
}

interface OrderGroup {
  key: string;
  title: string | null;
  orders: AdminOrder[];
}

function groupOrders(orders: AdminOrder[], group: PrintGroup, f: ReturnType<typeof useFormatters>): OrderGroup[] {
  if (group === 'none') return [{ key: 'all', title: null, orders }];
  const keyOf = (o: AdminOrder): string => {
    switch (group) {
      case 'area':
        return o.delivery.areaName || 'No area';
      case 'status':
        return STATUS_LABEL[o.status as OrderStatus];
      case 'source':
        return SOURCE_LABEL[o.source];
      case 'date':
        return f.date(o.placedAt);
      case 'delivery':
        return o.deliveryNumber ?? 'No delivery number';
    }
  };
  const map = new Map<string, AdminOrder[]>();
  for (const o of orders) {
    const k = keyOf(o);
    map.set(k, [...(map.get(k) ?? []), o]);
  }
  const entries = [...map.entries()];
  if (group === 'date') entries.sort((a, b) => a[1][0]!.placedAt.localeCompare(b[1][0]!.placedAt));
  else entries.sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([key, list]) => ({ key, title: `${PRINT_GROUP_LABEL[group]}: ${key}`, orders: list }));
}

function PrintBatch({ orders, view, group }: { orders: AdminOrder[]; view: PrintView; group: PrintGroup }) {
  const f = useFormatters();
  const groups = useMemo(() => groupOrders(orders, group, f), [orders, group, f]);
  return (
    <>
      {groups.map((g) =>
        view === 'invoices' ? (
          <section key={g.key} aria-label={g.title ?? 'Invoices'}>
            {g.title ? <h2 className="no-print mb-3 text-h3 font-bold text-ink">{g.title} ({g.orders.length})</h2> : null}
            {g.orders.map((o) => (
              <InvoiceCard key={o.id} order={o} />
            ))}
          </section>
        ) : view === 'labels' ? (
          <section key={g.key} aria-label={g.title ?? 'Labels'} className="print-page">
            {g.title ? (
              <h2 className="mb-3 text-h3 font-bold text-ink">
                {g.title} ({g.orders.length})
              </h2>
            ) : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-3">
              {g.orders.map((o) => (
                <LabelCard key={o.id} order={o} compact />
              ))}
            </div>
          </section>
        ) : (
          <SheetTable key={g.key} orders={g.orders} title={g.title ?? 'Delivery sheet'} />
        ),
      )}
    </>
  );
}

export function SheetTable({ orders, title = 'Delivery sheet' }: { orders: AdminOrder[]; title?: string }) {
  const f = useFormatters();
  const sorted = [...orders].sort((a, b) => (a.deliveryNumber ?? '').localeCompare(b.deliveryNumber ?? '') || a.id - b.id);
  const total = sorted.reduce((sum, o) => sum + o.totalCents, 0);
  return (
    <section aria-label={title} className="print-page mb-8 text-ink print:mb-0">
      <h2 className="mb-2 text-h3 font-bold print:block">{title}</h2>
      <p className="mb-3 hidden text-body-sm print:block">Printed {f.dateTime(new Date().toISOString())}</p>
      <div className="overflow-x-auto rounded-lg border border-base print:border-0">
        <table className="w-full border-collapse text-left text-body-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="border-b-2 border-ink">
            <tr>
              <th scope="col" className="px-2 py-2">Delivery no.</th>
              <th scope="col" className="px-2 py-2">Order no.</th>
              <th scope="col" className="px-2 py-2">Customer</th>
              <th scope="col" className="px-2 py-2">Phone</th>
              <th scope="col" className="px-2 py-2">Address</th>
              <th scope="col" className="px-2 py-2 text-right">Cash due</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => (
              <tr key={o.id} className="break-inside-avoid border-b border-line align-top">
                <td className="px-2 py-2 font-mono">{o.deliveryNumber ?? '—'}</td>
                <td className="px-2 py-2 font-mono tabular-nums">{o.number}</td>
                <td className="px-2 py-2">{o.customer.name}</td>
                <td className="px-2 py-2 tabular-nums">{o.contact.phone}</td>
                <td className="px-2 py-2">
                  <span className="whitespace-pre-wrap">{o.delivery.address}</span>, {o.delivery.areaName}
                  <span className="block text-fg-muted print:hidden">{STATUS_LABEL[o.status as OrderStatus]}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{f.money(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-bold">
              <td className="px-2 py-2" colSpan={5}>
                Total cash to collect ({sorted.length} {sorted.length === 1 ? 'order' : 'orders'})
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{f.money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
