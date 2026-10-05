import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp, CircleCheck, Circle, Clock, Mail, PackageX, Truck, type LucideIcon } from 'lucide-react';
import { Button, Checkbox, EmptyState, Pill, ProgressBar, Skeleton, StatCard, StatusPill, TextLink, cn, useToast, useUI } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useNotifyError } from '../../api/errors';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { useOverview, type Overview } from '../../lib/refdata';
import { OrderNumber } from '../orders/parts';
import type { AdminOrderSummary } from '../orders/api';

type Attention = Overview['attention'][number];
type SetupItem = Overview['setup']['items'][number];

const COLLAPSE_KEY = 'stimpy.setup.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Where an attention row goes (dashboard-pages 4). The row label is shown verbatim and never parsed. */
export function attentionLink(a: Attention): string {
  switch (a.type) {
    case 'NEW_TOO_LONG':
    case 'OUT_TOO_LONG':
    case 'HOLD_EXPIRED':
      return a.orderId ? `/orders/${a.orderId}` : '/orders';
    case 'EMAIL_FAILED':
      return a.orderId ? `/orders/${a.orderId}` : '/content?tab=emails';
    case 'LOW_STOCK':
      if (a.itemType === 'STIMPIE' && a.itemId) return `/stock?tab=stimpies&highlight=${a.itemId}`;
      if (a.itemType === 'HOODIE_VARIANT' && a.itemId) return `/stock?highlight=${a.itemId}`;
      return '/stock';
    default:
      return '/orders';
  }
}

const ATTENTION_ICON: Record<Attention['type'], { Icon: LucideIcon; label: string }> = {
  NEW_TOO_LONG: { Icon: Clock, label: 'Waiting' },
  OUT_TOO_LONG: { Icon: Truck, label: 'Out too long' },
  HOLD_EXPIRED: { Icon: AlertTriangle, label: 'Hold expired' },
  EMAIL_FAILED: { Icon: Mail, label: 'Email failed' },
  LOW_STOCK: { Icon: PackageX, label: 'Low stock' },
};

/** Overview (dashboard-pages 4): setup checklist, today, needs attention, live drop, last 7 days, recent orders. */
export default function OverviewPage() {
  const query = useOverview({ refetchInterval: 60_000 });
  return (
    <>
      <PageHeader title="Overview" />
      <QueryBoundary query={query} skeleton={<OverviewSkeleton />}>
        {(data) => <OverviewBody data={data} />}
      </QueryBoundary>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} variant="stat" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton variant="rect" className="h-56" />
        <Skeleton variant="rect" className="h-56" />
      </div>
    </div>
  );
}

