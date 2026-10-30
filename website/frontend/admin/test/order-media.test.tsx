import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderDetailItemRow, OrderItemMediaThumbs, resolveOrderMedia } from '../src/pages/orders/media';
import type { AdminOrder } from '../src/pages/orders/api';
import { Wrapper, json, stubFetch } from './helpers';

const item: AdminOrder['items'][number] = {
  id: 5,
  kind: 'STIMPIE_PACK',
  name: 'Seven Stimpies',
  qty: 2,
  unitPriceCents: 2800,
  lineTotalCents: 5600,
  details: {
    hoodie: null,
    color: null,
    size: null,
    stimpies: [],
    stimpieQuantities: [{ name: 'THE VOID', qty: 3 }, { name: 'NEON KOI', qty: 4 }],
  },
};

describe('Stimpie-only order rendering', () => {
  it('resolves media without inventing a hoodie and preserves repeated-design quantities', () => {
    const media = resolveOrderMedia(item, [], [{ id: 1, slug: 'classic', name: 'Stimpy Hoodie', description: '', priceCents: 2500, compareAtPriceCents: null, images: ['hoodie.jpg'], colors: [], inStock: true }]);
    expect(media.hoodieImg).toBeNull();
    expect(media.stimpieImgs).toEqual([
      { name: 'THE VOID', qty: 3, url: null },
      { name: 'NEON KOI', qty: 4, url: null },
    ]);
    render(<OrderItemMediaThumbs media={media} />);
    expect(screen.queryByAltText('Stimpy Hoodie')).not.toBeInTheDocument();
    expect(screen.getByTitle('Stimpie: THE VOID ×3')).toBeInTheDocument();
  });

  it('shows each Stimpie design and its quantity in the order details', async () => {
    const stub = stubFetch({
      'GET /api/v1/products/stimpies': () => json({ items: [], page: 1, pageSize: 100, total: 0 }),
      'GET /api/v1/products/hoodies': () => json({ items: [], page: 1, pageSize: 100, total: 0 }),
    });
    try {
      render(<Wrapper><OrderDetailItemRow item={item} moneyFormatter={(cents) => `$${(cents / 100).toFixed(2)}`} /></Wrapper>);
      expect(await screen.findByText('THE VOID ×3')).toBeInTheDocument();
      expect(screen.getByText('NEON KOI ×4')).toBeInTheDocument();
      expect(screen.queryByAltText('Stimpy Hoodie')).not.toBeInTheDocument();
    } finally {
      stub.restore();
    }
  });

  it('keeps order-provided artwork when a design is no longer in the catalog', () => {
    const media = resolveOrderMedia({ ...item, details: {
      ...item.details,
      stimpieImages: [{ name: 'THE VOID', imageUrl: 'https://store.example/uploads/original.webp' }],
    } }, [], []);
    expect(media.stimpieImgs[0]).toEqual({ name: 'THE VOID', qty: 3, url: 'https://store.example/uploads/original.webp' });
  });
});
