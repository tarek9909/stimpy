import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { components } from '@stimpy/api-client';
import { formatCents, useToast } from '@stimpy/ui';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { getEnv } from '../env';
import { setDocumentUnread } from '../lib/documentTitle';
import { fetchAllPages } from '../lib/pagination';
import { setNavBadge } from './navBadges';

type OrderSummary = components['schemas']['AdminOrderSummary'];

const SOUND_KEY = 'stimpy.notify.sound';
const BROWSER_KEY = 'stimpy.notify.browser';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* per-viewer convenience only */
  }
}

/** Two short tones from WebAudio (no audio asset to ship). Only after the user turned sound on. */
let audioCtx: AudioContext | null = null;
function ensureAudio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx ??= new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
function playChime(): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.18);
  });
}

export interface NotificationsValue {
  /** New orders since the founder last opened the bell. */
  unread: number;
  /** Newest first, at most 10. */
  recent: OrderSummary[];
  markSeen: () => void;
  sound: boolean;
  setSound: (on: boolean) => void;
  browserNotifications: boolean;
  /** `denied` when the browser blocked the permission prompt. */
  browserPermission: NotificationPermission | 'unsupported';
  setBrowserNotifications: (on: boolean) => Promise<void>;
  /** 3+ failed polls in a row. */
  pollFailing: boolean;
  /** Tell the poller not to announce an order this dashboard created itself. */
  ignoreOrder: (id: number) => void;
}

const Ctx = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications() needs <NotificationsProvider>.');
  return v;
}

