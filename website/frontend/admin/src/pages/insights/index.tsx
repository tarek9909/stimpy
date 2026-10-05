import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ErrorState, SegmentedControl, Skeleton, Tabs } from '@stimpy/ui';
import { api, unwrap, type Schemas } from '../../api/client';
import { describeError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { ChartCard, ColumnChart, HBarChart, type BarRow } from '../../components/charts';
import { DataTable, type Column, type SortState } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { RangeSelector, useRangeState } from '../../components/RangeSelector';
import { useFormatters } from '../../lib/format';
import { formatPercent, SOURCE_LABELS, WEEKDAY_LABELS, type DateRange } from '../../lib/ranges';
import { enumParam, useUrlState } from '../../lib/urlState';

type Sales = Schemas['InsightsSales'];
type Products = Schemas['InsightsProducts'];
type Customers = Schemas['InsightsCustomers'];
type Acquisition = Schemas['InsightsAcquisition'];

const q = (r: DateRange) => ({ from: r.from ?? undefined, to: r.to ?? undefined });
const useSales = (r: DateRange) => useQuery({ queryKey: queryKeys.insights('sales', r), queryFn: () => unwrap(api.GET('/api/v1/admin/insights/sales', { params: { query: q(r) } })), staleTime: 30_000, placeholderData: (p) => p });
const useProducts = (r: DateRange) => useQuery({ queryKey: queryKeys.insights('products', r), queryFn: () => unwrap(api.GET('/api/v1/admin/insights/products', { params: { query: q(r) } })), staleTime: 30_000, placeholderData: (p) => p });
const useCustomers = (r: DateRange) => useQuery({ queryKey: queryKeys.insights('customers', r), queryFn: () => unwrap(api.GET('/api/v1/admin/insights/customers', { params: { query: q(r) } })), staleTime: 30_000, placeholderData: (p) => p });
const useAcquisition = (r: DateRange) => useQuery({ queryKey: queryKeys.insights('acquisition', r), queryFn: () => unwrap(api.GET('/api/v1/admin/insights/acquisition', { params: { query: q(r) } })), staleTime: 30_000, placeholderData: (p) => p });

const NOT_ENOUGH = <EmptyState title="Not enough data yet for this range" text="Insights use delivered orders. Try a wider range." headingLevel={3} />;

function TabState<T>({ query, children, isEmpty }: { query: ReturnType<typeof useQuery<T>>; children: (d: T) => React.ReactNode; isEmpty?: (d: T) => boolean }) {
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton variant="rect" className="h-64" />
        <Skeleton variant="rect" className="h-48" />
      </div>
    );
  }
  if (query.isError && !query.data) {
    const info = describeError(query.error, 'read');
    return <ErrorState title="Couldn't load these insights" text={info.message} requestId={info.unexpected ? info.reference : null} onRetry={() => void query.refetch()} retryLoading={query.isFetching} />;
  }
  const d = query.data as T;
  return isEmpty?.(d) ? NOT_ENOUGH : <>{children(d)}</>;
}

/** Simple data table (also the "Show data" alternative of each chart). */
function GridTable<R>({ caption, columns, rows, getId }: { caption: string; columns: Column<R>[]; rows: R[]; getId: (r: R) => string | number }) {
  return <DataTable caption={caption} columns={columns} rows={rows} getRowId={getId} density="dense" stickyHeader={false} />;
}

