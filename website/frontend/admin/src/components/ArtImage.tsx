import { useState, type ImgHTMLAttributes } from 'react';
import { getEnv } from '../env';

/** Widths the storefront image optimizer accepts (Next's defaults). */
export type ArtWidth = 128 | 384 | 640;

/** Uploaded artwork is up to 2000 px tall; lists ask the storefront's optimizer for a small copy. Local dev keeps the original. */
export function artThumbUrl(src: string, width: ArtWidth): string {
  const env = getEnv();
  if (env.appEnv === 'local' || !/^https?:\/\/[^/]+\/uploads\//.test(src)) return src;
  return `${env.siteUrl}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

/** Lazy artwork thumbnail. Falls back to the original file if the optimizer can't serve it. */
export function ArtImage({ src, width, alt = '', ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width'> & { src: string; width: ArtWidth }) {
  const [failed, setFailed] = useState(false);
  return <img {...rest} src={failed ? src : artThumbUrl(src, width)} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
