import { randomBytes } from 'node:crypto';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { Prisma } from '../../lib/db';
import type { Db } from '../../lib/db';
import type { AppContext } from '../../context';
import { AppError } from '../../lib/errors';
import { now } from '../../lib/clock';
import { dayRangeInTz } from '../../lib/dates';
import { toPage, toSkipTake, type Page, type PageQuery } from '../../lib/http';
import { renderTemplate } from '../../lib/template';
import { buildWaUrl, loadWhatsappTemplate } from '../../services/whatsapp';
import { enqueueEmail, loadEmailTemplate } from '../../services/email-queue';
import { loadOrderTemplateValues } from '../../services/template-values';
import { refreshCampaignCounts } from './campaigns-email';
import { crmCampaignFiltersSchema, type CampaignChannel, type CrmCampaignFilters } from './campaigns.schemas';

type Target = { segmentId?: number; filters?: CrmCampaignFilters };
type AudienceCount = { matched: number; eligible: number; skipped: { noContact: number; noConsent: number; optedOut: number }; cap: number; overCap: number };
type Sample = { id: number; name: string; to: string };
type AudienceRow = { id: number; name: string; email: string | null; whatsapp: string; emailConsent: boolean; whatsappConsent: boolean; unsubscribedAt: Date | null; marketingOptOutAt: Date | null };
type AudienceSummary = { matched: number; eligible: number; skipped: { noContact: number; noConsent: number; optedOut: number }; selected: AudienceRow[] };
type CampaignSummary = { id: number; segmentId: number | null; segmentName: string | null; channel: CampaignChannel; templateKey: string; status: 'DRAFT' | 'QUEUED' | 'READY' | 'COMPLETED' | 'PARTIAL' | 'FAILED'; createdBy: string; sentCount: number; skippedCount: number; failedCount: number; createdAt: string; confirmedAt: string | null; completedAt: string | null };
const AUDIENCE_BATCH = 300;
const CONFIRM_TX_TIMEOUT_MS = 5 * 60_000;

/** Build only relational/column filters here; aggregate filters are evaluated from bounded groupBy batches below. */
function baseWhere(filters: CrmCampaignFilters): PrismaTypes.CustomerWhereInput {
  const AND: PrismaTypes.CustomerWhereInput[] = [];
  if (filters.areaId !== undefined) AND.push({ areaId: filters.areaId });
  for (const tagId of filters.tagIds) AND.push({ tags: { some: { tagId } } });
  if (filters.subscribedToDropId !== undefined) AND.push({ subscribers: { some: { dropId: filters.subscribedToDropId } } });
  if (filters.subscribedNeverOrdered === true) AND.push({ subscribers: { some: {} }, orders: { none: { status: { not: 'CANCELLED' } } } });
  if (filters.subscribedNeverOrdered === false) AND.push({ OR: [{ subscribers: { none: {} } }, { orders: { some: { status: { not: 'CANCELLED' } } } }] });
  if (filters.hasEmail === true) AND.push({ email: { not: null, notIn: [''] } });
  if (filters.hasEmail === false) AND.push({ OR: [{ email: null }, { email: '' }] });
  return AND.length ? { AND } : {};
}

/**
 * Prisma cannot filter relation aggregates in a CustomerWhereInput. Scan candidates in fixed-size batches and aggregate
 * orders with Prisma groupBy so segment previews remain bounded in memory and never need interpolated/raw SQL.
 */