function OverviewBody({ data }: { data: Overview }) {
  const f = useFormatters();
  const { Link } = useUI();
  const today = data.today;
  const cards: Array<{ label: string; value: string; to?: string; hint?: string }> = [
    { label: 'New orders', value: String(today.newOrders), to: '/orders?status=NEW' },
    { label: 'To pack', value: String(today.toPack), to: '/orders?status=TO_PACK' },
    { label: 'Out for delivery', value: String(today.outForDelivery), to: '/orders?status=OUT_FOR_DELIVERY' },
    { label: 'Cash to collect', value: f.money(today.cashToCollectCents), to: '/finance?tab=cash' },
    { label: "Today's revenue", value: f.money(today.revenueCents) },
  ];
  return (
    <div className="flex flex-col gap-4">
      {!data.setup.complete ? <SetupCard setup={data.setup} /> : null}
      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c, i) => {
          const card = <StatCard label={c.label} value={c.value} className={cn(c.to && 'transition hover:border-fg')} />;
          return (
            <div key={c.label} className={cn(i === cards.length - 1 && 'col-span-2 lg:col-span-1')}>
              {c.to ? (
                <Link href={c.to} className="block rounded-lg no-underline" aria-label={`${c.label}: ${c.value}`}>
                  {card}
                </Link>
              ) : (
                card
              )}
            </div>
          );
        })}
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <AttentionCard items={data.attention} />
          <RecentOrders orders={data.recentOrders} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <LiveDropCard drop={data.liveDrop} />
          <SalesChart days={data.sales7d} />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, id, action }: { title: string; children: React.ReactNode; id: string; action?: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-lg border border-base bg-surface-base p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="text-h5">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------------------ setup */

function SetupCard({ setup }: { setup: Overview['setup'] }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const required = setup.items.filter((i) => i.required);
  const done = required.filter((i) => i.status === 'DONE').length;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  };
  return (
    <section aria-labelledby="setup-h" className="rounded-lg border-2 border-fg bg-cream p-4" data-testid="setup-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="setup-h" className="text-h4">
            Get ready to sell
          </h2>
          <p className="text-body-sm text-fg-muted tabular-nums">
            {done} of {required.length} required steps done
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={!collapsed} aria-controls="setup-items" rightIcon={collapsed ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}>
          {collapsed ? 'Show steps' : 'Hide steps'}
        </Button>
      </div>
      <ProgressBar className="mt-3" value={done} max={Math.max(1, required.length)} aria-label="Required setup steps done" />
      {!collapsed ? (
        <ul id="setup-items" className="mt-3 divide-y divide-line rounded-md border border-base bg-surface-base">
          {setup.items.map((item) => (
            <SetupRow key={item.key} item={item} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SetupRow({ item }: { item: SetupItem }) {
  const qc = useQueryClient();
  const notify = useNotifyError();
  const mark = useMutation({
    mutationFn: (done: boolean) => unwrap(api.POST('/api/v1/admin/setup/{key}/done', { params: { path: { key: item.key } }, body: { done } })),
    // Pessimistic: the row changes when the overview is refetched after the call succeeded.
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.overview }),
    onError: (e) => notify(e),
  });
  const isDone = item.status === 'DONE';
  const Icon = isDone ? CircleCheck : Circle;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3" data-setup-key={item.key}>
      <Icon size={20} className={isDone ? 'text-success' : 'text-fg-muted'} aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-56">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {item.label}
          <span className={cn('text-caption font-medium', isDone ? 'text-success' : 'text-fg-muted')}>{isDone ? 'Done' : 'To do'}</span>
          {!item.required ? (
            <Pill tone="outline" size="sm">
              Optional
            </Pill>
          ) : null}
        </p>
        <p className="text-body-sm text-fg-muted">{item.hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {item.kind === 'REVIEW' ? (
          <Checkbox label="Mark as done" checked={isDone} disabled={mark.isPending} onChange={(e) => mark.mutate(e.target.checked)} className="!min-h-0" />
        ) : null}
        <Button variant="secondary" size="sm" href={item.link}>
          Open
        </Button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------------------- attention */

function AttentionCard({ items }: { items: Attention[] }) {
  const { Link } = useUI();
  return (
    <Panel title="Needs attention" id="attention">
      {items.length === 0 ? (
        <p className="text-body text-fg-muted">All clear. Nothing needs your attention.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a, i) => {
            const { Icon, label } = ATTENTION_ICON[a.type];
            return (
              <li key={`${a.type}-${a.orderId ?? a.itemId ?? i}-${i}`}>
                <Link href={attentionLink(a)} className="flex min-h-11 items-center gap-3 rounded-md px-1 py-2 no-underline hover:bg-surface">
                  <Icon size={20} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words text-body-sm">
                    <span className="sr-only">{label}: </span>
                    {a.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------- drop */

/** "3 d 4 h left" from an end instant (display only; the device clock is good enough for a label). */
export function timeLeft(endsAt: string, now: number = Date.now()): string {
  const ms = Date.parse(endsAt) - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'Ended';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} d ${hours} h left`;
  if (hours > 0) return `${hours} h ${minutes % 60} min left`;
  return `${Math.max(1, minutes)} min left`;
}

function LiveDropCard({ drop }: { drop: Overview['liveDrop'] }) {
  const f = useFormatters();
  return (
    <Panel title="Live drop" id="drop" action={drop ? <TextLink href="/drops?tab=live">View drop</TextLink> : undefined}>
      {drop ? (
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium">{drop.name}</p>
          <ProgressBar value={drop.unitsSold} max={Math.max(1, drop.unitsTotal)} aria-label={`${drop.name}: ${drop.unitsSold} of ${drop.unitsTotal} units sold`} />
          <p className="text-body-sm tabular-nums">
            {drop.unitsSold} of {drop.unitsTotal} units sold
          </p>
          <p className="text-body-sm text-fg-muted">{drop.endsAt ? `${timeLeft(drop.endsAt)} (ends ${f.dateTime(drop.endsAt)})` : 'No end date'}</p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-body text-fg-muted">No drop is live.</p>
          <Button variant="secondary" size="sm" href="/drops">
            Plan a drop
          </Button>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------------------------ chart */

function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d),
    day: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d),
  };
}

function SalesChart({ days }: { days: Overview['sales7d'] }) {
  const f = useFormatters();
  const [showData, setShowData] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.revenueCents));
  const total = days.reduce((s, d) => s + d.revenueCents, 0);
  const orders = days.reduce((s, d) => s + d.orders, 0);
  return (
    <Panel
      title="Last 7 days"
      id="sales"
      action={
        <Button variant="ghost" size="sm" onClick={() => setShowData((v) => !v)} aria-expanded={showData}>
          {showData ? 'Hide data' : 'Show data'}
        </Button>
      }
    >
      <p className="mb-3 text-body-sm text-fg-muted tabular-nums">
        {f.money(total)} from {orders} {orders === 1 ? 'order' : 'orders'}
      </p>
      <div role="img" aria-label={`Revenue per day, last 7 days: ${days.map((d) => `${d.date} ${f.money(d.revenueCents)}`).join(', ')}`} className="flex h-44 items-end gap-1.5">
        {days.map((d) => {
          const lbl = dayLabel(d.date);
          const pct = Math.round((d.revenueCents / max) * 100);
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${lbl.weekday} ${lbl.day}: ${f.money(d.revenueCents)}, ${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`}>
              <span className="mb-1 truncate text-center text-[11px] leading-none tabular-nums text-fg-muted">{d.revenueCents > 0 ? f.money(d.revenueCents).replace(/\.00$/, '') : ''}</span>
              <div className="flex flex-1 items-end">
                <div className={cn('w-full rounded-t-sm bg-coral', d.revenueCents === 0 && 'bg-line')} style={{ height: `${Math.max(d.revenueCents > 0 ? 4 : 2, pct)}%` }} />
              </div>
              <span className="mt-1 truncate text-center text-[11px] leading-tight text-fg-muted">{lbl.weekday}</span>
            </div>
          );
        })}
      </div>
      {showData ? (
        <table className="mt-3 w-full text-body-sm">
          <caption className="sr-only">Revenue and orders per day</caption>
          <thead>
            <tr className="border-b border-base text-left text-fg-muted">
              <th scope="col" className="py-1 font-medium">Day</th>
              <th scope="col" className="py-1 text-right font-medium">Orders</th>
              <th scope="col" className="py-1 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-b border-line last:border-b-0">
                <th scope="row" className="py-1 text-left font-normal">{dayLabel(d.date).weekday} {dayLabel(d.date).day}</th>
                <td className="py-1 text-right tabular-nums">{d.orders}</td>
                <td className="py-1 text-right tabular-nums">{f.money(d.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------------- recent */

function RecentOrders({ orders }: { orders: AdminOrderSummary[] }) {
  const f = useFormatters();
  const navigate = useNavigate();
  const columns = useMemo<Column<AdminOrderSummary>[]>(
    () => [
      { id: 'number', header: 'Order no.', priority: 'primary', cell: (o) => <TextLink href={`/orders/${o.id}`} className="whitespace-nowrap"><OrderNumber number={o.number} /></TextLink> },
      { id: 'total', header: 'Total', numeric: true, priority: 'primary', cell: (o) => f.money(o.totalCents) },
      { id: 'status', header: 'Status', priority: 'primary', cell: (o) => <StatusPill status={o.status} size="sm" /> },
      { id: 'customer', header: 'Customer', mobileLabel: '', cell: (o) => <span className="truncate">{o.customerName}</span> },
      
    ],
    [f],
  );
  return (
    <Panel title="Recent orders" id="recent" action={<TextLink href="/orders">All orders</TextLink>}>
      <DataTable
        caption="Recent orders"
        columns={columns}
        rows={orders}
        getRowId={(o) => o.id}
        rowLabel={(o) => o.number}
        density="dense"
        stickyHeader={false}
        empty={<EmptyState title="No orders yet" text="Orders from the website appear here within seconds." />}
        onRowClick={(o) => navigate(`/orders/${o.id}`)}
      />
    </Panel>
  );
}

