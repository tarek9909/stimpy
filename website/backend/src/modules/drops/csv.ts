/**
 * Minimal CSV writer for the subscribers export. Cells that a spreadsheet could run as a formula (start with
 * `=`, `+`, `-`, `@`, tab or carriage return) are prefixed with `'`; normalised phone numbers (`+961...`) are plain
 * digits after the plus and need no protection.
 */
const SAFE_PHONE = /^\+\d+$/;

export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v) && !SAFE_PHONE.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function subscribersCsv(rows: { contact: string; type: string; drop: string; createdAt: string }[]): string {
  const lines = [['contact', 'type', 'drop', 'createdAt'].join(',')];
  for (const r of rows) lines.push([r.contact, r.type, r.drop, r.createdAt].map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}
