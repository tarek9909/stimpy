import { cn } from './cn';

/**
 * - `primary` / `cta`: electric blue fill, white text. The ONLY blue button. `cta` is the
 *   website-pages name for purchase actions; both render identically.
 * - `dark`: black fill, white text (website-pages calls this `primary`). Inverts on dark bands.
 * - `secondary`: outline in the foreground colour. `ghost`: text only. `coral`: marketing
 *   highlight, black text. `danger`: dashboard destructive.
 */
export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'ghost' | 'coral' | 'danger' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-2 border-transparent bg-action text-white',
  cta: 'border-2 border-transparent bg-action text-white',
  dark: 'border-2 border-transparent bg-fg text-fg-inverse',
  coral: 'border-2 border-transparent bg-coral text-ink',
  danger: 'border-2 border-transparent bg-danger text-white',
  secondary: 'border-2 border-fg bg-transparent text-fg hover:bg-fg hover:text-fg-inverse',
  ghost: 'border-2 border-transparent bg-transparent text-fg underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-4 text-body-sm',
  md: 'min-h-11 px-5 text-button',
  lg: 'min-h-13 px-6 text-button-lg',
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 w-9 min-h-9 min-w-9 p-0',
  md: 'h-11 w-11 min-h-11 min-w-11 p-0',
  lg: 'h-13 w-13 min-h-13 min-w-13 p-0',
};

/** Class string for anything that must look like a Button (links, summary elements). */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  iconOnly?: boolean;
} = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium no-underline',
    'transition duration-fast ease-standard',
    'hover:brightness-90 active:brightness-75',
    'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled-bg disabled:text-disabled-fg disabled:no-underline disabled:brightness-100',
    'aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-disabled-bg aria-disabled:text-disabled-fg aria-disabled:no-underline aria-disabled:brightness-100',
    variantClasses[variant],
    iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
    fullWidth && 'w-full',
  );
}
