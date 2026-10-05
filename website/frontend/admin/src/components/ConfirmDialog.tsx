import { useId, useState, type ReactNode } from 'react';
import { Button, Input, Modal, FormField } from '@stimpy/ui';
import { useNotifyError } from '../api/errors';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. State the consequence (dashboard-pages 1.7). */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` = red button, Cancel focused first. */
  tone?: 'default' | 'destructive';
  /** Adds "This can't be undone." Use for deletes, status changes, ending a drop, stock adjustments. */
  notUndoable?: boolean;
  /** The person must type this exact text to enable the confirm button (ending a drop: its name). */
  requireText?: string;
  /**
   * Runs on confirm. May be async: the dialog shows loading and locks Esc/backdrop/Cancel until it
   * settles. On success the dialog calls `onClose`; if it throws, the dialog stays open and the
   * error is toasted with the standard mapping (pass `reportErrors={false}` to handle it yourself).
   */
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  reportErrors?: boolean;
  /** Extra content (a reason textarea, a restock choice). */
  children?: ReactNode;
  /** Disable confirm for a reason the children know about (e.g. a required field is empty). */
  confirmDisabled?: boolean;
}

/**
 * Confirmation modal for every action that changes something that matters. Wraps `Modal` so it can
 * support `requireText`, an async confirm and the "can't be undone" line, which `ConfirmModal`
 * does not.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  notUndoable,
  requireText,
  onConfirm,
  onClose,
  reportErrors = true,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const typedId = useId();
  const notifyError = useNotifyError();

  const matches = !requireText || typed.trim() === requireText;
  const disabled = !matches || !!confirmDisabled;

  const close = () => {
    if (busy) return;
    setTyped('');
    onClose();
  };

  const confirm = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onConfirm();
      setBusy(false);
      setTyped('');
      onClose();
    } catch (e) {
      setBusy(false);
      if (reportErrors) notifyError(e);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      role="alertdialog"
      closeOnEsc={!busy}
      closeOnBackdrop={!busy}
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'destructive' ? 'danger' : 'primary'} onClick={() => void confirm()} loading={busy} disabled={disabled && !busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description ? <div className="text-body text-fg">{description}</div> : null}
        {notUndoable ? <p className="text-body-sm font-medium text-fg">This can&apos;t be undone.</p> : null}
        {children}
        {requireText ? (
          <FormField label={`Type "${requireText}" to confirm`} id={typedId}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </FormField>
        ) : null}
      </div>
    </Modal>
  );
}
