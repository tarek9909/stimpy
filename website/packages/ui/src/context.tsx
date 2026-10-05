'use client';

import { createContext, useContext, useMemo, type ElementType, type ReactNode } from 'react';

/**
 * Framework injection point. The UI package never imports `next/*`: the web app passes
 * `next/link` and a `next/image` renderer once at the root, the admin passes a React Router link.
 */
export interface ImageRenderProps {
  src: string;
  alt: string;
  /** Responsive `sizes` hint, forwarded to the framework image component. */
  sizes?: string;
  /** Above-the-fold image: eager + high fetch priority. Exactly one per page. */
  priority?: boolean;
  /** Positioning/fit classes. The parent box is `relative` and already has its aspect ratio. */
  className: string;
  onError?: () => void;
}

export type RenderImage = (props: ImageRenderProps) => ReactNode;

export interface UIContextValue {
  /** Component used for every internal link. Must accept `href` and anchor props. */
  Link: ElementType;
  renderImage: RenderImage;
  /** Where the logo files are served (e.g. `/brand`). Default: bundled with the package. */
  logoBaseUrl?: string;
}

const defaultRenderImage: RenderImage = ({ src, alt, sizes, priority, className, onError }) => (
  <img
    src={src}
    alt={alt}
    sizes={sizes}
    className={className}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
    onError={onError}
  />
);

const defaultValue: UIContextValue = { Link: 'a', renderImage: defaultRenderImage };

const UIContext = createContext<UIContextValue>(defaultValue);

export interface UIProviderProps {
  /** e.g. `next/link`. Defaults to a plain `<a>`. */
  link?: ElementType;
  /** e.g. a `next/image` wrapper using `fill`. Defaults to a plain lazy `<img>`. */
  renderImage?: RenderImage;
  /** Serve logos from `public/` (copy `@stimpy/ui/assets/logo/*`), e.g. `/brand`. */
  logoBaseUrl?: string;
  children: ReactNode;
}

export function UIProvider({ link, renderImage, logoBaseUrl, children }: UIProviderProps) {
  const value = useMemo<UIContextValue>(
    () => ({ Link: link ?? defaultValue.Link, renderImage: renderImage ?? defaultRenderImage, logoBaseUrl }),
    [link, renderImage, logoBaseUrl],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  return useContext(UIContext);
}
