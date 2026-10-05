import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Badge, Button, EmptyState, Pill, Skeleton, cn } from '@stimpy/ui';
import { DataTable, type Column } from '../../components/DataTable';
import { QueryBoundary } from '../../components/QueryBoundary';
import { AdjustDialog, type AdjustTarget } from './AdjustDialog';
import { useStockStimpies, type StockStimpie } from './api';

/** Stock -> Stimpies (dashboard-pages 8.2): quantity, reserved, available, low flag; low first, then name. */
export function StimpiesTab({ highlight }: { highlight: number | null }) {
  const query = useStockStimpies();
  const [target, setTarget] = useState<AdjustTarget | null>(null);

  const rows = useMemo(
    () => [...(query.data?.items ?? [])].sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)),
    [query.data],
  );

  const done = useRef(false);
  useEffect(() => {
    if (highlight === null || done.current) return;
    const el = document.querySelector<HTMLElement>(`[data-row-id="${highlight}"]`);
    if (el) {
      done.current = true;
      el.scrollIntoView({ block: 'center' });
    }
  });

  const adjust = (s: StockStimpie) =>
    setTarget({ itemType: 'STIMPIE', itemId: s.stimpieId, name: s.name, quantity: s.quantity, reserved: s.reserved, available: s.available });

  const columns: Column<StockStimpie>[] = [
    { id: 'name', header: 'Name', priority: 'primary', cell: (s) => <span className="font-medium">{s.name}</span> },
    { id: 'available', header: 'Available', numeric: true, priority: 'primary', cell: (s) => <span className="font-bold">{s.available}</span> },
    { id: 'type', header: 'Type', cell: (s) => <Badge kind={s.type === 'CORE' ? 'CORE' : 'LIMITED'} /> },
    { id: 'drop', header: 'Drop', cell: (s) => s.dropName ?? '—' },
    { id: 'quantity', header: 'Quantity', numeric: true, mobileLabel: 'On hand', cell: (s) => s.quantity },
    {
      id: 'reserved',
      header: 'Reserved',
      numeric: true,
      cell: (s) => s.reserved,
    },
    {
      id: 'low',
      header: 'Level',
      mobileLabel: '',
      cell: (s) =>
        s.available <= 0 ? (
          <Pill tone="danger" size="sm" icon={<TriangleAlert size={14} aria-hidden="true" />}>Sold out</Pill>
        ) : s.low ? (
          <Pill tone="butter" size="sm" icon={<TriangleAlert size={14} aria-hidden="true" />}>Low stock</Pill>
        ) : (
          <span className="text-fg-muted">OK</span>
        ),
    },
    {
      id: 'adjust',
      header: 'Adjust',
      mobileLabel: '',
      align: 'right',
      cell: (s) => (
        <Button variant="secondary" size="sm" onClick={() => adjust(s)} aria-label={`Adjust ${s.name}`}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <>
      <QueryBoundary query={query} skeleton={<Skeleton variant="rect" className="h-64" />}>
        {() => (
          <DataTable
            caption="Stimpie stock"
            columns={columns}
            rows={rows}
            getRowId={(s) => s.stimpieId}
            rowLabel={(s) => s.name}
            refreshing={query.isFetching}
            rowClassName={(s) => cn(highlight === s.stimpieId && 'ring-4 ring-inset ring-coral', s.available <= 0 && 'bg-surface')}
            empty={<EmptyState title="No Stimpies yet" text="Create one in Products." action={<Button href="/products?tab=stimpies" variant="secondary">Go to Products</Button>} />}
          />
        )}
      </QueryBoundary>
      <AdjustDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}
