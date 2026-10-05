'use client';

import { HOODIE_RATIO, Media, PriceTag, QuantityStepper, STIMPIE_RATIO, TextLink } from '@stimpy/ui';
import { track } from '@/lib/track';
import { canEditLine } from './EditLineModal';
import { cartStore } from './store';
import type { CartLine } from './types';

function lineDetails(line: CartLine): string {
  return [line.ui.colorName, line.ui.sizeLabel].filter(Boolean).join(' / ');
}

const textButton =
  'inline-flex min-h-11 items-center px-1 text-body-sm font-medium text-fg underline underline-offset-4';

/**
 * One cart line, shared by the cart drawer and the checkout summary (checkout-and-order-flow 1.5, 1.6):
 * thumbnail, title, colour/size, Stimpie names, quantity stepper (1..10), line total, Remove, "Edit" for pack and
 * hoodie lines, and for UNAVAILABLE lines a greyed, struck-through title with Remove and "Find a replacement".
 * Notices from validation (`check.reasons`) show under the title.
 */
export function CartLineRow({ line, onEdit }: { line: CartLine; onEdit?: (lineId: string) => void }) {
  const unavailable = line.check.state === 'UNAVAILABLE';
  const ratio = line.item.kind === 'stimpie' ? STIMPIE_RATIO : HOODIE_RATIO;
  const details = lineDetails(line);
  const lineTotal = line.ui.unitPriceCents * line.item.qty;
  const editable = !!onEdit && canEditLine(line);
  return (
    <li className="flex gap-3 border-b border-base py-4" data-testid="cart-line" data-state={line.check.state}>
      <div className={unavailable ? 'w-16 shrink-0 opacity-50' : 'w-16 shrink-0'}>
        <Media src={line.ui.imageUrl} alt="" ratio={ratio} sizes="64px" className="rounded-md" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={unavailable ? 'text-body font-medium text-fg-muted line-through' : 'text-body font-medium text-fg'}>
          {line.ui.title}
        </p>
        {details ? <p className="text-body-sm text-fg-muted">{details}</p> : null}
        {line.ui.stimpies.length > 0 ? (
          <p className="text-body-sm text-fg-muted">{line.ui.stimpies.map((s) => s.name).join(', ')}</p>
        ) : null}
        {line.check.reasons.length > 0 ? (
          <ul className="text-body-sm font-medium text-fg" aria-label="Notices for this item" data-testid="line-notices">
            {line.check.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          {unavailable ? (
            <div className="flex flex-wrap gap-x-3 text-body-sm">
              {editable ? (
                <button type="button" className={textButton} onClick={() => onEdit?.(line.lineId)}>
                  Find a replacement
                </button>
              ) : line.ui.hoodieSlug ? (
                <TextLink href={`/shop/hoodie/${line.ui.hoodieSlug}`}>Pick another size</TextLink>
              ) : (
                <TextLink href="/shop?tab=stimpies">Find a replacement</TextLink>
              )}
            </div>
          ) : (
            <QuantityStepper
              value={line.item.qty}
              onChange={(q) => cartStore.getState().setQty(line.lineId, q)}
              label={`Quantity of ${line.ui.title}`}
            />
          )}
          <div className="flex flex-wrap items-center gap-x-3">
            {!unavailable ? <PriceTag cents={lineTotal} size="sm" /> : null}
            {editable && !unavailable ? (
              <button type="button" onClick={() => onEdit?.(line.lineId)} aria-label={`Edit ${line.ui.title}`} className={textButton}>
                Edit
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                track('cart_remove', { kind: line.item.kind });
                cartStore.getState().remove(line.lineId);
              }}
              aria-label={`Remove ${line.ui.title}`}
              className={textButton}
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
