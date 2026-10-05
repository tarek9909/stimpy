import type { EnvSignals, WebGLProbe } from '../types';

/** All browser reads are try/catch-wrapped: a missing API is "no signal", never a failure. */

interface NetworkInfoLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function readEnvSignals(): EnvSignals {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: NetworkInfoLike };
  const out: EnvSignals = {};
  try {
    if (typeof nav.deviceMemory === 'number') out.deviceMemory = nav.deviceMemory;
    if (typeof nav.hardwareConcurrency === 'number') out.hardwareConcurrency = nav.hardwareConcurrency;
    const c = nav.connection;
    if (c) {
      if (typeof c.saveData === 'boolean') out.saveData = c.saveData;
      if (typeof c.effectiveType === 'string') out.effectiveType = c.effectiveType;
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      out.reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
      out.coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    }
  } catch {
    /* no signal */
  }
  return out;
}

export function prefersReducedMotionNow(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** True on Data Saver, 2g or slow-2g: skip idle preloading. */
export function isSaveData(signals: EnvSignals = readEnvSignals()): boolean {
  return signals.saveData === true || signals.effectiveType === 'slow-2g' || signals.effectiveType === '2g';
}

/**
 * Create a 1x1 WebGL context once (builder.md 6.1 step 2), read renderer and MAX_TEXTURE_SIZE, then release it
 * with WEBGL_lose_context. Never throws.
 */
export function probeWebGL(): WebGLProbe {
  if (typeof document === 'undefined') return { supported: false };
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    // three.js r163+ needs WebGL2 (WebGL1 support was removed), so a WebGL1-only device counts as "no WebGL".
    const gl = canvas.getContext('webgl2');
    if (!gl) return { supported: false };
    let renderer: string | undefined;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { supported: true, renderer, maxTextureSize };
  } catch {
    return { supported: false };
  } finally {
    canvas = null;
  }
}

export const STORAGE_VIEW_KEY = 'stimpy.builder.view';
export const STORAGE_TIER_KEY = 'stimpy.builder.tier';
export const STORAGE_SIZE_KEY = 'stimpy.size';
export const STORAGE_FALLBACK_PREFIX = 'stimpy.builder.fallback.';

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice just is not remembered */
  }
}

/** Session verdict of the frame sampling: `disabled` after a switch to 2D, else the settled tier. */
export function readTierVerdict(): { disabled: boolean; tier: 'high' | 'mid' | 'low' | null } {
  const v = readSession(STORAGE_TIER_KEY);
  if (v === 'disabled') return { disabled: true, tier: null };
  if (v === 'high' || v === 'mid' || v === 'low') return { disabled: false, tier: v };
  return { disabled: false, tier: null };
}
