'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../cn';
import { X } from '../icons';
import { getFocusable } from '../utils';
import { Button } from './Button';

/* ------------------------------------------------------------------------------------------
 * Shared dialog behaviour: focus trap, Esc, return focus, scroll lock, inert background.
 * ---------------------------------------------------------------------------------------- */

let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

function lockScroll(): () => void {
  if (lockCount === 0) {
    const body = document.body;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  lockCount += 1;
  return () => {
    lockCount -= 1;
    if (lockCount === 0) {
      document.body.style.overflow = savedOverflow;
      document.body.style.paddingRight = savedPaddingRight;
    }
  };
}

/** Makes everything outside the dialog inert (not focusable, not clickable, hidden from AT). */
function inertBackground(portalRoot: HTMLElement): () => void {
  const changed: HTMLElement[] = [];
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child === portalRoot) continue;
    if (child.hasAttribute('inert')) continue;
    if (child.hasAttribute('data-stimpy-live')) continue; // toasts stay readable
    if (['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
    child.setAttribute('inert', '');
    changed.push(child);
  }
  return () => changed.forEach((el) => el.removeAttribute('inert'));
}

const overlayStack: symbol[] = [];

interface DialogBehaviorOptions {
  open: boolean;
  onClose: () => void;
  closeOnEsc: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function useDialogBehavior({ open, onClose, closeOnEsc, initialFocusRef, returnFocusRef }: DialogBehaviorOptions) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escRef = useRef(closeOnEsc);
  escRef.current = closeOnEsc;

  // Create (and always remove) the portal container while open.
  useEffect(() => {
    if (!open) return;
    const el = document.createElement('div');
    el.setAttribute('data-stimpy-overlay', '');
    document.body.appendChild(el);
    setRoot(el);
    return () => {
      setRoot(null);
      el.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !root) return;
    const trigger = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const releaseScroll = lockScroll();
    const releaseInert = inertBackground(root);
    const me = Symbol('overlay');
    overlayStack.push(me);

    const panel = panelRef.current;
    const target =
      initialFocusRef?.current ?? (panel ? (getFocusable(panel).find((el) => !el.hasAttribute('data-dialog-close')) ?? getFocusable(panel)[0]) : null) ?? panel;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== me) return;
      if (event.key === 'Escape') {
        if (escRef.current) {
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = getFocusable(panelRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusables[0] as HTMLElement;
      const last = focusables[focusables.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = overlayStack.indexOf(me);
      if (index !== -1) overlayStack.splice(index, 1);
      releaseInert();
      releaseScroll();
      if (trigger && document.contains(trigger)) trigger.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per open
  }, [open, root, returnFocusRef]);

  return { root, panelRef };
}

/* ---------------------------------------------------------------------------------- shell */

export interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  /** Required accessible name; shown as the heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  description?: ReactNode;
  /** Esc closes. Set false while a destructive action is in flight. Default true. */
  closeOnEsc?: boolean;
  /** Clicking the scrim closes. Default true. */
  closeOnBackdrop?: boolean;
  /** Hide the X button (only when the footer offers a close action). */
  hideClose?: boolean;
  /** Element to focus first; default is the first control in the dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Element to focus on close when opening followed an asynchronous action that moved focus. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  children?: ReactNode;
}

interface ShellProps extends DialogBaseProps {
  placement: 'center' | 'right' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
  /** Modal: below `sm` the dialog sits at the bottom like a sheet. */
  sheetOnMobile?: boolean;
  handle?: boolean;
}

function DialogShell({
  open,
  onClose,
  title,
  hideTitle,
  description,
  closeOnEsc = true,
  closeOnBackdrop = true,
  hideClose,
  initialFocusRef,
  returnFocusRef,
  footer,
  role = 'dialog',
  className,
  children,
  placement,
  size = 'md',
  sheetOnMobile = true,
  handle,
}: ShellProps) {
  const { root, panelRef } = useDialogBehavior({ open, onClose, closeOnEsc, initialFocusRef, returnFocusRef });
  const titleId = useId();
  const descId = useId();
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  if (!open || !root) return null;

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startY: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !panelRef.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    panelRef.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onHandleUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !panelRef.current) return;
    panelRef.current.style.transition = '';
    if (d.dy > 120) onClose();
    else panelRef.current.style.transform = '';
  };

  const sizeClass = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];

  const panel = (
    <div
      ref={panelRef}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      tabIndex={-1}
      className={cn(
        'relative flex max-h-[92dvh] w-full flex-col bg-surface-base text-fg shadow-overlay',
        (placement === 'center' || placement === 'right') &&
          cn(
            'animate-stimpy-fade-in sm:max-h-[85dvh] sm:rounded-lg',
            sheetOnMobile ? 'animate-stimpy-slide-up rounded-t-sheet sm:animate-stimpy-fade-in' : 'rounded-lg',
            sizeClass,
          ),
        placement === 'bottom' && 'animate-stimpy-slide-up rounded-t-sheet',
        className,
      )}
    >
      {handle ? (
        <div
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          aria-hidden="true"
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 id={titleId} className={cn('text-h3 text-fg', hideTitle && 'sr-only')}>
            {title}
          </h2>
          {description ? (
            <div id={descId} className="mt-1 text-body-sm text-fg-muted">
              {description}
            </div>
          ) : null}
        </div>
        {hideClose ? null : (
          <Button
            variant="ghost"
            iconOnly
            size="md"
            aria-label="Close"
            data-dialog-close=""
            onClick={onClose}
            className="-mr-2 -mt-1 shrink-0"
          >
            <X width={24} height={24} aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t border-base px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
          {footer}
        </div>
      ) : null}
    </div>
  );

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-overlay flex',
        (placement === 'center' || placement === 'right') &&
          (sheetOnMobile ? 'items-end justify-center sm:items-center sm:p-4' : 'items-center justify-center p-4'),
        placement === 'bottom' && 'items-end justify-center',
      )}
    >
      <div
        className="absolute inset-0 animate-stimpy-fade-in bg-ink/40"
        aria-hidden="true"
        onMouseDown={() => {
          if (closeOnBackdrop) onClose();
        }}
        onClick={() => {
          if (closeOnBackdrop) onClose();
        }}
      />
      {panel}
    </div>,
    root,
  );
}

