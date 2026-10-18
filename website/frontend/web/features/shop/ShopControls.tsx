'use client';

import { useId, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet, Button, FormField, Select, SegmentedControl, Spinner, Switch, Tabs, TabPanel } from '@stimpy/ui';
import type { ReactNode } from 'react';
import { PendingContent } from '@/components/PendingContent';
import { activeFilterCount, shopHref, type ShopParams } from './params';

export interface DropOption {
  slug: string;
  name: string;
}

/** Tabs (Hoodies / Stimpies). The active tab lives in the URL; the server re-renders the matching panel. */
export function ShopTabs({ params, children }: { params: ShopParams; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useOptimistic(params.tab);
  return (
    <Tabs
      aria-label="Shop sections"
      tabs={[
        { id: 'hoodies', label: 'Hoodies' },
        { id: 'stimpies', label: 'Stimpies' },
      ]}
      value={selected}
      onChange={(id) => startTransition(() => {
        const tab = id === 'stimpies' ? 'stimpies' : 'hoodies';
        setSelected(tab);
        router.replace(shopHref({ tab }), { scroll: false });
      })}
    >
      <TabPanel tabId={selected}>
        <PendingContent pending={pending && selected !== params.tab}>{children}</PendingContent>
      </TabPanel>
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
  const [pending, startTransition] = useTransition();
  const [selected, updateSelected] = useOptimistic(params, (current, next: Partial<ShopParams>) => ({ ...current, ...next }));
  const id = useId();
  const apply = (next: Partial<ShopParams>) => {
    startTransition(() => {
      updateSelected(next);
      router.replace(shopHref({ ...selected, ...next, tab: 'stimpies' }), { scroll: false });
    });
  };
  const count = pending ? activeFilterCount(selected) : activeCount;
  return (
    <div aria-busy={pending || undefined}>
      <div className="md:hidden">
        <Button variant="secondary" onClick={() => setOpen(true)} aria-haspopup="dialog">
          Filters{count > 0 ? ` (${count})` : ''}
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
          <FilterFields params={selected} drops={drops} idPrefix={`${id}-sheet`} onChange={apply} />
        </BottomSheet>
      </div>
      <div className="hidden md:block">
        <FilterFields params={selected} drops={drops} idPrefix={`${id}-inline`} onChange={apply} />
      </div>
      <div className="mt-3 min-h-5 text-body-sm text-fg-muted">
        {pending ? <span className="inline-flex items-center gap-2" role="status"><Spinner size="sm" /> Updating results…</span> : null}
      </div>
    </div>
  );
}
