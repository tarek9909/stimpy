/**
 * Mailpit HTTP API helper (http://localhost:8025 by default, `MAILPIT_URL`). Tests that send real SMTP mail through
 * the SMTP transport use it to read what arrived. Mailpit is shared by every engineer, so ALWAYS filter by a unique
 * recipient address rather than assuming an empty inbox.
 */
const base = (): string => (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/+$/, '');

export type MailpitMessage = {
  ID: string;
  Subject: string;
  To: { Address: string; Name: string }[];
  From: { Address: string; Name: string };
  Snippet: string;
  Created: string;
};

export async function mailpitAvailable(): Promise<boolean> {
  try {
    return (await fetch(`${base()}/api/v1/info`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

export async function mailpitMessages(opts: { to?: string } = {}): Promise<MailpitMessage[]> {
  const url = opts.to
    ? `${base()}/api/v1/search?query=${encodeURIComponent(`to:${opts.to}`)}&limit=100`
    : `${base()}/api/v1/messages?limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailpit ${res.status}`);
  return ((await res.json()) as { messages: MailpitMessage[] }).messages ?? [];
}

export async function mailpitMessage(id: string): Promise<{ Subject: string; Text: string; HTML: string; To: { Address: string }[]; ReplyTo: { Address: string }[] }> {
  const res = await fetch(`${base()}/api/v1/message/${id}`);
  if (!res.ok) throw new Error(`Mailpit ${res.status}`);
  return res.json() as Promise<{ Subject: string; Text: string; HTML: string; To: { Address: string }[]; ReplyTo: { Address: string }[] }>;
}

/** Deletes every message (use sparingly: the inbox is shared). `to` deletes only matching messages. */
export async function mailpitClear(opts: { to?: string } = {}): Promise<void> {
  if (opts.to) {
    const ids = (await mailpitMessages({ to: opts.to })).map((m) => m.ID);
    if (ids.length) await fetch(`${base()}/api/v1/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: ids }) });
    return;
  }
  await fetch(`${base()}/api/v1/messages`, { method: 'DELETE' });
}

/** Polls until at least `count` messages to `to` exist (default 1) or the timeout passes. */
export async function mailpitWaitFor(to: string, opts: { count?: number; timeoutMs?: number } = {}): Promise<MailpitMessage[]> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5000);
  for (;;) {
    const msgs = await mailpitMessages({ to });
    if (msgs.length >= (opts.count ?? 1)) return msgs;
    if (Date.now() > deadline) throw new Error(`Mailpit: expected ${opts.count ?? 1} message(s) to ${to}, found ${msgs.length}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}
