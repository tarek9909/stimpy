import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Builder, parseShareParams, type BuilderPreviewContext } from '../src';
import { data } from './fixtures';

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  // no WAAPI in jsdom: the Stage degrades to an instant swap
  vi.stubGlobal('requestIdleCallback', undefined);
});
afterEach(() => vi.unstubAllGlobals());

const carousel = () => screen.getByRole('listbox', { name: 'Stimpies' });
const option = (name: RegExp) => within(carousel()).getByRole('option', { name });

describe('Builder (page, 2D)', () => {
  it('shows only usable colours in 2D, ordered by position, with the sold-out strike in the accessible name', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Hoodie colour' });
    const radios = within(group).getAllByRole('radio');
    // Stone has no 2D image (hidden), Coral has no config entry (hidden)
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Black', 'Cream, sold out']);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveAttribute('tabindex', '0');
    expect(radios[1]).toHaveAttribute('tabindex', '-1');
  });

  it('swatches: arrow keys move the selection (radiogroup) and update the stage', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const black = screen.getByRole('radio', { name: 'Black' });
    black.focus();
    fireEvent.keyDown(black, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Cream, sold out' })).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelector('[data-builder-color-name]')).toHaveTextContent('Cream');
  });

  it('server-renderable: first render shows the hoodie image (LCP) and first Stimpie, a Preview label and See real photos', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    expect(screen.getByAltText('Black Stimpy hoodie, back view')).toHaveAttribute('fetchpriority', 'high');
    expect(screen.getByAltText('Stimpie 1 Stimpie')).toBeInTheDocument();
    expect(screen.getAllByText('Preview').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'See real photos' })).toHaveAttribute('href', '/shop/stimpie/stimpie-1');
  });

  it('no toggle and no three.js in 2D-only mode', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    expect(document.querySelector('[data-builder-toggle]')).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('connects a host preview action to live colours, Stimpies and pack duplicate rules', () => {
    const preview = vi.fn((context: BuilderPreviewContext) => <div>
      <button onClick={() => context.onColorChange(2)}>Preview cream</button>
      <button onClick={() => context.onStimpieChange(2)}>Preview second Stimpie</button>
      <button onClick={() => context.onStimpieChange(1)}>Preview duplicate</button>
    </div>);
    render(<Builder data={data()} renderPreviewAction={preview} />);
    expect(document.querySelector('[data-layer="preview-chip"]')).toBeNull();
    expect(preview.mock.lastCall?.[0]).toMatchObject({ colorId: 1, stimpieId: 1 });
    expect(preview.mock.lastCall?.[0].disabledStimpieIds.has(1)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Preview cream' }));
    expect(preview.mock.lastCall?.[0].colorId).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Preview second Stimpie' }));
    expect(preview.mock.lastCall?.[0].stimpieId).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Preview duplicate' }));
    expect(preview.mock.lastCall?.[0].stimpieId).toBe(2);
    expect(within(screen.getByRole('group', { name: 'Pack slots' })).getByRole('button', { name: /In the box/ })).toHaveTextContent('Stimpie 2');
  });

  it('carousel: listbox of options, roving tabindex (one tab stop), selected state with aria-selected', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const options = within(carousel()).getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(option(/Stimpie 1/)).toHaveAttribute('aria-selected', 'true');
    expect(option(/Stimpie 2/)).toHaveAttribute('aria-selected', 'false');
    expect(option(/Stimpie 3/).getAttribute('aria-label')).toContain('Sold out');
  });

  it('carousel keyboard: arrows move focus, Enter selects, Home/End jump', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const first = option(/Stimpie 1/);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(option(/Stimpie 2/));
    expect(option(/Stimpie 2/)).toHaveAttribute('aria-selected', 'false'); // focus only
    fireEvent.keyDown(option(/Stimpie 2/), { key: 'Enter' });
    expect(option(/Stimpie 2/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(option(/Stimpie 2/), { key: 'End' });
    expect(document.activeElement).toBe(option(/Stimpie 4/));
    fireEvent.keyDown(option(/Stimpie 4/), { key: 'Home' });
    expect(document.activeElement).toBe(option(/Stimpie 1/));
  });

  it('pack selector defaults to "Most popular" and shows names and prices from the packs', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const packs = screen.getByRole('radiogroup', { name: 'Pack' });
    const radios = within(packs).getAllByRole('radio');
    expect(radios).toHaveLength(3); // 1 Stimpie, 2 Stimpies, Hoodie only
    expect(within(packs).getByRole('radio', { name: /Hoodie \+ 2 Stimpies/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(packs).getByRole('radio', { name: /Hoodie \+ 2 Stimpies/ })).toHaveTextContent('$45');
    expect(within(packs).getByRole('radio', { name: /Hoodie only/ })).toHaveTextContent('$25');
    expect(within(packs).getByText('Most popular')).toBeInTheDocument();
  });

  it('2-Stimpie pack: slots, "Pick 1 more Stimpie", duplicates disabled, running price from the pack', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const slots = screen.getByRole('group', { name: 'Pack slots' });
    expect(within(slots).getAllByRole('button')).toHaveLength(2);
    expect(within(slots).getByRole('button', { name: /On your hoodie/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(slots).getByRole('button', { name: /In the box/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Pick 1 more Stimpie')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: /Add to cart/ });
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent('Add to cart - $45');
    // Stimpie 1 already fills slot 1: the card is disabled for slot 2 and a click does nothing
    expect(option(/Stimpie 1/)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(option(/Stimpie 1/));
    expect(within(slots).getByRole('button', { name: /In the box/ })).toHaveTextContent('Choose');
    fireEvent.click(option(/Stimpie 2/));
    expect(within(slots).getByRole('button', { name: /In the box/ })).toHaveTextContent('Stimpie 2');
    expect(screen.getByRole('button', { name: /Add to cart/ })).toBeEnabled();
    // changing pack updates the price immediately
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ }));
    expect(screen.getByRole('button', { name: /Add to cart/ })).toHaveTextContent('Add to cart - $35');
    expect(screen.queryByRole('group', { name: 'Pack slots' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie only/ }));
    expect(screen.getByRole('button', { name: /Add to cart/ })).toHaveTextContent('Add to cart - $25');
  });

  it('sold-out Stimpie: previewable, not addable, with the reason (test 27)', async () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    fireEvent.click(option(/Stimpie 3/));
    expect(await screen.findByAltText('Stimpie 3 Stimpie', {}, { timeout: 1500 })).toBeInTheDocument(); // previewed on the hoodie
    expect(screen.getByRole('button', { name: /Add to cart/ })).toBeDisabled();
    expect(screen.getByText('Choose an available Stimpie')).toBeInTheDocument();
  });

  it('sold-out colour: Add to cart disabled with the colour message, other colour works (test 26)', () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cream, sold out' }));
    expect(screen.getByText('This colour is sold out. Try another colour.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to cart/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Black' }));
    expect(screen.queryByText('This colour is sold out. Try another colour.')).toBeNull();
  });

  it('pack flow: fill both slots, choose a size in the sheet, add: emits exactly the CartItem (test 25)', async () => {
    const onAdd = vi.fn();
    render(<Builder data={data()} onAddToCart={onAdd} />);
    fireEvent.click(option(/Stimpie 4/));
    fireEvent.click(screen.getByRole('button', { name: /Add to cart/ }));
    const sheet = await screen.findByText('Choose your size');
    expect(sheet).toBeInTheDocument();
    // L is sold out for Black, M has "only 4 left"
    expect(screen.getByRole('radio', { name: 'L, sold out' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'M, only 4 left' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Size guide' })).toHaveAttribute('href', '/help');
    const confirm = document.querySelector('[data-builder-confirm-size]') as HTMLButtonElement;
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'M, only 4 left' }));
    expect(confirm).toBeEnabled();
    expect(confirm).toHaveTextContent('Add to cart - $45');
    fireEvent.click(confirm);
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [item, summary] = onAdd.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(item).toEqual({ kind: 'pack', packId: 2, hoodieId: 7, colorId: 1, sizeId: 11, stimpieIds: [1, 4], qty: 1 });
    expect(summary).toMatchObject({ title: 'Hoodie + 2 Stimpies', packSlug: 'hoodie-2', colorName: 'Black', sizeLabel: 'M', unitPriceCents: 4500 });
  });

  it('hoodie only emits the hoodie item shape', async () => {
    const onAdd = vi.fn();
    render(<Builder data={data()} onAddToCart={onAdd} />);
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie only/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add to cart/ }));
    await screen.findByText('Choose your size');
    fireEvent.click(screen.getByRole('radio', { name: 'S' }));
    fireEvent.click(document.querySelector('[data-builder-confirm-size]') as HTMLElement);
    expect(onAdd.mock.calls[0]?.[0]).toEqual({ kind: 'hoodie', hoodieId: 7, colorId: 1, sizeId: 10, qty: 1 });
  });

  it('refreshes stock before opening the size sheet', async () => {
    const current = data().hoodie!;
    const refreshInventory = vi.fn(async () => ({
      ...current,
      variants: current.variants.map((v) => v.colorId === 1 && v.sizeId === 11 ? { ...v, inStock: false, remaining: 0 } : v),
    }));
    render(<Builder data={data()} onAddToCart={vi.fn()} refreshInventory={refreshInventory} />);
    fireEvent.click(option(/Stimpie 4/));
    fireEvent.click(screen.getByRole('button', { name: /Add to cart/ }));
    await screen.findByText('Choose your size');
    expect(refreshInventory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'M, sold out' })).toBeDisabled();
  });

  it('a share link restores colour, Stimpie and pack; invalid values are ignored silently (test 24)', () => {
    render(<Builder data={data()} initialShare={parseShareParams({ color: '2', stimpie: 'stimpie-2', pack: 'hoodie-1' })} onAddToCart={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Cream, sold out' })).toHaveAttribute('aria-checked', 'true');
    expect(option(/Stimpie 2/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ })).toHaveAttribute('aria-checked', 'true');
    document.body.innerHTML = '';
    render(<Builder data={data()} initialShare={parseShareParams({ color: '999', stimpie: 'nope', pack: '!!' })} onAddToCart={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Black' })).toHaveAttribute('aria-checked', 'true');
  });

  it('previews a shared upcoming Stimpie without allowing purchase and links to its drop', () => {
    const upcoming = { ...data().stimpies[0]!, id: 9, slug: 'future-stimpie', name: 'Future Stimpie', status: 'UPCOMING' as const, purchasable: false, drop: { slug: 'future-drop', name: 'Future Drop', accentHex: '#FFE45C' } };
    render(<Builder data={data({ stimpies: [upcoming] })} initialShare={parseShareParams({ stimpie: 'future-stimpie' })} onAddToCart={vi.fn()} />);
    expect(option(/Future Stimpie/)).toHaveAttribute('aria-selected', 'true');
    expect(option(/Future Stimpie/)).toHaveAttribute('aria-label', expect.stringContaining('Coming soon'));
    expect(screen.getByRole('link', { name: 'See the upcoming drop' })).toHaveAttribute('href', '/drops/future-drop');
    expect(screen.getByRole('button', { name: /Add to cart/ })).toBeDisabled();
  });

  it('keeps the URL in sync with replaceState (no history entry) when syncUrl is set', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    render(<Builder data={data()} syncUrl onAddToCart={vi.fn()} />);
    await flush();
    fireEvent.click(option(/Stimpie 2/));
    await flush();
    const last = replace.mock.calls.at(-1)?.[2] as string;
    expect(last).toContain('color=1');
    expect(last).toContain('stimpie=stimpie-1');
    expect(last).toContain('pack=hoodie-2');
    expect(last).toContain('stimpie2=stimpie-2');
    expect(push).not.toHaveBeenCalled();
  });

  it('live region announces selections politely', async () => {
    render(<Builder data={data()} onAddToCart={vi.fn()} />);
    const live = document.querySelector('[data-builder-live]') as HTMLElement;
    expect(live).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ }));
    await flush();
    expect(live).toHaveTextContent('Black selected. Stimpie 1 on the back. Hoodie plus 1 Stimpie, $35.');
  });

  it('emits the analytics events with no personal data', async () => {
    const track = vi.fn();
    render(<Builder data={data()} onAddToCart={vi.fn()} track={track} source="share" />);
    await flush();
    expect(track).toHaveBeenCalledWith('builder_open', { surface: 'page', source: 'share' });
    expect(track).toHaveBeenCalledWith('builder_mode_resolved', expect.objectContaining({ effective_mode: '2D', view: '2d', reason: 'DEFAULT' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Cream, sold out' }));
    expect(track).toHaveBeenCalledWith('builder_color_select', { color_id: 2 });
    fireEvent.click(option(/Stimpie 2/));
    expect(track).toHaveBeenCalledWith('builder_stimpie_select', { stimpie_slug: 'stimpie-2', slot: 2, view: '2d' });
    fireEvent.click(screen.getByRole('radio', { name: /Hoodie \+ 1 Stimpie/ }));
    expect(track).toHaveBeenCalledWith('builder_pack_select', { pack_slug: 'hoodie-1' });
    fireEvent.click(screen.getByRole('link', { name: 'See real photos' }));
    expect(track).toHaveBeenCalledWith('builder_see_photos', { target: 'stimpie' });
  });

  it('the purchase UI is not rendered without onAddToCart (dashboard preview)', () => {
    render(<Builder data={data()} />);
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
  });
});

describe('Builder fallbacks', () => {
  it('shows the static fallback when no colour is usable, with no error wording (builder.md 6.5)', () => {
    const d = data();
    d.config = { ...d.config, colors: [] };
    render(<Builder data={d} onAddToCart={vi.fn()} />);
    const card = document.querySelector('[data-builder-static]') as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Try Stimpies on the hoodie: browse the shop.');
    expect(card.textContent ?? '').not.toMatch(/error|sorry|unsupported|failed/i);
  });
  it('shows the static fallback when there are no Stimpies', () => {
    render(<Builder data={data({ stimpies: [] })} onAddToCart={vi.fn()} />);
    expect(document.querySelector('[data-builder-static]')).toBeInTheDocument();
  });
  it('a 3D-capable config on a device without WebGL stays in silent 2D: no toggle, no canvas, no message', async () => {
    const d = data();
    d.config = {
      ...d.config,
      mode: 'BOTH',
      effectiveMode: 'BOTH',
      defaultView: '3D',
      model3d: { url: 'http://api.test/uploads/hoodie.glb', sizeBytes: 975480, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: { position: [0, 0.02, -2.4], target: [0, 0, 0], fov: 32 }, lighting: 'STUDIO' },
    };
    render(<Builder data={d} onAddToCart={vi.fn()} />); // jsdom: getContext('webgl2') is not implemented -> no WebGL
    await flush();
    expect(document.querySelector('[data-builder]')).toHaveAttribute('data-builder-view', '2d');
    expect(document.querySelector('[data-builder-toggle]')).toBeNull();
    expect(document.querySelector('canvas[data-builder-canvas]')).toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(/webgl|3D is not|unsupported/i);
  });
});

describe('Builder teaser (builder.md 12)', () => {
  it('compact: always 2D, max 4 colours and 6 Stimpies, no packs, no size sheet, CTA carries the selection', () => {
    const d = data({
      stimpies: Array.from({ length: 9 }, (_, i) => ({ ...data().stimpies[0]!, id: i + 1, slug: `s-${i + 1}`, name: `S ${i + 1}`, artworkUrl: `http://api.test/${i}.webp` })),
    });
    render(<Builder data={d} surface="teaser" />);
    expect(within(carousel()).getAllByRole('option')).toHaveLength(6);
    expect(screen.queryByRole('radiogroup', { name: 'Pack' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
    expect(document.querySelector('[data-builder-toggle]')).toBeNull();
    const cta = screen.getByRole('link', { name: 'Open full Builder' });
    expect(cta).toHaveAttribute('href', '/builder?color=1&stimpie=s-1');
    fireEvent.click(within(carousel()).getByRole('option', { name: /S 3/ }));
    expect(screen.getByRole('link', { name: 'Open full Builder' })).toHaveAttribute('href', '/builder?color=1&stimpie=s-3');
  });
  it('compact: arrow keys select on focus', () => {
    render(<Builder data={data()} surface="teaser" />);
    const first = option(/Stimpie 1/);
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(option(/Stimpie 2/)).toHaveAttribute('aria-selected', 'true');
  });
  it('compact: images are lazy (they must not compete with the hero for LCP)', () => {
    render(<Builder data={data()} surface="teaser" />);
    expect(screen.getByAltText('Black Stimpy hoodie, back view')).toHaveAttribute('loading', 'lazy');
  });
});
