import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banner } from '@stimpy/ui';
import { sessionQueryOptions } from '../auth/session';
import { useFormatters } from '../lib/format';
import { useOnline } from '../lib/hooks';
import { useNotifications } from './notifications';

/**
 * Persistent top banners (dashboard-pages 1.6, state-and-errors 10.1): offline, "back online" and
 * a polling failure. Never a modal. Pages disable mutation buttons with `useOnline()`.
 */
export function ConnectionBanners() {
  const online = useOnline();
  const { pollFailing } = useNotifications();
  const [wasOffline, setWasOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setBackOnline(false);
      return undefined;
    }
    if (wasOffline) {
      setWasOffline(false);
      setBackOnline(true);
      const t = setTimeout(() => setBackOnline(false), 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [online, wasOffline]);

  if (!online) {
    return (
      <Banner variant="warning" live className="rounded-none">
        You&apos;re offline. Changes can&apos;t be saved.
      </Banner>
    );
  }
  if (pollFailing) {
    return (
      <Banner variant="warning" live className="rounded-none">
        Can&apos;t reach the server. New orders may not show up until it is back.
      </Banner>
    );
  }
  if (backOnline) {
    return (
      <Banner variant="info" live className="rounded-none">
        Back online.
      </Banner>
    );
  }
  return null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Optional hint driven by `session.expiresAt` (auth-and-sessions 2.6): under 24 h away a
 * dismissible strip says when the session ends; under 5 minutes it says it is about to end.
 * It never blocks and never logs out early (the real 401 does that).
 */
export function SessionExpiryHint() {
  const { data } = useQuery({ ...sessionQueryOptions, enabled: false });
  const f = useFormatters();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const expiresAt = data?.expiresAt;
  if (!expiresAt || dismissedFor === expiresAt) return null;
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining > DAY) return null;

  return (
    <Banner variant="info" dismissible onDismiss={() => setDismissedFor(expiresAt)} className="rounded-none">
      {remaining < 5 * 60 * 1000
        ? 'Your session is about to end.'
        : `Your session ends on ${f.dateTime(expiresAt)}. Save your work; you'll need to log in again.`}
    </Banner>
  );
}
