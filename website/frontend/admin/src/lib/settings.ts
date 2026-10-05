import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components, paths } from '@stimpy/api-client';
import { api, unwrap } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { setBusinessTimeZone } from './time';

export type Settings = components['schemas']['Settings'];

/** `GET /admin/settings`: business, orders, email, notifications. Cached 5 minutes. */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings')),
    staleTime: 5 * 60_000,
  });
}

/** Query groups that hold date-bearing data and must be refetched when the business time zone changes (state-and-errors 4). */
const DATE_BEARING = [['orders'], ['overview'], ['finance'], ['insights'], ['content'], ['stock'], ['deliveries'], ['drops'], ['expenses'], ['ad-spend']] as const;

/**
 * Feeds the business time zone (`settings.business.timezone`) into the formatter store so every
 * screen formats dates in it (dashboard-pages 1.1), and refetches date-bearing queries when it
 * changes. Mounted once in the shell. `VITE_DEFAULT_TIMEZONE` applies until the setting loads.
 */
export function useBusinessTimeZoneSync(): void {
  const queryClient = useQueryClient();
  const { data } = useSettings();
  const zone = data?.business.timezone;
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!zone) return;
    const changed = setBusinessTimeZone(zone);
    if (changed && previous.current !== null) {
      DATE_BEARING.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
    }
    previous.current = zone;
  }, [zone, queryClient]);
}

/** Body of `PATCH /admin/settings` (any subset of the four groups), from the generated client types. */
export type SettingsPatch = NonNullable<paths['/api/v1/admin/settings']['patch']['requestBody']>['content']['application/json'];

/**
 * Saves part of the settings. On success the cache takes the server's response (normalised values,
 * e.g. the E.164 WhatsApp number), the Overview is invalidated (the setup checklist and the
 * low-stock attention depend on settings) and stock is refetched when the low-stock threshold
 * changed. A changed time zone reaches every screen through `useBusinessTimeZoneSync`.
 */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsPatch) => unwrap(api.PATCH('/api/v1/admin/settings', { body })),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(queryKeys.settings, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.overview });
      if (vars.orders?.lowStockThreshold !== undefined) void queryClient.invalidateQueries({ queryKey: queryKeys.stock });
    },
  });
}
