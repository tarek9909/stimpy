import { formatCents } from '@stimpy/ui';
import type { BuilderCartSummary, BuilderHoodie, BuilderPack, BuilderStimpie, JoinedColor } from '../types';
import { packById, type Selection } from './selection';

export function stimpieById(stimpies: readonly BuilderStimpie[], id: number | null): BuilderStimpie | null {
  return id === null ? null : (stimpies.find((s) => s.id === id) ?? null);
}

/** Polite live-region sentence (builder.md 10.1): "Midnight Cedar selected. Hoodie plus 2 Stimpies, $45." */
export function liveAnnouncement(args: {
  color: JoinedColor | null;
  selection: Selection;
  packs: readonly BuilderPack[];
  hoodie: BuilderHoodie | null | undefined;
  stimpie: BuilderStimpie | null;
}): string {
  const { color, selection, packs, hoodie, stimpie } = args;
  const pack = packById(packs, selection.packId);
  const price = pack ? pack.priceCents : (hoodie?.priceCents ?? null);
  const what = pack ? `Hoodie plus ${pack.stimpieCount} Stimpie${pack.stimpieCount === 1 ? '' : 's'}` : 'Hoodie only';
  const parts = [`${color?.name ?? 'Hoodie'} selected.`];
  if (stimpie) parts.push(`${stimpie.name} on the back.`);
  parts.push(price === null ? `${what}.` : `${what}, ${formatCents(price)}.`);
  return parts.join(' ');
}

/** Accessible name of the stage (builder.md 13): real text, includes "Preview". */
export function stageLabel(view: '2d' | '3d', color: JoinedColor | null, stimpie: BuilderStimpie | null): string {
  const c = color?.name ?? '';
  const s = stimpie ? ` with the ${stimpie.name} Stimpie on the back` : '';
  if (view === '3d') return `Preview. 3D preview of a ${c} Stimpy hoodie${s}. Drag to rotate.`.replace('  ', ' ');
  return `Preview. ${c} Stimpy hoodie, back view${s}.`.replace('  ', ' ');
}

/** Cart display snapshot stored next to the item by the host cart. */
export function buildCartSummary(args: {
  selection: Selection;
  packs: readonly BuilderPack[];
  stimpies: readonly BuilderStimpie[];
  hoodie: BuilderHoodie;
  color: JoinedColor;
  sizeLabel: string | null;
}): BuilderCartSummary {
  const { selection, packs, stimpies, hoodie, color, sizeLabel } = args;
  const pack = packById(packs, selection.packId);
  const chosen = pack ? selection.slots.flatMap((id) => stimpieById(stimpies, id) ?? []) : [];
  return {
    title: pack ? pack.name : hoodie.name,
    imageUrl: color.photo ?? hoodie.images[0] ?? null,
    hoodieSlug: hoodie.slug,
    packSlug: pack?.slug ?? null,
    colorName: color.name,
    colorHex: color.hex,
    sizeLabel,
    stimpies: chosen.map((s) => ({ id: s.id, slug: s.slug, name: s.name, artworkUrl: s.artworkUrl, type: s.type })),
    unitPriceCents: pack ? pack.priceCents : hoodie.priceCents,
  };
}
