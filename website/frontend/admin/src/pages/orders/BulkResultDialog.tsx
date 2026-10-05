import { Button, Modal } from '@stimpy/ui';
import { bulkFailureReason } from './status';

export interface BulkFailure {
  id: number;
  /** Order number when known (`STP-1042`); falls back to the id. */
  label: string;
  code: string;
}

/**
 * Result of a bulk operation with per-order failures (dashboard-pages 5.5): never just a toast.
 * "4 updated, 1 failed", each failed order with a plain reason, **Select failed orders** and **Close**.
 */
export function BulkResultDialog({
  open,
  updated,
  failed,
  onSelectFailed,
  onClose,
  title = 'Some orders were not updated',
  extra,
}: {
  open: boolean;
  updated: number;
  failed: BulkFailure[];
  onSelectFailed: () => void;
  onClose: () => void;
  title?: string;
  /** More content under the failed list (duplicate delivery number warnings). */
  extra?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          {failed.length > 0 ? (
            <Button variant="secondary" onClick={onSelectFailed}>
              Select failed orders
            </Button>
          ) : null}
          <Button variant="dark" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <p className="mb-3 text-body font-medium tabular-nums" role="status">
        {updated} updated, {failed.length} failed
      </p>
      {failed.length > 0 ? (
      <ul className="divide-y divide-line rounded-md border border-base">
        {failed.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-body-sm">
            <span className="font-mono tabular-nums">{f.label}</span>
            <span className="text-fg-muted">{bulkFailureReason(f.code)}</span>
          </li>
        ))}
      </ul>
      ) : null}
      {extra}
    </Modal>
  );
}
