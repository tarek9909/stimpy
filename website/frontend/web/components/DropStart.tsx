'use client';

import { useEffect, useState } from 'react';
import { formatDropStart, formatDateTime, timeZoneCity } from '@stimpy/ui';

/**
 * A drop's start time. The server (and the first client render) shows the business zone, e.g.
 * `16 Oct 2026, 15:35 (Beirut time)`; after hydration it switches to the visitor's zone, with "(Beirut time)" appended
 * only when the zones differ (state-and-errors 12.2). A neutral `<time dateTime>` keeps the machine value.
 */
export function DropStart({ iso, businessTimeZone, className }: { iso: string; businessTimeZone: string; className?: string }) {
  const [text, setText] = useState(`${formatDateTime(iso, { timeZone: businessTimeZone })} (${timeZoneCity(businessTimeZone)} time)`);
  useEffect(() => {
    setText(formatDropStart(iso, { businessTimeZone }));
  }, [iso, businessTimeZone]);
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
