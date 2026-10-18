import type { KeyboardEventHandler, ReactNode, Ref, RefObject } from 'react';
import Link from 'next/link';
import { ArrowRight, Box, Maximize2 } from 'lucide-react';
import type { BuilderData, BuilderStimpie, JoinedColor } from '@stimpy/builder';
import { joinColors, usable2D } from '@stimpy/builder/src/lib/join';
import { placementStyle } from '@stimpy/builder/src/lib/placement';

export function teaserColors(data: BuilderData): JoinedColor[] {
  return joinColors(data.colors, data.config).filter(usable2D);
}

type Props = {
  colors: readonly JoinedColor[];
  stimpies: readonly BuilderStimpie[];
  color: JoinedColor;
  stimpie: BuilderStimpie;
  stage: ReactNode;
  preview?: ReactNode;
  previewTrigger?: Ref<HTMLButtonElement>;
  colorRefs?: RefObject<Map<number, HTMLButtonElement>>;
  stimpieRefs?: RefObject<Map<number, HTMLButtonElement>>;
  selectColor?: (id: number) => void;
  selectStimpie?: (item: BuilderStimpie) => void;
  handleColorKeys?: KeyboardEventHandler<HTMLDivElement>;
  handleStimpieKeys?: KeyboardEventHandler<HTMLDivElement>;
  openPreview?: () => void;
};

/** The server poster and enhanced controls share their geometry so activation never shifts the page. */
export function BuilderTeaserView({ colors, stimpies, color, stimpie, stage, preview, previewTrigger, colorRefs, stimpieRefs, selectColor, selectStimpie, handleColorKeys, handleStimpieKeys, openPreview }: Props) {
  const fullBuilder = `/builder?color=${encodeURIComponent(color.id)}&stimpie=${encodeURIComponent(stimpie.slug)}`;
  return (
    <section data-builder="teaser" data-builder-view="2d" aria-label="Builder" className="store-teaser grid grid-cols-1 items-center gap-6 md:grid-cols-2">
      <div className="mx-auto w-full max-w-[384px]">
        <div
          role="group"
          aria-label={`Preview: ${color.name} Stimpy hoodie with the ${stimpie.name} Stimpie`}
          data-builder-frame
          className="relative mx-auto w-full overflow-hidden bg-cream"
          style={{ aspectRatio: '4 / 5' }}
        >
          {stage}
          <button ref={previewTrigger} type="button" className="store-preview-trigger" aria-label="Open 3D preview" aria-haspopup="dialog" disabled={!openPreview} onClick={openPreview}>
            <span className="store-preview-trigger-label"><Box size={16} aria-hidden="true" /> 3D preview</span>
            <span className="store-preview-expand" title="Open 3D preview"><Maximize2 size={18} aria-hidden="true" /></span>
          </button>
        </div>
        <div className="store-teaser-caption"><span>{stimpie.name}</span><span>{color.name} hoodie</span></div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="text-body-sm font-medium text-fg">Colour: <span className="text-fg-muted">{color.name}</span></p>
          <div role="radiogroup" aria-label="Hoodie colour" onKeyDown={handleColorKeys} className="mt-2 flex flex-wrap gap-2">
            {colors.map((item) => (
              <button
                key={item.id}
                ref={colorRefs ? (node) => {
                  if (node) colorRefs.current.set(item.id, node);
                  else colorRefs.current.delete(item.id);
                } : undefined}
                type="button"
                role="radio"
                aria-label={item.name}
                title={item.name}
                aria-checked={item.id === color.id}
                tabIndex={item.id === color.id ? 0 : -1}
                disabled={!selectColor} onClick={selectColor ? () => selectColor(item.id) : undefined}
                className="store-teaser-swatch"
              >
                <span aria-hidden="true" style={{ backgroundColor: item.hex }} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-body-sm font-medium text-fg">Choose a Stimpie</p>
          <div
            role="listbox"
            aria-label="Stimpies"
            data-builder-carousel
            onKeyDown={handleStimpieKeys}
            className="flex w-full min-w-0 max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-1 pb-3 pt-1"
            style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
          >
            {stimpies.map((item) => (
              <button
                key={item.id}
                ref={stimpieRefs ? (node) => {
                  if (node) stimpieRefs.current.set(item.id, node);
                  else stimpieRefs.current.delete(item.id);
                } : undefined}
                type="button"
                role="option"
                aria-label={[item.name, item.status === 'SOLD_OUT' ? 'Sold out' : item.status === 'UPCOMING' ? 'Coming soon' : ''].filter(Boolean).join(', ')}
                aria-selected={item.id === stimpie.id}
                tabIndex={item.id === stimpie.id ? 0 : -1}
                data-stimpie-slug={item.slug}
                data-selected={item.id === stimpie.id ? 'true' : 'false'}
                data-preview={item.id === stimpie.id ? 'true' : 'false'}
                disabled={!selectStimpie} onFocus={selectStimpie ? () => item.id !== stimpie.id && selectStimpie(item) : undefined}
                onClick={selectStimpie ? () => selectStimpie(item) : undefined}
                className="w-28 shrink-0 snap-start overflow-hidden rounded-md bg-white text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                style={{ outline: item.id === stimpie.id ? '3px solid #111111' : '3px solid transparent' }}
              >
                <span className="relative block overflow-hidden bg-cream" style={{ aspectRatio: '0.64' }}>
                  <img src={item.artworkUrl} alt="" width={160} height={250} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                </span>
                <span className="block truncate px-1 pb-1 pt-1 text-caption font-medium text-ink">{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <Link
          href={fullBuilder}
          data-builder-open-full
          className="inline-flex min-h-11 self-start items-center justify-center rounded-md border border-control bg-white px-5 py-3 text-body font-semibold text-ink underline-offset-4 hover:bg-cream hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Customize this look <ArrowRight size={16} aria-hidden="true" className="ml-3" />
        </Link>
      </div>
      {preview}
    </section>
  );
}

/** A server-rendered first look: the same images and layers used after the interactive island loads. */
export function BuilderTeaserStatic({ data }: { data: BuilderData }) {
  const colors = teaserColors(data);
  const stimpies = data.stimpies.slice(0, 6);
  const color = colors[0];
  const stimpie = stimpies[0];
  if (!color || !stimpie) return null;
  return <BuilderTeaserView colors={colors} stimpies={stimpies} color={color} stimpie={stimpie} stage={
    <div data-builder-stage="2d" className="relative w-full select-none overflow-hidden bg-cream" style={{ aspectRatio: '4 / 5' }}>
      <img src={color.hoodieImage2d!} alt={`${color.name} Stimpy hoodie, back view`} width={1000} height={1250} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      <div className="absolute" style={placementStyle(color.placement2d!)}>
        <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: '4% / 2.56%', boxShadow: color.overlay2d ? undefined : 'inset 0 0 0 1px rgba(0,0,0,0.06), inset 0 0 14px rgba(0,0,0,0.10)' }}>
          <img src={stimpie.artworkUrl} alt={`${stimpie.name} Stimpie`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        </div>
      </div>
      {color.overlay2d ? <img src={color.overlay2d} alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full object-contain" draggable={false} /> : null}
    </div>
  } />;
}
