import { describe, expect, it } from 'vitest';
import {
  anisotropyFor,
  applyThrottle,
  applyWebGLSimulation,
  decideMode,
  detectTier,
  formatMegabytes,
  hardChecks,
  pixelRatioFor,
  softChecks,
  type DecisionInput,
} from '../src';

const GOOD_GL = { supported: true, renderer: 'ANGLE (NVIDIA, GeForce RTX 3060)', maxTextureSize: 16384 };
const base: DecisionInput = {
  effectiveMode: 'BOTH',
  defaultView: '3d',
  has2d: true,
  has3d: true,
  probe: GOOD_GL,
  signals: {},
};

describe('hard checks (builder.md 6.1 step 2)', () => {
  it('passes on a capable GPU', () => {
    expect(hardChecks(GOOD_GL, {}).failed).toBe(false);
  });
  it('a: no WebGL2 context', () => {
    expect(hardChecks({ supported: false }, {})).toMatchObject({ failed: true, check: 'webgl' });
    expect(hardChecks(null, {})).toMatchObject({ failed: true, check: 'webgl' });
  });
  it('b: software renderers', () => {
    for (const r of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', 'llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver', 'Software Rasterizer']) {
      expect(hardChecks({ supported: true, renderer: r, maxTextureSize: 16384 }, {})).toMatchObject({ failed: true, check: 'software' });
    }
  });
  it('c: MAX_TEXTURE_SIZE below 4096', () => {
    expect(hardChecks({ supported: true, renderer: 'x', maxTextureSize: 2048 }, {})).toMatchObject({ failed: true, check: 'texture-size' });
    expect(hardChecks({ supported: true, renderer: 'x', maxTextureSize: 4096 }, {}).failed).toBe(false);
  });
  it('d: prefers-reduced-data', () => {
    expect(hardChecks(GOOD_GL, { reducedData: true })).toMatchObject({ failed: true, check: 'reduced-data' });
  });
  it('a renderer string that is not exposed is "no signal"', () => {
    expect(hardChecks({ supported: true, maxTextureSize: 8192 }, {}).failed).toBe(false);
  });
});

