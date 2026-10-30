import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { PackEditor } from '../src/pages/products/PackEditor';
import { PacksTab } from '../src/pages/products/PacksTab';
import PromotionsPage from '../src/pages/promotions';
import { json, stubFetch, TestApp } from './helpers';

let restore: () => void = () => undefined;
afterEach(() => restore());

const OFFER = {
  id: 21,
  name: 'Weekend Stimpies',
  slug: 'weekend-stimpies',
  description: 'A selection of Stimpies.',
  type: 'STIMPIE_ONLY',
  stimpieCount: 7,
  eligibleStimpieIds: [4, 6],
  priceCents: 2800,
  badge: null,
  active: true,
  position: 1,
};

function renderOfferEditor(onPost: (request: Request) => Promise<Response> | Response = () => json(OFFER, 201)) {
  const stub = stubFetch({
    'GET /api/v1/admin/packs': () => json({ items: [], page: 1, pageSize: 100, total: 0 }),
    'GET /api/v1/admin/stimpies': () => json({ items: [{ id: 4, name: 'THE VOID', active: true, artworkUrl: null }], page: 1, pageSize: 100, total: 1 }),
    'POST /api/v1/admin/packs': onPost,
  });
  restore = stub.restore;
  render(<TestApp routes={[{ path: '/products/packs/new', element: <PackEditor id={null} onClose={() => undefined} /> }]} entries={['/products/packs/new?type=STIMPIE_ONLY']} />);
  return stub;
}

describe('Stimpie-only offer administration', () => {
  it('creates a 7-Stimpie offer from the same Products > Packs record', async () => {
    let posted: Record<string, unknown> | null = null;
    const { calls } = renderOfferEditor(async (request) => {
      posted = await request.json() as Record<string, unknown>;
      return json({ ...OFFER, stimpieCount: 7 }, 201);
    });
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), { target: { value: 'Weekend Stimpies' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Stimpie count/ }), { target: { value: '7' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Price/ }), { target: { value: '28.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'POST')?.path).toBe('/api/v1/admin/packs'));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ type: 'STIMPIE_ONLY', stimpieCount: 7, eligibleStimpieIds: null, priceCents: 2800 });
  });

  it('allows a 10-Stimpie offer restricted to selected designs', async () => {
    let posted: Record<string, unknown> | null = null;
    const stub = renderOfferEditor(async (request) => {
      posted = await request.json() as Record<string, unknown>;
      return json({ ...OFFER, name: 'Ten Stimpies', stimpieCount: 10, eligibleStimpieIds: [4], priceCents: 3500 }, 201);
    });
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), { target: { value: 'Ten Stimpies' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Stimpie count/ }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Price/ }), { target: { value: '35.00' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Selected designs only' }));
    fireEvent.click(await screen.findByLabelText('THE VOID'));
    fireEvent.click(screen.getByRole('button', { name: 'Create offer' }));
    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ type: 'STIMPIE_ONLY', stimpieCount: 10, eligibleStimpieIds: [4], priceCents: 3500 });
    stub.restore();
  });

  it('keeps hoodie sets capped at five while Stimpie-only offers allow larger counts', async () => {
    const { calls } = renderOfferEditor();
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), { target: { value: 'Too many for a hoodie set' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Hoodie + Stimpies' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Stimpies in the set/ }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Price/ }), { target: { value: '35.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create pack' }));
    expect((await screen.findAllByText('Enter a count from 1 to 5.')).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('requires enough distinct eligible designs for a hoodie set', async () => {
    const { calls } = renderOfferEditor();
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), { target: { value: 'Two-design hoodie set' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Hoodie + Stimpies' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Stimpies in the set/ }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Price/ }), { target: { value: '35.00' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Selected designs only' }));
    fireEvent.click(await screen.findByLabelText('THE VOID'));
    fireEvent.click(screen.getByRole('button', { name: 'Create pack' }));
    expect((await screen.findAllByText('Select at least 2 designs so every Stimpie in the set can be different.')).length).toBeGreaterThan(0);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('shows Stimpie-only offers in Promotions and links editing back to the pack source', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/promotions': () => json({ items: [], page: 1, pageSize: 20, total: 0 }),
      'GET /api/v1/admin/packs': () => json({ items: [OFFER], page: 1, pageSize: 100, total: 1 }),
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/promotions/*', element: <PromotionsPage /> }]} entries={['/promotions']} />);
    expect(await screen.findByRole('heading', { name: 'Stimpie-only offers' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Weekend Stimpies' })).toHaveAttribute('href', '/products/packs/21');
    expect(screen.getByRole('link', { name: 'New Stimpie-only offer' })).toHaveAttribute('href', '/products/packs/new?type=STIMPIE_ONLY');
    expect(screen.getByText('7 Stimpies')).toBeInTheDocument();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('renders a Stimpie-only product card without adding a hoodie label', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/packs': () => json({ items: [OFFER], page: 1, pageSize: 100, total: 1 }),
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/products', element: <PacksTab view="all" onViewChange={() => undefined} /> }]} entries={['/products']} />);
    expect(await screen.findByText('Weekend Stimpies')).toBeInTheDocument();
    expect(screen.getByText('Stimpies only')).toBeInTheDocument();
    expect(screen.queryByText('+ 1 Hoodie')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Weekend Stimpies' })).toHaveAttribute('href', '/products/packs/21');
  });
});