function SalesTab({ range }: { range: DateRange }) {
  const query = useSales(range);
  const f = useFormatters();
  const [metric, setMetric] = useState<'orders' | 'revenue'>('revenue');
  const [sort, setSort] = useState<SortState>({ field: 'orders', direction: 'desc' });
  return (
    <TabState query={query} isEmpty={(d) => d.series.every((s) => s.orders === 0) && d.byDrop.length === 0 && d.bySource.every((s) => s.orders === 0)}>
      {(d: Sales) => {
        const seriesPoints = d.series.map((s) => ({
          label: s.date.slice(5).replace('-', '/'),
          value: metric === 'orders' ? s.orders : s.revenueCents,
          tooltip: `${s.date}: ${s.orders} ${s.orders === 1 ? 'order' : 'orders'}, ${f.money(s.revenueCents)}`,
        }));
        const fmtMetric = (v: number) => (metric === 'orders' ? String(v) : f.money(v).replace('.00', ''));
        const weekdays = [0, 1, 2, 3, 4, 5, 6].map((w) => ({ label: WEEKDAY_LABELS[w] as string, value: d.byWeekday.find((x) => x.weekday === w)?.orders ?? 0 }));
        const sourceRows: BarRow[] = d.bySource.map((s) => ({ label: SOURCE_LABELS[s.source] ?? s.source, value: s.orders, note: f.money(s.revenueCents) }));
        const dropRows: BarRow[] = d.byDrop.map((s) => ({ label: s.dropName, value: s.orders, note: f.money(s.revenueCents) }));
        const campaigns = [...d.byCampaign].sort((a, b) => {
          const dir = sort.direction === 'asc' ? 1 : -1;
          return ((sort.field === 'revenue' ? a.revenueCents - b.revenueCents : a.orders - b.orders)) * dir;
        });
        const campaignCols: Column<Sales['byCampaign'][number]>[] = [
          { id: 'src', header: 'Source', priority: 'primary', cell: (c) => c.utmSource ?? <span className="text-fg-muted">(none)</span> },
          { id: 'camp', header: 'Campaign', priority: 'primary', cell: (c) => c.utmCampaign ?? <span className="text-fg-muted">(none)</span> },
          { id: 'orders', header: 'Orders', sortKey: 'orders', defaultSortDirection: 'desc', numeric: true, cell: (c) => c.orders },
          { id: 'revenue', header: 'Revenue', sortKey: 'revenue', defaultSortDirection: 'desc', numeric: true, cell: (c) => f.money(c.revenueCents) },
        ];
        return (
          <div className="flex flex-col gap-4">
            <ChartCard
              id="series"
              title={metric === 'orders' ? 'Orders per day' : 'Revenue per day'}
              caption="Delivered orders, by delivery day."
              controls={<SegmentedControl aria-label="Metric" value={metric} onChange={(v) => setMetric(v as 'orders' | 'revenue')} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'orders', label: 'Orders' }]} />}
              table={<GridTable caption="Daily orders and revenue" rows={d.series} getId={(s) => s.date} columns={[
                { id: 'date', header: 'Date', priority: 'primary', cell: (s) => s.date },
                { id: 'orders', header: 'Orders', numeric: true, cell: (s) => s.orders },
                { id: 'revenue', header: 'Revenue', numeric: true, cell: (s) => f.money(s.revenueCents) },
              ]} />}
            >
              {seriesPoints.length === 0 ? NOT_ENOUGH : <ColumnChart integerAxis={metric === 'orders'} data={seriesPoints} format={fmtMetric} ariaLabel={`${metric === 'orders' ? 'Orders' : 'Revenue'} per day, ${seriesPoints.length} days`} />}
            </ChartCard>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard id="drops" title="By drop" caption="Orders (revenue beside each bar)." table={<GridTable caption="Sales by drop" rows={d.byDrop} getId={(s) => s.dropName} columns={[
                { id: 'n', header: 'Drop', priority: 'primary', cell: (s) => s.dropName },
                { id: 'o', header: 'Orders', numeric: true, cell: (s) => s.orders },
                { id: 'r', header: 'Revenue', numeric: true, cell: (s) => f.money(s.revenueCents) },
              ]} />}>
                {dropRows.length === 0 ? <p className="text-body-sm text-fg-muted">No drop sales in this range.</p> : <HBarChart rows={dropRows} format={String} ariaLabel="Orders by drop" />}
              </ChartCard>
              <ChartCard id="sources" title="By source" caption="Where orders came from." table={<GridTable caption="Sales by source" rows={d.bySource} getId={(s) => s.source} columns={[
                { id: 'n', header: 'Source', priority: 'primary', cell: (s) => SOURCE_LABELS[s.source] ?? s.source },
                { id: 'o', header: 'Orders', numeric: true, cell: (s) => s.orders },
                { id: 'r', header: 'Revenue', numeric: true, cell: (s) => f.money(s.revenueCents) },
              ]} />}>
                <HBarChart rows={sourceRows} format={String} ariaLabel="Orders by source" />
              </ChartCard>
            </div>
            <ChartCard id="weekday" title="By weekday" caption="Orders by the weekday they were delivered (Sunday first)." table={<GridTable caption="Orders by weekday" rows={weekdays} getId={(w) => w.label} columns={[
              { id: 'd', header: 'Weekday', priority: 'primary', cell: (w) => w.label },
              { id: 'o', header: 'Orders', numeric: true, cell: (w) => w.value },
            ]} />}>
              <ColumnChart data={weekdays} format={String} ariaLabel="Orders by weekday" height={200} integerAxis />
            </ChartCard>
            <section aria-labelledby="campaigns" className="flex flex-col gap-2">
              <h2 id="campaigns" className="text-h5">By campaign</h2>
              <p className="text-body-sm text-fg-muted">UTM values the website captured on landing and stored on orders. (none) means the visitor came without one.</p>
              <DataTable caption="Sales by campaign" columns={campaignCols} rows={campaigns} getRowId={(c) => `${c.utmSource}|${c.utmCampaign}`} sort={sort} onSortChange={setSort} empty={<EmptyState title="No campaign data in this range" headingLevel={3} />} />
            </section>
          </div>
        );
      }}
    </TabState>
  );
}