/* -------------------------------------------------------------------------- public components */

export interface ModalProps extends DialogBaseProps {
  size?: 'sm' | 'md' | 'lg';
  /** Below `sm` the modal docks to the bottom as a sheet (default true). */
  sheetOnMobile?: boolean;
}

/** Centred dialog (bottom sheet on phones). Traps focus, Esc closes, returns focus, locks scroll. */
export function Modal(props: ModalProps) {
  return <DialogShell {...props} placement="center" />;
}

export interface DrawerProps extends DialogBaseProps {
  side?: 'right' | 'bottom' | 'center';
}

/** Side panel or pop-up dialog. Centered on desktop, closed on backdrop press. */
export function Drawer({ side = 'center', ...props }: DrawerProps) {
  const placement = side === 'right' ? 'center' : side;
  return <DialogShell {...props} placement={placement} handle={placement === 'bottom'} />;
}

/** Drawer `bottom` preset with a drag handle. Drag down to dismiss. */
export function BottomSheet(props: DialogBaseProps) {
  return <DialogShell {...props} placement="bottom" handle />;
}

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `destructive` uses the danger button and focuses Cancel first. */
  tone?: 'default' | 'destructive';
  /** The action is in flight: confirm shows loading, Esc/backdrop/cancel are locked. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** `confirm` preset: title, text, Cancel + Confirm. */
export function ConfirmModal({
  open,
  title,
  text,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      closeOnEsc={!busy}
      closeOnBackdrop={!busy}
      hideClose
      initialFocusRef={tone === 'destructive' ? cancelRef : undefined}
      footer={
        <>
          <Button
            ref={(el) => {
              cancelRef.current = el as HTMLButtonElement | null;
            }}
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button variant={tone === 'destructive' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {text ? <div className="text-body text-fg">{text}</div> : null}
      {children}
    </Modal>
  );
}
