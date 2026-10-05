import { useMemo, useState } from 'react';
import { Banner, Button, EmptyState, Skeleton, Switch, TextLink, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { getDeliveredOrdersForDelivery, groupSettlementConfirmation, useSettleDelivery, useSettleOrder } from '../deliveries/api';
import { useCash, type Cash } from './api';

type Group = Cash['groups'][number];

/** A group is settled once every one of its orders is. */
export const groupSettled = (g: Group): boolean => g.orders.length > 0 && g.orders.every((o) => o.settled);

/** Finance -> Cash collection (dashboard-pages 11.2). */
export function CashTab() {
  const q = useCash();
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-72" />}>
      {(data) => <CashBody data={data} />}
    </QueryBoundary>
  );
}

function CashBody({ data }: { data: Cash }) {
  const f = useFormatters();
  const toast = useToast();
  const notify = useNotifyError();
  const settleGroup = useSettleDelivery();
  const settleOrder = useSettleOrder();
  const [confirm, setConfirm] = useState<{ deliveryNumber: string; totalOrders: number; receivedCents: number } | null>(null);
  const [preparingDelivery, setPreparingDelivery] = useState<string | null>(null);
  const [showSettled, setShowSettled] = useState(false);
  const open = useMemo(() => data.groups.filter((g) => !groupSettled(g)), [data.groups]);
  const settled = useMemo(() => data.groups.filter(groupSettled), [data.groups]);

  const settleDelivery = async (deliveryNumber: string, value: boolean) => {
    await settleGroup.mutateAsync({ deliveryNumber, settled: value });
    toast.success(value ? `Delivery ${deliveryNumber} marked settled.` : `Delivery ${deliveryNumber} is no longer settled.`, {
      durationMs: 6000,
      action: { label: 'Undo', onClick: () => settleGroup.mutateAsync({ deliveryNumber, settled: !value }).catch((e) => notify(e)) },
    });
  };
  const settleOne = async (orderId: number, orderNumber: string, value: boolean) => {
    try {
      await settleOrder.mutateAsync({ id: orderId, settled: value });
      toast.success(value ? `${orderNumber} marked settled.` : `${orderNumber} is no longer settled.`, {
        durationMs: 6000,
        action: { label: 'Undo', onClick: () => settleOrder.mutateAsync({ id: orderId, settled: !value }).catch((e) => notify(e)) },
      });
    } catch (e) {
      notify(e);
    }
  };

  const prepareSettlement = async (deliveryNumber: string) => {
    if (preparingDelivery !== null) return;
    setPreparingDelivery(deliveryNumber);
    try {
      const orders = await getDeliveredOrdersForDelivery(deliveryNumber);
      if (orders.length === 0) throw new Error(`No delivered orders were found for delivery ${deliveryNumber}. Refresh and try again.`);
      setConfirm({
        deliveryNumber,
        totalOrders: orders.length,
        receivedCents: orders.reduce((sum, order) => sum + order.cashDueCents, 0),
      });
    } catch (e) {
      notify(e);
    } finally {
      setPreparingDelivery(null);
    }
  };

  const renderGroup = (g: Group) => {
    const key = g.deliveryNumber ?? '__none__';
    const allSettled = groupSettled(g);
    return (
      <section key={key} aria-label={g.deliveryNumber ? `Delivery ${g.deliveryNumber}` : 'No delivery number'} className="rounded-lg border border-base">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base bg-cream px-4 py-3">
          <h3 className="text-h5 tabular-nums">
            {g.deliveryNumber ? <span className="font-mono">Delivery {g.deliveryNumber}</span> : 'No delivery number'} &middot; {g.orders.length} {g.orders.length === 1 ? 'order' : 'orders'} &middot;{' '}
            {allSettled ? 'settled' : `${f.money(g.totalDueCents)} due`}
          </h3>
          {g.deliveryNumber ? (
            allSettled ? (
              <Button variant="ghost" size="sm" onClick={() => void settleDelivery(g.deliveryNumber as string, false).catch((e) => notify(e))}>
                Undo settlement
              </Button>
            ) : (
              <Button variant="secondary" size="sm" loading={preparingDelivery === g.deliveryNumber} disabled={preparingDelivery !== null} onClick={() => void prepareSettlement(g.deliveryNumber as string)}>
                Mark delivery settled
              </Button>
            )
          ) : null}
        </div>
        <ul className="divide-y divide-base">
          {g.orders.map((o) => (
            <li key={o.orderId} className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <TextLink href={`/orders/${o.orderId}`} className="font-mono tabular-nums">{o.orderNumber}</TextLink>
                <span className="ml-3 font-bold tabular-nums">{f.money(o.cashDueCents)}</span>
              </div>
              <Switch
                label={<span className="sr-only">{`${o.orderNumber} cash settled`}</span>}
                checked={o.settled}
                onChange={(v) => void settleOne(o.orderId, o.orderNumber, v)}
                onText="Settled"
                offText="Not settled"
                disabled={settleOrder.isPending}
                className="!min-h-0"
              />
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border-2 border-ink p-4" data-testid="cash-outstanding">
        <p className="text-body-sm font-medium text-fg-muted">Outstanding</p>
        <p className="text-h2 font-bold tabular-nums">{f.money(data.outstandingCents)}</p>
        <p className="text-body-sm text-fg-muted">Cash collected by the courier on delivered orders and not yet handed over.</p>
      </div>
      {data.groups.length === 0 ? (
        <EmptyState title="Nothing to collect" text="Delivered orders with cash due appear here." headingLevel={3} />
      ) : (
        <>
          {open.length === 0 ? <Banner variant="info">Everything is settled.</Banner> : <div className="flex flex-col gap-4">{open.map(renderGroup)}</div>}
          {settled.length > 0 ? (
            <section aria-labelledby="settled-title" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="settled-title" className="text-h5">Settled ({settled.length})</h2>
                <Button variant="ghost" size="sm" aria-expanded={showSettled} onClick={() => setShowSettled((s) => !s)}>
                  {showSettled ? 'Hide settled' : 'Show settled'}
                </Button>
              </div>
              {showSettled ? <div className="flex flex-col gap-4">{settled.map(renderGroup)}</div> : null}
            </section>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Mark delivery settled?"
        description={confirm ? groupSettlementConfirmation(confirm.deliveryNumber, confirm.totalOrders, f.money(confirm.receivedCents)) : null}
        confirmLabel="Mark settled"
        reportErrors={false}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await settleDelivery(confirm.deliveryNumber, true);
          } catch (e) {
            notify(e);
            throw e;
          }
        }}
      />
    </div>
  );
}
