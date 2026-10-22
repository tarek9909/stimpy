import type { Prisma as PrismaTypes } from '@prisma/client';
import { Prisma } from '../../lib/db';
import type { AppContext } from '../../context';
import { AppError } from '../../lib/errors';
import { iso, isoOrNull } from '../../lib/dates';
import { dayRangeInTz, ymdInTz } from '../../lib/dates';
import { now } from '../../lib/clock';
import { formatUsd } from '../../lib/money';
import { parseSort, toPage, toSkipTake, type Page, type PageQuery } from '../../lib/http';
import { likeEscape } from '../../lib/like';
import { normalizePhone } from '../../lib/phone';
import { isUniqueViolation } from '../../lib/db';
import { orderSummaryArgs, toOrderSummary, type AdminOrderSummaryDto } from '../../services/order-summary';
import { ERASED_EMAIL_SUFFIX } from '../../services/email-queue';
import { refreshCampaignCounts } from './campaigns-email';

/**
 * Customers (api-reference 5.7). Definitions (DECISIONS.md "customers"):
 *  - ordersCount      = orders that are not CANCELLED (the same rule as "repeat customer", business-rules 2)
 *  - totalSpentCents  = sum of `total_cents` of DELIVERED orders (money that actually came in; RETURNED orders are excluded)
 *  - lastOrderAt      = latest `placed_at` among non-cancelled orders (null when none)
 *  - returnedCount    = RETURNED orders; `warning` is true at 3 or more (business-rules 13)
 */
export const RETURN_WARNING_THRESHOLD = 3;
export const CUSTOMER_SORT_FIELDS = ['name', 'ordersCount', 'totalSpentCents', 'lastOrderAt'] as const;

export type CustomerRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  whatsapp: string;
  ordersCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
  returnedCount: number;
  warning: boolean;
  areaName: string | null;
  /** The person asked to stop bulk messages; bulk sends skip them. */
  optedOut: boolean;
  emailConsent: boolean;
  whatsappConsent: boolean;
  unsubscribedAt: string | null;
};
export type CustomerListRow = CustomerRow & { tags: { id: number; name: string; color: string | null }[] };
export type CustomerDetail = CustomerRow & { notes: string | null; orders: AdminOrderSummaryDto[] };

type Stats = { ordersCount: number; totalSpentCents: number; lastOrderAt: Date | null; returnedCount: number };

async function statsFor(ctx: AppContext, customerIds?: number[]): Promise<Map<number, Stats>> {
  const idFilter = customerIds ? { customerId: { in: customerIds } } : {};
  const [open, delivered, returned] = await Promise.all([
    ctx.prisma.order.groupBy({ by: ['customerId'], where: { ...idFilter, status: { not: 'CANCELLED' } }, _count: { _all: true }, _max: { placedAt: true } }),
    ctx.prisma.order.groupBy({ by: ['customerId'], where: { ...idFilter, status: 'DELIVERED' }, _sum: { totalCents: true } }),
    ctx.prisma.order.groupBy({ by: ['customerId'], where: { ...idFilter, status: 'RETURNED' }, _count: { _all: true } }),
  ]);
  const out = new Map<number, Stats>();
  const get = (id: number): Stats => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { ordersCount: 0, totalSpentCents: 0, lastOrderAt: null, returnedCount: 0 }));
    return s;
  };
  for (const r of open) Object.assign(get(r.customerId), { ordersCount: r._count._all, lastOrderAt: r._max.placedAt });
  for (const r of delivered) get(r.customerId).totalSpentCents = r._sum.totalCents ?? 0;
  for (const r of returned) get(r.customerId).returnedCount = r._count._all;
  return out;
}

const ZERO: Stats = { ordersCount: 0, totalSpentCents: 0, lastOrderAt: null, returnedCount: 0 };

type RowSource = {
  id: number; name: string; email: string | null; phone: string; whatsapp: string; marketingOptOutAt?: Date | null;
  emailConsent: boolean; whatsappConsent: boolean; unsubscribedAt: Date | null; area?: { name: string } | null;
};

function toRow(c: RowSource, s: Stats): CustomerRow {
  return {
    areaName: c.area?.name ?? null,
    optedOut: Boolean(c.marketingOptOutAt),
    emailConsent: c.emailConsent,
    whatsappConsent: c.whatsappConsent,
    unsubscribedAt: isoOrNull(c.unsubscribedAt),
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    ordersCount: s.ordersCount,
    totalSpentCents: s.totalSpentCents,
    lastOrderAt: isoOrNull(s.lastOrderAt),
    returnedCount: s.returnedCount,
    warning: s.returnedCount >= RETURN_WARNING_THRESHOLD,
  };
}

/** Name, phone, e-mail and WhatsApp search. Digits are also matched against the normalised numbers ("03 123 456"). */
export function customerSearchWhere(q: string): PrismaTypes.CustomerWhereInput {
  const raw = q.trim();
  const text = likeEscape(raw);
  const digits = raw.replace(/[\s\-().]/g, '');
  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: text } }, { email: { contains: text } }];
  if (/^\+?\d+$/.test(digits)) {
    or.push({ phone: { contains: digits.replace(/^\+/, '') } }, { whatsapp: { contains: digits.replace(/^\+/, '') } });
    const normal = normalizePhone(raw);
    if (normal) or.push({ phone: normal }, { whatsapp: normal });
  } else {
    // not a number: phone fields can only match when the text happens to be part of one (never with wildcards)
    or.push({ phone: { contains: likeEscape(digits) } }, { whatsapp: { contains: likeEscape(digits) } });
  }
  return { OR: or };
}

/** Everything the customers list (and a bulk send "to everyone matching") can filter by. All filters are AND-combined. */
export type CustomerFilters = {
  filter?: 'all' | 'repeat';
  q?: string;
  areaId?: number;
  ordersMin?: number;
  ordersMax?: number;
  /** Cents; delivered orders only (see `totalSpentCents`). */
  spentMinCents?: number;
  spentMaxCents?: number;
  /** `YYYY-MM-DD`. Customers without an order never match "last order after"; they do match "before". */
  lastOrderBefore?: string;
  lastOrderAfter?: string;
  hasEmail?: boolean;
  returned?: boolean;
  optedOut?: boolean;
  tagId?: number;
  relationship?: 'SUBSCRIBED_NEVER_BOUGHT' | 'BOUGHT_NOT_SUBSCRIBED';
  ids?: number[];
};
export type CustomerListQuery = PageQuery & CustomerFilters & { sort?: string };

type CustomerListDbRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  whatsapp: string;
  marketing_opt_out_at: Date | null;
  email_consent: boolean;
  whatsapp_consent: boolean;
  unsubscribed_at: Date | null;
  area_name: string | null;
  orders_count: number | bigint;
  total_spent_cents: number | bigint | null;
  last_order_at: Date | null;
  returned_count: number | bigint;
};

/** Compile the calculated customer filters to SQL so list pagination and counts stay bounded by the requested page. */
function customerSqlWhere(f: CustomerFilters, timezone: string): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (f.ids?.length) conditions.push(Prisma.sql`c.id IN (${Prisma.join(f.ids)})`);
  if (f.q?.trim()) {
    const q = f.q.trim().toLowerCase();
    const digits = q.replace(/[\s\-().]/g, '');
    const contactSearch = /^\+?\d+$/.test(digits) ? digits.replace(/^\+/, '') : digits;
    const normalized = /^\+?\d+$/.test(digits) ? normalizePhone(f.q) : null;
    conditions.push(Prisma.sql`(
      LOCATE(${q}, LOWER(c.name)) > 0 OR LOCATE(${q}, LOWER(COALESCE(c.email, ''))) > 0
      OR LOCATE(${contactSearch}, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(c.phone), ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) > 0
      OR LOCATE(${contactSearch}, REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(c.whatsapp), ' ', ''), '-', ''), '.', ''), '(', ''), ')', '')) > 0
      ${normalized ? Prisma.sql`OR c.phone = ${normalized} OR c.whatsapp = ${normalized}` : Prisma.empty}
    )`);
  }
  if (f.areaId !== undefined) conditions.push(Prisma.sql`c.area_id = ${f.areaId}`);
  if (f.tagId !== undefined) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM customer_tag_links ctl WHERE ctl.customer_id = c.id AND ctl.tag_id = ${f.tagId})`);

  const ordersCount = Prisma.sql`(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')`;
  const spent = Prisma.sql`(SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'DELIVERED')`;
  const lastOrder = Prisma.sql`(SELECT MAX(o.placed_at) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')`;
  const returned = Prisma.sql`(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'RETURNED')`;
  const bought = Prisma.sql`EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')`;
  const subscribed = Prisma.sql`((c.email_consent = 1 OR c.whatsapp_consent = 1) AND c.unsubscribed_at IS NULL)`;

  if (f.filter === 'repeat') conditions.push(Prisma.sql`${ordersCount} >= 2`);
  if (f.ordersMin !== undefined) conditions.push(Prisma.sql`${ordersCount} >= ${f.ordersMin}`);
  if (f.ordersMax !== undefined) conditions.push(Prisma.sql`${ordersCount} <= ${f.ordersMax}`);
  if (f.spentMinCents !== undefined) conditions.push(Prisma.sql`${spent} >= ${f.spentMinCents}`);
  if (f.spentMaxCents !== undefined) conditions.push(Prisma.sql`${spent} <= ${f.spentMaxCents}`);
  // Calendar days are business-timezone days (the same rule as campaign segments and every other date filter).
  if (f.lastOrderBefore) conditions.push(Prisma.sql`(${lastOrder} IS NULL OR ${lastOrder} < ${dayRangeInTz(f.lastOrderBefore, timezone).start})`);
  if (f.lastOrderAfter) conditions.push(Prisma.sql`${lastOrder} >= ${dayRangeInTz(f.lastOrderAfter, timezone).end}`);
  if (f.hasEmail !== undefined) conditions.push(f.hasEmail ? Prisma.sql`c.email IS NOT NULL AND c.email <> ''` : Prisma.sql`(c.email IS NULL OR c.email = '')`);
  if (f.returned !== undefined) conditions.push(f.returned ? Prisma.sql`${returned} > 0` : Prisma.sql`${returned} = 0`);
  if (f.optedOut !== undefined) conditions.push(f.optedOut ? Prisma.sql`c.marketing_opt_out_at IS NOT NULL` : Prisma.sql`c.marketing_opt_out_at IS NULL`);
  if (f.relationship === 'SUBSCRIBED_NEVER_BOUGHT') conditions.push(Prisma.sql`${subscribed} AND NOT ${bought}`);
  if (f.relationship === 'BOUGHT_NOT_SUBSCRIBED') conditions.push(Prisma.sql`${bought} AND NOT ${subscribed}`);
  return conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`1 = 1`;
}

