import { Plus } from 'lucide-react';
import { Route, Routes } from 'react-router-dom';
import { Button, Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { enumParam, useUrlState } from '../../lib/urlState';
import { DropDetailPage } from './DropDetail';
import { ArchiveTab, LiveTab, UpcomingTab } from './DropsTabs';

const params = { tab: enumParam(['upcoming', 'live', 'archive'] as const, 'upcoming') };

function DropsHome() {
  const [{ tab }, setParams] = useUrlState(params);
  return (
    <>
      <PageHeader
        title="Drops"
        actions={
          <Button href="/drops/new" variant="primary" leftIcon={<Plus size={18} aria-hidden="true" />}>
            New drop
          </Button>
        }
      />
      <Tabs
        aria-label="Drop sections"
        tabs={[
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'live', label: 'Live' },
          { id: 'archive', label: 'Archive' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'upcoming' | 'live' | 'archive' })}
      />
      <div className="pt-6">
        {tab === 'upcoming' ? <UpcomingTab /> : null}
        {tab === 'live' ? <LiveTab /> : null}
        {tab === 'archive' ? <ArchiveTab /> : null}
      </div>
    </>
  );
}

/** Drops (dashboard-pages 9): Upcoming / Live / Archive lists, `/drops/new` and `/drops/:id`. */
export default function DropsPage() {
  return (
    <Routes>
      <Route index element={<DropsHome />} />
      <Route path=":id" element={<DropDetailPage />} />
    </Routes>
  );
}
