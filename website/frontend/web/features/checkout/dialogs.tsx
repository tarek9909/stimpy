'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HoodieDetail, PurchaseProblem, Stimpie, StockProblem } from '@stimpy/api-client';
import { Button, Modal, StimpieCard, TextLink, formatCents } from '@stimpy/ui';
import { browserApi } from '@/lib/api-browser';
import { cartStore } from '@/features/cart/store';
import type { CartLine } from '@/features/cart/types';
import { stimpieAlternatives, swapStimpieInLine, switchVariantInLine, variantAlternatives, type VariantChoice } from './alternatives';
import { purchaseProblemText, soldOutHeading, soldOutLine } from './outcome';

/* -------------------------------------------------------------------------- NOT_PURCHASABLE */

/** "Some items can't be ordered right now" (4.1). The lines are already marked UNAVAILABLE in the cart. */
export function NotPurchasableDialog({
  open,
  problems,
  onClose,
}: {
  open: boolean;
  problems: readonly PurchaseProblem[];
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Some items can't be ordered right now"
      description="Nothing was charged and nothing was reserved."
      size="md"
      footer={
        <>
          <Button variant="secondary" href="/shop" onClick={onClose}>
            Back to shop
          </Button>
          <Button variant="dark" onClick={onClose}>
            Update my order
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg" data-testid="not-purchasable-list">
        {problems.map((p, i) => (
          <li key={`${p.itemIndex}-${i}`}>{purchaseProblemText(p)}</li>
        ))}
      </ul>
      <p className="mt-4 text-body-sm text-fg-muted">Remove those items or find a replacement in your order summary.</p>
    </Modal>
  );
}

/* ----------------------------------------------------------------------------- PRICE_CHANGED */

/** "The price changed" (4.1): old total, new total, no auto-resubmit. */
export function PriceChangedDialog({
  open,
  oldTotalCents,
  newTotalCents,
  busy,
  onReview,
  onConfirm,
}: {
  open: boolean;
  oldTotalCents: number | null;
  newTotalCents: number;
  busy?: boolean;
  onReview: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onReview}
      title="The price changed"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onReview}>
            Review order
          </Button>
          <Button variant="cta" onClick={onConfirm} loading={busy}>
            {`Place order for ${formatCents(newTotalCents)}`}
          </Button>
        </>
      }
    >
      <dl className="flex flex-col gap-1 text-body">
        {oldTotalCents !== null ? (
          <div className="flex items-baseline justify-between">
            <dt className="text-fg-muted">You saw</dt>
            <dd className="tabular-nums line-through" data-testid="price-old">
              {formatCents(oldTotalCents)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <dt className="font-medium">New total (with delivery)</dt>
          <dd className="font-bold tabular-nums" data-testid="price-new">
            {formatCents(newTotalCents)}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-body text-fg">Review your order and confirm.</p>
    </Modal>
  );
}

/* ---------------------------------------------------------------------------------- SOLD_OUT */

interface AlternativesData {
  /** Purchasable Stimpies right now (`includeSoldOut=false`). */
  stimpies: Stimpie[];
  /** Hoodie detail per slug for HOODIE_VARIANT problems. */
  hoodies: Record<string, HoodieDetail>;
  /** Drop page to follow ("Notify me") for a sold-out Stimpie that belongs to a drop. */
  dropSlugFor: Record<number, string>;
}

function lineFor(lines: readonly CartLine[], p: StockProblem): CartLine | undefined {
  return lines[p.itemIndex];
}

/**
 * "Sorry, {name} just sold out." (4.4). Nothing was reserved. The cart has already been updated from the response;
 * this lists alternatives (Stimpies to swap in, other hoodie sizes/colours) and offers "Update my order" / "Back to
 * shop". Alternatives load fresh when the dialog opens.
 */
export function SoldOutDialog({
  open,
  problems,
  lines,
  onClose,
  onCartChanged,
}: {
  open: boolean;
  problems: readonly StockProblem[];
  /** Current cart lines (already updated from the response). */
  lines: readonly CartLine[];
  onClose: () => void;
  /** A swap changed the cart: the page validates again. */
  onCartChanged: () => void;
}) {
  const [data, setData] = useState<AlternativesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    setResolved(new Set());
    void (async () => {
      const api = browserApi();
      try {
        const stimpieProblems = problems.filter((p) => p.kind === 'STIMPIE');
        const variantSlugs = new Set<string>();
        for (const p of problems) {
          if (p.kind !== 'HOODIE_VARIANT') continue;
          const slug = lineFor(lines, p)?.ui.hoodieSlug;
          if (slug) variantSlugs.add(slug);
        }
        const [stimpiesRes, hoodieRes] = await Promise.all([
          stimpieProblems.length > 0
            ? api.GET('/api/v1/products/stimpies', { params: { query: { includeSoldOut: 'false' } }, cache: 'no-store' })
            : Promise.resolve({ data: [] as Stimpie[] }),
          Promise.all(
            [...variantSlugs].map(async (slug) => {
              const r = await api.GET('/api/v1/products/hoodies/{slug}', { params: { path: { slug } }, cache: 'no-store' });
              return [slug, r.data] as const;
            }),
          ),
        ]);
        const hoodies: Record<string, HoodieDetail> = {};
        for (const [slug, h] of hoodieRes) if (h) hoodies[slug] = h;
        const stimpies = stimpiesRes.data ?? [];
        // Nothing to swap in: find the sold-out Stimpie's drop for a "Notify me" link.
        const dropSlugFor: Record<number, string> = {};
        if (stimpieProblems.length > 0 && stimpies.filter((s) => s.purchasable).length === 0) {
          const all = await api.GET('/api/v1/products/stimpies', { cache: 'no-store' });
          for (const p of stimpieProblems) {
            if (p.kind !== 'STIMPIE') continue;
            const slug = all.data?.find((s) => s.id === p.stimpieId)?.drop?.slug;
            if (slug) dropSlugFor[p.stimpieId] = slug;
          }
        }
        if (!cancelled) setData({ stimpies, hoodies, dropSlugFor });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opening
  }, [open]);

  const markResolved = (index: number) => {
    setResolved((prev) => new Set([...prev, index]));
    onCartChanged();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={soldOutHeading(problems)}
      description="Nothing was charged and nothing was reserved."
      size="lg"
      footer={
        <>
          <Button variant="secondary" href="/shop" onClick={onClose}>
            Back to shop
          </Button>
          <Button variant="dark" onClick={onClose}>
            Update my order
          </Button>
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg" data-testid="sold-out-list">
        {problems.map((p, i) => (
          <li key={`${p.itemIndex}-${i}`}>{soldOutLine(p)}</li>
        ))}
      </ul>
      {failed ? <p className="mt-4 text-body-sm text-fg-muted">We couldn&apos;t load alternatives. You can pick something else in the shop.</p> : null}
      {data
        ? problems.map((p, i) => (
            <ProblemAlternatives
              key={`alt-${p.itemIndex}-${i}`}
              problem={p}
              line={lineFor(lines, p)}
              data={data}
              resolved={resolved.has(p.itemIndex)}
              onResolved={() => markResolved(p.itemIndex)}
            />
          ))
        : !failed
          ? <p className="mt-4 text-body-sm text-fg-muted" role="status">Looking for alternatives...</p>
          : null}
    </Modal>
  );
}

function ProblemAlternatives({
  problem,
  line,
  data,
  resolved,
  onResolved,
}: {
  problem: StockProblem;
  line: CartLine | undefined;
  data: AlternativesData;
  resolved: boolean;
  onResolved: () => void;
}) {
  const stimpieAlts = useMemo(() => {
    if (problem.kind !== 'STIMPIE' || !line) return [];
    const soldType = line.ui.stimpies.find((s) => s.id === problem.stimpieId)?.type ?? null;
    const inLine = line.item.kind === 'pack' ? line.item.stimpieIds : [];
    return stimpieAlternatives(data.stimpies, problem.stimpieId, soldType, inLine);
  }, [problem, line, data.stimpies]);

  if (resolved) {
    return (
      <p className="mt-4 text-body font-medium text-fg" role="status">
        Updated.
      </p>
    );
  }

  if (problem.kind === 'STIMPIE') {
    const dropSlug = data.dropSlugFor[problem.stimpieId];
    return (
      <section className="mt-5" aria-label={`Alternatives for ${problem.name}`}>
        {stimpieAlts.length > 0 ? (
          <>
            <h3 className="mb-3 text-h4">Swap in another Stimpie</h3>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="stimpie-alternatives">
              {stimpieAlts.map((s) => (
                <li key={s.id} className="flex flex-col gap-2">
                  <StimpieCard stimpie={s} variant="compact" sizes="140px" />
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      if (!line) return;
                      const swapped = swapStimpieInLine(line, problem.stimpieId, s);
                      if (!swapped) return;
                      cartStore.getState().replaceLine(line.lineId, swapped.item, swapped.ui);
                      onResolved();
                    }}
                  >
                    Swap in
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body text-fg-muted">
            No other Stimpies are available right now.{' '}
            {dropSlug ? <TextLink href={`/drops/${dropSlug}`}>Notify me about this drop</TextLink> : null}
            {dropSlug ? ' or ' : ''}
            <TextLink href="/shop">browse the shop</TextLink>.
          </p>
        )}
      </section>
    );
  }

  // HOODIE_VARIANT
  const hoodie = line?.ui.hoodieSlug ? data.hoodies[line.ui.hoodieSlug] : undefined;
  const choices: VariantChoice[] = hoodie ? variantAlternatives(hoodie, { colorId: problem.colorId, sizeId: problem.sizeId }) : [];
  return (
    <section className="mt-5" aria-label={`Alternatives for ${problem.name}`}>
      {hoodie && choices.length > 0 && line ? (
        <>
          <h3 className="mb-3 text-h4">Switch to another size or colour</h3>
          <ul className="flex flex-wrap gap-3" data-testid="variant-alternatives">
            {choices.map((c) => (
              <li key={`${c.colorId}-${c.sizeId}`}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    const switched = switchVariantInLine(line, hoodie, c);
                    if (!switched) return;
                    cartStore.getState().replaceLine(line.lineId, switched.item, switched.ui);
                    onResolved();
                  }}
                >
                  {`${c.colorName}, ${c.sizeLabel}`}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-body text-fg-muted">
          Nothing else is in stock right now. <TextLink href="/shop">Browse the shop</TextLink>.
        </p>
      )}
    </section>
  );
}
