import { Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { enumParam, optionalIntParam, useUrlState } from '../../lib/urlState';
import { HoodiesTab } from './HoodiesTab';
import { MovementsTab } from './MovementsTab';
import { StimpiesTab } from './StimpiesTab';

const params = {
  tab: enumParam(['hoodies', 'stimpies', 'movements'] as const, 'hoodies'),
  highlight: optionalIntParam(),
};

/** Stock (dashboard-pages 8): hoodie grid, Stimpies, movement log; every change is pessimistic and needs a note. */
export default function StockPage() {
  const [{ tab, highlight }, setParams] = useUrlState(params);
  return (
    <>
      <PageHeader title="Stock" />
      <Tabs
        aria-label="Stock sections"
        tabs={[
          { id: 'hoodies', label: 'Hoodies' },
          { id: 'stimpies', label: 'Stimpies' },
          { id: 'movements', label: 'Movements' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'hoodies' | 'stimpies' | 'movements', highlight: null })}
      />
      <div className="pt-6">
        {tab === 'hoodies' ? <HoodiesTab highlight={highlight} /> : null}
        {tab === 'stimpies' ? <StimpiesTab highlight={highlight} /> : null}
        {tab === 'movements' ? <MovementsTab /> : null}
      </div>
    </>
  );
}
