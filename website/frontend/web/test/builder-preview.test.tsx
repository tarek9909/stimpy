import { useEffect, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { BuilderConfig } from '@stimpy/api-client';
import type { JoinedColor } from '@stimpy/builder';
import type { Canvas3DHandle } from '@stimpy/builder/src/BuilderCanvas3D';
import { stimpie } from './fixtures';

const mocks = vi.hoisted(() => ({ GET: vi.fn(), rotate: vi.fn(), zoom: vi.fn(), reset: vi.fn() }));
vi.mock('@/lib/api-browser', () => ({ browserApi: () => ({ GET: mocks.GET }) }));
vi.mock('@stimpy/builder/src/BuilderStage2D', () => ({ BuilderStage2D: () => <div data-testid="poster" /> }));
vi.mock('@stimpy/builder/src/BuilderCanvas3D', () => ({
  Canvas3DBoundary: ({ children }: { children: ReactNode }) => children,
  BuilderCanvas3D: ({ onReady, label, handleRef }: { onReady: () => void; label: string; handleRef: Ref<Canvas3DHandle> }) => {
    useEffect(() => onReady(), []);
    useImperativeHandle(handleRef, () => ({ rotateBy: mocks.rotate, zoomBy: mocks.zoom, resetView: mocks.reset, getView: () => null, setCameraConfig: vi.fn() }));
    return <div role="img" aria-label={label} />;
  },
}));

import BuilderPreviewDialog from '@/features/builder/BuilderPreviewDialog';

const colors: JoinedColor[] = [
  { id: 1, name: 'Cream', hex: '#FFF4E6', position: 1, photo: null, tint: null, texture3d: null, hoodieImage2d: '/cream.webp', overlay2d: null, placement2d: { x: .5, y: .6, width: .3, rotation: 0 } },
  { id: 2, name: 'Black', hex: '#111111', position: 2, photo: null, tint: null, texture3d: null, hoodieImage2d: '/black.webp', overlay2d: null, placement2d: { x: .5, y: .6, width: .3, rotation: 0 } },
];
const config: BuilderConfig = {
  mode: 'BOTH', effectiveMode: 'BOTH', defaultView: '3D', hoodie: { id: 1, slug: 'stimpy-hoodie', name: 'Stimpy Hoodie' },
  model3d: { url: '/hoodie.glb', sizeBytes: 1000, backPanelMesh: 'back_panel', panelAspect: .64, camera: { position: [0, 0, -2.5], target: [0, 0, 0], fov: 32 }, lighting: 'STUDIO' },
  colors: [], stimpieTextures: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.GET.mockResolvedValue({ data: config });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

function setup() {
  const onColorChange = vi.fn();
  const onStimpieChange = vi.fn();
  const onClose = vi.fn();
  const view = render(<BuilderPreviewDialog colors={colors} stimpies={[stimpie()]} colorId={1} stimpieId={4}
    onColorChange={onColorChange} onStimpieChange={onStimpieChange} onClose={onClose} returnFocusRef={{ current: null }} />);
  return { ...view, onColorChange, onStimpieChange, onClose };
}

describe('customer 3D preview', () => {
  it('loads the model configuration only when mounted and exposes working view controls', async () => {
    expect(mocks.GET).not.toHaveBeenCalled();
    const view = setup();
    await view.findByRole('img', { name: '3D preview: Cream Stimpy hoodie with THE VOID' });
    expect(mocks.GET).toHaveBeenCalledWith('/api/v1/builder/config', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    fireEvent.click(await view.findByRole('button', { name: 'Rotate right' }));
    fireEvent.click(view.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(view.getByRole('button', { name: 'Reset view' }));
    expect(mocks.rotate).toHaveBeenCalledWith(30);
    expect(mocks.zoom).toHaveBeenCalledWith(.85);
    expect(mocks.reset).toHaveBeenCalledOnce();
  });
  it('keeps selections in the host and links the chosen look to the full builder', async () => {
    const view = setup();
    await view.findByRole('img');
    fireEvent.click(view.getByRole('radio', { name: 'Black' }));
    fireEvent.click(view.getByRole('button', { name: 'THE VOID' }));
    expect(view.onColorChange).toHaveBeenCalledWith(2);
    expect(view.onStimpieChange).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    expect(view.getByRole('link', { name: 'Customize & shop' })).toHaveAttribute('href', '/builder?color=1&stimpie=the-void');
    fireEvent.click(view.getByRole('button', { name: 'Keep this look' }));
    expect(view.onClose).toHaveBeenCalledOnce();
  });
  it('keeps the poster and offers retry when 3D is unavailable', async () => {
    mocks.GET.mockResolvedValueOnce({ data: { ...config, model3d: null, effectiveMode: '2D' } });
    const view = setup();
    await view.findByText('2D preview');
    // The 2D poster (campaign photo stage) stays visible.
    expect(document.querySelector('.store-preview-poster')).toHaveStyle({ visibility: 'visible' });
    expect(view.queryByText('Loading 3D preview')).not.toBeInTheDocument();
    fireEvent.click(view.getByRole('button', { name: 'Retry 3D' }));
    await view.findByRole('img');
    await waitFor(() => expect(mocks.GET).toHaveBeenCalledTimes(2));
  });
  it('aborts an in-flight configuration request when the preview closes', async () => {
    mocks.GET.mockReturnValue(new Promise(() => {}));
    const view = setup();
    await waitFor(() => expect(mocks.GET).toHaveBeenCalledOnce());
    const signal = mocks.GET.mock.calls[0]?.[1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('lets a Stimpie used in another pack slot be picked (it replaces that slot) and keeps the full Builder on its current page', async () => {
    const onStimpieChange = vi.fn();
    const view = render(<BuilderPreviewDialog colors={colors} stimpies={[stimpie(), stimpie({ id: 7, name: 'AFTER DARK' })]} colorId={2} stimpieId={7}
      onColorChange={vi.fn()} onStimpieChange={onStimpieChange} onClose={vi.fn()} returnFocusRef={{ current: null }}
      disabledStimpieIds={new Set([4])} showBuilderLink={false} />);
    await view.findByRole('img', { name: '3D preview: Black Stimpy hoodie with AFTER DARK' });
    const used = view.getByRole('button', { name: 'THE VOID' });
    expect(used).toHaveAttribute('title', expect.stringContaining('already selected in another pack slot'));
    fireEvent.click(used);
    expect(onStimpieChange).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
    expect(view.getByRole('button', { name: 'AFTER DARK' })).toBeEnabled();
    expect(view.queryByRole('link', { name: 'Customize & shop' })).not.toBeInTheDocument();
  });
});
