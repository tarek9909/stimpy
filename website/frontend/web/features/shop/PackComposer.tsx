'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Badge,
  Button,
  ColorSwatches,
  PriceTag,
  RadioGroup,
  SizeSelector,
  StimpieCard,
  TextLink,
  formatCents,
  type RadioOption,
} from '@stimpy/ui';
import type { HoodieDetail, Pack, Stimpie } from '@stimpy/api-client';
import { CART_FULL_TEXT, useAddToCart, type AddSource } from '@/features/cart/useAddToCart';
import { cartStore, useCart } from '@/features/cart/store';
import { StickyBarOffset } from '@/components/layout/FloatingWhatsAppGate';
import {
  HOODIE_ONLY,
  ISSUE_TEXT,
  buildCartLine,
  colorSoldOutIds,
  composerReducer,
  initialState,
  packById,
  requiredStimpies,
  selectionTotalCents,
  stimpieSelectable,
  validateComposer,
  type ComposerPreset,
  type ComposerState,
  type PackChoice,
} from './composer';

export interface PackComposerProps {
  hoodie: HoodieDetail;
  packs: readonly Pack[];
  stimpies: readonly Stimpie[];
  preset?: ComposerPreset;
  /** Delivery estimate ("2-3 working days") for the note under the button. */
  estimateText?: string | null;
  source?: AddSource;
  /** The chosen colour changed (the gallery shows its photo). */
  onColorChange?: (colorId: number) => void;
  /** Called after the line was added to the cart. */
  onAdded?: () => void;
  /** Mobile sticky bottom bar with total and Add to cart. Default true. */
  stickyBar?: boolean;
  /**
   * "Edit" from the cart (checkout-and-order-flow 1.3): the button reads "Save changes" and replaces this line (keeping
   * its quantity) instead of adding a new one. The line's own Stimpies are not counted against LOW stock limits.
   */
  replaceLine?: { lineId: string; qty: number };
}

const packValue = (c: PackChoice) => String(c);
const parseChoice = (v: string): PackChoice => (v === HOODIE_ONLY ? HOODIE_ONLY : Number(v));

/**
 * The pick-pack / colour / size / N-Stimpies flow (checkout-and-order-flow 1.3). Emits the exact `CartItem` the
 * checkout expects (see composer.ts). The rules live in composer.ts; this file is presentation.
 */