async function listCustomersSql(ctx: AppContext, q: CustomerListQuery): Promise<Page<CustomerListRow>> {
  const timezone = q.lastOrderBefore || q.lastOrderAfter ? (await ctx.settings.get('business')).timezone : 'UTC';
  const where = customerSqlWhere(q, timezone);
  const sort = parseSort(q.sort, CUSTOMER_SORT_FIELDS, { field: 'lastOrderAt', dir: 'desc' });
  const direction = sort.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const ordersCount = Prisma.sql`(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')`;
  const spent = Prisma.sql`(SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'DELIVERED')`;
  const lastOrder = Prisma.sql`(SELECT MAX(o.placed_at) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'CANCELLED')`;
  const returned = Prisma.sql`(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'RETURNED')`;
  const sortExpr = sort.field === 'name' ? Prisma.sql`c.name` : sort.field === 'ordersCount' ? ordersCount : sort.field === 'totalSpentCents' ? spent : lastOrder;
  const orderBy = sort.field === 'lastOrderAt'
    ? Prisma.sql`CASE WHEN ${lastOrder} IS NULL THEN 1 ELSE 0 END ASC, ${lastOrder} ${direction}, c.id DESC`
    : Prisma.sql`${sortExpr} ${direction}, c.id DESC`;
  const { skip, take } = toSkipTake(q);
  const [counts, rows] = await Promise.all([
    ctx.prisma.$queryRaw<{ total: number | bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total FROM customers c WHERE ${where}`),
    ctx.prisma.$queryRaw<CustomerListDbRow[]>(Prisma.sql`
      SELECT c.id, c.name, c.email, c.phone, c.whatsapp, c.marketing_opt_out_at, c.email_consent, c.whatsapp_consent, c.unsubscribed_at,
             a.name AS area_name, ${ordersCount} AS orders_count, ${spent} AS total_spent_cents,
             ${lastOrder} AS last_order_at, ${returned} AS returned_count
      FROM customers c LEFT JOIN areas a ON a.id = c.area_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${take} OFFSET ${skip}
    `),
  ]);
  const total = Number(counts[0]?.total ?? 0);
  const pageIds = rows.map((row) => Number(row.id));
  const tagLinks = pageIds.length
    ? await ctx.prisma.customerTagLink.findMany({
        where: { customerId: { in: pageIds } },
        include: { tag: { select: { id: true, name: true, color: true } } },
      })
    : [];
  const tagsByCustomer = new Map<number, { id: number; name: string; color: string | null }[]>();
  for (const link of tagLinks) {
    const tags = tagsByCustomer.get(link.customerId) ?? [];
    tags.push(link.tag);
    tagsByCustomer.set(link.customerId, tags);
  }
  for (const tags of tagsByCustomer.values()) tags.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const items = rows.map((c) => {
    const returnedCount = Number(c.returned_count);
    const id = Number(c.id);
    return {
      id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      whatsapp: c.whatsapp,
      ordersCount: Number(c.orders_count),
      totalSpentCents: Number(c.total_spent_cents ?? 0),
      lastOrderAt: isoOrNull(c.last_order_at),
      returnedCount,
      warning: returnedCount >= RETURN_WARNING_THRESHOLD,
      areaName: c.area_name,
      optedOut: c.marketing_opt_out_at !== null,
      emailConsent: Boolean(c.email_consent),
      whatsappConsent: Boolean(c.whatsapp_consent),
      unsubscribedAt: isoOrNull(c.unsubscribed_at),
      tags: tagsByCustomer.get(id) ?? [],
    } satisfies CustomerListRow;
  });
  return toPage(items, total, q);
}

export const BULK_AUDIENCE_MAX = 5_000;

/** SQL-filters the audience and materializes only bounded pages; bulk previews reject audiences above 5,000. */
export async function matchingCustomerRows(ctx: AppContext, f: CustomerFilters): Promise<CustomerRow[]> {
  const pageSize = 100;
  const first = await listCustomersSql(ctx, { ...f, page: 1, pageSize });
  if (first.total > BULK_AUDIENCE_MAX) throw AppError.conflict(`This selection has ${first.total} customers; narrow it to ${BULK_AUDIENCE_MAX} or fewer before previewing.`, 'target');
  const pages = [first];
  const pageCount = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= pageCount; page++) pages.push(await listCustomersSql(ctx, { ...f, page, pageSize }));
  return pages.flatMap((page) => page.items);
}

export async function emailUnsubscribeUrl(ctx: AppContext, customerId: number): Promise<string | null> {
  const row = await ctx.prisma.customer.findUnique({ where: { id: customerId }, select: { unsubscribeToken: true } });
  return row?.unsubscribeToken ? `${ctx.config.webUrl}/unsubscribe?token=${encodeURIComponent(row.unsubscribeToken)}` : null;
}

export async function listCustomers(ctx: AppContext, q: CustomerListQuery): Promise<Page<CustomerListRow>> {
  return listCustomersSql(ctx, q);
}

export type CustomerDuplicateGroup = { match: 'EMAIL' | 'PHONE'; value: string; customers: CustomerRow[] };

const DUPLICATE_CTES = Prisma.sql`
  WITH cleaned AS (
    SELECT id, email,
      REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '.', ''), '(', ''), ')', '') AS p
    FROM customers
  ), normalized AS (
    SELECT id, email,
      CASE
        WHEN p LIKE '+961%' THEN SUBSTRING(p, 5)
        WHEN p LIKE '00961%' THEN SUBSTRING(p, 6)
        WHEN p LIKE '961%' THEN SUBSTRING(p, 4)
        WHEN p LIKE '0%' THEN SUBSTRING(p, 2)
        ELSE p
      END AS national_phone
    FROM cleaned
  ), candidates AS (
    SELECT id, 'EMAIL' AS match_type, LOWER(TRIM(email)) AS match_value
    FROM normalized WHERE email IS NOT NULL AND TRIM(email) <> ''
    UNION ALL
    SELECT id, 'PHONE' AS match_type, CONCAT('+961', national_phone) AS match_value
    FROM normalized
    WHERE CHAR_LENGTH(national_phone) BETWEEN 7 AND 8
      AND national_phone REGEXP '^[1-9][0-9]{6,7}$'
  )`;

export async function listCustomerDuplicates(ctx: AppContext, q: PageQuery): Promise<Page<CustomerDuplicateGroup>> {
  const { skip, take } = toSkipTake(q);
  const [counts, groups] = await Promise.all([
    ctx.prisma.$queryRaw<{ total: number | bigint }[]>(Prisma.sql`${DUPLICATE_CTES}
      SELECT COUNT(*) AS total FROM (
        SELECT match_type, match_value FROM candidates GROUP BY match_type, match_value HAVING COUNT(*) > 1
      ) AS matches`),
    ctx.prisma.$queryRaw<{ match_type: 'EMAIL' | 'PHONE'; match_value: string; ids: string; n: number | bigint }[]>(Prisma.sql`${DUPLICATE_CTES}
      SELECT match_type, match_value, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids
      FROM candidates GROUP BY match_type, match_value HAVING COUNT(*) > 1
      ORDER BY match_type ASC, match_value ASC LIMIT ${take} OFFSET ${skip}`),
  ]);
  const items: CustomerDuplicateGroup[] = [];
  for (const group of groups) {
    let ids = group.ids.split(',').map(Number).filter(Number.isInteger);
    // GROUP_CONCAT stops at group_concat_max_len (1024 bytes by default): a cut-off last id ("…,12" of 1234) would name the
    // wrong customer, so a truncated list drops its last entry.
    if (ids.length < Number(group.n)) ids = ids.slice(0, -1);
    if (!ids.length) continue;
    const [customers, stats] = await Promise.all([
      ctx.prisma.customer.findMany({ where: { id: { in: ids } }, include: { area: { select: { name: true } } } }),
      statsFor(ctx, ids),
    ]);
    const byId = new Map(customers.map((customer) => [customer.id, toRow(customer, stats.get(customer.id) ?? ZERO)]));
    items.push({ match: group.match_type, value: group.match_value, customers: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) });
  }
  return toPage(items, Number(counts[0]?.total ?? 0), q);
}

export async function exportCustomerData(ctx: AppContext, id: number) {
  const customer = await ctx.prisma.customer.findUnique({
    where: { id },
    include: {
      area: true,
      orders: {
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        include: { items: true, stockLines: true, events: true, notesList: true, emails: true, stockMovements: true },
      },
    },
  });
  if (!customer) throw AppError.notFound('Customer not found.');
  const orderIds = customer.orders.map((order) => order.id);
  const emails = [...new Set([customer.email, ...customer.orders.map((order) => order.contactEmail)].filter((value): value is string => !!value))];
  const contacts = [...new Set([customer.phone, customer.whatsapp, ...customer.orders.flatMap((order) => [order.contactPhone, order.contactWhatsapp])])];
  const [emailLogs, subscribers] = await Promise.all([
    ctx.prisma.emailLog.findMany({ where: { OR: [...(orderIds.length ? [{ orderId: { in: orderIds } }] : []), ...(emails.length ? [{ toEmail: { in: emails } }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ctx.prisma.subscriber.findMany({ where: { contact: { in: [...emails, ...contacts] } }, include: { drop: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
  ]);
  const campaignRecipients = await ctx.prisma.campaignRecipient.findMany({
    where: { customerId: id },
    include: { campaign: { select: { id: true, channel: true, templateKey: true, status: true, createdAt: true, confirmedAt: true } }, emailLog: { select: { id: true, status: true, sentAt: true, error: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const { unsubscribeToken: _token, ...customerExport } = customer;
  return { customer: customerExport, orders: customer.orders, emailLogs, subscribers, campaignRecipients };
}

/** Erases a customer's direct identifiers from profile, delivery snapshots, subscribers, logs and free-text notes. */
export async function eraseCustomerPersonalData(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id } });
    if (!customer) throw AppError.notFound('Customer not found.');
    const orders = await tx.order.findMany({ where: { customerId: id }, select: { id: true, contactEmail: true, contactPhone: true, contactWhatsapp: true } });
    const orderIds = orders.map((order) => order.id);
    const emails = [...new Set([customer.email, ...orders.map((order) => order.contactEmail)].filter((value): value is string => !!value))];
    const phones = [...new Set([customer.phone, customer.whatsapp, ...orders.flatMap((order) => [order.contactPhone, order.contactWhatsapp])])];
    const normalizedPhones = [...new Set(phones.flatMap((phone) => [phone, normalizePhone(phone)].filter((value): value is string => !!value)))];
    const contacts = [...new Set([...emails, ...normalizedPhones])];
    const anonymous = `Deleted customer ${id}`;
    const erasedPhone = `ERASED-${id}`;

    if (orderIds.length) {
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { customerName: anonymous, contactEmail: null, contactPhone: erasedPhone, contactWhatsapp: erasedPhone, address: '[personal data erased]', notes: null },
      });
      await tx.orderNote.updateMany({ where: { orderId: { in: orderIds } }, data: { body: '[personal data erased]' } });
      await tx.orderEvent.updateMany({ where: { orderId: { in: orderIds }, note: { not: null } }, data: { note: '[personal data erased]' } });
    }
    await tx.customerNote.updateMany({ where: { customerId: id }, data: { body: '[personal data erased]' } });
    const campaignRecipients = await tx.campaignRecipient.findMany({ where: { customerId: id }, select: { campaignId: true, status: true } });
    const activeByCampaign = new Map<number, number>();
    for (const recipient of campaignRecipients) {
      if (recipient.status === 'QUEUED' || recipient.status === 'READY') activeByCampaign.set(recipient.campaignId, (activeByCampaign.get(recipient.campaignId) ?? 0) + 1);
    }
    await tx.campaignRecipient.updateMany({ where: { customerId: id }, data: { destination: null, bodySnapshot: '[personal data erased]' } });
    await tx.campaignRecipient.updateMany({ where: { customerId: id, status: { in: ['QUEUED', 'READY'] } }, data: { status: 'SKIPPED', error: 'Customer personal data was erased.' } });
    for (const [campaignId, count] of activeByCampaign) {
      await tx.campaignSend.update({ where: { id: campaignId }, data: { skippedCount: { increment: count } } });
      await refreshCampaignCounts(tx, campaignId);
    }
    if (contacts.length) await tx.subscriber.deleteMany({ where: { contact: { in: contacts } } });
    const emailLogs = await tx.emailLog.findMany({
      where: { OR: [...(orderIds.length ? [{ orderId: { in: orderIds } }] : []), ...(emails.length ? [{ toEmail: { in: emails } }] : [])] },
      select: { id: true, status: true },
    });
    for (const emailLog of emailLogs) {
      // Only unsent mail is stopped. Delivered history stays SENT and old failures stay FAILED: rewriting every row to FAILED
      // made erased customers' past e-mails show up as "could not be sent" on the overview (and be retryable to a dead address).
      const stop = emailLog.status === 'PENDING';
      await tx.emailLog.update({
        where: { id: emailLog.id },
        data: {
          toEmail: `erased-${id}-${emailLog.id}${ERASED_EMAIL_SUFFIX}`, subject: '[personal data erased]', bodyText: '[personal data erased]', bodyHtml: '[personal data erased]',
          ...(stop ? { status: 'FAILED' as const, error: 'Customer personal data was erased.' } : { error: null }),
        },
      });
    }
    await tx.customer.update({
      where: { id },
      data: {
        name: anonymous, phone: erasedPhone, whatsapp: erasedPhone, email: null, areaId: null, notes: null,
        emailConsent: false, whatsappConsent: false, consentUpdatedAt: now(), unsubscribedAt: now(), unsubscribeToken: null,
        marketingOptOutAt: now(),
        firstSource: null, firstUtmSource: null, firstUtmMedium: null, firstUtmCampaign: null, firstUtmContent: null, firstUtmTerm: null, firstReferrer: null, firstTouchAt: null,
      },
    });
  });
}

export async function getCustomer(ctx: AppContext, id: number): Promise<CustomerDetail> {
  const c = await ctx.prisma.customer.findUnique({ where: { id }, include: { area: { select: { name: true } } } });
  if (!c) throw AppError.notFound('Customer not found.');
  const [stats, orders] = await Promise.all([
    statsFor(ctx, [id]),
    ctx.prisma.order.findMany({ where: { customerId: id }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], ...orderSummaryArgs }),
  ]);
  return { ...toRow(c, stats.get(id) ?? ZERO), notes: c.notes, orders: orders.map((o) => toOrderSummary(o)) };
}

export type CustomerPatch = {
  name?: string; email?: string | null; whatsapp?: string; notes?: string | null; marketingOptOut?: boolean;
  emailConsent?: boolean; whatsappConsent?: boolean;
};

/** Phone is the identity key and cannot change. Editing a customer never rewrites past orders (their contact is a snapshot). */
export async function updateCustomer(ctx: AppContext, id: number, patch: CustomerPatch): Promise<CustomerDetail> {
  const existing = await ctx.prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound('Customer not found.');
  const data: Prisma.CustomerUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.marketingOptOut !== undefined) data.marketingOptOutAt = patch.marketingOptOut ? now() : null;
  if (patch.emailConsent !== undefined) data.emailConsent = patch.emailConsent;
  if (patch.whatsappConsent !== undefined) data.whatsappConsent = patch.whatsappConsent;
  if (patch.emailConsent !== undefined || patch.whatsappConsent !== undefined) data.consentUpdatedAt = now();
  if (patch.emailConsent === true) data.unsubscribedAt = null;
  if (patch.whatsapp !== undefined) {
    const normal = normalizePhone(patch.whatsapp);
    if (!normal) throw AppError.validation({ whatsapp: 'Enter a Lebanese phone number, e.g. 03 123 456.' });
    data.whatsapp = normal;
  }
  if (Object.keys(data).length) await ctx.prisma.customer.update({ where: { id }, data });
  return getCustomer(ctx, id);
}

/** Merge a duplicate into the survivor without losing customer-owned records; orders retain their historical contact snapshots. */
export async function mergeCustomer(ctx: AppContext, survivorId: number, duplicateId: number, userId: number): Promise<CustomerDetail> {
  if (survivorId === duplicateId) throw AppError.validation({ duplicateCustomerId: 'Choose a different customer to merge.' });
  await ctx.prisma.$transaction(async (tx) => {
    const [survivor, duplicate] = await Promise.all([
      tx.customer.findUnique({ where: { id: survivorId }, include: { tags: true, subscribers: true } }),
      tx.customer.findUnique({ where: { id: duplicateId }, include: { tags: true, subscribers: true } }),
    ]);
    if (!survivor) throw AppError.notFound('Surviving customer not found.');
    if (!duplicate) throw AppError.notFound('Duplicate customer not found.');

    await tx.order.updateMany({ where: { customerId: duplicateId }, data: { customerId: survivorId } });
    await tx.customerNote.updateMany({ where: { customerId: duplicateId }, data: { customerId: survivorId } });
    await tx.customerFollowUp.updateMany({ where: { customerId: duplicateId }, data: { customerId: survivorId } });
    await tx.campaignRecipient.updateMany({ where: { customerId: duplicateId }, data: { customerId: survivorId } });

    for (const link of duplicate.tags) {
      await tx.customerTagLink.upsert({
        where: { customerId_tagId: { customerId: survivorId, tagId: link.tagId } },
        create: { customerId: survivorId, tagId: link.tagId },
        update: {},
      });
    }
    for (const subscriber of duplicate.subscribers) {
      const exists = await tx.subscriber.findFirst({
        where: { customerId: survivorId, type: subscriber.type, dropId: subscriber.dropId, contact: subscriber.contact },
        select: { id: true },
      });
      if (exists) await tx.subscriber.delete({ where: { id: subscriber.id } });
      else await tx.subscriber.update({ where: { id: subscriber.id }, data: { customerId: survivorId } });
    }

    const firstTouchFromDuplicate = duplicate.firstTouchAt && (!survivor.firstTouchAt || duplicate.firstTouchAt < survivor.firstTouchAt);
    const consentUpdatedAt = [survivor.consentUpdatedAt, duplicate.consentUpdatedAt].filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const unsubscribedAt = [survivor.unsubscribedAt, duplicate.unsubscribedAt].filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const marketingOptOutAt = [survivor.marketingOptOutAt, duplicate.marketingOptOutAt].filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    // `unsubscribe_token` is UNIQUE: release it on the duplicate before the survivor inherits it (the duplicate is deleted below).
    if (!survivor.unsubscribeToken && duplicate.unsubscribeToken) {
      await tx.customer.update({ where: { id: duplicateId }, data: { unsubscribeToken: null } });
    }
    await tx.customer.update({
      where: { id: survivorId },
      data: {
        email: survivor.email ?? duplicate.email,
        whatsapp: survivor.whatsapp || duplicate.whatsapp,
        notes: [survivor.notes, duplicate.notes].filter((value): value is string => Boolean(value?.trim())).join('\n\n') || null,
        emailConsent: (survivor.emailConsent || duplicate.emailConsent) && unsubscribedAt === null,
        whatsappConsent: survivor.whatsappConsent || duplicate.whatsappConsent,
        consentUpdatedAt,
        unsubscribedAt,
        marketingOptOutAt,
        unsubscribeToken: survivor.unsubscribeToken ?? duplicate.unsubscribeToken,
        ...(firstTouchFromDuplicate ? {
          firstSource: duplicate.firstSource,
          firstUtmSource: duplicate.firstUtmSource,
          firstUtmMedium: duplicate.firstUtmMedium,
          firstUtmCampaign: duplicate.firstUtmCampaign,
          firstUtmContent: duplicate.firstUtmContent,
          firstUtmTerm: duplicate.firstUtmTerm,
          firstReferrer: duplicate.firstReferrer,
          firstTouchAt: duplicate.firstTouchAt,
        } : {}),
      },
    });
    await tx.customerNote.create({ data: { customerId: survivorId, userId, body: `Merged duplicate customer ${duplicateId} into this profile.` } });
    await tx.customer.delete({ where: { id: duplicateId } });
  });
  return getCustomer(ctx, survivorId);
}

export type CustomerTagDto = { id: number; name: string; color: string | null; createdAt: string; updatedAt: string };
export type CustomerNoteDto = { id: number; customerId: number; userId: number; userName: string; body: string; createdAt: string };

const toTagDto = (tag: { id: number; name: string; color: string | null; createdAt: Date; updatedAt: Date }): CustomerTagDto => ({
  id: tag.id, name: tag.name, color: tag.color, createdAt: iso(tag.createdAt), updatedAt: iso(tag.updatedAt),
});
const toCustomerNoteDto = (note: { id: number; customerId: number; userId: number; body: string; createdAt: Date; user: { name: string } }): CustomerNoteDto => ({
  id: note.id, customerId: note.customerId, userId: note.userId, userName: note.user.name, body: note.body, createdAt: iso(note.createdAt),
});

export async function listCustomerTags(ctx: AppContext, q: PageQuery): Promise<Page<CustomerTagDto>> {
  const { skip, take } = toSkipTake(q);
  const [total, rows] = await Promise.all([
    ctx.prisma.customerTag.count(),
    ctx.prisma.customerTag.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take }),
  ]);
  return toPage(rows.map(toTagDto), total, q);
}

export async function createCustomerTag(ctx: AppContext, input: { name: string; color?: string | null }): Promise<CustomerTagDto> {
  try {
    return toTagDto(await ctx.prisma.customerTag.create({ data: { name: input.name, color: input.color ?? null } }));
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('A customer tag with that name already exists.', 'name');
    throw error;
  }
}

export async function updateCustomerTag(ctx: AppContext, id: number, input: { name?: string; color?: string | null }): Promise<CustomerTagDto> {
  try {
    const result = await ctx.prisma.customerTag.updateMany({ where: { id }, data: input });
    if (!result.count) throw AppError.notFound('Customer tag not found.');
    return toTagDto((await ctx.prisma.customerTag.findUniqueOrThrow({ where: { id } })));
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('A customer tag with that name already exists.', 'name');
    throw error;
  }
}

export async function deleteCustomerTag(ctx: AppContext, id: number): Promise<void> {
  const result = await ctx.prisma.customerTag.deleteMany({ where: { id } });
  if (!result.count) throw AppError.notFound('Customer tag not found.');
}

export async function listCustomerTagsForCustomer(ctx: AppContext, customerId: number): Promise<CustomerTagDto[]> {
  const customer = await ctx.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw AppError.notFound('Customer not found.');
  const rows = await ctx.prisma.customerTag.findMany({ where: { customers: { some: { customerId } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return rows.map(toTagDto);
}

export async function attachCustomerTag(ctx: AppContext, customerId: number, tagId: number): Promise<CustomerTagDto[]> {
  const [customer, tag] = await Promise.all([
    ctx.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }),
    ctx.prisma.customerTag.findUnique({ where: { id: tagId }, select: { id: true } }),
  ]);
  if (!customer) throw AppError.notFound('Customer not found.');
  if (!tag) throw AppError.notFound('Customer tag not found.');
  await ctx.prisma.customerTagLink.upsert({ where: { customerId_tagId: { customerId, tagId } }, create: { customerId, tagId }, update: {} });
  return listCustomerTagsForCustomer(ctx, customerId);
}

export async function detachCustomerTag(ctx: AppContext, customerId: number, tagId: number): Promise<void> {
  const customer = await ctx.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) throw AppError.notFound('Customer not found.');
  await ctx.prisma.customerTagLink.deleteMany({ where: { customerId, tagId } });
}

export async function listCustomerNotes(ctx: AppContext, customerId: number, q: PageQuery): Promise<Page<CustomerNoteDto>> {
  if (!(await ctx.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) throw AppError.notFound('Customer not found.');
  const where = { customerId };
  const { skip, take } = toSkipTake(q);
  const [total, rows] = await Promise.all([
    ctx.prisma.customerNote.count({ where }),
    ctx.prisma.customerNote.findMany({ where, include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
  ]);
  return toPage(rows.map(toCustomerNoteDto), total, q);
}

export async function addCustomerNote(ctx: AppContext, input: { customerId: number; userId: number; body: string }): Promise<CustomerNoteDto> {
  if (!(await ctx.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } }))) throw AppError.notFound('Customer not found.');
  const note = await ctx.prisma.customerNote.create({ data: input, include: { user: { select: { name: true } } } });
  return toCustomerNoteDto(note);
}

export type FollowUpDue = 'today' | 'overdue' | 'upcoming';
export type FollowUpDto = {
  id: number;
  customerId: number;
  customerName: string;
  userId: number;
  userName: string;
  dueAt: string;
  note: string;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toFollowUpDto(row: {
  id: number; customerId: number; userId: number; dueAt: Date; note: string; doneAt: Date | null; createdAt: Date; updatedAt: Date;
  customer: { name: string }; user: { name: string };
}): FollowUpDto {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.name,
    userId: row.userId,
    userName: row.user.name,
    dueAt: iso(row.dueAt),
    note: row.note,
    doneAt: isoOrNull(row.doneAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

const followUpInclude = { customer: { select: { name: true } }, user: { select: { name: true } } } as const;

export async function listFollowUps(ctx: AppContext, q: PageQuery & { due: FollowUpDue; customerId?: number }): Promise<Page<FollowUpDto>> {
  const timezone = (await ctx.settings.get('business')).timezone;
  const today = ymdInTz(now(), timezone);
  const { start, end } = dayRangeInTz(today, timezone);
  const dueAt = q.due === 'today'
    ? { gte: start, lt: end }
    : q.due === 'overdue'
      ? { lt: start }
      : { gte: end };
  const where = { doneAt: null, dueAt, ...(q.customerId ? { customerId: q.customerId } : {}) };
  const { skip, take } = toSkipTake(q);
  const [total, rows] = await Promise.all([
    ctx.prisma.customerFollowUp.count({ where }),
    ctx.prisma.customerFollowUp.findMany({ where, include: followUpInclude, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], skip, take }),
  ]);
  return toPage(rows.map(toFollowUpDto), total, q);
}

export async function createFollowUp(ctx: AppContext, input: { customerId: number; userId: number; dueAt: string; note: string }): Promise<FollowUpDto> {
  const customer = await ctx.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
  if (!customer) throw AppError.notFound('Customer not found.');
  const row = await ctx.prisma.customerFollowUp.create({
    data: { customerId: input.customerId, userId: input.userId, dueAt: new Date(input.dueAt), note: input.note },
    include: followUpInclude,
  });
  return toFollowUpDto(row);
}

export async function updateFollowUp(ctx: AppContext, id: number, patch: { dueAt?: string; note?: string; done?: boolean }): Promise<FollowUpDto> {
  const data: Prisma.CustomerFollowUpUpdateManyMutationInput = {};
  if (patch.dueAt !== undefined) data.dueAt = new Date(patch.dueAt);
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.done !== undefined) data.doneAt = patch.done ? now() : null;
  const updated = await ctx.prisma.$transaction(async (tx) => {
    const result = await tx.customerFollowUp.updateMany({ where: { id }, data });
    if (!result.count) throw AppError.notFound('Follow-up not found.');
    return tx.customerFollowUp.findUnique({ where: { id }, include: followUpInclude });
  });
  if (!updated) throw AppError.notFound('Follow-up not found.');
  return toFollowUpDto(updated);
}

export async function deleteFollowUp(ctx: AppContext, id: number): Promise<void> {
  const result = await ctx.prisma.customerFollowUp.deleteMany({ where: { id } });
  if (!result.count) throw AppError.notFound('Follow-up not found.');
}

export async function validateUnsubscribeToken(ctx: AppContext, token: string): Promise<{ valid: true }> {
  const customer = await ctx.prisma.customer.findUnique({ where: { unsubscribeToken: token }, select: { id: true } });
  if (!customer) throw AppError.notFound('This unsubscribe link is invalid or has expired.');
  return { valid: true };
}

export async function confirmEmailUnsubscribe(ctx: AppContext, token: string): Promise<void> {
  const at = now();
  const result = await ctx.prisma.customer.updateMany({
    where: { unsubscribeToken: token },
    data: { emailConsent: false, unsubscribedAt: at, consentUpdatedAt: at },
  });
  if (!result.count) throw AppError.notFound('This unsubscribe link is invalid or has expired.');
}

/** `{ id, name, phone, email }` rows for the global search. */
export async function searchCustomers(ctx: AppContext, q: string, take = 5): Promise<{ id: number; name: string; phone: string; email: string | null }[]> {
  return ctx.prisma.customer.findMany({
    where: customerSearchWhere(q),
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true, name: true, phone: true, email: true },
  });
}

export type CustomerProfile = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  whatsapp: string;
  areaId: number | null;
  area: { id: number; name: string } | null;
  optedOut: boolean;
  emailConsent: boolean;
  whatsappConsent: boolean;
  unsubscribedAt: string | null;
  consentUpdatedAt: string | null;
  firstSource: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstUtmContent: string | null;
  firstUtmTerm: string | null;
  firstReferrer: string | null;
  firstTouchAt: string | null;
  signups: { id: number; channel: 'EMAIL' | 'WHATSAPP'; dropName: string | null; signedUpAt: string }[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  orderCount: number;
  lifetimeValueCents: number;
  averageOrderValueCents: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  returnedCount: number;
  warning: boolean;
  favouriteStimpie: string | null;
  favouriteStimpieType: string | null;
  favouriteColor: string | null;
  favouriteColorHex: string | null;
  recentOrders: AdminOrderSummaryDto[];
};

export async function getCustomerProfile(ctx: AppContext, id: number): Promise<CustomerProfile> {
  const c = await ctx.prisma.customer.findUnique({
    where: { id },
    include: { area: { select: { id: true, name: true } } },
  });
  if (!c) throw AppError.notFound('Customer not found.');

  type StatsRow = {
    order_count: number | bigint;
    ltv_cents: number | bigint | null;
    ltv_order_count: number | bigint;
    first_order_at: Date | null;
    last_order_at: Date | null;
    returned_count: number | bigint;
  };

  const statsRows = await ctx.prisma.$queryRaw<StatsRow[]>`
    SELECT
      COUNT(*) as order_count,
      COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED', 'RETURNED') THEN total_cents ELSE 0 END), 0) as ltv_cents,
      COUNT(CASE WHEN status NOT IN ('CANCELLED', 'RETURNED') THEN 1 END) as ltv_order_count,
      MIN(placed_at) as first_order_at,
      MAX(placed_at) as last_order_at,
      COUNT(CASE WHEN status = 'RETURNED' THEN 1 END) as returned_count
    FROM orders
    WHERE customer_id = ${id} AND status != 'CANCELLED'
  `;

  const s = statsRows[0];
  const orderCount = Number(s?.order_count ?? 0);
  const ltvCents = Number(s?.ltv_cents ?? 0);
  const ltvOrderCount = Number(s?.ltv_order_count ?? 0);
  const averageOrderValueCents = ltvOrderCount > 0 ? Math.round(ltvCents / ltvOrderCount) : 0;
  const returnedCount = Number(s?.returned_count ?? 0);

  type ColorRow = { name: string; hex: string; total_qty: number | bigint };
  const colorRows = await ctx.prisma.$queryRaw<ColorRow[]>`
    SELECT c.name, c.hex, SUM(osl.qty) as total_qty
    FROM order_stock_lines osl
    JOIN orders o ON osl.order_id = o.id
    JOIN hoodie_variants hv ON osl.variant_id = hv.id
    JOIN colors c ON hv.color_id = c.id
    WHERE o.customer_id = ${id} AND o.status != 'CANCELLED'
    GROUP BY c.id, c.name, c.hex
    ORDER BY total_qty DESC, c.id ASC
    LIMIT 1
  `;
  const favouriteColor = colorRows[0]?.name ?? null;
  const favouriteColorHex = colorRows[0]?.hex ?? null;

  type StimpieRow = { name: string; total_qty: number | bigint };
  const stimpieRows = await ctx.prisma.$queryRaw<StimpieRow[]>`
    SELECT s.name, SUM(osl.qty) as total_qty
    FROM order_stock_lines osl
    JOIN orders o ON osl.order_id = o.id
    JOIN stimpies s ON osl.stimpie_id = s.id
    WHERE o.customer_id = ${id} AND o.status != 'CANCELLED'
    GROUP BY s.id, s.name
    ORDER BY total_qty DESC, s.id ASC
    LIMIT 1
  `;
  const favouriteStimpie = stimpieRows[0]?.name ?? null;

  type StimpieTypeRow = { type: string; total_qty: number | bigint };
  const stimpieTypeRows = await ctx.prisma.$queryRaw<StimpieTypeRow[]>`
    SELECT s.type, SUM(osl.qty) as total_qty
    FROM order_stock_lines osl
    JOIN orders o ON osl.order_id = o.id
    JOIN stimpies s ON osl.stimpie_id = s.id
    WHERE o.customer_id = ${id} AND o.status != 'CANCELLED'
    GROUP BY s.type
    ORDER BY total_qty DESC
    LIMIT 1
  `;
  const favouriteStimpieType = stimpieTypeRows[0]?.type ?? null;

  const recentOrderRows = await ctx.prisma.order.findMany({
    where: { customerId: id },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: 5,
    ...orderSummaryArgs,
  });
  const signups = await ctx.prisma.subscriber.findMany({
    where: { customerId: id }, include: { drop: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    areaId: c.areaId,
    area: c.area ? { id: c.area.id, name: c.area.name } : null,
    optedOut: Boolean(c.marketingOptOutAt),
    emailConsent: c.emailConsent,
    whatsappConsent: c.whatsappConsent,
    unsubscribedAt: isoOrNull(c.unsubscribedAt),
    consentUpdatedAt: isoOrNull(c.consentUpdatedAt),
    firstSource: c.firstSource,
    firstUtmSource: c.firstUtmSource,
    firstUtmMedium: c.firstUtmMedium,
    firstUtmCampaign: c.firstUtmCampaign,
    firstUtmContent: c.firstUtmContent,
    firstUtmTerm: c.firstUtmTerm,
    firstReferrer: c.firstReferrer,
    firstTouchAt: isoOrNull(c.firstTouchAt),
    signups: signups.map((signup) => ({ id: signup.id, channel: signup.type, dropName: signup.drop?.name ?? null, signedUpAt: iso(signup.createdAt) })),
    notes: c.notes,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
    orderCount,
    lifetimeValueCents: ltvCents,
    averageOrderValueCents,
    firstOrderAt: isoOrNull(s?.first_order_at),
    lastOrderAt: isoOrNull(s?.last_order_at),
    returnedCount,
    warning: returnedCount >= RETURN_WARNING_THRESHOLD,
    favouriteStimpie,
    favouriteStimpieType,
    favouriteColor,
    favouriteColorHex,
    recentOrders: recentOrderRows.map((o) => toOrderSummary(o)),
  };
}

export type TimelineItemType = 'ORDER' | 'ORDER_EVENT' | 'ORDER_NOTE' | 'EMAIL' | 'FOLLOW_UP' | 'CUSTOMER_NOTE';

export type TimelineItemDto = {
  id: string;
  type: TimelineItemType;
  at: string;
  title: string;
  detail: string | null;
  refId: string | null;
};

export type TimelineResponse = {
  items: TimelineItemDto[];
  nextCursor: string | null;
};

export type TimelineQuery = {
  limit?: number;
  cursor?: string;
};

export async function getCustomerTimeline(ctx: AppContext, id: number, query: TimelineQuery): Promise<TimelineResponse> {
  const customer = await ctx.prisma.customer.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!customer) throw AppError.notFound('Customer not found.');

  const orders = await ctx.prisma.order.findMany({
    where: { customerId: id },
    select: { id: true, number: true, status: true, totalCents: true, placedAt: true },
  });
  const orderIds = orders.map((o) => o.id);

  const [events, notes, emails] = await Promise.all([
    orderIds.length > 0
      ? ctx.prisma.orderEvent.findMany({
          where: { orderId: { in: orderIds } },
          include: { order: { select: { number: true } }, user: { select: { name: true } } },
        })
      : [],
    orderIds.length > 0
      ? ctx.prisma.orderNote.findMany({
          where: { orderId: { in: orderIds } },
          include: { order: { select: { number: true } }, user: { select: { name: true } } },
        })
      : [],
    ctx.prisma.emailLog.findMany({
      where: {
        OR: [
          ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
          ...(customer.email ? [{ toEmail: customer.email }] : []),
        ],
      },
      select: { id: true, subject: true, templateKey: true, status: true, toEmail: true, sentAt: true, createdAt: true, orderId: true },
    }),
  ]);
  const [followUps, customerNotes] = await Promise.all([
    ctx.prisma.customerFollowUp.findMany({ where: { customerId: id }, include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    ctx.prisma.customerNote.findMany({ where: { customerId: id }, include: { user: { select: { name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
  ]);

  const items: TimelineItemDto[] = [];

  for (const o of orders) {
    items.push({
      id: `order-${o.id}`,
      type: 'ORDER',
      at: iso(o.placedAt),
      title: `Order ${o.number} placed`,
      detail: `${formatUsd(o.totalCents)} · Status: ${o.status}`,
      refId: String(o.id),
    });
  }

  for (const e of events) {
    const detail = e.note || (e.fromStatus ? `Status changed from ${e.fromStatus} to ${e.toStatus}` : `Status: ${e.toStatus}`);
    items.push({
      id: `event-${e.id}`,
      type: 'ORDER_EVENT',
      at: iso(e.createdAt),
      title: `Order ${e.order.number}: ${e.toStatus}`,
      detail,
      refId: String(e.orderId),
    });
  }

  for (const n of notes) {
    items.push({
      id: `note-${n.id}`,
      type: 'ORDER_NOTE',
      at: iso(n.createdAt),
      title: `Note on order ${n.order.number}${n.user?.name ? ` by ${n.user.name}` : ''}`,
      detail: n.body,
      refId: String(n.orderId),
    });
  }

  for (const m of emails) {
    items.push({
      id: `email-${m.id}`,
      type: 'EMAIL',
      at: iso(m.sentAt ?? m.createdAt),
      title: `Email: ${m.subject}`,
      detail: `Template: ${m.templateKey} · To: ${m.toEmail} · Status: ${m.status}`,
      refId: String(m.id),
    });
  }

  for (const f of followUps) {
    items.push({
      id: `follow-up-${f.id}`,
      type: 'FOLLOW_UP',
      at: iso(f.updatedAt),
      title: `${f.doneAt ? 'Completed' : 'Follow-up'}${f.user.name ? ` by ${f.user.name}` : ''}`,
      detail: `${f.note} · Due ${iso(f.dueAt)}`,
      refId: String(f.id),
    });
  }
  for (const note of customerNotes) {
    items.push({
      id: `customer-note-${note.id}`,
      type: 'CUSTOMER_NOTE',
      at: iso(note.createdAt),
      title: `Customer note by ${note.user.name}`,
      detail: note.body,
      refId: String(note.id),
    });
  }

  items.sort((a, b) => {
    const timeCmp = b.at.localeCompare(a.at);
    if (timeCmp !== 0) return timeCmp;
    return b.id.localeCompare(a.id);
  });

  const limit = query.limit ?? 20;
  let startIndex = 0;
  if (query.cursor) {
    const idx = items.findIndex((it) => it.id === query.cursor);
    if (idx !== -1) {
      startIndex = idx + 1;
    }
  }
  const slice = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  const nextCursor = hasMore && slice.length > 0 ? slice[slice.length - 1]!.id : null;

  return {
    items: slice,
    nextCursor,
  };
}
