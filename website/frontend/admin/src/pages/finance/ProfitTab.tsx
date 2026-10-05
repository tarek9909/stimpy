import { useMemo, useState } from 'react';
import { Banner, Card, EmptyState, Skeleton, TextLink, cn } from '@stimpy/ui';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { DataTable, type Column, type SortState } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { RangeSelector, type RangeState } from '../../components/RangeSelector';
import { useFormatters } from '../../lib/format';
import { averageProfitCents } from '../../lib/ranges';
import { useProfit, type Profit } from './api';

type Row = Profit['byOrder'][number];

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card variant="stat" className="p-4">
      <p className="text-body-sm text-fg-muted">{label}</p>
      <p className="mt-1 text-h4 font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-body-sm text-fg-muted">{hint}</p> : null}
    </Card>
  );
}

/** Sorts rows client-side (the contract has no sort on `byOrder`). */
export function sortRows(rows: Row[], sort: SortState): Row[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const key = sort.field as keyof Row;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y)) * dir;
  });
}

function ProfitBody({ data }: { data: Profit }) {
  const f = useFormatters();
  const [sort, setSort] = useState<SortState>({ field: 'date', direction: 'desc' });
  const rows = useMemo(() => sortRows(data.byOrder, sort), [data.byOrder, sort]);
  const loss = data.profitCents < 0;
  const avg = averageProfitCents(data.profitCents, data.ordersCount);
  const columns: Column<Row>[] = [
    { id: 'orderNumber', header: 'Order', sortKey: 'orderNumber', priority: 'primary', cell: (r) => <TextLink href={`/orders?q=${encodeURIComponent(r.orderNumber)}`} className="font-mono">{r.orderNumber}</TextLink> },
    { id: 'profit', header: 'Profit', sortKey: 'profitCents', defaultSortDirection: 'desc', numeric: true, priority: 'primary', cell: (r) => <span className={cn('font-bold', r.profitCents < 0 && 'text-fg-danger')}>{f.money(r.profitCents)}</span> },
    { id: 'date', header: 'Delivered', sortKey: 'date', defaultSortDirection: 'desc', cell: (r) => <span className="tabular-nums">{r.date}</span> },
    { id: 'revenue', header: 'Revenue', sortKey: 'revenueCents', defaultSortDirection: 'desc', numeric: true, cell: (r) => f.money(r.revenueCents) },
    { id: 'cost', header: 'Cost', sortKey: 'costCents', defaultSortDirection: 'desc', numeric: true, cell: (r) => f.money(r.costCents) },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body-sm text-fg-muted">{data.note}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Figure label="Revenue" value={f.money(data.revenueCents)} hint="Items on delivered orders" />
        <Figure label="Delivery fees" value={f.money(data.deliveryFeesCents)} hint="Shown separately" />
        <Figure label="Cost of goods" value={f.money(data.costOfGoodsCents)} />
        <Figure label="Expenses" value={f.money(data.expensesCents)} />
        <Figure label="Ad spend" value={f.money(data.adSpendCents)} />
        <div
          className={cn('flex flex-col justify-center rounded-lg border-2 p-4', loss ? 'border-danger' : 'border-success')}
          role="group"
          aria-label={loss ? 'Loss' : 'Profit'}
          data-testid="profit-figure"
        >
          <p className="flex items-center gap-2 text-body-sm font-medium">
            {loss ? <TrendingDown size={18} aria-hidden="true" /> : <TrendingUp size={18} aria-hidden="true" />}
            {loss ? 'Loss' : 'Profit'}
          </p>
          <p className={cn('mt-1 text-h3 font-bold tabular-nums', loss ? 'text-fg-danger' : 'text-fg')}>{f.money(data.profitCents)}</p>
          <p className="text-body-sm text-fg-muted">Revenue &minus; cost of goods &minus; expenses &minus; ad spend</p>
        </div>
      </div>

      <section aria-labelledby="plan-margins" className="rounded-lg border border-base bg-cream p-4">
        <h2 id="plan-margins" className="text-h5">Plan margins</h2>
        <ul className="mt-2 flex flex-col gap-1 text-body tabular-nums">
          <li>Plan: {f.money(data.planMargins.pack35)} on the $35 pack</li>
          <li>Plan: {f.money(data.planMargins.pack45)} on the $45 pack</li>
          <li className="font-medium">Actual so far: {f.money(avg)} average profit per order ({data.ordersCount} {data.ordersCount === 1 ? 'order' : 'orders'})</li>
        </ul>
        <p className="mt-2 text-body-sm text-fg-muted">The plan figures are before delivery, packaging and ads. Your average includes expenses and ad spend in this range.</p>
      </section>

      <section aria-labelledby="by-order" className="flex flex-col gap-3">
        <h2 id="by-order" className="text-h5">By order</h2>
        <DataTable
          caption="Profit by order"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.orderNumber}
          sort={sort}
          onSortChange={setSort}
          empty={<EmptyState title="No delivered orders in this range" text="Orders count here once they are delivered." headingLevel={3} />}
        />
        <p className="text-body-sm text-fg-muted">Per-order profit is revenue minus cost of goods. Expenses and ad spend are not split across orders.</p>
      </section>
    </div>
  );
}

/** Finance -> Profit (dashboard-pages 11.1). */
export function ProfitTab({ range }: { range: RangeState }) {
  const q = useProfit(range.range);
  return (
    <div className="flex flex-col gap-4">
      <RangeSelector state={range} />
      {q.isFetching && !q.isPending ? <span className="sr-only" role="status">Updating</span> : null}
      <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-72" />}>
        {(data) =>
          data.ordersCount === 0 && data.expensesCents === 0 && data.adSpendCents === 0 ? (
            <>
              <EmptyState title="No delivered orders in this range" text="Revenue counts delivered orders. Try a wider range." headingLevel={3} />
              <Banner variant="info">{data.note}</Banner>
            </>
          ) : (
            <ProfitBody data={data} />
          )
        }
      </QueryBoundary>
    </div>
  );
}