export function PackComposer({
  hoodie,
  packs,
  stimpies,
  preset,
  estimateText,
  source = 'product',
  onColorChange,
  onAdded,
  stickyBar = true,
  replaceLine,
}: PackComposerProps) {
  const data = useMemo(() => ({ hoodie, packs, stimpies }), [hoodie, packs, stimpies]);
  const allLines = useCart((s) => s.lines);
  const cartLines = useMemo(
    () => (replaceLine ? allLines.filter((l) => l.lineId !== replaceLine.lineId) : allLines),
    [allLines, replaceLine],
  );
  const add = useAddToCart();
  // The preset (`?color=&size=&pack=&stimpie=`) arrives after mount, so the server-rendered HTML stays identical
  // for every URL (the page stays static/ISR). It is applied once, before the visitor has interacted.
  const [state, dispatch] = useReducer(composerReducer, undefined, () => initialState(data, undefined, cartLines));
  const presetApplied = useRef(false);
  useEffect(() => {
    if (!preset || presetApplied.current) return;
    presetApplied.current = true;
    const hasValue = !!(preset.colorId || preset.sizeId || preset.packSlug || (preset.stimpieSlugs?.length ?? 0) > 0);
    if (hasValue) dispatch({ type: 'reset', state: initialState(data, preset, cartLines) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the preset is first known
  }, [preset]);
  const [added, setAdded] = useState(false);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tell the page which colour is chosen (gallery photo).
  useEffect(() => {
    if (state.colorId !== null) onColorChange?.(state.colorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify on colour change only
  }, [state.colorId]);

  // A chosen Stimpie that is no longer purchasable (refetch on focus): clear it with a notice.
  useEffect(() => {
    const gone = state.stimpieIds.filter((id) => {
      const s = stimpies.find((x) => x.id === id);
      return !s || !s.purchasable;
    });
    if (gone.length > 0) {
      dispatch({ type: 'dropStimpies', ids: gone });
      setNotice('A Stimpie you picked is no longer available, so we cleared it. Please pick another.');
    }
  }, [stimpies, state.stimpieIds]);

  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
  }, []);

  const need = requiredStimpies(packs, state.pack);
  const validation = validateComposer(data, state);
  const total = selectionTotalCents(data, state);
  const colors = hoodie.colors.map((c) => ({ id: c.id, name: c.name, hex: c.hex }));
  const soldOutColors = useMemo(() => colorSoldOutIds(hoodie), [hoodie]);
  const pickedPack = packById(packs, state.pack);

  const packOptions: RadioOption[] = [
    { value: HOODIE_ONLY, label: 'Hoodie only', description: 'Wear it plain. Add Stimpies any time.', meta: formatCents(hoodie.priceCents) },
    ...packs.map((p) => ({
      value: packValue(p.id),
      label: (
        <span className="flex flex-wrap items-center gap-2">
          {p.name}
          {p.badge ? <Badge kind="POPULAR" label={p.badge} /> : null}
        </span>
      ),
      description: p.description,
      meta: formatCents(p.priceCents),
    })),
  ];

  function onAdd() {
    const line = buildCartLine(data, state);
    if (!line) return;
    const result = replaceLine
      ? cartStore.getState().replaceLine(replaceLine.lineId, { ...line.item, qty: replaceLine.qty } as typeof line.item, line.ui)
      : add(line, source);
    if (!result.ok) {
      setFull(result.reason === 'FULL');
      return;
    }
    setFull(false);
    setAdded(true);
    onAdded?.();
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 1800);
  }

  const soldOut = validation.issue === 'HOODIE_SOLD_OUT';
  const addLabel = soldOut ? 'Sold out' : added ? (replaceLine ? 'Saved' : 'Added') : replaceLine ? 'Save changes' : 'Add to cart';
  const helper = !validation.valid && validation.issue ? (validation.issue === 'NEED_STIMPIES' && validation.progressLabel ? validation.progressLabel : ISSUE_TEXT[validation.issue]) : null;

  const button = (size: 'md' | 'lg', fullWidth: boolean) => (
    <Button variant="cta" size={size} fullWidth={fullWidth} disabled={!validation.valid} onClick={onAdd}>
      {addLabel}
    </Button>
  );

  return (
    <div className="store-composer flex flex-col gap-6">
      <RadioGroup
        name="pack"
        legend="Choose your set"
        variant="card"
        value={packValue(state.pack)}
        onChange={(v) => dispatch({ type: 'pack', pack: parseChoice(v), packs })}
        options={packOptions}
      />

      <ColorSwatches
        colors={colors}
        value={state.colorId}
        onChange={(id) => dispatch({ type: 'color', colorId: id, hoodie })}
        soldOutIds={soldOutColors}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body font-medium text-fg">Size</span>
          <TextLink href="/help?tab=size" className="text-body-sm">
            Size guide
          </TextLink>
        </div>
        <SizeSelector
          sizes={hoodie.sizes.map((s) => ({ id: s.id, label: s.label }))}
          variants={hoodie.variants}
          colorId={state.colorId ?? -1}
          value={state.sizeId}
          onChange={(id) => dispatch({ type: 'size', sizeId: id })}
          label="Size"
        />
      </div>

      {need > 0 ? (
        <div className="flex flex-col gap-3" data-testid="stimpie-picker">
          <p className="text-body font-medium text-fg" role="status" aria-live="polite">
            {validation.progressLabel}
          </p>
          <ul className="scroll-row -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0" aria-label="Stimpies">
            {stimpies.map((s) => {
              const selectable = stimpieSelectable(s, cartLines);
              const selected = state.stimpieIds.includes(s.id);
              // Picking is allowed while a slot is free or when swapping a one-Stimpie pack.
              return (
                <li key={s.id} className="w-28 shrink-0 snap-start">
                  <StimpieCard
                    stimpie={selectable ? s : { ...s, purchasable: false }}
                    variant="compact"
                    selectable
                    selected={selected}
                    onSelect={() => dispatch({ type: 'toggleStimpie', stimpieId: s.id, need })}
                    sizes="112px"
                  />
                </li>
              );
            })}
          </ul>
          {notice ? (
            <p role="status" className="text-body-sm font-medium text-fg">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={stickyBar ? "hidden flex-col gap-2 md:flex" : "flex flex-col gap-2"}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body text-fg-muted">{pickedPack ? pickedPack.name : 'Hoodie only'}</span>
          <PriceTag cents={total} size="lg" />
        </div>
        {button('lg', true)}
        {helper ? (
          <p className="text-body-sm text-fg-muted" data-testid="composer-helper">
            {helper}
          </p>
        ) : null}
        {full ? <p className="text-body-sm font-medium text-fg">{CART_FULL_TEXT}</p> : null}
      </div>

      {estimateText ? <p className="text-body-sm text-fg-muted">Cash on delivery. {estimateText}.</p> : null}

      {stickyBar ? (
        <>
          <StickyBarOffset px={80} />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-base bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-float md:hidden">
            <div className="mx-auto flex max-w-xl items-center gap-4">
              <div className="min-w-0">
                <PriceTag cents={total} size="md" />
                {helper || full ? (
                  <p className="truncate text-caption text-fg-muted">{full ? CART_FULL_TEXT : helper}</p>
                ) : null}
              </div>
              <div className="ml-auto">{button('lg', false)}</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export type { ComposerState };
