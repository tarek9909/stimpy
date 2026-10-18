import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, TriangleAlert, PackageX } from 'lucide-react';
import { Button, EmptyState, Skeleton, cn } from '@stimpy/ui';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useIsMdUp } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { AdjustDialog, type AdjustTarget } from './AdjustDialog';
import { useStockHoodies, type StockCell, type StockHoodies } from './api';

type CellState = 'sold-out' | 'low' | 'ok';

export function cellState(available: number, threshold: number): CellState {
  if (available <= 0) return 'sold-out';
  if (available <= threshold) return 'low';
  return 'ok';
}

function StateTag({ state }: { state: CellState }) {
  if (state === 'sold-out') {
    return (
      <span className="inline-flex items-center gap-1 text-caption font-bold">
        <PackageX size={14} aria-hidden="true" /> Sold out
      </span>
    );
  }
  if (state === 'low') {
    return (
      <span className="inline-flex items-center gap-1 text-caption font-bold">
        <TriangleAlert size={14} aria-hidden="true" /> Low
      </span>
    );
  }
  return null;
}

const STATE_CLASS: Record<CellState, string> = {
  'sold-out': 'bg-danger/10 border-danger text-fg',
  low: 'bg-butter border-butter text-ink',
  ok: 'bg-surface-base border-base text-fg',
};

