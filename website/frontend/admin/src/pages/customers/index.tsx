import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { enumParam, useUrlState } from '../../lib/urlState';
import { CustomerDetailPage } from './CustomerDetail';
import { CustomersList, SubscribersTab } from './CustomersList';
import { CrmCampaigns, type CrmSegmentFilters } from './CrmCampaigns';

const params = { tab: enumParam(['all', 'repeat', 'subscribers', 'segments', 'campaigns'] as const, 'all') };

function CustomersHome() {
  const [{ tab }, setParams] = useUrlState(params);
  const [crmFilters, setCrmFilters] = useState<CrmSegmentFilters>({ tagIds: [] });
  return (
    <>
      {tab === 'all' || tab === 'repeat' || tab === 'subscribers' ? <PageHeader title="Customers" /> : null}
      <Tabs
        aria-label="Customer sections"
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'repeat', label: 'Repeat' },
          { id: 'subscribers', label: 'Subscribers' },
          { id: 'segments', label: 'Segments' },
          { id: 'campaigns', label: 'Campaigns' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as 'all' | 'repeat' | 'subscribers' | 'segments' | 'campaigns' })}
      />
      <div className="pt-6">
        {tab === 'subscribers' ? <SubscribersTab /> : tab === 'segments' || tab === 'campaigns' ? <CrmCampaigns mode={tab} filters={crmFilters} onFiltersChange={setCrmFilters} /> : <CustomersList filter={tab === 'repeat' ? 'repeat' : 'all'} />}
      </div>
    </>
  );
}

/** Customers (dashboard-pages 10): All / Repeat / Subscribers lists and `/customers/:id`. */
export default function CustomersPage() {
  return (
    <Routes>
      <Route index element={<CustomersHome />} />
      <Route path=":id" element={<CustomerDetailPage />} />
    </Routes>
  );
}
