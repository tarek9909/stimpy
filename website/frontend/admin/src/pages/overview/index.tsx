import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, ChevronDown, ChevronRight, ChevronUp, CircleCheck, Clock, DollarSign, Mail, Package, PackageX, ShoppingBag, Table2, Truck, Wallet, type LucideIcon } from 'lucide-react';
import { Button, ProgressBar, Skeleton, StatusPill, TextLink, cn, useUI } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { useOverview, type Overview } from '../../lib/refdata';
import { OrderNumber } from '../orders/parts';
import type { AdminOrderSummary } from '../orders/api';

type Attention = Overview['attention'][number];
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

/** Overview (dashboard-pages 4): today, needs attention, live drop, last 7 days, recent orders. */
export default function OverviewPage() {
  const query = useOverview({ refetchInterval: 60_000 });
  const f = useFormatters();
  const today = new Date();
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: f.timeZone }).format(today);
  return (
    <>
      <PageHeader title="Overview" actions={<div className="overview-date"><CalendarDays size={15} aria-hidden="true" /><time dateTime={today.toISOString()}>{date}</time></div>} />
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
  const cards: Array<{ label: string; value: string; to: string; hint: string; Icon: LucideIcon }> = [
    { label: "Today's revenue", value: f.money(today.revenueCents), to: '/finance?tab=profit', hint: 'Recorded today', Icon: DollarSign },
    { label: 'New orders', value: String(today.newOrders), to: '/orders?status=NEW', hint: 'Awaiting confirmation', Icon: ShoppingBag },
    { label: 'To pack', value: String(today.toPack), to: '/orders?status=TO_PACK', hint: 'Ready to prepare', Icon: Package },
    { label: 'Out for delivery', value: String(today.outForDelivery), to: '/orders?status=OUT_FOR_DELIVERY', hint: 'On the way to customers', Icon: Truck },
    { label: 'Cash to collect', value: f.money(today.cashToCollectCents), to: '/finance?tab=cash', hint: 'Outstanding collections', Icon: Wallet },
  ];
  return (
    <div className="overview-body">
      <section aria-label="Today" className="overview-metrics">
        {cards.map(({ label, value, to, hint, Icon }) => (
          <Link key={label} href={to} className="overview-metric" aria-label={`${label}: ${value}`}>
            <span className="overview-metric-label">{label}<Icon size={16} aria-hidden="true" /></span>
            <strong className="overview-metric-value">{value}</strong>
            <span className="overview-metric-note">{hint}</span>
          </Link>
        ))}
      </section>
      <div className="overview-workspace">
        <div className="overview-side-column">
          <AttentionCard items={data.attention} />
          <div className="overview-drop"><LiveDropCard drop={data.liveDrop} /></div>
        </div>
        <div className="overview-main-column">
          <SalesChart days={data.sales7d} />
          <div className="overview-recent"><RecentOrders orders={data.recentOrders} /></div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children, id, action }: { title: string; children: ReactNode; id: string; action?: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="overview-panel">
      <div className="overview-panel-heading">
        <h2 id={`${id}-h`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------------------- attention */

function AttentionCard({ items }: { items: Attention[] }) {
  const { Link } = useUI();
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 3);
  return (
    <Panel title="Needs attention" id="attention" action={items.length > 0 ? <span className="overview-count">{items.length}</span> : undefined}>
      {items.length === 0 ? (
        <div className="overview-empty !px-0 !py-4"><CircleCheck size={26} aria-hidden="true" /><strong>You're all caught up</strong><p>Nothing needs your attention right now.</p></div>
      ) : (
        <ul id="attention-items" className="overview-attention-list">
          {visibleItems.map((a, i) => {
            const { Icon, label } = ATTENTION_ICON[a.type];
            return (
              <li key={`${a.type}-${a.orderId ?? a.itemId ?? i}-${i}`}>
                <Link href={attentionLink(a)} className="overview-attention-item">
                  <span className="overview-attention-icon"><Icon size={16} aria-hidden="true" /></span>
                  <span className="overview-attention-copy">
                    <small>{label}</small>
                    {a.label}
                  </span>
                  <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-fg-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 3 ? <button type="button" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-caption text-action" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="attention-items">{expanded ? 'Show fewer' : `View all ${items.length} alerts`}{expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}</button> : null}
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
          <p className="text-body-sm text-fg-muted">No active drop</p>
          <TextLink href="/drops" className="mt-1 !text-caption !text-action !no-underline">Plan your next drop <ArrowRight size={13} aria-hidden="true" /></TextLink>
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
      title="Revenue"
      id="sales"
      action={
        <div className="flex items-center gap-2"><span className="text-caption text-fg-muted">Last 7 days</span><Button variant="ghost" size="sm" iconOnly title={showData ? 'Hide daily sales data' : 'Show daily sales data'} aria-label={showData ? 'Hide daily sales data' : 'Show daily sales data'} onClick={() => setShowData((v) => !v)} aria-expanded={showData} aria-controls="daily-sales-data"><Table2 size={15} aria-hidden="true" /></Button></div>
      }
    >
      <div className="overview-sales-summary"><strong>{f.money(total)}</strong><span>from {orders} {orders === 1 ? 'order' : 'orders'}</span></div>
      <div role="img" aria-label={`Revenue per day, last 7 days: ${days.map((d) => `${d.date} ${f.money(d.revenueCents)}`).join(', ')}`} className="overview-chart">
        <div className="overview-chart-lines" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => <div key={fraction} className="overview-chart-line"><span>{f.money(Math.round(Math.max(400, max) * fraction)).replace(/\.00$/, '')}</span></div>)}
        </div>
        <div className="overview-chart-bars">
          {days.map((d) => {
            const lbl = dayLabel(d.date);
            const pct = (d.revenueCents / Math.max(400, max)) * 100;
            return (
              <div key={d.date} className="overview-chart-day" title={`${lbl.weekday} ${lbl.day}: ${f.money(d.revenueCents)}, ${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`}>
                <div className="overview-chart-track"><div className="overview-chart-bar" style={{ height: `${pct}%` }} /></div>
                <span>{lbl.weekday}</span>
              </div>
            );
          })}
        </div>
      </div>
      {total === 0 ? <p className="mt-3 text-caption text-fg-muted">No revenue recorded in the last 7 days.</p> : null}
      {showData ? (
        <table id="daily-sales-data" className="mt-3 w-full text-body-sm">
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
    <Panel title="Recent orders" id="recent" action={<TextLink href="/orders">View all orders <ArrowRight size={13} aria-hidden="true" /></TextLink>}>
      <DataTable
        caption="Recent orders"
        columns={columns}
        rows={orders}
        getRowId={(o) => o.id}
        rowLabel={(o) => o.number}
        density="dense"
        stickyHeader={false}
        empty={<div className="overview-empty"><ShoppingBag size={28} strokeWidth={1.4} aria-hidden="true" /><strong>No orders yet</strong><p>Your first customer order will appear here.</p><TextLink href="/orders/new" className="mt-1 !text-caption !text-action !no-underline">Create an order <ArrowRight size={13} aria-hidden="true" /></TextLink></div>}
        onRowClick={(o) => navigate(`/orders/${o.id}`)}
      />
    </Panel>
  );
}

