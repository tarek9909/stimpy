'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../cn';
import { whatsappLink } from '../format';
import { Check, Copy, MessageCircle } from '../icons';
import type { ButtonSize, ButtonVariant } from '../buttonStyles';
import { Button } from './Button';
import { useOptionalToast } from './Toast';

/* ------------------------------------------------------------------------------------ CopyButton */

/** Clipboard write with a textarea fallback for in-app browsers without the async API. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface CopyButtonProps {
  text: string;
  /** Accessible name, e.g. "Copy order number". Visible text when `children` is absent and not `iconOnly`. */
  label: string;
  children?: ReactNode;
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  copiedLabel?: string;
  /** Toast on copy when a <ToastProvider> is mounted. Default true. */
  toast?: boolean;
  onCopied?: () => void;
  className?: string;
}

/** Copies text; success is shown by the icon, a polite live-region text change and (optionally) a toast. */
export function CopyButton({
  text,
  label,
  children,
  iconOnly,
  variant = 'secondary',
  size = 'md',
  copiedLabel = 'Copied',
  toast = true,
  onCopied,
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toaster = useOptionalToast();
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'failed');
    if (ok) {
      onCopied?.();
      if (toast) toaster?.success(copiedLabel);
    } else if (toast) {
      toaster?.error("Couldn't copy. Select the text and copy it manually.");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const icon = state === 'copied' ? <Check width={20} height={20} aria-hidden="true" /> : <Copy width={20} height={20} aria-hidden="true" />;
  return (
    <span className={cn('inline-flex', className)}>
      <Button
        variant={variant}
        size={size}
        iconOnly={iconOnly}
        aria-label={iconOnly ? label : undefined}
        leftIcon={iconOnly ? undefined : icon}
        onClick={onClick}
      >
        {iconOnly ? icon : (children ?? (state === 'copied' ? copiedLabel : label))}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? copiedLabel : state === 'failed' ? "Couldn't copy" : ''}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------------- WhatsAppButton */

export interface WhatsAppButtonProps {
  /** `business.whatsappNumber` (`+961XXXXXXXX`) or null. Renders NOTHING when null or unusable. */
  number: string | null | undefined;
  /** Pre-filled message. */
  text?: string;
  /** Website "Confirm on WhatsApp"; dashboard "Message customer". */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** A normal anchor to `wa.me` (not `window.open`, so it survives in-app browsers). */
export function WhatsAppButton({
  number,
  text,
  label = 'Confirm on WhatsApp',
  variant = 'dark',
  size = 'md',
  fullWidth,
  className,
}: WhatsAppButtonProps) {
  const href = whatsappLink(number, text);
  if (!href) return null;
  return (
    <Button
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      leftIcon={<MessageCircle width={20} height={20} aria-hidden="true" />}
    >
      {label}
    </Button>
  );
}

export interface FloatingWhatsAppProps {
  number: string | null | undefined;
  text?: string;
  /** Hide behind open sheets or on /checkout. */
  hidden?: boolean;
  className?: string;
}

/**
 * Bottom-right chat button: 56px, white glyph on a black circle (white on coral would fail
 * contrast at 2.6:1; not WhatsApp green). Lifts above a sticky bar via `--stimpy-sticky-offset`.
 */
export function FloatingWhatsApp({ number, text = 'Hi Stimpy', hidden, className }: FloatingWhatsAppProps) {
  const href = whatsappLink(number, text);
  if (!href || hidden) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Stimpy on WhatsApp"
      className={cn(
        'fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom)_+_var(--stimpy-sticky-offset,0px))] right-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white transition duration-fast ease-standard hover:brightness-90',
        className,
      )}
    >
      <MessageCircle width={28} height={28} aria-hidden="true" />
    </a>
  );
}