function ProductsTab({ range }: { range: DateRange }) {
  const query = useProducts(range);
  const f = useFormatters();
  return (
    <TabState query={query} isEmpty={(d) => d.stimpies.every((s) => s.unitsSold === 0) && d.packMix.every((p) => p.orders === 0) && d.sizes.every((s) => s.units === 0)}>
      {(d: Products) => {
        const ranked = [...d.stimpies].sort((a, b) => b.unitsSold - a.unitsSold || b.revenueCents - a.revenueCents);
        const totalPacks = d.packMix.reduce((s, p) => s + p.orders, 0);
        const packRows: BarRow[] = d.packMix.map((p) => ({ label: p.packName, value: p.orders, note: `${formatPercent(totalPacks ? p.orders / totalPacks : 0)} of pack orders` }));
        return (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard id="stimpies" title="Stimpies ranked" caption="Units sold (revenue beside each bar). Top 10." table={<GridTable caption="Stimpie sales" rows={ranked} getId={(s) => s.name} columns={[
                { id: 'n', header: 'Stimpie', priority: 'primary', cell: (s) => s.name },
                { id: 'u', header: 'Units', numeric: true, cell: (s) => s.unitsSold },
                { id: 'r', header: 'Revenue', numeric: true, cell: (s) => f.money(s.revenueCents) },
              ]} />}>
                <HBarChart rows={ranked.map((s) => ({ label: s.name, value: s.unitsSold, note: f.money(s.revenueCents) }))} format={String} limit={10} ariaLabel="Units sold per Stimpie" />
              </ChartCard>
              <div className="flex flex-col gap-4">
                <ChartCard id="packs" title="Pack mix" caption="Orders per pack." table={<GridTable caption="Pack mix" rows={d.packMix} getId={(p) => p.packName} columns={[
                  { id: 'n', header: 'Pack', priority: 'primary', cell: (p) => p.packName },
                  { id: 'o', header: 'Orders', numeric: true, cell: (p) => p.orders },
                  { id: 's', header: 'Share', numeric: true, cell: (p) => formatPercent(totalPacks ? p.orders / totalPacks : 0) },
                ]} />}>
                  {packRows.length ? <HBarChart rows={packRows} format={String} ariaLabel="Orders per pack" /> : <p className="text-body-sm text-fg-muted">No pack orders in this range.</p>}
                </ChartCard>
                <Card variant="stat" className="p-4" data-testid="attach-rate">
                  <p className="text-body-sm text-fg-muted">Extra Stimpie attach rate</p>
                  <p className="text-h3 font-bold tabular-nums">{formatPercent(d.extraStimpieAttachRate)}</p>
                  <p className="text-body-sm text-fg-muted">share of orders with extra Stimpies</p>
                </Card>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard id="sizes" title="Sizes" caption="Hoodie units sold." table={<GridTable caption="Units by size" rows={d.sizes} getId={(s) => s.label} columns={[
                { id: 'n', header: 'Size', priority: 'primary', cell: (s) => s.label },
                { id: 'u', header: 'Units', numeric: true, cell: (s) => s.units },
              ]} />}>
                <HBarChart rows={d.sizes.map((s) => ({ label: s.label, value: s.units }))} format={String} ariaLabel="Units by size" />
              </ChartCard>
              <ChartCard id="colors" title="Colours" caption="Hoodie units sold." table={<GridTable caption="Units by colour" rows={d.colors} getId={(s) => s.name} columns={[
                { id: 'n', header: 'Colour', priority: 'primary', cell: (s) => s.name },
                { id: 'u', header: 'Units', numeric: true, cell: (s) => s.units },
              ]} />}>
                <HBarChart rows={d.colors.map((s) => ({ label: s.name, value: s.units }))} format={String} ariaLabel="Units by colour" />
              </ChartCard>
            </div>
          </div>
        );
      }}
    </TabState>
  );
}

