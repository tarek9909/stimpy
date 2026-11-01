import { render, screen } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { EditorQuery } from '../src/pages/products/shared';

const setup = (query: Partial<UseQueryResult<{ name: string }>>) =>
  render(
    <MemoryRouter>
      <EditorQuery
        query={query as UseQueryResult<{ name: string }>}
        title="Edit Stimpie"
        crumbs={[]}
        onClose={vi.fn()}
        skeleton={<div>Loading</div>}
        notFoundWhat="Stimpie"
        notFoundBackTo="/products"
        notFoundBackLabel="Back"
      >
        {(data) => <p>{data.name}</p>}
      </EditorQuery>
    </MemoryRouter>,
  );

describe('EditorQuery', () => {
  it('opens the pop-up while the record is still loading', () => {
    setup({ data: undefined, isPending: true, isLoading: true, isError: false, error: null, fetchStatus: 'fetching', status: 'pending' });
    expect(screen.getByRole('dialog', { name: 'Edit Stimpie' })).toBeInTheDocument();
  });

  it('hands over to the form once the record has loaded', () => {
    setup({ data: { name: 'Sabotage' }, isPending: false, isLoading: false, isError: false, error: null, fetchStatus: 'idle', status: 'success' });
    expect(screen.getByText('Sabotage')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
