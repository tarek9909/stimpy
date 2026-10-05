/** Injectable clock. Production code must call `now()`, never `new Date()`, for anything time-dependent. */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}
export function setClock(fn: (() => Date) | null): void {
  override = fn;
}
export function resetClock(): void {
  override = null;
}
export const addMs = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