function CustomersTab({ range }: { range: DateRange }) {
  const query = useCustomers(range);
  return (
    <TabState query={query} isEmpty={(d) => d.byArea.length === 0 && d.repeatRate === 0 && d.deliverySuccessRate === 0 && d.returnRate === 0}>
      {(d: Customers) => (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Repeat rate', d.repeatRate, 'Customers with 2+ delivered orders'],
              ['Delivery success', d.deliverySuccessRate, 'Delivered of all dispatched'],
              ['Return rate', d.returnRate, 'Returned of delivered or returned'],
            ].map(([label, v, hint]) => (
              <Card key={label as string} variant="stat" className="p-4">
                <p className="text-body-sm text-fg-muted">{label as string}</p>
                <p className="text-h3 font-bold tabular-nums">{formatPercent(v as number)}</p>
                <p className="text-body-sm text-fg-muted">{hint as string}</p>
              </Card>
            ))}
          </div>
          <ChartCard id="areas" title="Orders by area" caption="Delivered orders per delivery area." table={<GridTable caption="Orders by area" rows={d.byArea} getId={(a) => a.areaName} columns={[
            { id: 'n', header: 'Area', priority: 'primary', cell: (a) => a.areaName },
            { id: 'o', header: 'Orders', numeric: true, cell: (a) => a.orders },
          ]} />}>
            {d.byArea.length ? <HBarChart rows={d.byArea.map((a) => ({ label: a.areaName, value: a.orders }))} format={String} ariaLabel="Orders by area" /> : <p className="text-body-sm text-fg-muted">No area data in this range.</p>}
          </ChartCard>
        </div>
      )}
    </TabState>
  );
}

