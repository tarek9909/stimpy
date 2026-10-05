/**
 * Test overrides of the Builder (never active in production unless the variable is set at build time):
 * `NEXT_PUBLIC_BUILDER_TEST_OVERRIDES=1` makes the page honour
 *   ?builder3d=force   bypass the software-renderer and slow-frame checks (headless Chrome renders with SwiftShader)
 *   ?builder3d=renderer   bypass ONLY the software-renderer check, so the real frame-time sampling can still fall back
 *   ?builder3dframe=<ms>   add an artificial cost per frame (throttle simulator) to exercise the slow-frame fallback
 *   ?builder3dshader=break   break the swap shader on purpose (cross-fade fallback + SHADER_PATCH_FAILED)
 * Written as a literal `process.env.NEXT_PUBLIC_*` so Next inlines it. (lib/env.ts is the usual home for env reads;
 * this flag is deliberately local so the storefront foundation files stay untouched.)
 */
export const BUILDER_TEST_OVERRIDES: boolean = process.env.NEXT_PUBLIC_BUILDER_TEST_OVERRIDES === '1';

export interface BuilderOverrides {
  force3d: boolean | 'renderer';
  breakShader: boolean;
  extraFrameMs: number;
}

export function readOverrides(search: string): BuilderOverrides {
  if (!BUILDER_TEST_OVERRIDES) return { force3d: false, breakShader: false, extraFrameMs: 0 };
  const q = new URLSearchParams(search);
  const f = q.get('builder3d');
  return { force3d: f === 'force' ? true : f === 'renderer' ? 'renderer' : false, breakShader: q.get('builder3dshader') === 'break', extraFrameMs: Math.min(500, Math.max(0, Number(q.get('builder3dframe')) || 0)) };
}
