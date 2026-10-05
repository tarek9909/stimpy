'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TabPanel, Tabs, type TabItem } from '@stimpy/ui';

/** Tabs whose active value lives in the URL (`?tab=`). The server re-renders the matching panel. */
export function UrlTabs({
  tabs,
  value,
  label,
  basePath,
  param = 'tab',
  children,
}: {
  tabs: TabItem[];
  value: string;
  label: string;
  basePath: string;
  param?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs
      aria-label={label}
      tabs={tabs}
      value={value}
      onChange={(id) => router.replace(`${basePath}?${param}=${encodeURIComponent(id)}`, { scroll: false })}
    >
      <TabPanel tabId={value} className="pt-6">
        {children}
      </TabPanel>
    </Tabs>
  );
}