async function scanAudience(ctx: AppContext, db: Db, filters: CrmCampaignFilters, channel: CampaignChannel, retain: number): Promise<AudienceSummary> {
  const where = baseWhere(filters);
  const timezone = filters.lastOrderBefore || filters.lastOrderAfter ? (await ctx.settings.get('business')).timezone : null;
  const before = filters.lastOrderBefore && timezone ? dayRangeInTz(filters.lastOrderBefore, timezone).start : null;
  const after = filters.lastOrderAfter && timezone ? dayRangeInTz(filters.lastOrderAfter, timezone).end : null;
  const result: AudienceSummary = { matched: 0, eligible: 0, skipped: { noContact: 0, noConsent: 0, optedOut: 0 }, selected: [] };
  let cursor = 0;
  while (true) {
    const batch = await db.customer.findMany({
      where: { ...where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: AUDIENCE_BATCH,
      select: { id: true, name: true, email: true, whatsapp: true, emailConsent: true, whatsappConsent: true, unsubscribedAt: true, marketingOptOutAt: true },
    });
    if (!batch.length) break;
    cursor = batch[batch.length - 1]!.id;
    const ids = batch.map((row) => row.id);
    const [orderStats, valueStats] = await Promise.all([
      db.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { not: 'CANCELLED' } }, _count: { _all: true }, _max: { placedAt: true } }),
      db.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { notIn: ['CANCELLED', 'RETURNED'] } }, _sum: { totalCents: true } }),
    ]);
    const ordersByCustomer = new Map(orderStats.map((row) => [row.customerId, { count: row._count._all, last: row._max.placedAt }]));
    const valueByCustomer = new Map(valueStats.map((row) => [row.customerId, row._sum.totalCents ?? 0]));
    for (const row of batch) {
      const order = ordersByCustomer.get(row.id) ?? { count: 0, last: null };
      const ltv = valueByCustomer.get(row.id) ?? 0;
      if (filters.orderCountMin !== undefined && order.count < filters.orderCountMin) continue;
      if (filters.orderCountMax !== undefined && order.count > filters.orderCountMax) continue;
      if (filters.lifetimeValueMinCents !== undefined && ltv < filters.lifetimeValueMinCents) continue;
      if (filters.lifetimeValueMaxCents !== undefined && ltv > filters.lifetimeValueMaxCents) continue;
      if (before && order.last && order.last >= before) continue;
      if (after && (!order.last || order.last < after)) continue;
      result.matched++;
      const consent = channel === 'EMAIL' ? row.emailConsent && row.unsubscribedAt === null : row.whatsappConsent;
      const contact = channel === 'EMAIL' ? Boolean(row.email?.trim()) : Boolean(row.whatsapp.trim());
      if (row.marketingOptOutAt) result.skipped.optedOut++;
      else if (!consent) result.skipped.noConsent++;
      else if (!contact) result.skipped.noContact++;
      else {
        result.eligible++;
        if (result.selected.length < retain) result.selected.push(row);
      }
    }
  }
  return result;
}

async function filtersForTarget(ctx: AppContext, target: Target): Promise<{ segmentId: number | null; filters: CrmCampaignFilters }> {
  if ((target.segmentId !== undefined) === (target.filters !== undefined)) throw AppError.validation({ target: 'Choose one saved segment or filter set.' });
  if (target.segmentId !== undefined) {
    const segment = await ctx.prisma.segment.findUnique({ where: { id: target.segmentId } });
    if (!segment) throw AppError.notFound('Segment not found.');
    const parsed = crmCampaignFiltersSchema.safeParse(segment.filterJson);
    if (!parsed.success) throw AppError.conflict('This saved segment has invalid filters. Edit it before sending.', 'filters');
    return { segmentId: segment.id, filters: parsed.data };
  }
  const parsed = crmCampaignFiltersSchema.safeParse(target.filters);
  if (!parsed.success) throw AppError.validation({ filters: parsed.error.issues.map((issue) => issue.message).join(' ') });
  return { segmentId: null, filters: parsed.data };
}

async function capFor(ctx: AppContext): Promise<number> {
  return (await ctx.settings.get('email')).campaignRecipientCap;
}

export async function previewAudience(ctx: AppContext, filters: CrmCampaignFilters, channel: CampaignChannel): Promise<AudienceCount & { sample: Sample[] }> {
  const cap = await capFor(ctx);
  const summary = await scanAudience(ctx, ctx.prisma, filters, channel, Math.min(cap, 5));
  return {
    matched: summary.matched,
    eligible: summary.eligible,
    skipped: summary.skipped,
    cap,
    overCap: Math.max(0, summary.eligible - cap),
    sample: summary.selected.map((row) => ({ id: row.id, name: row.name, to: channel === 'EMAIL' ? row.email! : row.whatsapp })),
  };
}

export async function previewTarget(ctx: AppContext, target: Target, channel: CampaignChannel) {
  const resolved = await filtersForTarget(ctx, target);
  return { ...(await previewAudience(ctx, resolved.filters, channel)), segmentId: resolved.segmentId };
}