/** Stock -> Hoodies (dashboard-pages 8.1): one grid per hoodie (colour x size); phone: card per hoodie, accordion per colour. */
export function HoodiesTab({ highlight }: { highlight: number | null }) {
  const query = useStockHoodies();
  const settings = useSettings();
  const threshold = settings.data?.orders.lowStockThreshold ?? 10;
  const [target, setTarget] = useState<AdjustTarget | null>(null);

  return (
    <>
      <QueryBoundary query={query} skeleton={<Skeleton variant="rect" className="h-72" />}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState title="No hoodies yet" text="Create one in Products." action={<Button href="/products?tab=hoodies" variant="secondary">Go to Products</Button>} />
          ) : (
            <div className="flex flex-col gap-6">
              {data.items.map((h) => (
                <HoodieGrid key={h.hoodieId} hoodie={h} threshold={threshold} highlight={highlight} onAdjust={setTarget} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
      <AdjustDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function HoodieGrid({
  hoodie,
  threshold,
  highlight,
  onAdjust,
}: {
  hoodie: StockHoodies['items'][number];
  threshold: number;
  highlight: number | null;
  onAdjust: (t: AdjustTarget) => void;
}) {
  const isMd = useIsMdUp();
  const byKey = new Map(hoodie.cells.map((c) => [`${c.colorId}:${c.sizeId}`, c]));
  const colorName = new Map(hoodie.colors.map((c) => [c.id, c.name]));
  const sizeLabel = new Map(hoodie.sizes.map((s) => [s.id, s.label]));
  const adjust = (cell: StockCell) =>
    onAdjust({
      itemType: 'HOODIE_VARIANT',
      itemId: cell.variantId,
      name: `${hoodie.name}, ${colorName.get(cell.colorId) ?? ''}, ${sizeLabel.get(cell.sizeId) ?? ''}`,
      quantity: cell.quantity,
      available: cell.available,
    });

  // Scroll the highlighted cell (Overview "low stock" link) into view once.
  const done = useRef(false);
  useEffect(() => {
    if (highlight === null || done.current) return;
    const el = document.querySelector<HTMLElement>(`[data-variant-id="${highlight}"]`);
    if (el) {
      done.current = true;
      el.scrollIntoView({ block: 'center' });
    }
  });

  return (
    <section aria-labelledby={`hoodie-${hoodie.hoodieId}`} className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id={`hoodie-${hoodie.hoodieId}`} className="mb-3 text-h4">
        {hoodie.name}
      </h2>
      {hoodie.colors.length === 0 || hoodie.sizes.length === 0 ? <p className="text-body-sm text-fg-muted">No colour and size combinations are assigned yet. Choose them in Products → Hoodies.</p> : null}
      {isMd ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-2 text-center">
            <caption className="sr-only">{hoodie.name} stock by colour and size</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left text-body-sm font-medium text-fg-muted">Colour</th>
                {hoodie.sizes.map((s) => (
                  <th key={s.id} scope="col" className="text-body-sm font-medium text-fg-muted">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hoodie.colors.map((color) => (
                <tr key={color.id}>
                  <th scope="row" className="whitespace-nowrap pr-2 text-left text-body font-medium">
                    <span className="mr-2 inline-block h-4 w-4 rounded-full border border-base align-[-2px]" style={{ backgroundColor: color.hex }} aria-hidden="true" />
                    {color.name}
                  </th>
                  {hoodie.sizes.map((size) => {
                    const cell = byKey.get(`${color.id}:${size.id}`);
                    if (!cell) return <td key={size.id} className="text-fg-muted">—</td>;
                    const state = cellState(cell.available, threshold);
                    return (
                      <td key={size.id}>
                        <button
                          type="button"
                          data-variant-id={cell.variantId}
                          onClick={() => adjust(cell)}
                          aria-label={`${color.name}, ${size.label}: available ${cell.available}, quantity ${cell.quantity}. Adjust stock`}
                          className={cn(
                            'flex min-h-16 w-full min-w-16 flex-col items-center justify-center rounded-md border-2 px-2 py-1 transition hover:border-fg',
                            STATE_CLASS[state],
                            highlight === cell.variantId && 'ring-4 ring-coral ring-offset-2',
                          )}
                        >
                          <span className="text-h4 font-bold leading-none tabular-nums">{cell.available}</span>
                          <span className="mt-1 text-caption tabular-nums text-fg-muted">
                            {cell.quantity} on hand
                          </span>
                          <StateTag state={state} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-caption text-fg-muted">Available to sell is shown above the on-hand quantity. Click a cell to adjust its quantity.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {hoodie.colors.map((color) => (
            <ColorAccordion key={color.id} color={color} hoodie={hoodie} threshold={threshold} highlight={highlight} onAdjust={adjust} />
          ))}
        </div>
      )}
    </section>
  );
}

function ColorAccordion({
  color,
  hoodie,
  threshold,
  highlight,
  onAdjust,
}: {
  color: StockHoodies['items'][number]['colors'][number];
  hoodie: StockHoodies['items'][number];
  threshold: number;
  highlight: number | null;
  onAdjust: (cell: StockCell) => void;
}) {
  const cells = hoodie.sizes.map((s) => hoodie.cells.find((c) => c.colorId === color.id && c.sizeId === s.id)).filter((c): c is StockCell => !!c);
  const hasHighlight = highlight !== null && cells.some((c) => c.variantId === highlight);
  const problems = cells.filter((c) => cellState(c.available, threshold) !== 'ok').length;
  const [open, setOpen] = useState(hasHighlight);
  const id = `acc-${hoodie.hoodieId}-${color.id}`;
  const sizeLabel = new Map(hoodie.sizes.map((s) => [s.id, s.label]));
  return (
    <div className="rounded-md border border-base">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)} className="flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left">
        <span className="flex items-center gap-2 font-medium">
          <span className="inline-block h-4 w-4 rounded-full border border-base" style={{ backgroundColor: color.hex }} aria-hidden="true" />
          {color.name}
          {problems > 0 ? <span className="rounded-sm bg-butter px-1.5 text-caption text-ink">{problems} to check</span> : null}
        </span>
        {open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {open ? (
        <ul id={id} className="divide-y divide-line border-t border-base">
          {cells.map((cell) => {
            const state = cellState(cell.available, threshold);
            return (
              <li
                key={cell.variantId}
                data-variant-id={cell.variantId}
                className={cn('flex items-center justify-between gap-2 px-3 py-2', state === 'sold-out' && 'bg-danger/10', state === 'low' && 'bg-butter', highlight === cell.variantId && 'ring-4 ring-inset ring-coral')}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {sizeLabel.get(cell.sizeId)} <span className="ml-2 tabular-nums">Available {cell.available}</span>
                  </p>
                  <p className="text-body-sm tabular-nums text-fg-muted">
                    (on hand {cell.quantity}) <StateTag state={state} />
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => onAdjust(cell)} aria-label={`Adjust ${color.name}, ${sizeLabel.get(cell.sizeId)}`}>
                  Adjust
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
