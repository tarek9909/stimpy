'use client';

import { StimpieCard } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import type { CartLine } from '@/features/cart/types';
import { stimpieSelectable } from './composer';

/** The artwork picker is downloaded when a set needs Stimpies, after the initial hoodie controls are ready. */
export default function ComposerStimpies({ stimpies, cartLines, selectedIds, onSelect }: {
  stimpies: readonly Stimpie[];
  cartLines: readonly CartLine[];
  selectedIds: readonly number[];
  onSelect: (id: number) => void;
}) {
  return <ul className="scroll-row -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0" aria-label="Stimpies">
    {stimpies.map((stimpie) => <li key={stimpie.id} className="w-28 shrink-0 snap-start">
      <StimpieCard stimpie={stimpieSelectable(stimpie, cartLines) ? stimpie : { ...stimpie, purchasable: false }}
        variant="compact" selectable selected={selectedIds.includes(stimpie.id)} onSelect={() => onSelect(stimpie.id)} sizes="112px" />
    </li>)}
  </ul>;
}