export async function listSegments(ctx: AppContext, q: PageQuery): Promise<Page<{ id: number; name: string; filters: CrmCampaignFilters; createdAt: string; updatedAt: string }>> {
  const [total, rows] = await Promise.all([
    ctx.prisma.segment.count(),
    ctx.prisma.segment.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map((row) => ({ id: row.id, name: row.name, filters: crmCampaignFiltersSchema.parse(row.filterJson), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })), total, q);
}

export async function createSegment(ctx: AppContext, input: { name: string; filters: CrmCampaignFilters; userId: number }) {
  try {
    const row = await ctx.prisma.segment.create({ data: { name: input.name, filterJson: input.filters as PrismaTypes.InputJsonValue, createdBy: input.userId } });
    return { id: row.id, name: row.name, filters: crmCampaignFiltersSchema.parse(row.filterJson), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw AppError.conflict('A segment with this name already exists.', 'name');
    throw err;
  }
}

export async function updateSegment(ctx: AppContext, id: number, patch: { name?: string; filters?: CrmCampaignFilters }) {
  const existing = await ctx.prisma.segment.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Segment not found.');
  try {
    const row = await ctx.prisma.segment.update({ where: { id }, data: { ...(patch.name === undefined ? {} : { name: patch.name }), ...(patch.filters === undefined ? {} : { filterJson: patch.filters as PrismaTypes.InputJsonValue }) } });
    return { id: row.id, name: row.name, filters: crmCampaignFiltersSchema.parse(row.filterJson), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw AppError.conflict('A segment with this name already exists.', 'name');
    throw err;
  }
}

export async function deleteSegment(ctx: AppContext, id: number): Promise<void> {
  const row = await ctx.prisma.segment.deleteMany({ where: { id } });
  if (!row.count) throw AppError.notFound('Segment not found.');
}

async function assertTemplate(ctx: AppContext, channel: CampaignChannel, key: string) {
  if (channel === 'EMAIL') {
    const settings = await ctx.settings.get('email');
    if (!settings.enabled) throw AppError.conflict('Customer emails are switched off in Settings.', 'email');
    const template = await loadEmailTemplate(ctx.prisma, key);
    if (!template || !template.enabled) throw AppError.validation({ templateKey: 'Choose an enabled email template.' });
    return template;
  }
  const template = await loadWhatsappTemplate(ctx.prisma, key);
  if (!template) throw AppError.validation({ templateKey: 'Choose an available WhatsApp template.' });
  return template;
}

async function templateValuesForCustomer(ctx: AppContext, db: Db, row: Pick<AudienceRow, 'id' | 'name'>): Promise<Record<string, string>> {
  const firstName = row.name.trim().split(/\s+/)[0] ?? '';
  const latestOrder = await db.order.findFirst({ where: { customerId: row.id, status: { not: 'CANCELLED' } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], select: { id: true } });
  const orderValues = latestOrder ? (await loadOrderTemplateValues(ctx, db, latestOrder.id)).values : {};
  return {
    name: firstName, full_name: row.name, customer_name: row.name,
    order_number: '', items: '', total: '', delivery_number: '', tracking_url: `${ctx.config.webUrl}/track`, shop_url: `${ctx.config.webUrl}/shop`, cancel_reason: '', order_list: 'No orders yet.',
    ...orderValues,
  };
}

export async function createCampaignDraft(ctx: AppContext, input: { target: Target; channel: CampaignChannel; templateKey: string; userId: number }) {
  await assertTemplate(ctx, input.channel, input.templateKey);
  const resolved = await filtersForTarget(ctx, input.target);
  const row = await ctx.prisma.campaignSend.create({
    data: { segmentId: resolved.segmentId, filterJson: resolved.filters as PrismaTypes.InputJsonValue, channel: input.channel, templateKey: input.templateKey, createdBy: input.userId },
    include: { creator: { select: { name: true } }, segment: { select: { name: true } } },
  });
  return { id: row.id, segmentId: row.segmentId, segmentName: row.segment?.name ?? null, channel: row.channel, templateKey: row.templateKey, status: row.status, createdBy: row.creator.name, sentCount: row.sentCount, skippedCount: row.skippedCount, failedCount: row.failedCount, createdAt: row.createdAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null } satisfies CampaignSummary;
}

export async function confirmCampaign(ctx: AppContext, id: number) {
  const campaign = await ctx.prisma.campaignSend.findUnique({ where: { id } });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  if (campaign.status !== 'DRAFT') throw AppError.conflict('This campaign has already been confirmed.', 'status');
  const channel = campaign.channel as CampaignChannel;
  const filters = crmCampaignFiltersSchema.parse(campaign.filterJson);
  const cap = await capFor(ctx);
  const template = await assertTemplate(ctx, channel, campaign.templateKey);
  const emailSubject = channel === 'EMAIL' ? (await loadEmailTemplate(ctx.prisma, campaign.templateKey))!.subject : '';
  await ctx.prisma.$transaction(async (tx) => {
    const claim = await tx.campaignSend.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'QUEUED' } });
    if (!claim.count) throw AppError.conflict('This campaign has already been confirmed.', 'status');
    const audience = await scanAudience(ctx, tx, filters, channel, cap);
    const picked = audience.selected;
    if (!picked.length) throw AppError.conflict('Nobody currently meets this campaign’s filters and consent requirements.', 'target');
    const recipients = [] as { customerId: number; status: 'QUEUED' | 'READY'; destination: string; bodySnapshot?: string | null; emailLogId?: number | null; error?: string | null }[];
    for (const row of picked) {
      const customerId = Number(row.id);
      const to = channel === 'EMAIL' ? row.email! : row.whatsapp;
      const values = await templateValuesForCustomer(ctx, tx, row);
      const body = channel === 'EMAIL'
        ? null
        : `${renderTemplate(template.body, values)}\n\nReply STOP if you do not want WhatsApp marketing messages.`;
      const recipient = await tx.campaignRecipient.create({ data: { campaignId: id, customerId, status: channel === 'EMAIL' ? 'QUEUED' : 'READY', destination: to, bodySnapshot: body } });
      if (channel === 'EMAIL') {
        let customer = await tx.customer.findUnique({ where: { id: customerId }, select: { unsubscribeToken: true } });
        if (!customer) throw AppError.notFound('A campaign customer was removed. Preview again.');
        let token = customer.unsubscribeToken;
        if (!token) {
          token = randomBytes(32).toString('hex');
          await tx.customer.update({ where: { id: customerId }, data: { unsubscribeToken: token } });
        }
        const queued = await enqueueEmail(ctx, tx, {
          to,
          template: 'custom',
          custom: { subject: emailSubject, body: `${template.body}\n\nUnsubscribe: {unsubscribe_url}` },
          values: { ...values, unsubscribe_url: `${ctx.config.webUrl}/unsubscribe?token=${token}` },
        });
        if (queued) {
          await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { emailLogId: queued.id } });
        } else {
          await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', error: 'Email queue is disabled or the address is invalid.' } });
        }
      }
    }
    const skippedCount = Math.max(0, audience.matched - picked.length);
    const status = channel === 'EMAIL' ? 'QUEUED' : 'READY';
    await tx.campaignSend.update({ where: { id }, data: { status, confirmedAt: now(), skippedCount } });
    // Several queries per recipient (up to the 5,000 cap) run in this one transaction; Prisma's 5 s default would abort
    // (and roll back) any real-sized campaign with P2028.
  }, { maxWait: 10_000, timeout: CONFIRM_TX_TIMEOUT_MS });
  await refreshCampaignCounts(ctx.prisma, id);
  return getCampaign(ctx, id, { page: 1, pageSize: 25 });
}

