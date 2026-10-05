'use client';

import {
  forwardRef,
  useRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ElementType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from '../buttonStyles';
import { cn } from '../cn';
import { useUI } from '../context';
import { ExternalLink } from '../icons';
import { useIsomorphicLayoutEffect } from '../hooks';
import { isExternalHref, mergeRefs } from '../utils';
import { Spinner } from './Spinner';

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;
type NativeAnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'type'>;

export interface ButtonProps extends NativeButtonProps, Pick<NativeAnchorProps, 'target' | 'rel' | 'download'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner in place of the icon, keeps the label and the width, sets `aria-busy`. */
  loading?: boolean;
  /** Icon-only button: `aria-label` is REQUIRED. Gives a square 36/44/52 px target. */
  iconOnly?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Renders an `<a>` (through the injected Link for internal URLs) instead of a `<button>`. */
  href?: string;
  /** Force a specific element/component, e.g. Next's `Link` when no UIProvider is mounted. */
  as?: ElementType;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth,
    loading = false,
    iconOnly = false,
    leftIcon,
    rightIcon,
    href,
    as,
    disabled,
    onClick,
    type,
    className,
    style,
    children,
    target,
    rel,
    ...rest
  },
  ref,
) {
  const { Link } = useUI();
  const innerRef = useRef<HTMLElement>(null);
  const widthRef = useRef<number | null>(null);

  // Remember the resting width so the button does not jump when the spinner appears.
  useIsomorphicLayoutEffect(() => {
    if (!loading && innerRef.current) widthRef.current = innerRef.current.offsetWidth;
  });

  const isLink = href !== undefined && !disabled;
  const external = isExternalHref(href);
  const Comp: ElementType = as ?? (isLink ? (external ? 'a' : Link) : href !== undefined ? 'a' : 'button');
  const isButtonElement = Comp === 'button';

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled || loading) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    (onClick as ((e: MouseEvent<HTMLElement>) => void) | undefined)?.(event);
  };

  const spinner = <Spinner size="sm" />;
  const lead = loading && (leftIcon || !rightIcon) ? spinner : leftIcon;
  const trail = loading && !leftIcon && rightIcon ? spinner : rightIcon && !(loading && !leftIcon) ? rightIcon : null;

  const computedRel =
    rel ?? (target === '_blank' || external ? 'noopener noreferrer' : undefined);

  const extra: Record<string, unknown> = {};
  if (isButtonElement) {
    extra.type = type ?? 'button';
    extra.disabled = disabled;
  } else {
    if (isLink || (as && href !== undefined)) {
      extra.href = href;
      extra.target = target;
      extra.rel = computedRel;
    }
    if (disabled) {
      extra['aria-disabled'] = true;
      extra.role = 'link';
      extra.tabIndex = -1;
    }
  }

  return (
    <Comp
      ref={mergeRefs(ref, innerRef)}
      className={cn(buttonClasses({ variant, size, fullWidth, iconOnly }), className)}
      style={loading && widthRef.current ? { minWidth: widthRef.current, ...style } : style}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...extra}
      {...rest}
    >
      {lead}
      {children}
      {trail}
    </Comp>
  );
});

export interface LinkButtonProps extends Omit<ButtonProps, 'href'> {
  href: string;
}

/** A Button that is always a link. */
export const LinkButton = forwardRef<HTMLElement, LinkButtonProps>(function LinkButton(props, ref) {
  return <Button ref={ref} {...props} />;
});

export interface TextLinkProps extends Omit<NativeAnchorProps, 'href'> {
  href: string;
  /** `inline`: underlined, foreground colour (default). `action`: blue, white backgrounds only. */
  variant?: 'inline' | 'action';
  as?: ElementType;
  children?: ReactNode;
}

/** Inline navigation link. External links get `rel`, a new-tab hint and an icon. Visited is not styled. */
export const TextLink = forwardRef<HTMLAnchorElement, TextLinkProps>(function TextLink(
  { href, variant = 'inline', as, className, children, target, rel, ...rest },
  ref,
) {
  const { Link } = useUI();
  const external = isExternalHref(href) && !href.startsWith('mailto:') && !href.startsWith('tel:');
  const Comp: ElementType = as ?? (isExternalHref(href) ? 'a' : Link);
  return (
    <Comp
      ref={ref}
      href={href}
      target={target}
      rel={rel ?? (external || target === '_blank' ? 'noopener noreferrer' : undefined)}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm underline decoration-1 underline-offset-4 transition-colors duration-fast ease-standard hover:decoration-2',
        variant === 'action' ? 'text-action' : 'text-fg',
        className,
      )}
      {...rest}
    >
      {children}
      {external ? <ExternalLink width={16} height={16} aria-hidden="true" /> : null}
      {external && target === '_blank' ? <span className="sr-only">(opens in a new tab)</span> : null}
    </Comp>
  );
});
