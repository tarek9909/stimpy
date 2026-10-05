import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { Button, cn, useUI } from '@stimpy/ui';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Internal path or absolute URL. Renders a link. */
  href?: string;
  onSelect?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Short reason shown under a disabled item. */
  disabledReason?: string;
  /** Draws a divider above the item. */
  separatorBefore?: boolean;
}

export interface MenuProps {
  /** Accessible name of the trigger, e.g. "Actions for STP-1042". */
  label: string;
  items: MenuItem[];
  /** Custom trigger content. Default: a "..." icon button (44 px). */
  trigger?: ReactNode;
  /** Non-interactive content above the items (the signed-in user's name and e-mail). */
  header?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

interface Position {
  top: number;
  left: number;
  minWidth: number;
}

/**
 * Action menu (WAI-ARIA menu button): row actions, user menu, "More" lists. Rendered in a portal
 * with fixed positioning so table and card containers never clip it. Arrow keys, Home/End, Enter
 * or Space select, Escape closes and returns focus, Tab closes. Items can be links or callbacks.
 */
export function Menu({ label, items, trigger, header, align = 'end', className }: MenuProps) {
  const { Link } = useUI();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const [active, setActive] = useState(0);

  const enabledIndexes = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setPos(null);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const listHeight = listRef.current?.offsetHeight ?? items.length * 44 + 8;
    const listWidth = Math.max(rect.width, 208);
    const below = rect.bottom + 4;
    const top = below + listHeight > window.innerHeight - 8 ? Math.max(8, rect.top - listHeight - 4) : below;
    const rawLeft = align === 'end' ? rect.right - listWidth : rect.left;
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - listWidth - 8);
    setPos({ top, left, minWidth: listWidth });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    const onDismiss = () => close(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('scroll', onDismiss, true);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && pos) {
      const el = listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active];
      el?.focus();
    }
  }, [open, pos, active]);

  const openMenu = (first: 'first' | 'last' = 'first') => {
    setActive(first === 'first' ? (enabledIndexes[0] ?? 0) : (enabledIndexes[enabledIndexes.length - 1] ?? 0));
    setOpen(true);
  };

  const move = (delta: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const at = enabledIndexes.indexOf(active);
    const next = enabledIndexes[(at + delta + enabledIndexes.length) % enabledIndexes.length];
    if (next !== undefined) setActive(next);
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(enabledIndexes[0] ?? 0);
        break;
      case 'End':
        e.preventDefault();
        setActive(enabledIndexes[enabledIndexes.length - 1] ?? 0);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  const select = (item: MenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect?.();
  };

  return (
    <span className={cn('inline-flex', className)}>
      <Button
        ref={(el) => {
          triggerRef.current = el as HTMLButtonElement | null;
        }}
        variant="ghost"
        iconOnly={!trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            openMenu('first');
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu('last');
          }
        }}
      >
        {trigger ?? <MoreHorizontal size={22} aria-hidden="true" />}
      </Button>
      {open
        ? createPortal(
            <div
              ref={listRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth } : { top: 0, left: 0, visibility: 'hidden' }}
              className="fixed z-toast max-w-[calc(100vw-1rem)] rounded-md border border-base bg-surface-base py-1 shadow-float"
            >
              {header ? <div className="border-b border-base px-4 py-3">{header}</div> : null}
              {items.map((item, i) => {
                const cls = cn(
                  'flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-body-sm no-underline',
                  item.tone === 'danger' ? 'text-fg-danger' : 'text-fg',
                  item.disabled ? 'cursor-not-allowed text-disabled-fg' : 'hover:bg-surface focus:bg-surface',
                );
                const inner = (
                  <>
                    {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                    <span className="flex min-w-0 flex-col">
                      <span>{item.label}</span>
                      {item.disabled && item.disabledReason ? <span className="text-caption text-fg-muted">{item.disabledReason}</span> : null}
                    </span>
                  </>
                );
                return (
                  <div key={item.id} role="none">
                    {item.separatorBefore ? <div role="separator" className="my-1 border-t border-base" /> : null}
                    {item.href && !item.disabled ? (
                      <Link
                        href={item.href}
                        role="menuitem"
                        tabIndex={i === active ? 0 : -1}
                        className={cls}
                        onClick={() => close(false)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={i === active ? 0 : -1}
                        aria-disabled={item.disabled || undefined}
                        className={cls}
                        onClick={() => select(item)}
                      >
                        {inner}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
