import type { AppContext } from '../context';
import type { Db } from '../lib/db';
import { AppError } from '../lib/errors';
import { formatUsd } from '../lib/money';
import { WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_KEYS } from '../lib/templates-catalog';
import { renderTemplate } from '../lib/template';
import { waDigits } from '../lib/phone';
import { formatItemsText, loadOrderTemplateValues, type ItemForText } from './template-values';

/**
 * WhatsApp is never sent automatically (integrations section 4): templates only fill the text of a `wa.me` link.
 */
export type WhatsappTemplateKey = (typeof WHATSAPP_TEMPLATE_KEYS)[number];

/** `https://wa.me/<digits>?text=<URL-encoded text>` */
export function buildWaUrl(number: string, text: string): string {
  return `https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`;
}

export async function loadWhatsappTemplate(db: Db, key: string): Promise<{ key: string; name: string; body: string } | null> {
  const row = await db.whatsappTemplate.findUnique({ where: { key } });
  if (row) return { key: row.key, name: row.name, body: row.body };
  const def = WHATSAPP_TEMPLATES.find((t) => t.key === key);
  return def ? { key: def.key, name: def.name, body: def.body } : null;
}

/**
 * `GET /admin/orders/:id/whatsapp`: `{ to, text, url }` for one of the four templates, to the order's `contact_whatsapp`.
 * Unknown template key -> VALIDATION_ERROR on `template`; unknown order -> NOT_FOUND.
 */
export async function buildOrderWhatsapp(ctx: AppContext, db: Db, input: { orderId: number; template: string }): Promise<{ to: string; text: string; url: string }> {
  const tpl = await loadWhatsappTemplate(db, input.template);
  if (!tpl) throw AppError.validation({ template: `Use one of: ${WHATSAPP_TEMPLATE_KEYS.join(', ')}.` });
  const { values, order } = await loadOrderTemplateValues(ctx, db, input.orderId);
  const text = renderTemplate(tpl.body, values);
  return { to: order.contactWhatsapp, text, url: buildWaUrl(order.contactWhatsapp, text) };
}

/**
 * The customer-side confirmation link returned by `POST /orders` as `whatsappUrl`: fixed text (not editable in v1),
 * to the business number; `null` until `settings.business.whatsappNumber` is set.
 */
export async function customerConfirmationWhatsappUrl(
  ctx: AppContext,
  input: { orderNumber: string; customerName: string; totalCents: number; items: ItemForText[] },
): Promise<string | null> {
  const business = await ctx.settings.get('business');
  if (!business.whatsappNumber) return null;
  const text = `Hi Stimpy, I just placed order ${input.orderNumber}: ${formatItemsText(input.items)}. Total ${formatUsd(input.totalCents)}. My name is ${input.customerName}.`;
  return buildWaUrl(business.whatsappNumber, text);
}
