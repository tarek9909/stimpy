/**
 * @stimpy/ui: the Stimpy design system. Presentational React components only: no data fetching,
 * no framework-specific imports. Styling comes from `@stimpy/ui/preset` (Tailwind) and
 * `@stimpy/ui/tokens.css`; fonts from `@stimpy/ui/fonts.css`.
 */

// Foundations
export { cn } from './cn';
export * from './types';
export * from './format';
export * from './clockMath';
export * from './clock';
export * from './constants';
export * from './buttonStyles';
export { UIProvider, useUI } from './context';
export type { ImageRenderProps, RenderImage, UIContextValue, UIProviderProps } from './context';
export { SURFACE_CLASSES, accentSurface } from './surfaces';
export type { SurfaceTone } from './surfaces';
export * as icons from './icons';
export { getFocusable, isExternalHref, mergeRefs, prefersReducedMotion } from './utils';
export { useIsomorphicLayoutEffect } from './hooks';

// Primitives and forms
export * from './components/Button';
export * from './components/Spinner';
export * from './components/forms';
export * from './components/Swatches';

// Display
export * from './components/badges';
export * from './components/PriceTag';
export * from './components/Media';
export * from './components/cards';
export * from './components/Countdown';
export * from './components/StatusTimeline';
export * from './components/Tabs';
export * from './components/Accordion';
export * from './components/RichText';

// Overlays and feedback
export * from './components/overlays';
export * from './components/Toast';
export * from './components/feedback';
export * from './components/actions';

// Layout, brand, motion
export * from './components/layout';
export * from './components/Logo';
export * from './components/ZipWipe';
