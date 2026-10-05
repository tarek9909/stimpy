import { Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { useRangeState } from '../../components/RangeSelector';
import { enumParam, useUrlState } from '../../lib/urlState';
import { CashTab } from './CashTab';
import { CostsTab } from './CostsTab';
import { ProfitTab } from './ProfitTab';

const params = { tab: enumParam(['profit', 'cash', 'costs'] as const, 'profit') };

/** Finance (dashboard-pages 11): Profit, Cash collection, Costs. The range lives in the URL (`?from&to`, `?all=1`). */
export default function FinancePage() {
  const [{ tab }, setParams] = useUrlState(params);
  const range = useRangeState('month');
  return (
    <>
      <PageHeader title="Finance" />
      <Tabs
        aria-label="Finance sections"
        tabs={[
          { id: 'profit', label: 'Profit' },
          { id: 'cash', label: 'Cash collection' },
          { id: 'costs', label: 'Costs' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'profit' | 'cash' | 'costs' })}
      />
      <div className="pt-6">
        {tab === 'profit' ? <ProfitTab range={range} /> : null}
        {tab === 'cash' ? <CashTab /> : null}
        {tab === 'costs' ? <CostsTab range={range} /> : null}
      </div>
    </>
  );
}
