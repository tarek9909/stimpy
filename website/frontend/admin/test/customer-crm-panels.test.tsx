import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerFollowUpsPanel } from '../src/pages/customers/crm/CustomerFollowUpsPanel';
import { CustomerConsentPanel } from '../src/pages/customers/crm/CustomerConsentPanel';
import { CustomerNotesPanel } from '../src/pages/customers/crm/CustomerNotesPanel';
import { CustomerPrivacyActions } from '../src/pages/customers/crm/CustomerPrivacyActions';
import { CustomerTagsPanel } from '../src/pages/customers/crm/CustomerTagsPanel';
import { Wrapper } from './helpers';

const withProviders = (node: React.ReactNode) => render(<Wrapper>{node}</Wrapper>);

describe('customer CRM panels', () => {
  it('shows channel consent, unsubscribe time and linked drop sign-ups', () => {
    withProviders(
      <CustomerConsentPanel
        channels={[
          { label: 'Email marketing', granted: false, updatedAt: '2026-10-01T12:00:00Z' },
          { label: 'WhatsApp marketing', granted: true, updatedAt: '2026-10-02T12:00:00Z' },
        ]}
        unsubscribedAt="2026-10-03T12:00:00Z"
        signups={[{ key: 'signup-1', channel: 'WhatsApp', dropName: 'Autumn Drop', signedUpAt: '2026-10-04T12:00:00Z' }]}
      />,
    );
    expect(screen.getByText('No consent')).toBeInTheDocument();
    expect(screen.getByText('Consented')).toBeInTheDocument();
    expect(screen.getByText('Unsubscribed')).toBeInTheDocument();
    expect(screen.getByLabelText('Linked drop sign-ups')).toHaveTextContent('Autumn Drop · WhatsApp');
  });

  it('assigns or creates tags, prevents duplicates, and removes an assigned tag', async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    withProviders(<CustomerTagsPanel tags={[{ key: '1', label: 'VIP', color: '#375A7F' }]} options={['VIP', 'Returning']} onAdd={onAdd} onRemove={onRemove} />);

    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'VIP' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove VIP tag' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('1'));

    const input = screen.getByRole('combobox', { name: 'Add or create a tag' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Returning' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Returning'));
  });

  it('keeps the legacy note pinned and adds internal notes as plain text', async () => {
    const onAdd = vi.fn();
    const onLoadMore = vi.fn();
    withProviders(
      <CustomerNotesPanel
        legacyNote={'Call after 5pm\nDo not leave a message.'}
        notes={[{ key: 'note-1', body: 'Asked about the next drop.', author: 'Owner', createdAt: '2026-10-01T12:00:00Z' }]}
        onAdd={onAdd}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    expect(screen.getByLabelText('Legacy note')).toHaveTextContent('Call after 5pm');
    expect(screen.getByText('Asked about the next drop.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older notes' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    const note = screen.getByLabelText('Add a note');
    fireEvent.change(note, { target: { value: '  Check stock next week.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Check stock next week.'));
  });

  it('schedules, completes, reopens, and retries deletion after a failure', async () => {
    const onCreate = vi.fn();
    const onSetDone = vi.fn();
    const onDelete = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    withProviders(
      <CustomerFollowUpsPanel
        items={[
          { key: 'open', dueAt: '2026-10-10T12:00:00Z', note: 'Confirm the colour choice', done: false },
          { key: 'done', dueAt: '2026-10-08T12:00:00Z', note: 'Send size guide', done: true },
        ]}
        onCreate={onCreate}
        onSetDone={onSetDone}
        onDelete={onDelete}
      />,
    );

    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-10-12' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Call to confirm delivery.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('2026-10-12', 'Call to confirm delivery.'));

    const openItem = screen.getByText('Confirm the colour choice').closest('li')!;
    fireEvent.click(within(openItem).getByRole('button', { name: 'Mark done' }));
    expect(onSetDone).toHaveBeenCalledWith('open', true);

    const doneItem = screen.getByText('Send size guide').closest('li')!;
    fireEvent.click(within(doneItem).getByRole('button', { name: 'Reopen' }));
    expect(onSetDone).toHaveBeenCalledWith('done', false);

    fireEvent.click(within(openItem).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete follow-up?' });
    expect(dialog).toHaveTextContent('permanently remove this follow-up');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete follow-up' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The follow-up could not be deleted. Try again.');
    expect(screen.getByRole('alertdialog', { name: 'Delete follow-up?' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete follow-up' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('open'));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Delete follow-up?' })).not.toBeInTheDocument());
  });

  it('exports directly and requires explicit confirmation before anonymising', async () => {
    const onExport = vi.fn();
    const onAnonymise = vi.fn();
    withProviders(<CustomerPrivacyActions onExport={onExport} onAnonymise={onAnonymise} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export data' }));
    expect(onExport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Anonymise customer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Anonymise this customer?' });
    expect(dialog).toHaveTextContent('Orders remain for accounting');
    expect(onAnonymise).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anonymise customer' }));
    await waitFor(() => expect(onAnonymise).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Anonymise this customer?' })).not.toBeInTheDocument());
  });
});
