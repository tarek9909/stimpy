'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import { Button, ErrorState, Modal, Skeleton, SkeletonGroup } from '@stimpy/ui';
import { browserApi } from '@/lib/api-browser';
import { PackComposer } from '@/features/shop/PackComposer';
import type { ComposerPreset } from '@/features/shop/composer';
import { useCart } from './store';
import type { CartLine } from './types';

interface Loaded {
  hoodie: HoodieDetail;
  packs: Pack[];
  stimpies: Stimpie[];
}

/** The composer preset that re-creates a cart line (checkout-and-order-flow 1.3: "Edit" re-opens PackComposer pre-filled). */
export function presetForLine(line: CartLine): ComposerPreset {
  const { item, ui } = line;
  if (item.kind === 'stimpie') return {};
  return {
    colorId: item.colorId,
    sizeId: item.sizeId,
    packSlug: item.kind === 'pack' ? ui.packSlug : null,
    stimpieSlugs: item.kind === 'pack' ? ui.stimpies.map((s) => s.slug) : [],
  };
}

/** Can this line be edited with the pack composer? Pack and hoodie lines with a known hoodie page can. */
export function canEditLine(line: CartLine): boolean {
  return line.item.kind !== 'stimpie' && !!line.ui.hoodieSlug;
}

/**
 * "Edit" / "Find a replacement" for a pack or hoodie line: the same PackComposer, pre-filled, loaded fresh
 * (no-store) so sold-out sizes and Stimpies show as they are now. Saving replaces the line in place.
 */
export function EditLineModal({ lineId, onClose }: { lineId: string | null; onClose: () => void }) {
  const line = useCart((s) => (lineId ? (s.lines.find((l) => l.lineId === lineId) ?? null) : null));
  const slug = line?.ui.hoodieSlug ?? null;
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    const api = browserApi();
    void (async () => {
      try {
        const [h, p, s] = await Promise.all([
          api.GET('/api/v1/products/hoodies/{slug}', { params: { path: { slug } }, cache: 'no-store' }),
          api.GET('/api/v1/packs', { cache: 'no-store' }),
          api.GET('/api/v1/products/stimpies', { params: { query: { includeSoldOut: 'true' } }, cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (!h.data || !p.data || !s.data) throw new Error('empty');
        setData({ hoodie: h.data, packs: p.data, stimpies: s.data });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, attempt, lineId]);

  const preset = useMemo(() => (line ? presetForLine(line) : undefined), [line]);
  const open = lineId !== null && line !== null;

  return (
    <Modal open={open} onClose={onClose} title={line ? `Change ${line.ui.title}` : 'Change item'} size="lg">
      {failed ? (
        <ErrorState
          title="We couldn't load this item"
          text="Check your connection and try again."
          onRetry={() => setAttempt((n) => n + 1)}
          action={
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          }
        />
      ) : !data || !line ? (
        <SkeletonGroup label="Loading">
          <Skeleton variant="rect" className="h-32" />
        </SkeletonGroup>
      ) : (
        <PackComposer
          // A fresh composer per opened line (its reducer state is initialised once).
          key={`${line.lineId}:${attempt}`}
          hoodie={data.hoodie}
          packs={data.packs}
          stimpies={data.stimpies}
          preset={preset}
          source="product"
          stickyBar={false}
          replaceLine={{ lineId: line.lineId, qty: line.item.qty }}
          onAdded={onClose}
        />
      )}
    </Modal>
  );
}
