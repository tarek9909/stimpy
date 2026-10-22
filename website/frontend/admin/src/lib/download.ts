import { getBusinessTimeZone, ymdInZone } from './time';

/**
 * Browser downloads of API-generated files (CSV exports, auth-and-sessions 6.2). The blob is saved
 * under the server's `Content-Disposition` name when it is safe, else under `fallback`.
 */

/** `attachment; filename="orders-2026-10-14.csv"` -> `orders-2026-10-14.csv`; unsafe or missing -> `fallback`. */
export function filenameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  const name = match?.[1]?.trim();
  return name && /^[A-Za-z0-9._-]{1,100}$/.test(name) ? name : fallback;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `YYYY-MM-DD` in the business time zone (a UTC date names the file after "yesterday" just after midnight in Beirut). */
export function todayStamp(date: Date = new Date(), timeZone: string = getBusinessTimeZone()): string {
  return ymdInZone(date, timeZone);
}
