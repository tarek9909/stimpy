import { isValidTimeZone } from '@stimpy/ui';

const FALLBACK = [
  'Asia/Beirut',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Amman',
  'Africa/Cairo',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'UTC',
];

/** IANA zone names for the Business settings select. Uses the browser's list where available. */
export function listTimeZones(current?: string | null): string[] {
  let zones: string[] = FALLBACK;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) zones = supported.includes('UTC') ? supported : [...supported, 'UTC'];
  } catch {
    zones = FALLBACK;
  }
  const out = new Set(zones);
  if (current && isValidTimeZone(current)) out.add(current);
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}
