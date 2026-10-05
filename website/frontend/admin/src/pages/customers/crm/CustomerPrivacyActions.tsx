import { useState } from 'react';
import { Button } from '@stimpy/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

export function CustomerPrivacyActions({
  onExport,
  onAnonymise,
  exporting = false,
}: {
  onExport: () => void | Promise<unknown>;
  onAnonymise: () => void | Promise<unknown>;
  exporting?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportCustomer = async () => {
    setExportError(null);
    try {
      await onExport();
    } catch {
      setExportError('The customer export could not be downloaded. Try again.');
    }
  };
  return (
    <section aria-labelledby="customer-privacy-heading" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="customer-privacy-heading" className="mb-1 text-h5">Privacy</h2>
      <p className="mb-3 text-body-sm text-fg-muted">Download the data held for this customer or anonymise their personal details.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={exporting} disabled={exporting} onClick={() => void exportCustomer()}>
          Export data
        </Button>
        <Button type="button" variant="danger" onClick={() => setConfirm(true)}>
          Anonymise customer
        </Button>
      </div>
      {exportError ? <p role="alert" className="mt-2 text-body-sm text-fg-danger">{exportError}</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Anonymise this customer?"
        description="This will replace the customer's name, phone, email, and notes with anonymised values. Orders remain for accounting."
        confirmLabel="Anonymise customer"
        tone="destructive"
        notUndoable
        onConfirm={onAnonymise}
        onClose={() => setConfirm(false)}
      />
    </section>
  );
}
