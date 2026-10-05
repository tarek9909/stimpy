import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@stimpy/api-client';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-browser', () => ({
  browserApi: () => ({ GET: get, POST: post }),
}));

import { UnsubscribeView } from '@/features/unsubscribe/UnsubscribeView';

afterEach(() => vi.clearAllMocks());

describe('public email unsubscribe confirmation', () => {
  it('validates the token then requires an explicit confirmation before revoking email consent', async () => {
    get.mockResolvedValueOnce({ data: { valid: true } });
    post.mockResolvedValueOnce({ response: { status: 204 } });
    render(<UnsubscribeView token="opaque-token" />);

    const confirm = await screen.findByRole('button', { name: 'Unsubscribe from emails' });
    expect(get).toHaveBeenCalledWith('/api/v1/unsubscribe/{token}', {
      params: { path: { token: 'opaque-token' } },
      cache: 'no-store',
    });
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await screen.findByRole('status');
    await waitFor(() => expect(screen.getByText('You have been unsubscribed from email updates.')).toBeInTheDocument());
    expect(post).toHaveBeenCalledWith('/api/v1/unsubscribe/{token}/confirm', { params: { path: { token: 'opaque-token' } } });
  });

  it('shows an invalid-link state without confirming when token validation fails', async () => {
    get.mockRejectedValueOnce(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'missing' }));
    render(<UnsubscribeView token="expired-token" />);
    expect(await screen.findByText('This email link is invalid or has expired. You can close this page.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not send a request for an absent token', async () => {
    render(<UnsubscribeView token="" />);
    expect(await screen.findByText('This email link is invalid or has expired. You can close this page.')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
