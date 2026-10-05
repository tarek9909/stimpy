'use client';

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../cn';
import { useUI } from '../context';
import { AlertCircle, AlertTriangle, Info, X, type LucideIcon } from '../icons';
import { Button } from './Button';

/* ----------------------------------------------------------------------------- Banner/Alert */

export type BannerVariant = 'info' | 'warning' | 'error' | 'announcement';

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: BannerVariant;
  title?: ReactNode;
  /** Right-aligned action (a Button or link). */
  action?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Announce politely when it appears (offline/back online). `error` is always `role="alert"`. */
  live?: boolean;
}

const bannerIcon: Record<Exclude<BannerVariant, 'announcement'>, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

/**
 * In-flow persistent message. info = sky, warning = butter (black text), error = danger border,
 * announcement = the storefront bar (always black with white text). `role="alert"` only for errors.
 */
export function Banner({
  variant = 'info',
  title,
  action,
  dismissible,
  onDismiss,
  live,
  className,
  children,
  ...rest
}: BannerProps) {
  const Icon = variant === 'announcement' ? null : bannerIcon[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : live ? 'status' : undefined}
      className={cn(
        'flex items-start gap-3 text-body-sm',
        variant === 'announcement'
          ? 'min-h-9 items-center justify-center bg-ink px-4 py-2 text-center text-white'
          : 'rounded-lg px-4 py-3',
        variant === 'info' && 'bg-sky text-ink',
        variant === 'warning' && 'bg-butter text-ink',
        variant === 'error' && 'border-2 border-danger bg-surface-base text-fg',
        className,
      )}
      {...rest}
    >
      {Icon ? (
        <Icon
          width={20}
          height={20}
          className={cn('mt-0.5 shrink-0', variant === 'error' && 'text-danger')}
          aria-hidden="true"
        />
      ) : null}
      <div className={cn('min-w-0 flex-1', variant === 'announcement' && 'truncate')}>
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {dismissible ? (
        <Button
          variant="ghost"
          iconOnly
          size="sm"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-my-1 -mr-2 shrink-0"
        >
          <X width={20} height={20} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

export interface AnnouncementBarProps {
  text: string;
  linkUrl?: string | null;
  className?: string;
}

/** Storefront announcement: always black with white text, only text and link are configurable. Not dismissible. */
export function AnnouncementBar({ text, linkUrl, className }: AnnouncementBarProps) {
  const { Link } = useUI();
  if (!text) return null;
  const external = !!linkUrl && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(linkUrl);
  const Comp = external ? 'a' : Link;
  return (
    <div
      role="region"
      aria-label="Announcement"
      className={cn('flex min-h-9 items-center justify-center bg-ink px-4 py-2 text-body-sm text-white', className)}
    >
      {linkUrl ? (
        <Comp
          href={linkUrl}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="max-w-full truncate underline underline-offset-4"
        >
          {text}
        </Comp>
      ) : (
        <p className="max-w-full truncate">{text}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ Skeleton */

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'card' | 'table-row' | 'stat';
  /** `text`: number of lines (last one shorter). */
  lines?: number;
  /** `rect`/`card`: aspect ratio so the box matches the final content (0.64 Stimpie, 4/5 hoodie). */
  ratio?: number | string;
  /** `table-row`: number of cells. */
  cells?: number;
  /** Use `line` on cream sections where cream-on-cream would vanish. */
  tone?: 'cream' | 'line';
}

/**
 * Loading placeholder shaped like the final content. A pulse of opacity (0.6-1, 1.2 s), never a
 * gradient shimmer; static under reduced motion. Decorative: wrap groups in <SkeletonGroup>.
 */
export function Skeleton({
  variant = 'rect',
  lines = 3,
  ratio,
  cells = 4,
  tone = 'cream',
  className,
  style,
  ...rest
}: SkeletonProps) {
  const fill = tone === 'cream' ? 'bg-cream' : 'bg-line';
  const block = cn('animate-stimpy-pulse', fill);
  const aspect = ratio !== undefined ? { aspectRatio: String(ratio), ...style } : style;

  if (variant === 'text') {
    return (
      <div aria-hidden="true" className={cn('space-y-2', className)} style={style} {...rest}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={cn('h-4 rounded-sm', block, i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    );
  }
  if (variant === 'card') {
    return (
      <div aria-hidden="true" className={cn('space-y-3', className)} {...rest}>
        <div className={cn('w-full rounded-lg', block)} style={{ aspectRatio: String(ratio ?? 0.64) }} />
        <div className={cn('h-5 w-3/4 rounded-sm', block)} />
        <div className={cn('h-5 w-1/3 rounded-sm', block)} />
      </div>
    );
  }
  if (variant === 'table-row') {
    return (
      <div aria-hidden="true" className={cn('flex h-12 items-center gap-4 border-b border-base', className)} {...rest}>
        {Array.from({ length: cells }, (_, i) => (
          <div key={i} className={cn('h-4 flex-1 rounded-sm', block)} />
        ))}
      </div>
    );
  }
  if (variant === 'stat') {
    return (
      <div aria-hidden="true" className={cn('space-y-3 rounded-lg border border-base p-4', className)} {...rest}>
        <div className={cn('h-4 w-1/3 rounded-sm', block)} />
        <div className={cn('h-8 w-1/2 rounded-sm', block)} />
      </div>
    );
  }
  return <div aria-hidden="true" className={cn('rounded-lg', block, className)} style={aspect} {...rest} />;
}

export interface SkeletonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Announced once: "Loading". */
  label?: string;
}

/** One live announcement for a whole loading region. */
export function SkeletonGroup({ label = 'Loading', className, children, ...rest }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" className={className} {...rest}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * state-and-errors 7: show a skeleton only after `delayMs` (150) of loading, and once shown keep it
 * at least `minMs` (300) so it does not flash.
 */
export function useSkeletonDelay(loading: boolean, delayMs = 150, minMs = 300): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(t);
    }
    if (shownAt.current !== null) {
      const remaining = Math.max(0, minMs - (Date.now() - shownAt.current));
      const t = setTimeout(() => {
        shownAt.current = null;
        setVisible(false);
      }, remaining);
      return () => clearTimeout(t);
    }
    setVisible(false);
    return undefined;
  }, [loading, delayMs, minMs]);
  return visible;
}

export interface SlowLoadingHintProps {
  /** True while loading. After `afterMs` (8000) the hint appears. */
  loading: boolean;
  onRetry?: () => void;
  afterMs?: number;
  className?: string;
}

/** "Still loading. Your connection may be slow." with a Retry button, after 8 seconds. */
export function SlowLoadingHint({ loading, onRetry, afterMs = 8000, className }: SlowLoadingHintProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return undefined;
    }
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [loading, afterMs]);
  if (!loading || !slow) return null;
  return (
    <p role="status" className={cn('flex flex-wrap items-center gap-3 text-body-sm text-fg-muted', className)}>
      Still loading. Your connection may be slow.
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </p>
  );
}

/* ---------------------------------------------------------------------------------- ProgressBar */

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** 0..max. Omit for indeterminate. */
  value?: number;
  max?: number;
  /** Required accessible name, e.g. "Uploading hoodie.glb". */
  'aria-label': string;
}

export function ProgressBar({ value, max = 100, className, ...rest }: ProgressBarProps) {
  const determinate = typeof value === 'number';
  const pct = determinate ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={determinate ? Math.round(value) : undefined}
      aria-valuetext={determinate ? `${Math.round(pct)}%` : undefined}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
      {...rest}
    >
      {determinate ? (
        <div
          className="h-full rounded-full bg-fg transition-[width] duration-base ease-standard"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div className="h-full w-2/5 animate-stimpy-indeterminate rounded-full bg-fg" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- EmptyState / ErrorState */

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A 32px lucide icon, passed as an element. */
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}

export function EmptyState({ icon, title, text, action, headingLevel = 3, className, ...rest }: EmptyStateProps) {
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-12 text-center', className)} {...rest}>
      {icon ? (
        <span className="text-fg" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <H className="text-h3 text-fg">{title}</H>
      {text ? <p className="max-w-prose text-body text-fg-muted">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  text?: ReactNode;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  retryLabel?: string;
  retryLoading?: boolean;
  /** From an API error body (`error.requestId`). Omit for network failures, which have none. */
  requestId?: string | null;
  /** Extra actions next to Try again (e.g. a Home link). */
  action?: ReactNode;
  icon?: ReactNode;
}

/** Plain language, never a stack trace. */
export function ErrorState({
  title = 'Something went wrong',
  text = 'We could not load this. Please try again.',
  onRetry,
  retryLabel = 'Try again',
  retryLoading,
  requestId,
  action,
  icon,
  className,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}
      {...rest}
    >
      <span className="text-fg" aria-hidden="true">
        {icon ?? <AlertCircle width={32} height={32} />}
      </span>
      <h3 className="text-h3 text-fg">{title}</h3>
      {text ? <p className="max-w-prose text-body text-fg-muted">{text}</p> : null}
      {onRetry || action ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {onRetry ? (
            <Button variant="dark" onClick={onRetry} loading={retryLoading}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
      {requestId ? (
        <p className="mt-2 max-w-prose text-body-sm text-fg-muted">
          If it keeps happening, message us and quote this code:{' '}
          <span className="font-medium tabular-nums text-fg">{requestId}</span>
        </p>
      ) : null}
    </div>
  );
}