export async function listCampaigns(ctx: AppContext, q: PageQuery): Promise<Page<CampaignSummary>> {
  const [total, rows] = await Promise.all([
    ctx.prisma.campaignSend.count(),
    ctx.prisma.campaignSend.findMany({ include: { creator: { select: { name: true } }, segment: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map((row) => ({ id: row.id, segmentId: row.segmentId, segmentName: row.segment?.name ?? null, channel: row.channel, templateKey: row.templateKey, status: row.status, createdBy: row.creator.name, sentCount: row.sentCount, skippedCount: row.skippedCount, failedCount: row.failedCount, createdAt: row.createdAt.toISOString(), confirmedAt: row.confirmedAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null })), total, q);
}

export async function getCampaign(ctx: AppContext, id: number, q: PageQuery) {
  const campaign = await ctx.prisma.campaignSend.findUnique({ include: { creator: { select: { name: true } }, segment: { select: { name: true } } }, where: { id } });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  const [total, rows] = await Promise.all([
    ctx.prisma.campaignRecipient.count({ where: { campaignId: id } }),
    ctx.prisma.campaignRecipient.findMany({ where: { campaignId: id }, include: { customer: { select: { id: true, name: true, emailConsent: true, whatsappConsent: true, unsubscribedAt: true, marketingOptOutAt: true } }, emailLog: { select: { status: true, error: true, sentAt: true } } }, orderBy: [{ id: 'asc' }], ...toSkipTake(q) }),
  ]);
  const items = rows.map((row) => {
    const emailStatus = row.emailLog?.status;
    const status = row.status === 'QUEUED' && emailStatus === 'SENT' ? 'SENT' : row.status === 'QUEUED' && emailStatus === 'FAILED' ? 'FAILED' : row.status;
    const allowed = campaign.channel === 'EMAIL' ? row.customer.emailConsent && row.customer.unsubscribedAt === null : row.customer.whatsappConsent;
    const url = campaign.channel === 'WHATSAPP' && row.status === 'READY' && allowed && row.customer.marketingOptOutAt === null && row.destination && row.bodySnapshot ? buildWaUrl(row.destination, row.bodySnapshot) : null;
    return { id: row.id, customerId: row.customer.id, customerName: row.customer.name, status, to: row.destination, error: row.error ?? row.emailLog?.error ?? null, sentAt: (row.sentAt ?? row.emailLog?.sentAt)?.toISOString() ?? null, whatsappUrl: url };
  });
  return {
    id: campaign.id, segmentId: campaign.segmentId, segmentName: campaign.segment?.name ?? null, filters: crmCampaignFiltersSchema.parse(campaign.filterJson),
    channel: campaign.channel, templateKey: campaign.templateKey, status: campaign.status, createdBy: campaign.creator.name,
    sentCount: campaign.sentCount, skippedCount: campaign.skippedCount, failedCount: campaign.failedCount,
    createdAt: campaign.createdAt.toISOString(), confirmedAt: campaign.confirmedAt?.toISOString() ?? null, completedAt: campaign.completedAt?.toISOString() ?? null,
    recipients: toPage(items, total, q),
  };
}

export async function markWhatsappCampaignSent(ctx: AppContext, input: { campaignId: number; customerId: number; userId: number }) {
  const result = await ctx.prisma.$transaction(async (tx) => {
    const campaign = await tx.campaignSend.findUnique({ where: { id: input.campaignId }, select: { channel: true } });
    if (!campaign) throw AppError.notFound('Campaign not found.');
    if (campaign.channel !== 'WHATSAPP') throw AppError.conflict('Only WhatsApp campaign recipients can be marked sent.', 'channel');
    const recipient = await tx.campaignRecipient.findFirst({ where: { campaignId: input.campaignId, customerId: input.customerId }, include: { customer: { select: { whatsappConsent: true, marketingOptOutAt: true } } } });
    if (!recipient) throw AppError.notFound('Campaign recipient not found.');
    if (recipient.status === 'SENT') return recipient;
    if (recipient.status !== 'READY') throw AppError.conflict('This WhatsApp recipient is not ready to mark as sent.', 'status');
    if (!recipient.customer.whatsappConsent || recipient.customer.marketingOptOutAt) {
      const skipped = await tx.campaignRecipient.updateMany({ where: { id: recipient.id, status: 'READY' }, data: { status: 'SKIPPED', error: 'Consent was revoked before sending.' } });
      if (skipped.count) await tx.campaignSend.update({ where: { id: input.campaignId }, data: { skippedCount: { increment: 1 } } });
      return tx.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    }
    const at = now();
    const changed = await tx.campaignRecipient.updateMany({ where: { id: recipient.id, status: 'READY' }, data: { status: 'SENT', sentAt: at } });
    if (!changed.count) {
      const current = await tx.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
      if (current.status === 'SENT') return current;
      throw AppError.conflict('This WhatsApp recipient is not ready to mark as sent.', 'status');
    }
    const updated = await tx.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } });
    await tx.customerNote.create({ data: { customerId: input.customerId, userId: input.userId, body: `WhatsApp campaign ${input.campaignId} marked as sent.` } });
    return updated;
  });
  await refreshCampaignCounts(ctx.prisma, input.campaignId);
  return { id: result.id, customerId: result.customerId, status: result.status, sentAt: result.sentAt?.toISOString() ?? null };
}

