import type {
  BuilderMode,
  BuilderView,
  EnvSignals,
  ResolveReason,
  ThrottleSimulator,
  Tier,
  WebGLProbe,
} from '../types';

/** Renderer strings that mean software rendering (builder.md 6.1 check 2b). */
export const SOFTWARE_RENDERER_RE = /swiftshader|llvmpipe|software|basic render/i;
export const MIN_MAX_TEXTURE_SIZE = 4096;

export interface HardCheckResult {
  failed: boolean;
  /** Analytics reason when failed. */
  reason: ResolveReason | null;
  /** Which sub-check failed (for logs and tests). */
  check: 'webgl' | 'software' | 'texture-size' | 'reduced-data' | null;
}

/**
 * Hard checks of the decision order (builder.md 6.1 step 2). Any failure means 2D with 3D hidden.
 * `probe` is null when the probe could not run (treated as "no WebGL").
 */
export function hardChecks(probe: WebGLProbe | null, signals: EnvSignals): HardCheckResult {
  if (!probe || !probe.supported) return { failed: true, reason: 'WEBGL_UNSUPPORTED', check: 'webgl' };
  if (probe.renderer && SOFTWARE_RENDERER_RE.test(probe.renderer)) {
    return { failed: true, reason: 'WEBGL_UNSUPPORTED', check: 'software' };
  }
  if (typeof probe.maxTextureSize === 'number' && probe.maxTextureSize < MIN_MAX_TEXTURE_SIZE) {
    return { failed: true, reason: 'WEBGL_UNSUPPORTED', check: 'texture-size' };
  }
  if (signals.reducedData === true) return { failed: true, reason: 'SAVE_DATA', check: 'reduced-data' };
  return { failed: false, reason: null, check: null };
}

export interface SoftChecks {
  lowMemory: boolean;
  lowCpu: boolean;
  /** save-data or slow-2g / 2g: 3D never downloads on its own. */
  dataSaver: boolean;
  /** 3g: 3D starts only after an explicit "Load 3D" tap. */
  slow3g: boolean;
}

export function softChecks(s: EnvSignals): SoftChecks {
  const et = s.effectiveType;
  return {
    lowMemory: s.deviceMemory !== undefined && s.deviceMemory <= 2,
    lowCpu: s.hardwareConcurrency !== undefined && s.hardwareConcurrency <= 2,
    dataSaver: s.saveData === true || et === 'slow-2g' || et === '2g',
    slow3g: et === '3g',
  };
}

/** Performance tier from device signals (drives antialiasing, DPR cap, anisotropy, texture size). */
export function detectTier(s: EnvSignals): Tier {
  if ((s.deviceMemory !== undefined && s.deviceMemory <= 2) || (s.hardwareConcurrency !== undefined && s.hardwareConcurrency <= 2)) {
    return 'low';
  }
  if (
    (s.deviceMemory !== undefined && s.deviceMemory <= 4) ||
    (s.hardwareConcurrency !== undefined && s.hardwareConcurrency <= 4) ||
    s.coarsePointer === true
  ) {
    return 'mid';
  }
  return 'high';
}

/** Pixel ratio cap per tier (builder.md 5.8). */
export function pixelRatioFor(tier: Tier, devicePixelRatio: number): number {
  const cap = tier === 'high' ? 2 : tier === 'mid' ? 1.5 : 1;
  return Math.max(1, Math.min(devicePixelRatio || 1, cap));
}

/** Anisotropy cap per tier (builder.md 5.5). */
export function anisotropyFor(tier: Tier, max: number): number {
  return Math.min(max, tier === 'high' ? 8 : tier === 'mid' ? 4 : 2);
}

export interface DecisionInput {
  effectiveMode: BuilderMode;
  defaultView: BuilderView;
  /** At least one colour renders in 2D (image + placement) and there is a Stimpie. */
  has2d: boolean;
  /** A model exists (and at least one colour). */
  has3d: boolean;
  probe: WebGLProbe | null;
  signals: EnvSignals;
  /** Test/dashboard override: skip the software-renderer and slow-frame verdicts. */
  force3d?: boolean;
  /** Verdict cached in sessionStorage for this session (`stimpy.builder.tier`). */
  storedVerdict?: 'disabled' | null;
  /** Explicit last choice of the visitor (`stimpy.builder.view`). */
  userView?: BuilderView | null;
  /** The visitor tapped "Load 3D". */
  loadTapped?: boolean;
  /** Share link `?view=`; honoured only when that view is available. */
  shareView?: BuilderView | null;
}

