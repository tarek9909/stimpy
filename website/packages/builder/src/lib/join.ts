import type { BuilderConfigData, BuilderStimpie, BuilderView, JoinedColor, OptionColor } from '../types';

/**
 * Usable colours (builder.md 2.2): `GET /options` colours joined with `config.colors` on `colorId`, ordered by
 * `position`. A colour with no config entry is not shown (the founder has not set its look yet).
 */
export function joinColors(options: readonly OptionColor[], config: Pick<BuilderConfigData, 'colors'>): JoinedColor[] {
  const byId = new Map(config.colors.map((c) => [c.colorId, c]));
  return [...options]
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .flatMap((o): JoinedColor[] => {
      const c = byId.get(o.id);
      if (!c) return [];
      return [
        {
          id: o.id,
          name: o.name,
          hex: o.hex,
          position: o.position,
          photo: o.images?.[0] ?? null,
          tint: c.tint,
          texture3d: c.texture3d,
          hoodieImage2d: c.hoodieImage2d,
          overlay2d: c.overlay2d,
          placement2d: c.placement2d,
        },
      ];
    });
}

/** 2D needs the flat hoodie image and the placement. */
export function usable2D(c: JoinedColor): boolean {
  return c.hoodieImage2d !== null && c.hoodieImage2d !== '' && c.placement2d !== null;
}

/** 3D is always possible when there is a model (the tint falls back to `Color.hex`). */
export function usable3D(_c: JoinedColor, hasModel: boolean): boolean {
  return hasModel;
}

export function colorsForView(colors: readonly JoinedColor[], view: BuilderView, hasModel: boolean): JoinedColor[] {
  return colors.filter((c) => (view === '2d' ? usable2D(c) : usable3D(c, hasModel)));
}

/**
 * Keep `colorId` when the view can render it, else the first usable colour of that view (no error, builder.md 2.2 rule 5).
 * Returns null when the view has no usable colour at all.
 */
export function resolveColorForView(
  colors: readonly JoinedColor[],
  colorId: number | null,
  view: BuilderView,
  hasModel: boolean,
): number | null {
  const list = colorsForView(colors, view, hasModel);
  if (colorId !== null && list.some((c) => c.id === colorId)) return colorId;
  return list[0]?.id ?? null;
}

/** Tint applied to the body material in 3D: `colors[].tint ?? Color.hex`. */
export function tintFor(c: JoinedColor): string {
  return c.tint ?? c.hex;
}

/** 3D texture of a Stimpie: its override when present, else the artwork. 2D always uses the artwork. */
export function textureUrlFor(stimpie: BuilderStimpie, overrides: BuilderConfigData['stimpieTextures']): string {
  return overrides.find((t) => t.stimpieId === stimpie.id)?.textureUrl ?? stimpie.artworkUrl;
}

export type StimpieTag = 'Core' | 'Limited' | 'Last few' | 'Sold out' | 'Coming soon' | 'Ended';

/** Card tag from `type`/`status` (builder.md 10.1). */
export function stimpieTag(s: BuilderStimpie): StimpieTag {
  if (s.status === 'SOLD_OUT') return 'Sold out';
  if (s.status === 'UPCOMING') return 'Coming soon';
  if (s.status === 'ENDED') return 'Ended';
  if (s.status === 'LOW') return 'Last few';
  return s.type === 'LIMITED' ? 'Limited' : 'Core';
}

/** Why a Stimpie cannot be added (shown on the card and in the hint), or null when it can. */
export function stimpieBlockReason(s: BuilderStimpie): string | null {
  if (s.purchasable) return null;
  if (s.status === 'SOLD_OUT') return 'Sold out';
  if (s.status === 'UPCOMING') return 'Coming soon';
  if (s.status === 'ENDED') return 'Drop ended';
  return 'Not available';
}
