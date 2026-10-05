import type { Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { likeEscape } from '../lib/like';
import { normalizePhone } from '../lib/phone';
import { orderSummaryArgs, toOrderSummary, type AdminOrderSummaryDto } from './order-summary';

/**
 * Order matching for the global search (api-reference 5.4): order number (full, partial or bare digits), delivery number,
 * phone / WhatsApp, e-mail and name. Newest orders first. WP-B's `GET /admin/orders?q=` has the same semantics.
 */
export function orderSearchWhere(q: string): Prisma.OrderWhereInput {
  const raw = q.trim();
  const text = likeEscape(raw);
  const digits = raw.replace(/[\s\-().]/g, '');
  const or: Prisma.OrderWhereInput[] = [
    { number: { contains: text } },
    { deliveryNumber: { contains: text } },
    { customerName: { contains: text } },
    { contactEmail: { contains: text } },
  ];
  if (/^\+?\d+$/.test(digits)) {
    const bare = digits.replace(/^\+/, '');
    or.push({ contactPhone: { contains: bare } }, { contactWhatsapp: { contains: bare } });
    const normal = normalizePhone(raw);
    if (normal) or.push({ contactPhone: normal }, { contactWhatsapp: normal });
  }
  return { OR: or };
}

export async function searchOrders(ctx: AppContext, q: string, take = 5): Promise<AdminOrderSummaryDto[]> {
  const rows = await ctx.prisma.order.findMany({ where: orderSearchWhere(q), orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take, ...orderSummaryArgs });
  return rows.map((o) => toOrderSummary(o));
}
