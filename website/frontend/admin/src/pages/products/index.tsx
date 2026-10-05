import { useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, Tabs } from '@stimpy/ui';
import { PageHeader } from '../../components/PageHeader';
import { useIsLgUp } from '../../lib/hooks';
import { enumParam, useUrlState } from '../../lib/urlState';
import { HoodieEditor } from './HoodieEditor';
import { HoodiesTab } from './HoodiesTab';
import { OptionsTab } from './OptionsTab';
import { PackEditor } from './PackEditor';
import { PacksTab } from './PacksTab';
import { SizeChartTab } from './SizeChartTab';
import { StimpieEditor } from './StimpieEditor';
import { StimpiesTab } from './StimpiesTab';
import type { ActiveView } from './shared';

const TABS = ['hoodies', 'stimpies', 'packs', 'options', 'size-chart'] as const;
type Tab = (typeof TABS)[number];
const EDITABLE: ReadonlyArray<Tab> = ['hoodies', 'stimpies', 'packs'];
const params = { tab: enumParam(TABS, 'hoodies'), show: enumParam(['all', 'true', 'false'] as const, 'all') };

/**
 * Products (dashboard-pages 7). `/products?tab=` lists; `/products/<tab>/new` and
 * `/products/<tab>/:id` open the editor: a right drawer over the list from `lg`, a full page below.
 */
function ProductsShell() {
  const urlParams = useParams();
  const navigate = useNavigate();
  const isLg = useIsLgUp();
  const [{ tab: urlTab, show }, setParams] = useUrlState(params);
  const routeTab = urlParams.tab as Tab | undefined;
  const tab: Tab = routeTab && TABS.includes(routeTab) ? routeTab : urlTab;
  const rawId = urlParams.id;
  const editing = !!routeTab && EDITABLE.includes(routeTab) && rawId !== undefined;
  const id = rawId === undefined || rawId === 'new' ? null : Number(rawId);
  const [createdHoodie, setCreatedHoodie] = useState<string | null>(null);
  const close = () => navigate(`/products?tab=${tab}`);
  const view = show as ActiveView;

  const editor = !editing ? null : tab === 'hoodies' ? (
    <HoodieEditor id={id} onClose={close} onCreated={(h) => setCreatedHoodie(h.name)} />
  ) : tab === 'stimpies' ? (
    <StimpieEditor id={id} onClose={close} />
  ) : (
    <PackEditor id={id} onClose={close} />
  );

  // Below `lg` the editor is a page of its own.
  if (editing && !isLg) return <>{editor}</>;

  return (
    <>
      <PageHeader title="Products" />
      <Tabs
        aria-label="Product sections"
        tabs={[
          { id: 'hoodies', label: 'Hoodies' },
          { id: 'stimpies', label: 'Stimpies' },
          { id: 'packs', label: 'Packs' },
          { id: 'options', label: 'Options' },
          { id: 'size-chart', label: 'Size chart' },
        ]}
        value={tab}
        onChange={(t) => (editing ? navigate(`/products?tab=${t}`) : setParams({ tab: t as Tab }))}
      />
      <div className="pt-6">
        {tab === 'hoodies' ? <HoodiesTab view={view} onViewChange={(v) => setParams({ show: v })} /> : null}
        {tab === 'stimpies' ? <StimpiesTab /> : null}
        {tab === 'packs' ? <PacksTab view={view} onViewChange={(v) => setParams({ show: v })} /> : null}
        {tab === 'options' ? <OptionsTab view={view} onViewChange={(v) => setParams({ show: v })} /> : null}
        {tab === 'size-chart' ? <SizeChartTab /> : null}
      </div>
      {editor}
      <Modal
        open={createdHoodie !== null}
        onClose={() => setCreatedHoodie(null)}
        title="Hoodie created"
        size="sm"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreatedHoodie(null)}>Later</Button>
            <Button variant="primary" onClick={() => { setCreatedHoodie(null); navigate('/stock'); }}>Go to Stock</Button>
          </>
        }
      >
        <p>Variants for every active color and size were created with zero stock for {createdHoodie}. Set quantities in Stock.</p>
      </Modal>
    </>
  );
}

export default function ProductsPage() {
  return (
    <Routes>
      <Route index element={<ProductsShell />} />
      <Route path=":tab" element={<ProductsShell />} />
      <Route path=":tab/:id" element={<ProductsShell />} />
    </Routes>
  );
}
