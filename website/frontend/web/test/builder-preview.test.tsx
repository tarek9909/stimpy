import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { JoinedColor } from '@stimpy/builder';
import { stimpie } from './fixtures';

import BuilderPreviewDialog from '@/features/builder/BuilderPreviewDialog';

const colors: JoinedColor[] = [
  { id: 1, name: 'Cream', hex: '#FFF4E6', position: 1, photo: null, tint: null, texture3d: null, hoodieImage2d: '/cream.webp', overlay2d: null, placement2d: { x: .5, y: .6, width: .3, rotation: 0 } },
  { id: 2, name: 'Black', hex: '#111111', position: 2, photo: null, tint: null, texture3d: null, hoodieImage2d: '/black.webp', overlay2d: null, placement2d: { x: .5, y: .6, width: .3, rotation: 0 } },
];
beforeEach(() => vi.clearAllMocks());

function setup() {
  const onColorChange = vi.fn();
  const onStimpieChange = vi.fn();
  const onClose = vi.fn();
  const view = render(<BuilderPreviewDialog colors={colors} stimpies={[stimpie()]} colorId={1} stimpieId={4}
    onColorChange={onColorChange} onStimpieChange={onStimpieChange} onClose={onClose} returnFocusRef={{ current: null }} />);
  return { ...view, onColorChange, onStimpieChange, onClose };
}

describe('customer photo preview', () => {
  it('shows the campaign photo and does not expose model controls', () => {
    const view = setup();
    expect(view.getByText('Photo preview')).toBeInTheDocument();
    expect(document.querySelector('[data-layer="hoodie-photo"]')).toBeInTheDocument();
    expect(view.queryByText(/3D studio|Loading 3D|Retry 3D/)).not.toBeInTheDocument();
  });
  it('keeps selections in the host and links the chosen look to the full builder', async () => {
    const view = setup();
    await view.findByRole('img');
    fireEvent.click(view.getByRole('radio', { name: 'Black' }));
    fireEvent.click(view.getByRole('button', { name: 'THE VOID' }));
    expect(view.onColorChange).toHaveBeenCalledWith(2);
    expect(view.onStimpieChange).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    expect(view.getByRole('link', { name: 'Customize & shop' })).toHaveAttribute('href', '/builder?color=1&mode=stimpie-only&stimpie=the-void');
    fireEvent.click(view.getByRole('button', { name: 'Keep this look' }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });
  it('lets a Stimpie used in another pack slot be picked (it replaces that slot) and keeps the full Builder on its current page', async () => {
    const onStimpieChange = vi.fn();
    const view = render(<BuilderPreviewDialog colors={colors} stimpies={[stimpie(), stimpie({ id: 7, name: 'AFTER DARK' })]} colorId={2} stimpieId={7}
      onColorChange={vi.fn()} onStimpieChange={onStimpieChange} onClose={vi.fn()} returnFocusRef={{ current: null }}
      disabledStimpieIds={new Set([4])} showBuilderLink={false} />);
    expect(view.getByRole('img', { name: 'Black Stimpy hoodie with the AFTER DARK Stimpie' })).toBeInTheDocument();
    const used = view.getByRole('button', { name: 'THE VOID' });
    expect(used).toHaveAttribute('title', expect.stringContaining('already selected in another pack slot'));
    fireEvent.click(used);
    expect(onStimpieChange).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    expect(view.getByRole('button', { name: 'AFTER DARK' })).toBeEnabled();
    expect(view.queryByRole('link', { name: 'Customize & shop' })).not.toBeInTheDocument();
  });
});
