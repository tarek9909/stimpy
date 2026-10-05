import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FaqTab } from '../src/pages/content/FaqTab';
import { useReviews } from '../src/pages/content/api';
import { useHoodies } from '../src/pages/products/api';
import { json, stubFetch, TestApp } from './helpers';

let restore: () => void = () => undefined;
afterEach(() => restore());

function FullListCounts() {
  const reviews = useReviews();
  const hoodies = useHoodies();
  return <output>{`reviews ${reviews.data?.items.length ?? 0}; hoodies ${hoodies.data?.items.length ?? 0}`}</output>;
}

describe('content lists beyond one API page', () => {
  it('loads every review and hoodie page for dashboard lists', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/reviews': (req) => {
        const query = new URL(req.url).searchParams;
        const page = Number(query.get('page') ?? 1);
        const pageSize = Number(query.get('pageSize') ?? 25);
        const all = Array.from({ length: 125 }, (_, index) => ({ id: index + 1 }));
        const start = (page - 1) * pageSize;
        return json({ items: all.slice(start, start + pageSize), page, pageSize, total: all.length });
      },
      'GET /api/v1/admin/hoodies': (req) => {
        const query = new URL(req.url).searchParams;
        const page = Number(query.get('page') ?? 1);
        const pageSize = Number(query.get('pageSize') ?? 25);
        const all = Array.from({ length: 105 }, (_, index) => ({ id: index + 1001 }));
        const start = (page - 1) * pageSize;
        return json({ items: all.slice(start, start + pageSize), page, pageSize, total: all.length });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <FullListCounts /> }]} />);

    expect(await screen.findByText('reviews 125; hoodies 105')).toBeInTheDocument();
    expect(stub.calls.filter((call) => new URL(call.url).searchParams.get('page') === '2')).toHaveLength(2);
  });

  it('loads the complete FAQ list and submits a valid 501-id order', async () => {
    let orderedIds = Array.from({ length: 501 }, (_, index) => index + 1);
    const submission: { ids: number[] | null } = { ids: null };
    const stub = stubFetch({
      'GET /api/v1/admin/faqs': (req) => {
        const query = new URL(req.url).searchParams;
        const page = Number(query.get('page') ?? 1);
        const pageSize = Number(query.get('pageSize') ?? 25);
        const start = (page - 1) * pageSize;
        return json({
          items: orderedIds.slice(start, start + pageSize).map((id) => ({ id, question: `Question ${id}`, answer: `Answer ${id}`, group: null, showOnHome: false, position: orderedIds.indexOf(id) })),
          page,
          pageSize,
          total: orderedIds.length,
        });
      },
      'PUT /api/v1/admin/faqs/order': async (req) => {
        const body = (await req.json()) as { ids: number[] };
        submission.ids = body.ids;
        orderedIds = body.ids;
        return new Response(null, { status: 204 });
      },
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <FaqTab /> }]} />);

    const moveLastQuestion = await screen.findByRole('button', { name: 'Move Question 501 up' });
    fireEvent.click(moveLastQuestion);
    await waitFor(() => expect(submission.ids).toHaveLength(501));
    expect(submission.ids?.slice(-3)).toEqual([499, 501, 500]);

    const faqListCalls = stub.calls.filter((call) => call.path === '/api/v1/admin/faqs');
    expect(faqListCalls.some((call) => new URL(call.url).searchParams.get('page') === '6')).toBe(true);
    expect(faqListCalls.filter((call) => new URL(call.url).searchParams.get('page') === '1').length).toBeGreaterThanOrEqual(2);
  }, 15_000);
});
