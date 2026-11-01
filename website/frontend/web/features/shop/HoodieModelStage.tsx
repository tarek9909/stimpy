'use client';

import { BuilderCanvas3D, Canvas3DBoundary, type EngineArt } from '@stimpy/builder';
import { prefersReducedMotion } from '@stimpy/ui';
import { STOREFRONT_MODEL } from '@/features/builder/data';

/** The product page's 3D hoodie. Loaded through `next/dynamic`, so three.js and the model never block the photos. */
export function HoodieModelStage({ tint, art, label, onReady, onFailed }: {
  tint: string;
  art: EngineArt | null;
  label: string;
  onReady: () => void;
  onFailed: () => void;
}) {
  return (
    <Canvas3DBoundary onError={onFailed}>
      <BuilderCanvas3D
        model={STOREFRONT_MODEL}
        tint={tint}
        fabricTextureUrl={null}
        art={art}
        tier="mid"
        reducedMotion={prefersReducedMotion()}
        label={label}
        onReady={onReady}
        onFallback={onFailed}
      />
    </Canvas3DBoundary>
  );
}
