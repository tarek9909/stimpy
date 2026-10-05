import { useQuery } from '@tanstack/react-query';
import { Pill, Skeleton, Tabs, TabPanel } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { PageHeader } from '../../components/PageHeader';
import { QueryBoundary } from '../../components/QueryBoundary';
import { type ParamDef, useUrlState } from '../../lib/urlState';
import { AccountTab } from './AccountTab';
import { BusinessTab } from './BusinessTab';
import { CustomerEmailTab } from './CustomerEmailTab';
import { DeliveryTab } from './DeliveryTab';
import { NotificationsTab } from './NotificationsTab';

const TABS = ['account', 'business', 'delivery', 'notifications', 'customer-email'] as const;
type TabId = (typeof TABS)[number];

const tabParam: ParamDef<TabId> = {
  defaultValue: 'account',
  parse: (raw) => {
    if (raw === 'fees' || raw === 'delivery-fee' || raw === 'delivery-fees') return 'delivery';
    if (raw !== null && (TABS as readonly string[]).includes(raw)) return raw as TabId;
    return 'account';
  },
  serialize: (v) => (v === 'account' ? null : v),
  equals: (a, b) => a === b,
};

const params = { tab: tabParam };

function SettingsSkeleton() {
  return (
    <div className="max-w-3xl space-y-4">
      <Skeleton variant="rect" className="h-40" />
      <Skeleton variant="rect" className="h-56" />
    </div>
  );
}

/** Settings (dashboard-pages 15): Account, Business, Delivery fees, Notifications, Customer email; Users is a disabled "Later". */
export default function SettingsPage() {
  const [{ tab }, setParams] = useUrlState(params);
  const settings = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings')),
    staleTime: 5 * 60_000,
  });

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs
        aria-label="Settings sections"
        tabs={[
          { id: 'account', label: 'Account' },
          { id: 'business', label: 'Business' },
          { id: 'delivery', label: 'Delivery fees' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'customer-email', label: 'Customer email' },
          {
            id: 'users',
            disabled: true,
            label: (
              <>
                Users <Pill tone="cream">Later</Pill>
              </>
            ),
          },
        ]}
        value={tab}
        onChange={(id) => setParams({ tab: id as (typeof TABS)[number] })}
      >
        <TabPanel tabId="account" className="pt-6 outline-none">
          <AccountTab />
        </TabPanel>
        <TabPanel tabId="business" className="pt-6 outline-none">
          <QueryBoundary query={settings} skeleton={<SettingsSkeleton />}>
            {(s) => <BusinessTab settings={s} />}
          </QueryBoundary>
        </TabPanel>
        <TabPanel tabId="delivery" className="pt-6 outline-none">
          <DeliveryTab />
        </TabPanel>
        <TabPanel tabId="notifications" className="pt-6 outline-none">
          <QueryBoundary query={settings} skeleton={<SettingsSkeleton />}>
            {(s) => <NotificationsTab settings={s} />}
          </QueryBoundary>
        </TabPanel>
        <TabPanel tabId="customer-email" className="pt-6 outline-none">
          <QueryBoundary query={settings} skeleton={<SettingsSkeleton />}>
            {(s) => <CustomerEmailTab settings={s} />}
          </QueryBoundary>
        </TabPanel>
      </Tabs>
    </>
  );
}
