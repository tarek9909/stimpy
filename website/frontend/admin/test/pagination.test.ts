import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '../src/lib/pagination';

describe('complete API pagination', () => {
  it('loads and verifies every page for a full list above the 500-item reorder boundary', async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ id: index + 1 }));
    const calls: number[] = [];
    const result = await fetchAllPages(async (page, pageSize) => {
      calls.push(page);
      const start = (page - 1) * pageSize;
      return { items: rows.slice(start, start + pageSize), page, pageSize, total: rows.length };
    });

    expect(result.items).toHaveLength(501);
    expect(result.items[0]?.id).toBe(1);
    expect(result.items.at(-1)?.id).toBe(501);
    expect(calls).toEqual([1, 2, 3, 4, 5, 6, 1]);
  });

  it('rejects incomplete, overlapping, or changing page results', async () => {
    const duplicate = await fetchAllPages(async (page, pageSize) => ({
      items: page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 2 }],
      page,
      pageSize,
      total: 3,
    })).catch((error: unknown) => error);
    expect(duplicate).toBeInstanceOf(Error);
    expect((duplicate as Error).message).toMatch(/list changed/i);

    let loads = 0;
    const changed = await fetchAllPages(async (page, pageSize) => {
      loads += 1;
      const total = loads === 1 ? 101 : 102;
      return { items: [{ id: page }], page, pageSize, total };
    }).catch((error: unknown) => error);
    expect(changed).toBeInstanceOf(Error);
    expect((changed as Error).message).toMatch(/list changed/i);
  });
});
