import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@stimpy/ui';
import { NEW_ORDER_PATH } from '../app/navigation';
import { isTypingTarget } from '../lib/hooks';
import { focusGlobalSearch } from './GlobalSearch';

/**
 * Global keyboard shortcuts (dashboard-pages 2.6). They fire only when focus is not in an input,
 * textarea, select or contenteditable (Ctrl/Cmd+K works anywhere), and NEVER change data: there is
 * no "press c to confirm". `j` / `k` list selection belongs to each list page, not the shell.
 */
export const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: '/  or  Ctrl/Cmd+K', action: 'Search' },
  { keys: 'n', action: 'New order' },
  { keys: 'g then h', action: 'Go to Overview' },
  { keys: 'g then o', action: 'Go to Orders' },
  { keys: 'g then p', action: 'Go to Products' },
  { keys: 'g then s', action: 'Go to Stock' },
  { keys: 'g then d', action: 'Go to Deliveries' },
  { keys: 'g then c', action: 'Go to Customers' },
  { keys: '?', action: 'Show this help' },
  { keys: 'Esc', action: 'Close a dialog, menu or search' },
];

const GO: Record<string, string> = { h: '/', o: '/orders', p: '/products', s: '/stock', d: '/deliveries', c: '/customers' };

export function ShortcutsHost() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K works from anywhere.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        focusGlobalSearch();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      // A dialog is open (the page behind it is inert): leave the keys alone.
      if (document.querySelector('[data-stimpy-overlay]')) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const dest = GO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        return;
      }
      switch (e.key) {
        case '/':
          e.preventDefault();
          focusGlobalSearch();
          break;
        case 'n':
          e.preventDefault();
          navigate(NEW_ORDER_PATH);
          break;
        case 'g':
          pendingG.current = window.setTimeout(() => {
            pendingG.current = null;
          }, 1200);
          break;
        case '?':
          e.preventDefault();
          setHelpOpen(true);
          break;
        default:
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (pendingG.current !== null) window.clearTimeout(pendingG.current);
    };
  }, [navigate]);

  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" size="md">
      <dl className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 py-2.5 text-body-sm">
            <dt className="font-medium tabular-nums">{s.keys}</dt>
            <dd className="text-fg-muted">{s.action}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-body-sm text-fg-muted">Shortcuts never change data.</p>
    </Modal>
  );
}
