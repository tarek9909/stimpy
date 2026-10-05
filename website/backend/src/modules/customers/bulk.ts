import type { AppContext } from '../../context';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../lib/errors';
import { renderTemplate } from '../../lib/template';
import { enqueueEmail } from '../../services/email-queue';
import { buildWaUrl } from '../../services/whatsapp';
import { matchingCustomerRows, type CustomerFilters, type CustomerRow } from './service';

/**
 * Bulk messaging to customers (docs/crm/backend.md phase 4, trimmed): the CRM list filters pick the people, the server
 * decides who is actually reachable. Rules enforced here, never in the browser:
 *  - no email address / WhatsApp number -> skipped ("noContact")
 *  - the customer opted out of bulk messages -> skipped ("optedOut")
 *  - consent, unsubscribe and opt-out are enforced by the server for the selected channel
 *  - at most the configured campaign recipient cap per send; the rest are reported as `overCap`
 *  - WhatsApp is never sent automatically: the result is a list of `wa.me` links the owner opens one by one
 */
export const DEFAULT_BULK_CAP = 200;

export type BulkTarget = { ids?: number[]; filters?: CustomerFilters };
export type Skipped = { noContact: number; noConsent: number; optedOut: number };
type Channel = 'EMAIL' | 'WHATSAPP';

const OPT_OUT_LINE = 'Reply "stop" to this message and we will not message you again.';

async function resolveTarget(ctx: AppContext, target: BulkTarget): Promise<CustomerRow[]> {
  if (target.ids) {
    // Ids are always checked against the table: unknown ids are dropped, not an error.
    return matchingCustomerRows(ctx, { ids: target.ids });
  }
  return matchingCustomerRows(ctx, target.filters ?? {});
}

/** Splits matches into reachable recipients (first BULK_CAP) and skip counts. `to` is the address or number for the channel. */
async function select(ctx: AppContext, target: BulkTarget, channel: Channel) {
  const matched = await resolveTarget(ctx, target);
  const skipped: Skipped = { noContact: 0, noConsent: 0, optedOut: 0 };
  const eligible: { row: CustomerRow; to: string }[] = [];
  const seen = new Set<string>();
  const consented = (row: CustomerRow) => channel === 'EMAIL' ? row.emailConsent && row.unsubscribedAt === null : row.whatsappConsent;
  for (const row of matched) {
    if (row.optedOut) {
      skipped.optedOut++;
      continue;
    }
    const to = channel === 'EMAIL' ? row.email?.trim() : row.whatsapp.trim();
    if (!to) {
      skipped.noContact++;
      continue;
    }
    if (!consented(row)) {
      skipped.noConsent++;
      continue;
    }
    // Two customers sharing one address get one message.
    if (seen.has(to.toLowerCase())) continue;
    seen.add(to.toLowerCase());
    eligible.push({ row, to });
  }
  eligible.sort((a, b) => a.row.id - b.row.id);
  const cap = (await ctx.settings.get('email')).campaignRecipientCap ?? DEFAULT_BULK_CAP;
  return { matched: matched.length, skipped, eligible: eligible.slice(0, cap), overCap: Math.max(0, eligible.length - cap), eligibleTotal: eligible.length, cap };
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';
const valuesFor = (row: CustomerRow) => ({ name: firstName(row.name), full_name: row.name });

export async function previewBulk(ctx: AppContext, input: { target: BulkTarget; channel: Channel }) {
  const s = await select(ctx, input.target, input.channel);
  return {
    matched: s.matched,
    eligible: s.eligibleTotal,
    skipped: s.skipped,
    cap: s.cap,
    overCap: s.overCap,
    sample: s.eligible.slice(0, 5).map(({ row, to }) => ({ id: row.id, name: row.name, to })),
  };
}

export async function sendBulkEmail(ctx: AppContext, input: { target: BulkTarget; subject: string; body: string }) {
  if (!(await ctx.settings.get('email')).enabled) throw AppError.conflict('Customer emails are switched off in Settings.', 'email');
  const s = await select(ctx, input.target, 'EMAIL');
  if (s.eligible.length === 0) throw AppError.conflict('Nobody in this selection can be emailed.', 'target');
  let queued = 0;
  for (const { row, to } of s.eligible) {
    const row_ = await ctx.prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({ where: { id: row.id }, select: { emailConsent: true, unsubscribedAt: true, marketingOptOutAt: true, unsubscribeToken: true } });
      if (!customer || !customer.emailConsent || customer.unsubscribedAt || customer.marketingOptOutAt) return null;
      let token = customer.unsubscribeToken;
      if (!token) {
        token = randomBytes(32).toString('hex');
        await tx.customer.update({ where: { id: row.id }, data: { unsubscribeToken: token } });
      }
      return enqueueEmail(ctx, tx, {
        to,
        template: 'custom',
        custom: { subject: input.subject, body: `${input.body}\n\nUnsubscribe: {unsubscribe_url}` },
        values: { ...valuesFor(row), unsubscribe_url: `${ctx.config.webUrl}/unsubscribe?token=${token}` },
        force: true,
      });
    });
    if (row_) queued++;
  }
  return { queued, skipped: s.skipped, overCap: s.overCap };
}

export async function buildBulkWhatsapp(ctx: AppContext, input: { target: BulkTarget; text: string }) {
  const s = await select(ctx, input.target, 'WHATSAPP');
  const items = s.eligible.map(({ row, to }) => {
    const text = `${renderTemplate(input.text, valuesFor(row))}\n\n${OPT_OUT_LINE}`;
    return { customerId: row.id, name: row.name, to, text, url: buildWaUrl(to, text) };
  });
  return { items, skipped: s.skipped, overCap: s.overCap };
}
