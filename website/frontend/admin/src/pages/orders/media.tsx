import { useState } from 'react';
import { useCatalogHoodies, useCatalogStimpies } from './catalog';
import type { AdminOrder, AdminOrderSummary } from './api';
import { useOrder } from './api';
import { Modal } from '@stimpy/ui';
import { Eye, Plus } from 'lucide-react';

export interface ResolvedMedia {
  hoodieImg: string | null;
  hoodieColor: string | null;
  hoodieSize: string | null;
  stimpieImgs: Array<{ name: string; url: string | null }>;
}

/** Hook to resolve high-res hoodie and Stimpie artwork URLs from item details and catalog. */
export function useOrderMediaResolver() {
  const stimpiesQuery = useCatalogStimpies();
  const hoodiesQuery = useCatalogHoodies();

  const resolveItemMedia = (item: {
    name: string;
    kind: string;
    details: {
      hoodie?: string | null;
      color?: string | null;
      size?: string | null;
      stimpies?: string[];
      hoodieImage?: string | null;
      stimpieImages?: Array<{ name: string; imageUrl: string | null }>;
    };
  }): ResolvedMedia => {
    const d = item.details;
    const stimpieCatalog = stimpiesQuery.data ?? [];
    const hoodieCatalog = hoodiesQuery.data ?? [];

    // 1. Resolve Hoodie Image
    let hoodieImg: string | null = d.hoodieImage ?? null;
    if (!hoodieImg && (d.hoodie || item.kind === 'HOODIE' || item.kind === 'PACK')) {
      const hoodie = hoodieCatalog.find((h) => !d.hoodie || h.name.toLowerCase() === d.hoodie.toLowerCase()) ?? hoodieCatalog[0];
      if (hoodie) {
        const colorMatch = d.color
          ? hoodie.images?.find((img) => img.toLowerCase().includes(d.color!.toLowerCase()))
          : null;
        hoodieImg = colorMatch ?? hoodie.images?.[0] ?? null;
      }
    }

    // 2. Resolve Stimpie Images
    const stimpieImgs: Array<{ name: string; url: string | null }> = [];
    if (d.stimpieImages && d.stimpieImages.length > 0) {
      d.stimpieImages.forEach((s) => {
        stimpieImgs.push({ name: s.name, url: s.imageUrl });
      });
    } else if (Array.isArray(d.stimpies) && d.stimpies.length > 0) {
      d.stimpies.forEach((name) => {
        const found = stimpieCatalog.find(
          (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase() || s.slug === name.toLowerCase().replace(/\s+/g, '-'),
        );
        stimpieImgs.push({
          name,
          url: found?.artworkUrl ?? found?.images?.[0] ?? null,
        });
      });
    } else if (item.kind === 'STIMPIE') {
      const found = stimpieCatalog.find(
        (s) => s.name.trim().toLowerCase() === item.name.trim().toLowerCase() || s.slug === item.name.toLowerCase().replace(/\s+/g, '-'),
      );
      stimpieImgs.push({
        name: item.name,
        url: found?.artworkUrl ?? found?.images?.[0] ?? null,
      });
    }

    return {
      hoodieImg,
      hoodieColor: d.color ?? null,
      hoodieSize: d.size ?? null,
      stimpieImgs,
    };
  };

  return { resolveItemMedia, isLoading: stimpiesQuery.isPending || hoodiesQuery.isPending };
}

/** Interactive media thumbnail with preview dialog */
export function OrderImageThumbnail({
  src,
  alt,
  title,
  subtitle,
  shape = 'square',
  size = 'md',
}: {
  src: string | null | undefined;
  alt: string;
  title?: string;
  subtitle?: string;
  shape?: 'square' | 'tarot';
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-muted text-fg-muted border border-line rounded-md text-[10px] font-mono ${
          shape === 'tarot' ? (size === 'sm' ? 'w-7 h-10' : size === 'lg' ? 'w-14 h-20' : 'w-9 h-13') : (size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-10 h-10')
        }`}
        title={title || alt}
      >
        N/A
      </div>
    );
  }

  const dimensions =
    shape === 'tarot'
      ? size === 'sm'
        ? 'w-7 h-10'
        : size === 'lg'
        ? 'w-14 h-20'
        : 'w-9 h-13'
      : size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
      ? 'w-16 h-16'
      : 'w-10 h-10';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`group relative overflow-hidden rounded-md border border-base/80 bg-surface-muted transition-all hover:border-fg hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent ${dimensions}`}
        title={`Click to preview ${title || alt}`}
      >
        <img src={src} alt={alt} className="h-full w-full object-cover object-center transition-transform group-hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye size={12} className="text-white drop-shadow" />
        </div>
      </button>

      {open ? (
        <Modal open={open} onClose={() => setOpen(false)} title={title || alt} size="md">
          <div className="flex flex-col items-center justify-center gap-3">
            {subtitle ? <p className="text-body-sm text-fg-muted">{subtitle}</p> : null}
            <div className="flex max-h-[65vh] w-full items-center justify-center overflow-hidden rounded-lg border border-base bg-surface-muted p-2">
              <img src={src} alt={alt} className="max-h-[60vh] max-w-full rounded object-contain shadow-sm" />
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** Visual thumbnails block displaying both Hoodie and Stimpie(s) with an aesthetic linkage */
export function OrderItemMediaThumbs({
  media,
  size = 'md',
}: {
  media: ResolvedMedia;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { hoodieImg, hoodieColor, hoodieSize, stimpieImgs } = media;
  const hasHoodie = !!hoodieImg;
  const hasStimpie = stimpieImgs.length > 0;

  if (!hasHoodie && !hasStimpie) return null;

  return (
    <div className="inline-flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      {hasHoodie ? (
        <OrderImageThumbnail
          src={hoodieImg}
          alt="Stimpy Hoodie"
          title={`Stimpy Hoodie (${[hoodieColor, hoodieSize].filter(Boolean).join(' · ') || 'Classic'})`}
          subtitle={[hoodieColor, hoodieSize].filter(Boolean).join(' · ')}
          shape="square"
          size={size}
        />
      ) : null}

      {hasHoodie && hasStimpie ? (
        <span className="text-fg-muted text-[11px] font-bold select-none">+</span>
      ) : null}

      {hasStimpie ? (
        <div className="flex items-center gap-1">
          {stimpieImgs.map((s, idx) => (
            <OrderImageThumbnail
              key={idx}
              src={s.url}
              alt={s.name}
              title={`Stimpie: ${s.name}`}
              subtitle="Back panel artwork"
              shape="tarot"
              size={size}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Cell component for Orders list table and mobile cards */
export function OrderListItemsCell({ order }: { order: AdminOrderSummary }) {
  const detailQuery = useOrder(order.id);
  const { resolveItemMedia } = useOrderMediaResolver();

  const items = detailQuery.data?.items;
  if (!items || items.length === 0) {
    return (
      <span className="block truncate font-medium text-body-sm" title={order.itemsSummary}>
        {order.itemsSummary}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 py-0.5">
      {items.map((item) => {
        const media = resolveItemMedia(item);
        const detailsText = [media.hoodieColor, media.hoodieSize].filter(Boolean).join(' · ');
        const stimpieNames = media.stimpieImgs.map((s) => s.name).join(', ');

        return (
          <div key={item.id} className="flex items-center gap-2.5">
            <OrderItemMediaThumbs media={media} size="sm" />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate font-medium text-body-sm text-fg leading-tight">
                {item.name}
                {item.qty > 1 ? <span className="text-fg-muted font-normal"> × {item.qty}</span> : null}
              </p>
              <p className="truncate text-[11px] text-fg-muted leading-tight mt-0.5">
                {[detailsText, stimpieNames ? `Back: ${stimpieNames}` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Detailed item row for OrderDetail page */
export function OrderDetailItemRow({
  item,
  moneyFormatter,
}: {
  item: AdminOrder['items'][number];
  moneyFormatter: (cents: number) => string;
}) {
  const { resolveItemMedia } = useOrderMediaResolver();
  const media = resolveItemMedia(item);
  const d = item.details;
  const parts = [d.hoodie, d.color, d.size].filter(Boolean).join(', ');

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <OrderItemMediaThumbs media={media} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-body text-fg">{item.name}</p>
          {parts ? <p className="text-body-sm text-fg-muted mt-0.5">{parts}</p> : null}
          {d.stimpies.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-body-xs font-semibold uppercase tracking-wider text-fg-muted">Back panel:</span>
              {d.stimpies.map((s, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-body-xs font-medium text-fg border border-line"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-baseline justify-between sm:flex-col sm:items-end sm:justify-center shrink-0">
        <p className="text-body-sm tabular-nums text-fg-muted">
          {item.qty} × {moneyFormatter(item.unitPriceCents)}
        </p>
        <p className="text-body font-bold tabular-nums text-fg">{moneyFormatter(item.lineTotalCents)}</p>
      </div>
    </li>
  );
}
