import { lazy, Suspense } from 'react';
import { Skeleton, Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { enumParam, useUrlState } from '../../lib/urlState';
import { AnnouncementTab } from './AnnouncementTab';
import { EmailsTab } from './EmailsTab';
import { FaqTab } from './FaqTab';
import { HomepageTab } from './HomepageTab';
import { PoliciesTab } from './PoliciesTab';

// The Builder tab pulls in the Builder package (and, on demand, Three.js): its own chunk.
const BuilderTab = lazy(() => import('./builder/BuilderTab'));

const TABS = ['announcement', 'faq', 'policies', 'homepage', 'builder', 'emails'] as const;
const params = { tab: enumParam(TABS, 'announcement') };

/** Content (dashboard-pages 13): announcement bar, FAQ, policies, homepage, Builder settings, emails. */
export default function ContentPage() {
  const [{ tab }, setParams] = useUrlState(params);
  return (
    <>
      <PageHeader title="Content" />
      <Tabs
        aria-label="Content sections"
        tabs={[
          { id: 'announcement', label: 'Announcement' },
          { id: 'faq', label: 'FAQ' },
          { id: 'policies', label: 'Policies' },
          { id: 'homepage', label: 'Homepage' },
          { id: 'builder', label: 'Builder' },
          { id: 'emails', label: 'Emails' },
        ]}
        value={tab}
        onChange={(t) => setParams({ tab: t as (typeof TABS)[number] })}
      />
      <div className="pt-6">
        {tab === 'announcement' ? <AnnouncementTab /> : null}
        {tab === 'faq' ? <FaqTab /> : null}
        {tab === 'policies' ? <PoliciesTab /> : null}
        {tab === 'homepage' ? <HomepageTab /> : null}
        {tab === 'builder' ? (
          <Suspense fallback={<Skeleton variant="rect" className="h-[32rem]" />}>
            <BuilderTab />
          </Suspense>
        ) : null}
        {tab === 'emails' ? <EmailsTab /> : null}
      </div>
    </>
  );
}
