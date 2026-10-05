import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button, Switch, cn } from '@stimpy/ui';
import { useFormatters } from '../lib/format';
import { useNotifications } from './notifications';

/**
 * Bell with the count of new orders since it was last opened. The popover lists the recent new
 * orders (number, name, total, time), links to `/orders?status=NEW` and holds the per-browser
 * **Sound** and **Browser notifications** switches (the sound switch click unlocks audio; the
 * browser permission prompt appears only when that switch is turned on).
 */
export function NotificationBell() {
  const n = useNotifications();
  const f = useFormatters();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    n.markSeen();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // markSeen is stable enough: the effect should run per open, not per notification change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        iconOnly
        aria-label={n.unread > 0 ? `Notifications, ${n.unread} new` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative inline-flex">
          <Bell size={22} aria-hidden="true" />
          {n.unread > 0 ? (
            <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-coral px-1 text-caption tabular-nums text-ink">
              {n.unread > 99 ? '99+' : n.unread}
            </span>
          ) : null}
        </span>
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="New orders"
          className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-base bg-surface-base shadow-float"
        >
          <div className="max-h-72 overflow-y-auto">
            {n.recent.length === 0 ? (
              <p className="p-4 text-body-sm text-fg-muted">No new orders since you logged in.</p>
            ) : (
              <ul>
                {n.recent.map((o) => (
                  <li key={o.id} className="border-b border-base last:border-b-0">
                    <Link to={`/orders/${o.id}`} onClick={() => setOpen(false)} className="flex min-h-14 flex-col gap-0.5 px-4 py-2 no-underline hover:bg-surface">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium tabular-nums">{o.number}</span>
                        <span className="text-body-sm tabular-nums">{f.money(o.totalCents)}</span>
                      </span>
                      <span className="flex items-baseline justify-between gap-2 text-body-sm text-fg-muted">
                        <span className="min-w-0 truncate">{o.customerName}</span>
                        <time dateTime={o.placedAt} title={f.dateTime(o.placedAt)} className="shrink-0 tabular-nums">
                          {f.relative(o.placedAt)}
                        </time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-base px-4 py-2">
            <Link to="/orders?status=NEW" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center text-body-sm underline underline-offset-4">
              View all new orders
            </Link>
          </div>
          <div className={cn('border-t border-base px-4 py-1')}>
            <Switch label="Sound" description="Play a chime for each new order." checked={n.sound} onChange={n.setSound} />
            {n.browserPermission !== 'unsupported' ? (
              <Switch
                label="Browser notifications"
                description={n.browserPermission === 'denied' ? 'Blocked in this browser. Allow notifications in the site settings.' : 'Show a desktop notification.'}
                checked={n.browserNotifications}
                disabled={n.browserPermission === 'denied'}
                onChange={(on) => void n.setBrowserNotifications(on)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
