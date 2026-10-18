import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { HOODIE_RATIO } from '../constants';
import { Banknote, RefreshCw, Truck, Video } from '../icons';
import { SURFACE_CLASSES, accentColorStyle, accentSurface, type SurfaceTone } from '../surfaces';
import type { AccentColor, ReviewLike } from '../types';
import { Media } from './Media';
import { ZipWipe, type ZipColor, type ZipDirection } from './ZipWipe';

/* -------------------------------------------------------------------------------------- Section */

export type SectionTone = 'white' | 'cream' | 'black' | 'coral' | 'accent';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Background and its brand text pair: black on white/cream/coral/accent, white on black. */
  tone?: SectionTone;
  /** `accent`: the drop colour. */
  accentColor?: AccentColor | null;
  /** Exact user-picked colour; takes precedence over the legacy enum. */
  accentHex?: string;
  heading?: ReactNode;
  eyebrow?: ReactNode;
  headingLevel?: 1 | 2;
  /** Play a ZipWipe over this section when it scrolls into view (once). */
  zipIn?: boolean;
  /** Panel colour left behind by the wipe. Default `cream` (`black` on cream sections). */
  zipFrom?: ZipColor;
  zipDirection?: ZipDirection;
  children?: ReactNode;
}

/** Storefront band: py-12 mobile, py-20 desktop, content up to 1200px. */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  {
    tone = 'white',
    accentColor,
    accentHex,
    heading,
    eyebrow,
    headingLevel = 2,
    zipIn,
    zipFrom,
    zipDirection = 'down',
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const surface: SurfaceTone = tone === 'accent' ? accentSurface(accentColor) : tone;
  const classes = SURFACE_CLASSES[surface];
  const useHex = tone === 'accent' && !!accentHex;
  const H = `h${headingLevel}` as 'h1' | 'h2';
  const section = (
    <section
      ref={ref}
      className={cn(
        classes,
        useHex && 'surface-colored',
        'py-12 md:py-16 lg:py-20',
        className,
      )}
      style={useHex ? { ...accentColorStyle(accentHex), ...style } : style}
      {...rest}
    >
      <div className="container">
        {heading || eyebrow ? (
          <header className="mb-8 md:mb-10">
            {eyebrow ? (
              <p className="mb-2 text-caption font-medium uppercase tracking-[0.04em]">{eyebrow}</p>
            ) : null}
            {heading ? <H className={headingLevel === 1 ? 'text-h1' : 'text-h2'}>{heading}</H> : null}
          </header>
        ) : null}
        {children}
      </div>
    </section>
  );
  if (!zipIn) return section;
  return (
    <ZipWipe
      trigger="inView"
      direction={zipDirection}
      color={zipFrom ?? (tone === 'cream' ? 'black' : 'cream')}
      onDark={tone === 'black'}
    >
      {section}
    </ZipWipe>
  );
});

/* -------------------------------------------------------------------------------------- SkipLink */

export interface SkipLinkProps {
  /** id of the main landmark. Default `main-content`. */
  targetId?: string;
  children?: ReactNode;
}

/** First focusable element on every page. Visible only on focus. */
export function SkipLink({ targetId = 'main-content', children = 'Skip to content' }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only z-skip rounded-md bg-ink px-4 py-3 text-button font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
    >
      {children}
    </a>
  );
}

/* ----------------------------------------------------------------------------------- TrustStrip */

export interface TrustItem {
  icon?: ReactNode;
  text: string;
}

const DEFAULT_TRUST: TrustItem[] = [
  { icon: <Video width={24} height={24} aria-hidden="true" />, text: 'Real footage' },
  { icon: <Banknote width={24} height={24} aria-hidden="true" />, text: 'Cash on delivery' },
  { icon: <Truck width={24} height={24} aria-hidden="true" />, text: 'Delivery across Lebanon' },
  { icon: <RefreshCw width={24} height={24} aria-hidden="true" />, text: 'Clear exchange policy' },
];

/** Four short reassurance points. Put it in a cream <Section>. */
export function TrustStrip({ items = DEFAULT_TRUST, className }: { items?: TrustItem[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4', className)}>
      {items.map((item) => (
        <li key={item.text} className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left md:gap-3">
          {item.icon ? <span className="shrink-0 text-fg">{item.icon}</span> : null}
          <span className="text-body font-medium text-fg">{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------------------- ReviewCard */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export interface ReviewCardProps {
  review: ReviewLike;
  className?: string;
}

/** Customer swap: short quote with optional photo or video. Video is muted, user-started. */
export function ReviewCard({ review, className }: ReviewCardProps) {
  const media = review.mediaUrl;
  return (
    <figure className={cn('flex flex-col overflow-hidden rounded-lg border border-base bg-surface-base text-fg', className)}>
      {media ? (
        VIDEO_EXT.test(media) ? (
          <video
            className="aspect-[9/16] max-h-96 w-full bg-cream object-cover"
            src={media}
            controls
            muted
            playsInline
            preload="none"
            aria-label={`Video from ${review.name}`}
          />
        ) : (
          <Media src={media} alt={`Photo from ${review.name}`} ratio={HOODIE_RATIO} />
        )
      ) : null}
      <blockquote className="flex-1 p-4 text-body">{review.text}</blockquote>
      <figcaption className="px-4 pb-4 text-body-sm font-medium text-fg-muted">{review.name}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------------------------------ Avatar */

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: 'sm' | 'md';
}

/** Initials in a cream circle (dashboard customer/user). */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar({ name, size = 'md', className, ...rest }, ref) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      ref={ref}
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-cream font-medium text-ink',
        size === 'sm' ? 'h-8 w-8 text-caption' : 'h-10 w-10 text-body-sm',
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true">{initials || '?'}</span>
    </span>
  );
});
