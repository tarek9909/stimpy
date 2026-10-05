import { Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { enumParam, useUrlState } from '../../lib/urlState';
import { DeliveredTab } from './DeliveredTab';
import { FeesTab } from './FeesTab';
import { OutTab } from './OutTab';

const params = { tab: enumParam(['out', 'delivered', 'fees'] as const, 'out') };

/** Deliveries (dashboard-pages 14): out for delivery, delivered (cash settlement) and fees. No courier integration. */
export default function DeliveriesPage() {
  const [{ tab }, setParams] = useUrlState(params);
  return (
    <>
      <PageHeader title="Deliveries" />
      <Tabs
        aria-label="Delivery sections"
        tabs={[
          { id: 'out', label: 'Out for delivery' },
          { id: 'delivered', label: 'Delivered' },
          { id: 'fees', label: 'Fees' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'out' | 'delivered' | 'fees' })}
      />
      <div className="pt-6">
        {tab === 'out' ? <OutTab /> : null}
        {tab === 'delivered' ? <DeliveredTab /> : null}
        {tab === 'fees' ? <FeesTab /> : null}
      </div>
    </>
  );
}