/**
 * New-order polling and alerts (dashboard-pages 2.5). `GET /admin/orders/counts` every 30 s while
 * the tab is visible (TanStack pauses it in the background and refetches on focus); when `ALL`
 * rises, `GET /admin/orders?afterId=<last known id>` names exactly the newcomers, so an order that
 * left NEW in the same interval cannot hide a new one. Failed polls back off to 60 s and after 3
 * failures `pollFailing` turns on. A 401 follows the global expiry flow (polling then stops
 * because the shell unmounts). Mounted once inside the shell.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const pollMs = getEnv().orderPollMs;

  const counts = useQuery({
    queryKey: queryKeys.ordersCounts,
    queryFn: () => unwrap(api.GET('/api/v1/admin/orders/counts')),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' ? 60_000 : pollMs),
    refetchIntervalInBackground: false,
  });

  const [recent, setRecent] = useState<OrderSummary[]>([]);
  const [unread, setUnread] = useState(0);
  const [sound, setSoundState] = useState(() => readFlag(SOUND_KEY));
  const [browser, setBrowserState] = useState(() => readFlag(BROWSER_KEY));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const [failures, setFailures] = useState(0);
  const [lookupRevision, setLookupRevision] = useState(0);

  const lastKnownId = useRef<number | null>(null);
  const lastAll = useRef<number | null>(null);
  const initializing = useRef(false);
  const lookupInFlight = useRef(false);
  const lookupFailures = useRef(0);
  const lookupRetryTimer = useRef<number | null>(null);
  const ignored = useRef(new Set<number>());
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const browserRef = useRef(browser);
  browserRef.current = browser;

  // The Orders badge in the navigation = orders waiting in NEW.
  useEffect(() => {
    setNavBadge('orders', counts.data?.NEW ?? 0);
    return () => setNavBadge('orders', null);
  }, [counts.data?.NEW]);

  // Count consecutive failures (reset by any success).
  useEffect(() => {
    if (counts.dataUpdatedAt > 0) setFailures(0);
  }, [counts.dataUpdatedAt]);
  useEffect(() => {
    if (counts.errorUpdatedAt > 0) setFailures((n) => n + 1);
  }, [counts.errorUpdatedAt]);

  // Learn a recent high-water id once, so only later orders count as new. A failed baseline read
  // remains uninitialized and is retried; treating failure as id 0 would announce old orders.
  useEffect(() => {
    if (counts.data === undefined || lastKnownId.current !== null || initializing.current) return;
    lastAll.current ??= counts.data.ALL;
    initializing.current = true;
    let cancelled = false;
    void unwrap(api.GET('/api/v1/admin/orders', { params: { query: { pageSize: 20, sort: '-placedAt' } } }))
      .then((page) => {
        if (cancelled) return;
        lastKnownId.current = page.items.reduce((highest, order) => Math.max(highest, order.id), 0);
        setLookupRevision((revision) => revision + 1);
      })
      .catch(() => {
        if (!cancelled) scheduleLookupRetry();
      });
    return () => {
      cancelled = true;
      initializing.current = false;
    };
  }, [counts.dataUpdatedAt, lookupRevision]);

  const announce = useCallback(
    (orders: OrderSummary[]) => {
      const fresh = orders.filter((o) => !ignored.current.has(o.id));
      if (fresh.length === 0) return;
      setRecent((r) => [...fresh, ...r].slice(0, 10));
      setUnread((n) => n + fresh.length);
      if (fresh.length === 1) {
        const o = fresh[0] as OrderSummary;
        toast.info(`New order ${o.number} from ${o.customerName} (${formatCents(o.totalCents, { fixed: true })})`, { action: { label: 'Open', onClick: () => navigate(`/orders/${o.id}`) } });
      } else {
        toast.info(`${fresh.length} new orders`, { action: { label: 'View', onClick: () => navigate('/orders?status=NEW') } });
      }
      if (soundRef.current) playChime();
      if (browserRef.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const o = fresh[0] as OrderSummary;
          new Notification(fresh.length === 1 ? `New order ${o.number}` : `${fresh.length} new orders`, {
            body: fresh.length === 1 ? `${o.customerName}, ${formatCents(o.totalCents, { fixed: true })}` : undefined,
            tag: 'stimpy-new-order',
          });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
    },
    [toast, navigate],
  );

  // A rising ALL count means something arrived. Keep both cursors unchanged on any failed page;
  // the next count refresh or bounded retry will request the same arrivals again.
  useEffect(() => {
    const all = counts.data?.ALL;
    if (all === undefined || lastAll.current === null || lastKnownId.current === null) {
      if (all !== undefined && lastAll.current === null) lastAll.current = all;
      return;
    }
    if (all <= lastAll.current) {
      lastAll.current = all;
      return;
    }
    if (lookupInFlight.current) return;
    lookupInFlight.current = true;
    const observedAll = all;
    const afterId = lastKnownId.current;
    void fetchAllPages(
      (page, pageSize) => unwrap(api.GET('/api/v1/admin/orders', { params: { query: { afterId, sort: '-placedAt', page, pageSize } } })),
      20,
    )
      .then((page) => {
        const ids = page.items.map((o) => o.id);
        if (ids.length > 0) lastKnownId.current = Math.max(lastKnownId.current ?? 0, ...ids);
        lastAll.current = observedAll;
        lookupFailures.current = 0;
        clearLookupRetry();
        announce(page.items);
        void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
        setLookupRevision((revision) => revision + 1);
      })
      .catch(() => scheduleLookupRetry())
      .finally(() => {
        lookupInFlight.current = false;
      });
  }, [counts.data?.ALL, counts.dataUpdatedAt, announce, queryClient, lookupRevision]);

  function clearLookupRetry(): void {
    if (lookupRetryTimer.current !== null) window.clearTimeout(lookupRetryTimer.current);
    lookupRetryTimer.current = null;
  }

  function scheduleLookupRetry(): void {
    clearLookupRetry();
    lookupFailures.current += 1;
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(lookupFailures.current - 1, 6));
    lookupRetryTimer.current = window.setTimeout(() => {
      lookupRetryTimer.current = null;
      setLookupRevision((revision) => revision + 1);
    }, delay);
  }

  useEffect(() => () => clearLookupRetry(), []);

  useEffect(() => {
    setDocumentUnread(unread);
    return () => setDocumentUnread(0);
  }, [unread]);

  const value = useMemo<NotificationsValue>(
    () => ({
      unread,
      recent,
      markSeen: () => setUnread(0),
      sound,
      setSound: (on) => {
        // The click that turns sound on is also the user gesture that unlocks audio.
        if (on) {
          ensureAudio();
          playChime();
        }
        writeFlag(SOUND_KEY, on);
        setSoundState(on);
      },
      browserNotifications: browser && permission === 'granted',
      browserPermission: permission,
      setBrowserNotifications: async (on) => {
        if (!on) {
          writeFlag(BROWSER_KEY, false);
          setBrowserState(false);
          return;
        }
        if (typeof Notification === 'undefined') return;
        // Ask only now, from the switch: never on load.
        const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        setPermission(result);
        const granted = result === 'granted';
        writeFlag(BROWSER_KEY, granted);
        setBrowserState(granted);
      },
      pollFailing: failures >= 3,
      ignoreOrder: (id) => {
        ignored.current.add(id);
      },
    }),
    [unread, recent, sound, browser, permission, failures],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
