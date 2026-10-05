import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('../src/three/engine', async () => {
  throw new Error('simulated lazy chunk download failure');
});

import { BuilderCanvas3D } from '../src/BuilderCanvas3D';

describe('3D lazy import failure', () => {
  it('falls back instead of leaving the loading shell stuck', async () => {
    const onFallback = vi.fn();
    render(
      <BuilderCanvas3D
        model={{ url: 'model.glb', sizeBytes: 100, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: { position: [0, 0, 1], target: [0, 0, 0], fov: 30 }, lighting: 'STUDIO' } as never}
        tint="#111111"
        fabricTextureUrl={null}
        art={null}
        tier="mid"
        reducedMotion={false}
        label="3D hoodie preview"
        onFallback={onFallback}
      />,
    );
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('GLB_FAILED'));
  });
});