export interface Decision {
  view: BuilderView | 'static';
  /** The 2D / 3D toggle may be shown. */
  showToggle: boolean;
  /** 3D is available but held back for data reasons: show "Load 3D (about N MB)". */
  needsLoadTap: boolean;
  reason: ResolveReason;
  /** 3D is permanently off for this session (hard failure or cached slow verdict). */
  threeDisabled: boolean;
  tier: Tier;
}

/**
 * The decision order of builder.md 6.1, run once before any three.js code is fetched. Pure.
 *
 *  1. effectiveMode 2D -> 2D.            2. Hard checks fail -> 2D, no toggle.
 *  3. Soft checks -> start in 2D (3D stays selectable in BOTH); 3g/save-data need an explicit tap.
 *  4. Otherwise `defaultView` (BOTH) or 3D (3D only).
 */
export function decideMode(input: DecisionInput): Decision {
  const tier = detectTier(input.signals);
  const twoD: BuilderView | 'static' = input.has2d ? '2d' : 'static';
  const off = (reason: ResolveReason, disabled: boolean): Decision => ({
    view: twoD,
    showToggle: false,
    needsLoadTap: false,
    reason,
    threeDisabled: disabled,
    tier,
  });

  // 1.
  if (input.effectiveMode === '2D' || !input.has3d) return off('DEFAULT', true);

  // 2. (a cached "disabled" verdict is a hard result for the rest of the session)
  if (input.storedVerdict === 'disabled') return off('SLOW_FRAMES', true);
  if (!input.force3d) {
    const hard = hardChecks(input.probe, input.signals);
    if (hard.failed) return off(hard.reason ?? 'WEBGL_UNSUPPORTED', true);
  } else if (!input.probe?.supported) {
    return off('WEBGL_UNSUPPORTED', true);
  }

  const soft = softChecks(input.signals);
  const both = input.effectiveMode === 'BOTH';
  const explicit3d = input.userView === '3d' || input.loadTapped === true;
  const shareView = both || input.effectiveMode === '3D' ? input.shareView : null;

  let desired: BuilderView = input.effectiveMode === '3D' ? '3d' : input.defaultView;
  if (both && shareView && input.has2d) desired = shareView;
  if (both && input.userView && input.has2d) desired = input.userView;

  const base = { tier, threeDisabled: false };
  const toggleOk = both && input.has2d;

  if (desired === '2d') {
    return { ...base, view: twoD, showToggle: toggleOk && !(soft.dataSaver || soft.slow3g) , needsLoadTap: toggleOk && (soft.dataSaver || soft.slow3g), reason: 'DEFAULT' };
  }

  // desired 3D
  if ((soft.dataSaver || soft.slow3g) && !explicit3d) {
    const reason: ResolveReason = soft.dataSaver && input.signals.saveData ? 'SAVE_DATA' : 'SLOW_CONNECTION';
    return { ...base, view: twoD, showToggle: false, needsLoadTap: true, reason };
  }
  if ((soft.lowMemory || soft.lowCpu) && !explicit3d && input.has2d) {
    return { ...base, view: '2d', showToggle: toggleOk, needsLoadTap: false, reason: 'LOW_MEMORY' };
  }
  return {
    ...base,
    view: '3d',
    showToggle: toggleOk,
    needsLoadTap: false,
    reason: input.userView === '3d' ? 'USER_TOGGLE' : 'DEFAULT',
  };
}

/** Merge the dashboard's throttle simulator into the real signals. */
export function applyThrottle(signals: EnvSignals, sim: ThrottleSimulator | undefined): EnvSignals {
  if (!sim || sim === 'none') return signals;
  if (sim === 'no-webgl') return signals;
  if (sim === 'slow-3g') return { ...signals, effectiveType: '3g' };
  if (sim === 'slow-2g') return { ...signals, effectiveType: 'slow-2g' };
  if (sim === 'low-tier') return { ...signals, deviceMemory: 2, hardwareConcurrency: 2 };
  return { ...signals, ...(sim.signals ?? {}) };
}

/** Dashboard-only preview override for the hard WebGL fallback path. */
export function applyWebGLSimulation(probe: WebGLProbe | null, sim: ThrottleSimulator | undefined): WebGLProbe | null {
  return sim === 'no-webgl' ? { supported: false } : probe;
}

/** "about 2.4 MB" (one decimal, builder.md 6.3). */
export function formatMegabytes(bytes: number): string {
  const mb = Math.max(0.1, bytes / (1024 * 1024));
  return `${(Math.round(mb * 10) / 10).toFixed(1)} MB`;
}
