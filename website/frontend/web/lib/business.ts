/**
 * Business-level values every page needs from `GET /content` (timezone, WhatsApp number...). All of them degrade
 * gracefully when the content call fails, so a content outage never takes the shop pages down.
 */
import { DEFAULT_TIME_ZONE, formatDateTime, resolveTimeZone, timeZoneCity } from '@stimpy/ui';
import { getContent } from './data';

export async function getBusinessTimezone(): Promise<string> {
  try {
    const content = await getContent();
    return resolveTimeZone(content.business.timezone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Server-rendered text for a countdown or `<time>`: the instant in the BUSINESS zone (deterministic, so it cannot
 * mismatch on hydration). Example: `16 Oct 2026, 15:35 (Beirut time)`.
 */
export function staticDropText(iso: string, timeZone: string): string {
  return `${formatDateTime(iso, { timeZone })} (${timeZoneCity(timeZone)} time)`;
}
