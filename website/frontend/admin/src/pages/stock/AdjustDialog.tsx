import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button, FormField, Input, Modal, Select, Tabs, Textarea, useToast } from '@stimpy/ui';
import { asApiError, useNotifyError } from '../../api/errors';
import { useStockChange, type ItemType } from './api';

export interface AdjustTarget {
  itemType: ItemType;
  itemId: number;
  /** "Stimpy Hoodie, Black, M" or "THE VOID". */
  name: string;
  quantity: number;
  reserved: number;
  available: number;
}

type Mode = 'adjust' | 'set';
type Reason = 'RESTOCK' | 'CORRECTION' | 'DAMAGED';

const NOTE_MIN = 3;
const NOTE_MAX = 255;
export const BIG_DELTA = 50;

/** Parses a whole number with an optional leading minus; null when it is not one. */
export function parseWholeNumber(raw: string): number | null {
  const t = raw.trim();
  return /^-?\d+$/.test(t) ? Number(t) : null;
}

/**
 * Adjust on-hand stock only (dashboard-pages 8.4). Reserved units are controlled by order flows;
 * the server derives their count from open order reservations.
 */
export function AdjustDialog({ target, onClose }: { target: AdjustTarget | null; onClose: () => void }) {
  const change = useStockChange();
  const toast = useToast();
  const notify = useNotifyError();
  const [mode, setMode] = useState<Mode>('adjust');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<Reason>('RESTOCK');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ delta?: string; reason?: string; quantity?: string; note?: string }>({});
  const [confirmLarge, setConfirmLarge] = useState(false);

  useEffect(() => {
    if (!target) return;
    setMode('adjust');
    setDelta('');
    setReason('RESTOCK');
    setQuantity(String(target.quantity));
    setNote('');
    setErrors({});
    setConfirmLarge(false);
  }, [target?.itemType, target?.itemId]);

  if (!target) return null;

  const deltaN = parseWholeNumber(delta);
  const qtyN = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : null;
  const newQuantity = mode === 'adjust' ? (deltaN === null ? null : target.quantity + deltaN) : qtyN;
  const newAvailable = newQuantity === null ? null : newQuantity - target.reserved;
  const effectiveDelta = mode === 'adjust' ? deltaN : (qtyN === null ? null : qtyN - target.quantity);
  const busy = change.isPending;

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (mode === 'adjust') {
      if (deltaN === null || deltaN === 0) next.delta = 'Enter a whole number other than 0.';
      else if (reason === 'RESTOCK' && deltaN < 0) next.delta = 'A restock adds units: enter a positive number.';
      else if (reason === 'DAMAGED' && deltaN > 0) next.delta = 'Damaged units are removed: enter a negative number.';
    } else if (qtyN === null) {
      next.quantity = 'Enter a whole number of 0 or more.';
    }
    if (newQuantity !== null && newQuantity < target.reserved) {
      const msg = `You can't go below what's reserved for open orders (reserved: ${target.reserved}).`;
      if (mode === 'adjust') next.delta = msg;
      else next.quantity = msg;
    }

    const trimmed = note.trim();
    if (trimmed.length === 0) next.note = 'Add a note so we know why the stock changed.';
    else if (trimmed.length < NOTE_MIN) next.note = `Use at least ${NOTE_MIN} characters.`;
    else if (trimmed.length > NOTE_MAX) next.note = `Use at most ${NOTE_MAX} characters.`;

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (effectiveDelta !== null && Math.abs(effectiveDelta) > BIG_DELTA && !confirmLarge) {
      setConfirmLarge(true);
      return;
    }
    try {
      await change.mutateAsync(
        mode === 'adjust'
          ? { mode: 'adjust', itemType: target.itemType, itemId: target.itemId, delta: deltaN as number, reason, note: note.trim() }
          : { mode: 'set', itemType: target.itemType, itemId: target.itemId, quantity: qtyN as number, note: note.trim() },
      );
      toast.success('Stock updated.');
      onClose();
    } catch (e) {
      setConfirmLarge(false);
      const err = asApiError(e);
      if (err?.code === 'CONFLICT') {
        const msg = `You can't go below what's reserved for open orders (reserved: ${target.reserved}).`;
        setErrors(mode === 'adjust' ? { delta: msg } : { quantity: msg });
      } else if (err?.code === 'VALIDATION_ERROR' && err.fields) {
        setErrors({ delta: err.fields.delta, reason: err.fields.reason, quantity: err.fields.quantity, note: err.fields.note });
        if (!err.fields.delta && !err.fields.reason && !err.fields.quantity && !err.fields.note) notify(e);
      } else notify(e);
    }
  };

  const verb = effectiveDelta !== null && effectiveDelta < 0 ? 'Remove' : 'Add';

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Adjust stock: ${target.name}`}
      size="md"
      closeOnBackdrop={false}
      closeOnEsc={!busy}
      footer={
        confirmLarge ? (
          <>
            <Button variant="secondary" onClick={() => setConfirmLarge(false)} disabled={busy}>Back</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>Yes, save adjustment</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>Save adjustment</Button>
          </>
        )
      }
    >
      {confirmLarge ? (
        <div className="space-y-3" role="alert">
          <p className="text-h5">{verb} {Math.abs(effectiveDelta ?? 0)} units?</p>
          <p>That is a big change ({target.quantity} to {newQuantity}). Check it is not a typo.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-2 rounded-md bg-surface p-2 text-center text-body-sm">
            <div className="flex flex-col items-center p-1.5">
              <dt className="text-fg-muted font-medium">On hand</dt>
              <dd className="text-h5 font-bold tabular-nums">{target.quantity}</dd>
            </div>
            <div className="flex flex-col items-center p-1.5">
              <dt className="text-fg-muted font-medium">Reserved</dt>
              <dd className="text-h5 font-bold tabular-nums">{target.reserved}</dd>
            </div>
            <div className="flex flex-col items-center p-1.5">
              <dt className="text-fg-muted font-medium">Available</dt>
              <dd className="text-h5 font-bold tabular-nums">{target.available}</dd>
            </div>
          </dl>

          <Tabs
            aria-label="Adjustment type"
            variant="pill"
            tabs={[
              { id: 'adjust', label: 'Add / remove' },
              { id: 'set', label: 'Set total' },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m as Mode);
              setErrors({});
            }}
          />

          {mode === 'adjust' ? (
            <>
              <FormField label="Change" name="delta" required error={errors.delta} hint="Use a minus sign to remove units, for example -2.">
                {(a11y) => (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" iconOnly aria-label="Subtract one" onClick={() => setDelta(String((deltaN ?? 0) - 1))}>
                      <Minus size={18} aria-hidden="true" />
                    </Button>
                    <Input {...a11y} invalid={!!errors.delta} value={delta} onChange={(e) => setDelta(e.target.value)} inputMode="numeric" autoComplete="off" className="text-center tabular-nums" placeholder="0" />
                    <Button variant="secondary" iconOnly aria-label="Add one" onClick={() => setDelta(String((deltaN ?? 0) + 1))}>
                      <Plus size={18} aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </FormField>
              <FormField label="Reason" name="reason" required error={errors.reason}>
                <Select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as Reason)}
                  options={[
                    { value: 'RESTOCK', label: 'Restock' },
                    { value: 'CORRECTION', label: 'Correction' },
                    { value: 'DAMAGED', label: 'Damaged' },
                  ]}
                />
              </FormField>
            </>
          ) : (
            <FormField label="New total on hand" name="quantity" required error={errors.quantity}>
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" autoComplete="off" className="tabular-nums" />
            </FormField>
          )}

          <FormField label="Note" name="note" required error={errors.note} hint="Why is the stock changing? Saved in the movement log.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={NOTE_MAX} showCount />
          </FormField>

          {newQuantity !== null && newAvailable !== null ? (
            <p className="rounded-md bg-cream px-3 py-2 text-body-sm" aria-live="polite" data-testid="stock-preview">
              On hand {target.quantity} → {newQuantity}. Reserved {target.reserved}. Available {newAvailable}.
              {newAvailable === 0 ? <span className="mt-1 block font-medium">This will show as Sold out on the website.</span> : null}
            </p>
          ) : null}

          <p className="text-body-sm text-fg-muted">Stock changes are logged and can only be corrected with another adjustment.</p>
        </div>
      )}
    </Modal>
  );
}