describe('soft checks and tier', () => {
  it('flags low memory, few cores, data saver and 3g; missing APIs are no signal', () => {
    expect(softChecks({})).toEqual({ lowMemory: false, lowCpu: false, dataSaver: false, slow3g: false });
    expect(softChecks({ deviceMemory: 2 }).lowMemory).toBe(true);
    expect(softChecks({ deviceMemory: 4 }).lowMemory).toBe(false);
    expect(softChecks({ hardwareConcurrency: 2 }).lowCpu).toBe(true);
    expect(softChecks({ saveData: true }).dataSaver).toBe(true);
    expect(softChecks({ effectiveType: 'slow-2g' }).dataSaver).toBe(true);
    expect(softChecks({ effectiveType: '2g' }).dataSaver).toBe(true);
    expect(softChecks({ effectiveType: '3g' }).slow3g).toBe(true);
    expect(softChecks({ effectiveType: '4g' })).toEqual({ lowMemory: false, lowCpu: false, dataSaver: false, slow3g: false });
  });
  it('detects the tier', () => {
    expect(detectTier({})).toBe('high');
    expect(detectTier({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high');
    expect(detectTier({ deviceMemory: 4 })).toBe('mid');
    expect(detectTier({ hardwareConcurrency: 4 })).toBe('mid');
    expect(detectTier({ coarsePointer: true })).toBe('mid');
    expect(detectTier({ deviceMemory: 2 })).toBe('low');
    expect(detectTier({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe('low');
  });
  it('DPR cap and anisotropy by tier', () => {
    expect(pixelRatioFor('high', 3)).toBe(2);
    expect(pixelRatioFor('mid', 3)).toBe(1.5);
    expect(pixelRatioFor('low', 3)).toBe(1);
    expect(pixelRatioFor('high', 1)).toBe(1);
    expect(anisotropyFor('high', 16)).toBe(8);
    expect(anisotropyFor('mid', 16)).toBe(4);
    expect(anisotropyFor('low', 16)).toBe(2);
    expect(anisotropyFor('high', 4)).toBe(4);
  });
});

describe('decision order (builder.md 6.1)', () => {
  it('1. effectiveMode 2D -> 2D, no toggle, never 3D', () => {
    const d = decideMode({ ...base, effectiveMode: '2D' });
    expect(d).toMatchObject({ view: '2d', showToggle: false, needsLoadTap: false, threeDisabled: true });
  });
  it('no model/colours for 3D -> 2D', () => {
    expect(decideMode({ ...base, has3d: false }).view).toBe('2d');
  });
  it('2. a failing hard check -> 2D with the toggle hidden', () => {
    const d = decideMode({ ...base, probe: { supported: false } });
    expect(d).toMatchObject({ view: '2d', showToggle: false, threeDisabled: true, reason: 'WEBGL_UNSUPPORTED' });
    expect(decideMode({ ...base, probe: { supported: true, renderer: 'SwiftShader', maxTextureSize: 8192 } }).view).toBe('2d');
    expect(decideMode({ ...base, signals: { reducedData: true } })).toMatchObject({ view: '2d', reason: 'SAVE_DATA', showToggle: false });
  });
  it('2. hard failure with no 2D assets -> static fallback', () => {
    expect(decideMode({ ...base, has2d: false, probe: { supported: false } }).view).toBe('static');
  });
  it('4. capable device: BOTH opens in defaultView with the toggle', () => {
    expect(decideMode(base)).toMatchObject({ view: '3d', showToggle: true, needsLoadTap: false, reason: 'DEFAULT' });
    expect(decideMode({ ...base, defaultView: '2d' })).toMatchObject({ view: '2d', showToggle: true });
  });
  it('3D only on a capable device: 3D, no toggle', () => {
    expect(decideMode({ ...base, effectiveMode: '3D' })).toMatchObject({ view: '3d', showToggle: false });
  });
  it('3a/3b. low memory or few cores start in 2D, 3D stays selectable in BOTH', () => {
    expect(decideMode({ ...base, signals: { deviceMemory: 2 } })).toMatchObject({ view: '2d', showToggle: true, reason: 'LOW_MEMORY' });
    expect(decideMode({ ...base, signals: { hardwareConcurrency: 2 } })).toMatchObject({ view: '2d', showToggle: true });
  });
  it('an explicit visitor choice of 3D overrides the slow-device default, but not a hard failure', () => {
    expect(decideMode({ ...base, signals: { deviceMemory: 2 }, userView: '3d' })).toMatchObject({ view: '3d' });
    expect(decideMode({ ...base, probe: { supported: false }, userView: '3d' })).toMatchObject({ view: '2d', showToggle: false });
  });
  it('3D-only on a weak device falls back to 2D when 2D assets exist', () => {
    expect(decideMode({ ...base, effectiveMode: '3D', signals: { deviceMemory: 1 } }).view).toBe('2d');
  });
  it('3c. save-data / 2g never downloads 3D automatically; 3g waits for a tap', () => {
    for (const signals of [{ saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' }, { effectiveType: '3g' }]) {
      const d = decideMode({ ...base, signals });
      expect(d).toMatchObject({ view: '2d', needsLoadTap: true, showToggle: false });
    }
    expect(decideMode({ ...base, signals: { effectiveType: '3g' }, loadTapped: true })).toMatchObject({ view: '3d', needsLoadTap: false, showToggle: true });
  });
  it('a cached slow-frames verdict keeps 3D off for the session and hides the toggle', () => {
    expect(decideMode({ ...base, storedVerdict: 'disabled' })).toMatchObject({ view: '2d', showToggle: false, threeDisabled: true });
  });
  it('force3d bypasses the software renderer check (test override)', () => {
    const sw = { supported: true, renderer: 'SwiftShader', maxTextureSize: 8192 };
    expect(decideMode({ ...base, probe: sw, force3d: true }).view).toBe('3d');
    // a runtime failure (stored verdict) still wins: the override must not loop on a broken model
    expect(decideMode({ ...base, probe: sw, force3d: true, storedVerdict: 'disabled' }).view).toBe('2d');
    expect(decideMode({ ...base, probe: { supported: false }, force3d: true }).view).toBe('2d'); // no GL at all stays 2D
  });
  it('share link ?view= is honoured only when available and never overrides fallbacks', () => {
    expect(decideMode({ ...base, defaultView: '2d', shareView: '3d' }).view).toBe('3d');
    expect(decideMode({ ...base, shareView: '2d' }).view).toBe('2d');
    expect(decideMode({ ...base, effectiveMode: '2D', shareView: '3d' }).view).toBe('2d');
    expect(decideMode({ ...base, probe: { supported: false }, shareView: '3d' }).view).toBe('2d');
  });
  it('reports the tier of the device', () => {
    expect(decideMode({ ...base, signals: { deviceMemory: 4 } }).tier).toBe('mid');
  });
});

describe('throttle simulator (dashboard preview)', () => {
  it('slow 3G and low tier edit the signals', () => {
    expect(applyThrottle({}, 'slow-3g')).toEqual({ effectiveType: '3g' });
    expect(applyThrottle({ saveData: false }, 'slow-2g').effectiveType).toBe('slow-2g');
    expect(applyThrottle({}, 'low-tier')).toEqual({ deviceMemory: 2, hardwareConcurrency: 2 });
    expect(applyThrottle({ deviceMemory: 8 }, 'none')).toEqual({ deviceMemory: 8 });
    expect(applyThrottle({}, { signals: { saveData: true } })).toEqual({ saveData: true });
  });
  it('drives the decision', () => {
    expect(decideMode({ ...base, signals: applyThrottle({}, 'slow-3g') }).needsLoadTap).toBe(true);
    expect(decideMode({ ...base, signals: applyThrottle({}, 'low-tier') }).view).toBe('2d');
  });
  it('simulates unavailable WebGL without changing the real browser environment', () => {
    expect(applyWebGLSimulation(GOOD_GL, 'no-webgl')).toEqual({ supported: false });
    expect(applyWebGLSimulation(GOOD_GL, 'none')).toBe(GOOD_GL);
    expect(applyWebGLSimulation(null, 'no-webgl')).toEqual({ supported: false });
  });
});

describe('Load 3D label', () => {
  it('rounds to one decimal in MB', () => {
    expect(formatMegabytes(975480)).toBe('0.9 MB');
    expect(formatMegabytes(2.4 * 1024 * 1024)).toBe('2.4 MB');
  });
});