function AcquisitionTab({ range }: { range: DateRange }) {
  const query = useAcquisition(range);
  const f = useFormatters();
  return (
    <TabState query={query} isEmpty={(data) => data.bySource.length === 0 && data.byCampaign.length === 0 && data.unmatchedAdSpendCents === 0}>
      {(data: Acquisition) => (
        <div className="flex flex-col gap-4">
          <Card className="p-4"><h2 className="text-h5">Acquisition by first touch</h2><p className="mt-1 text-body-sm text-fg-muted">New customers are grouped by first-touch date. Delivered revenue follows each customer&apos;s first-touch source. Ad spend matches an exact source name, case-insensitively.</p></Card>
          <ChartCard id="acquisition-source" title="Source performance" caption="Cost per customer and ROAS use matched source-level ad spend." table={<GridTable caption="Acquisition source performance" rows={data.bySource} getId={(row) => row.source} columns={[
            { id: 'source', header: 'Source', priority: 'primary', cell: (row) => row.source },
            { id: 'customers', header: 'New customers', numeric: true, cell: (row) => row.customers },
            { id: 'revenue', header: 'Delivered revenue', numeric: true, cell: (row) => f.money(row.revenueCents) },
            { id: 'spend', header: 'Ad spend', numeric: true, cell: (row) => f.money(row.adSpendCents) },
            { id: 'cpa', header: 'Cost / customer', numeric: true, cell: (row) => row.costPerCustomerCents === null ? '—' : f.money(row.costPerCustomerCents) },
            { id: 'roas', header: 'ROAS', numeric: true, cell: (row) => row.roas === null ? '—' : `${row.roas.toFixed(2)}×` },
          ]} />}>
            {data.bySource.length ? <HBarChart rows={data.bySource.map((row) => ({ label: row.source, value: row.revenueCents, note: `${row.customers} new` }))} format={(value) => f.money(value)} ariaLabel="Delivered revenue by first-touch source" /> : <p className="p-4 text-body-sm text-fg-muted">No source data in this range.</p>}
          </ChartCard>
          <ChartCard id="acquisition-campaign" title="Campaign performance" caption="Campaign-level ad spend is not available in the current AdSpend model." table={<GridTable caption="First-touch campaign performance" rows={data.byCampaign} getId={(row) => `${row.source}:${row.campaign}`} columns={[
            { id: 'source', header: 'Source', priority: 'primary', cell: (row) => row.source },
            { id: 'campaign', header: 'Campaign', priority: 'primary', cell: (row) => row.campaign },
            { id: 'customers', header: 'New customers', numeric: true, cell: (row) => row.customers },
            { id: 'revenue', header: 'Delivered revenue', numeric: true, cell: (row) => f.money(row.revenueCents) },
          ]} />}>
            {data.byCampaign.length ? <HBarChart rows={data.byCampaign.map((row) => ({ label: `${row.source} / ${row.campaign}`, value: row.revenueCents }))} format={(value) => f.money(value)} ariaLabel="Delivered revenue by first-touch campaign" /> : <p className="p-4 text-body-sm text-fg-muted">No campaign data in this range.</p>}
          </ChartCard>
          {data.unmatchedAdSpendCents > 0 ? <p className="rounded-md border border-line p-3 text-body-sm text-fg-muted">{f.money(data.unmatchedAdSpendCents)} of ad spend has no exact first-touch source match, so it is left unassigned.</p> : null}
        </div>
      )}
    </TabState>
  );
}

const params = { tab: enumParam(['sales', 'products', 'customers', 'acquisition'] as const, 'sales') };

/** Insights (dashboard-pages 12): Sales / Products / Customers with one shared range (default Last 30 days). */
export default function InsightsPage() {
  const [{ tab }, setParams] = useUrlState(params);
  const range = useRangeState('30d');
  const r = useMemo(() => range.range, [range.range]);
  return (
    <>
      <PageHeader title="Insights" />
      <Tabs
        aria-label="Insight sections"
        tabs={[
          { id: 'sales', label: 'Sales' },
          { id: 'products', label: 'Products' },
          { id: 'customers', label: 'Customers' },
          { id: 'acquisition', label: 'Acquisition' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'sales' | 'products' | 'customers' | 'acquisition' })}
      />
      <div className="flex flex-col gap-4 pt-6">
        <RangeSelector state={range} />
        {tab === 'sales' ? <SalesTab range={r} /> : null}
        {tab === 'products' ? <ProductsTab range={r} /> : null}
        {tab === 'customers' ? <CustomersTab range={r} /> : null}
        {tab === 'acquisition' ? <AcquisitionTab range={r} /> : null}
      </div>
    </>
  );
}
