import type { LightingPreset } from '../types';

export type LightDef =
  | { kind: 'ambient'; color: number; intensity: number }
  | { kind: 'hemisphere'; sky: number; ground: number; intensity: number }
  | { kind: 'directional'; color: number; intensity: number; position: readonly [number, number, number] };

/**
 * Lighting presets (builder.md 5.3). The SETUPS (which lights, where) are the spec; the intensities are the starting
 * values of the spec tuned by eye against the real hoodie so that black, cream, stone and coral all show their form
 * (seams, folds, hood depth, ribs) while the artwork keeps faithful colours under NeutralToneMapping.
 * Final values are recorded in docs/DECISIONS.md. Physically-based units (three r155+). Model faces +Z, the default
 * camera sits on -Z.
 */
export const LIGHTING: Record<LightingPreset, readonly LightDef[]> = {
  STUDIO: [
    { kind: 'hemisphere', sky: 0xffffff, ground: 0x8a8a8a, intensity: 0.7 },
    // a raking key from high on one side: it is what draws the folds and leaves the far side in shadow
    { kind: 'directional', color: 0xffffff, intensity: 1.3, position: [3.5, 3, -2.5] },
    { kind: 'directional', color: 0xffffff, intensity: 0.45, position: [-3, 1, -2] },
    // rims from above, one behind each view: their sheen is what shows the folds on dark fabric
    { kind: 'directional', color: 0xffffff, intensity: 1.1, position: [0, 2, 3] },
    { kind: 'directional', color: 0xffffff, intensity: 1.1, position: [0, 2, -3] },
    // the same raking light on the hoodie's front, so it keeps its form when turned around
    { kind: 'directional', color: 0xffffff, intensity: 0.9, position: [-3.5, 3, 2.5] },
    // soft fills from the camera side and the front, kept low so the shadows stay dark
    { kind: 'directional', color: 0xffffff, intensity: 0.2, position: [0, 0.6, -5] },
    { kind: 'directional', color: 0xffffff, intensity: 0.2, position: [0, 0.6, 5] },
  ],
  SOFT: [
    { kind: 'ambient', color: 0xffffff, intensity: 1.2 },
    { kind: 'hemisphere', sky: 0xffffff, ground: 0xcfc7bc, intensity: 1.1 },
    { kind: 'directional', color: 0xffffff, intensity: 1.0, position: [1, 2, -3] },
    { kind: 'directional', color: 0xffffff, intensity: 0.6, position: [0, 2, 3] },
  ],
  NIGHT: [
    { kind: 'hemisphere', sky: 0x6677aa, ground: 0x111111, intensity: 0.6 },
    { kind: 'directional', color: 0xaabbff, intensity: 1.6, position: [-2, 2, -3] },
    { kind: 'directional', color: 0xff7a59, intensity: 2.4, position: [1, 1.5, 3] },
    { kind: 'directional', color: 0xaabbff, intensity: 0.5, position: [0, 0.6, -5] },
  ],
};

export const TONE_MAPPING_EXPOSURE = 1.0;
