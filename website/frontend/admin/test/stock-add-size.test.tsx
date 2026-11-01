import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@stimpy/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoodiesTab } from '../src/pages/stock/HoodiesTab';

vi.mock('../src/lib/settings', () => ({ useSettings: () => ({ data: undefined }) }));

const size = (id: number, label: string) => ({ id, label, position: id, active: true });
const stock = {
  page: 1,
  pageSize: 100,
  total: 1,
  colors: [{ id: 1, name: 'Black', hex: '#111111' }],
  sizes: [size(1, 'S'), size(5, 'XXL')],
  items: [{
    hoodieId: 9,
    name: 'Stimpy Hoodie',
    colors: [{ id: 1, name: 'Black', hex: '#111111' }],
    sizes: [size(1, 'S')],
    cells: [{ variantId: 3, colorId: 1, sizeId: 1, quantity: 2, reserved: 0, available: 2 }],
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe('stock grid sizes', () => {
  it('offers active sizes the hoodie lacks and adds one to the existing sizes', async () => {
    const patches: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      if (input.method === 'PATCH') {
        patches.push(await input.clone().json());
        return Response.json({});
      }
      const body = input.url.includes('/admin/stock/hoodies') ? stock : {};
      return Response.json(body);
    }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider><MemoryRouter><HoodiesTab highlight={null} /></MemoryRouter></ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add size XXL to Stimpy Hoodie' }));
    await waitFor(() => expect(patches).toEqual([{ sizeIds: [1, 5] }]));
  });
});
