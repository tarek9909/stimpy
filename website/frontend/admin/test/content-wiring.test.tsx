import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { queryKeys } from '../src/api/queryKeys';
import { setSession } from '../src/auth/session';
import { EmailsTab } from '../src/pages/content/EmailsTab';
import { PoliciesTab } from '../src/pages/content/PoliciesTab';
import { type PoliciesBlock } from '../src/pages/content/api';
import { apiError, json, OWNER, stubFetch, TestApp, testQueryClient } from './helpers';

let restore: () => void = () => undefined;
afterEach(() => restore());

function contentHandlers() {
  return {
    'GET /api/v1/admin/content/policies': () => json({ deliveryReturns: 'Delivery', care: 'Care', terms: 'Terms', privacy: 'Privacy' }),
    'GET /api/v1/admin/content/about': () => json({ about: 'About us' }),
    'GET /api/v1/admin/content/how-it-works': () => json({ steps: [], promises: [], faqs: [] }),
  };
}

describe('dashboard content persistence', () => {
  it('keeps saved policy siblings when saving another section and refreshes clean editors', async () => {
    const requests: PoliciesBlock[] = [];
    const stub = stubFetch({
      ...contentHandlers(),
      'PUT /api/v1/admin/content/policies': async (req) => {
        const body = await req.json() as PoliciesBlock;
        requests.push(body);
        return json(body);
      },
    });
    restore = stub.restore;
    const client = testQueryClient();
    render(<TestApp client={client} routes={[{ path: '/', element: <PoliciesTab /> }]} />);

    fireEvent.change(await screen.findByLabelText('Delivery & returns'), { target: { value: 'Updated delivery' } });
    fireEvent.change(screen.getByLabelText('Care'), { target: { value: 'Updated care' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Delivery & returns', hidden: true }));
    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Care', hidden: true })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save Care', hidden: true }));
    await waitFor(() => expect(requests).toHaveLength(2));
    await screen.findByText('Care saved.');
    expect(requests[1]).toMatchObject({ deliveryReturns: 'Updated delivery', care: 'Updated care', terms: 'Terms', privacy: 'Privacy' });

    fireEvent.change(screen.getByLabelText('Terms'), { target: { value: 'Unsaved terms' } });
    act(() => {
      client.setQueryData(queryKeys.content('policies'), { ...requests[1], terms: 'New server terms', privacy: 'New server privacy' });
    });
    await waitFor(() => expect(screen.getByLabelText('Privacy')).toHaveValue('New server privacy'));
    expect(screen.getByLabelText('Terms')).toHaveValue('Unsaved terms');
  });

  it('shows a failed content save and preserves the edited text', async () => {
    const stub = stubFetch({
      ...contentHandlers(),
      'PUT /api/v1/admin/content/about': () => apiError(409, 'CONFLICT', 'Content could not be saved.'),
    });
    restore = stub.restore;
    render(<TestApp routes={[{ path: '/', element: <PoliciesTab /> }]} />);
    const input = await screen.findByLabelText('About');
    fireEvent.change(input, { target: { value: 'Keep this edited text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save About', hidden: true }));
    expect(await screen.findByText('Content could not be saved.')).toBeInTheDocument();
    expect(input).toHaveValue('Keep this edited text');
  });

  it('keeps email enabled switches in sync while preserving unsaved message edits', async () => {
    const template = { key: 'order_received', name: 'Order received', subject: 'Your order', body: 'Saved message', enabled: true, placeholders: [] };
    const stub = stubFetch({
      'GET /api/v1/admin/email-templates': () => json([template]),
      'POST /api/v1/admin/email-templates/order_received/preview': () => json({ subject: template.subject, text: template.body, html: '<p>Preview</p>' }),
      'PUT /api/v1/admin/email-templates/order_received': async (req) => json({ ...template, ...await req.json() }),
    });
    restore = stub.restore;
    const client = testQueryClient();
    setSession(client, { user: OWNER, expiresAt: null });
    render(<TestApp client={client} routes={[{ path: '/', element: <EmailsTab /> }]} />);
    const body = await screen.findByRole('textbox', { name: /^Body/ });
    fireEvent.change(body, { target: { value: 'Unsaved message' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Order received enabled' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /^Send this email/ })).not.toBeChecked());
    expect(screen.getByRole('switch', { name: 'Order received enabled' })).not.toBeChecked();
    expect(body).toHaveValue('Unsaved message');
  });

  it('maps indexed WhatsApp validation errors back to the message field', async () => {
    const stub = stubFetch({
      'GET /api/v1/admin/whatsapp-templates': () => json([{ key: 'order_confirmed', name: 'Order confirmed', body: 'Confirmed', placeholders: [] }]),
      'PUT /api/v1/admin/whatsapp-templates': () => apiError(400, 'VALIDATION_ERROR', 'Check the message.', { fields: { '0.body': 'Unknown placeholder {bad}.' } }),
    });
    restore = stub.restore;
    render(<TestApp entries={['/?section=whatsapp']} routes={[{ path: '/', element: <EmailsTab /> }]} />);
    const message = await screen.findByLabelText('Message');
    fireEvent.change(message, { target: { value: 'Confirmed {bad}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save WhatsApp templates' }));
    expect(await screen.findByText('Unknown placeholder {bad}.')).toBeInTheDocument();
    expect(message).toHaveValue('Confirmed {bad}');
  });
});
