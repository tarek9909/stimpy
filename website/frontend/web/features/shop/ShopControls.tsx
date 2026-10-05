'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet, Button, FormField, Select, SegmentedControl, Switch, Tabs, TabPanel } from '@stimpy/ui';
import type { ReactNode } from 'react';
import { shopHref, type ShopParams } from './params';

export interface DropOption {
  slug: string;
  name: string;
}

/** Tabs (Hoodies / Stimpies). The active tab lives in the URL; the server re-renders the matching panel. */
export function ShopTabs({ params, children }: { params: ShopParams; children: ReactNode }) {
  const router = useRouter();
  return (
    <Tabs
      aria-label="Shop sections"
      tabs={[
        { id: 'hoodies', label: 'Hoodies' },
        { id: 'stimpies', label: 'Stimpies' },
      ]}
      value={params.tab}
      onChange={(id) => router.replace(shopHref({ tab: id === 'stimpies' ? 'stimpies' : 'hoodies' }), { scroll: false })}
    >
      <TabPanel tabId={params.tab}>{children}</TabPanel>
    </Tabs>
  );
}

function FilterFields({ params, drops, idPrefix, onChange }: { params: ShopParams; drops: DropOption[]; idPrefix: string; onChange: (next: Partial<ShopParams>) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-body font-medium text-fg">Type</span>
        <SegmentedControl
          aria-label="Type"
          name={`${idPrefix}-type`}
          value={params.type ?? 'ALL'}
          onChange={(v) => onChange({ type: v === 'CORE' || v === 'LIMITED' ? v : null })}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'CORE', label: 'Core' },
            { value: 'LIMITED', label: 'Limited' },
          ]}
          fullWidth
        />
      </div>
      <FormField label="Drop" name={`${idPrefix}-drop`}>
        <Select
          value={params.drop ?? ''}
          onChange={(e) => onChange({ drop: e.target.value || null })}
          options={[{ value: '', label: 'Any drop' }, ...drops.map((d) => ({ value: d.slug, label: d.name }))]}
        />
      </FormField>
      <Switch
        label="Hide sold out"
        checked={params.hideSoldOut}
        onChange={(checked) => onChange({ hideSoldOut: checked })}
      />
    </div>
  );
}

/**
 * Stimpie filters: chips for type, a drop select and a "Hide sold out" switch. Inline on `md`+ (sidebar from `lg`),
 * inside a "Filters" bottom sheet on phones. Every change updates the URL; the server re-renders the grid.
 */
export function StimpieFilters({ params, drops, activeCount }: { params: ShopParams; drops: DropOption[]; activeCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const id = useId();
  const apply = (next: Partial<ShopParams>) => {
    router.replace(shopHref({ ...params, ...next, tab: 'stimpies' }), { scroll: false });
  };
  return (
    <div>
      <div className="md:hidden">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Filters"
          footer={
            <Button variant="dark" fullWidth onClick={() => setOpen(false)}>
              Show results
            </Button>
          }
        >
          <FilterFields params={params} drops={drops} idPrefix={`${id}-sheet`} onChange={apply} />
        </BottomSheet>
      </div>
      <div className="hidden md:block">
        <FilterFields params={params} drops={drops} idPrefix={`${id}-inline`} onChange={apply} />
      </div>
    </div>
  );
}
