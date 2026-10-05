/** Order number helpers. The counter itself (raw SQL, inside the order transaction) belongs to services/orders. */
export function formatOrderNumber(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

export type OrderLookup = { kind: 'full'; number: string } | { kind: 'digits'; digits: string };

/** "stp-1042" -> full "STP-1042"; "1042" -> digits (resolve to the current prefix, then to any "-1042" suffix). */
export function parseOrderLookup(input: string): OrderLookup | null {
  const s = input.trim().replace(/^#/, '').trim().toUpperCase(); // customers type "#1042" or "STP1042" too
  if (/^\d{1,9}$/.test(s)) return { kind: 'digits', digits: String(Number(s)) };
  const m = /^([A-Z0-9]{1,10})-(\d{1,9})$/.exec(s) ?? /^([A-Z]{1,10})(\d{1,9})$/.exec(s);
  if (m) return { kind: 'full', number: `${m[1]}-${Number(m[2])}` };
  return null;
}
