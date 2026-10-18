'use client';

import { useOptimistic, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TabPanel, Tabs, type TabItem } from '@stimpy/ui';
import { PendingContent } from './PendingContent';

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
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(value);
  return (
    <Tabs
      aria-label={label}
      tabs={tabs}
      value={selected}
      onChange={(id) => startTransition(() => {
        setSelected(id);
        router.replace(`${basePath}?${param}=${encodeURIComponent(id)}`, { scroll: false });
      })}
    >
      <TabPanel tabId={selected} className="pt-6">
        <PendingContent pending={pending && selected !== value}>{children}</PendingContent>
      </TabPanel>
    </Tabs>
  );
}
