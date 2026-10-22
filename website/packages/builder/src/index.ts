/**
 * @stimpy/builder: the Stimpy Builder (2D and 3D) as a framework-agnostic React package.
 * No `next/*` imports, no data fetching: the host passes the payloads as props and injects the router `Link`
 * through `@stimpy/ui`'s `UIProvider`. three.js is only ever loaded through a dynamic import (see BuilderCanvas3D).
 */

// Components
export { Builder } from './Builder';
export type { BuilderProps, BuilderPreviewContext } from './Builder';
export { BuilderStage2D } from './BuilderStage2D';
export type { BuilderStage2DProps, Stage2DArt, Stage2DColor } from './BuilderStage2D';
export { BuilderCanvas3D, Canvas3DBoundary } from './BuilderCanvas3D';
export type { BuilderCanvas3DProps, Canvas3DHandle, EngineArt } from './BuilderCanvas3D';
export { BuilderStaticFallback, ColorSwatchRow, Controls3D, ModeToggle, PackSelector, SizeSheet, SlotChips, StimpieCarousel } from './parts';
export { useInView, useReducedMotion } from './hooks';

// Types
export type * from './types';

// Pure functions (each unit-tested)
export { colorsForView, engineArtFor, joinColors, resolveColorForView, stimpieBlockReason, stimpieTag, tintFor, textureUrlFor, usable2D, usable3D } from './lib/join';
export { STIMPIE_ASPECT, placementPx, placementStyle } from './lib/placement';
export type { PlacementPx } from './lib/placement';
export {
  MIN_MAX_TEXTURE_SIZE,
  SOFTWARE_RENDERER_RE,
  anisotropyFor,
  applyThrottle,
  applyWebGLSimulation,
  decideMode,
  detectTier,
  formatMegabytes,
  hardChecks,
  pixelRatioFor,
  softChecks,
} from './lib/mode';
export type { Decision, DecisionInput, HardCheckResult, SoftChecks } from './lib/mode';
export { FrameTimeSampler, frameStats, frameVerdict, nextLowerTier } from './lib/frameSampler';
export type { FrameStats, FrameVerdict } from './lib/frameSampler';
export { LruCache } from './lib/lru';
export { COVER_TOLERANCE, coverCrop, coverFitRect } from './lib/coverCrop';
export type { CoverCrop } from './lib/coverCrop';
export { buildShareQuery, buildShareUrl, parseShareParams } from './lib/share';
export type { ShareParams, ShareState } from './lib/share';
export {
  HOODIE_ONLY_SLUG,
  POPULAR_BADGE,
  buildCartItem,
  canPick,
  colorSoldOut,
  defaultPackId,
  evaluateAdd,
  initialSelection,
  packById,
  runningPriceCents,
  selectionReducer,
  slotCount,
} from './lib/selection';
export type { AddIssue, AddState, Selection, SelectionAction } from './lib/selection';
export { buildCartSummary, liveAnnouncement, stageLabel } from './lib/summary';
export { COLOR_FADE_MS, CROSSFADE_MS, ZIP_TOTAL_MS, cubicBezier, popOffset, zipFrame, zipKeyframes } from './lib/zipTimeline';
export type { ZipFrame, ZipKeyframes } from './lib/zipTimeline';
export { DECODE_TIMEOUT_MS, DecodedImageCache, MAX_DECODED_IMAGES, decodeImage } from './lib/images';
export { SwapMonitor, sampleFromTimestamps } from './lib/swapMonitor';
export type { SwapSample } from './lib/swapMonitor';
export { probeWebGL, readEnvSignals } from './lib/env';
