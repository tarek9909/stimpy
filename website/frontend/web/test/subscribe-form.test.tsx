import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@stimpy/api-client';

// A plain wrapper (not vi.fn) so vitest does not track the rejected promises as unhandled.
let impl: (...args: unknown[]) => Promise<unknown> = async () => ({});
const calls: unknown[][] = [];
const post = {
  mockReset: () => {
    impl = async () => ({});
    calls.length = 0;
  },
  mockResolvedValue: (v: unknown) => {
    impl = async () => v;
  },
  mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => {
    impl = fn;
  },
};
vi.mock('@/lib/api-browser', () => ({
  browserApi: () => ({
    POST: (...args: unknown[]) => {
      calls.push(args);
      return impl(...args);
    },
  }),
}));

import { SubscribeForm, checkContact } from '@/features/drops/SubscribeForm';

beforeEach(() => post.mockReset());

function submit(value: string) {
  fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /notify me/i }));
}

describe('SubscribeForm', () => {
  it('checks the contact locally without being stricter than the server', () => {
    expect(checkContact('EMAIL', 'a@b.co')).toBeNull();
    expect(checkContact('EMAIL', 'nope')).toMatch(/valid email/i);
    expect(checkContact('WHATSAPP', '03 123 456')).toBeNull();
    expect(checkContact('WHATSAPP', '12')).toMatch(/valid whatsapp/i);
  });

  it('shows "You\'re on the list." on success', async () => {
    post.mockResolvedValue({});
    render(<SubscribeForm dropId={5} dropName="Drop 002" />);
    submit('03 123 456');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("You're on the list."));
    expect(calls[0]).toEqual(['/api/v1/drops/{id}/subscribe', { params: { path: { id: 5 } }, body: { contact: '03 123 456', type: 'WHATSAPP' } }]);
  });

  it('puts a server validation error under the contact field and keeps the value', async () => {
    const err = new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'x', fields: { contact: 'Enter a Lebanese number.' } });
    post.mockImplementation(() => Promise.reject(err));
    render(<SubscribeForm dropId={5} dropName="Drop 002" />);
    submit('03 123 456');
    await waitFor(() => expect(screen.getByText('Enter a Lebanese number.')).toBeInTheDocument());
    expect(screen.getByLabelText(/whatsapp number/i)).toHaveValue('03 123 456');
  });

  it('shows the Retry-After wait on 429 and disables the button', async () => {
    const err = new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 30 });
    post.mockImplementation(() => Promise.reject(err));
    render(<SubscribeForm dropId={5} dropName="Drop 002" />);
    submit('03 123 456');
    await waitFor(() => expect(screen.getByText('Too many tries. Please wait 30 seconds.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /try again in 30s/i })).toBeDisabled();
  });
});
