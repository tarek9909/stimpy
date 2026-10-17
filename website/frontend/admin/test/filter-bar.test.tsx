import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FilterBar } from '../src/components/FilterBar';
import { TestApp } from './helpers';
import { forceDesktop } from './orderFixtures';

afterEach(() => vi.restoreAllMocks());

function Filters() {
  const [source, setSource] = useState('all');
  return (
    <FilterBar
      search={<input aria-label="Search orders" />}
      activeCount={source === 'all' ? 0 : 1}
      onClear={() => setSource('all')}
      actions={<button type="button">Export CSV</button>}
    >
      <label>Source<select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option><option value="WEBSITE">Website</option></select></label>
    </FilterBar>
  );
}

describe('filter toolbar', () => {
  it('keeps search and actions visible while advanced filters are collapsed', () => {
    forceDesktop();
    render(<TestApp routes={[{ path: '/', element: <Filters /> }]} />);
    expect(screen.getByRole('textbox', { name: 'Search orders' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    expect(screen.getByLabelText('Source')).not.toBeVisible();
    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Source')).toBeVisible();
  });

  it('preserves selected filters when collapsed and clears them from the toolbar', () => {
    forceDesktop();
    render(<TestApp routes={[{ path: '/', element: <Filters /> }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'WEBSITE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters (1)' }));
    expect(screen.getByLabelText('Source')).not.toBeVisible();
    expect(screen.getByLabelText('Source')).toHaveValue('WEBSITE');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByLabelText('Source')).toHaveValue('all');
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the mobile sheet workflow and applied filter count', () => {
    forceDesktop();
    const matchMedia = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...matchMedia(query), matches: false }));
    render(<TestApp routes={[{ path: '/', element: <Filters /> }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    fireEvent.change(within(dialog).getByLabelText('Source'), { target: { value: 'WEBSITE' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show results' }));
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
  });
});
