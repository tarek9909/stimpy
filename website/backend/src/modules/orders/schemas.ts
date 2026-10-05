import { z } from 'zod';
import { boolQuery, csvQuery, pageQuerySchema, searchQuery, sortQuery } from '../../lib/http';
import { normalizePhone } from '../../lib/phone';

/** Zod schemas for the orders module: cart, public order, tracking, admin order shapes (api-reference 2, 3.5, 5.1, 5.3). */

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'] as const;
export const orderStatus = z.enum(ORDER_STATUSES);
export const orderSource = z.enum(['WEBSITE', 'INSTAGRAM', 'WHATSAPP', 'MANUAL']);

const id = z.number().int().min(1).max(2_147_483_647);
const qty = z.number().int().min(1, 'Quantity must be 1 to 10.').max(10, 'Quantity must be 1 to 10.');

// ---------------------------------------------------------------- cart

export const cartItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pack'),
    packId: id,
    hoodieId: id,
    colorId: id,
    sizeId: id,
    stimpieIds: z.array(id).min(1).max(5),
    qty,
  }),
  z.strictObject({ kind: z.literal('hoodie'), hoodieId: id, colorId: id, sizeId: id, qty }),
  z.strictObject({ kind: z.literal('stimpie'), stimpieId: id, qty }),
]);

const cartItems = z.array(cartItemSchema).min(1, 'Add at least one item.').max(20, 'A cart can hold at most 20 items.');

// ---------------------------------------------------------------- problems (StockProblem / PurchaseProblem)

const hoodieRef = { kind: z.literal('HOODIE_VARIANT'), hoodieId: z.number().int(), colorId: z.number().int(), sizeId: z.number().int() };
const stimpieRef = { kind: z.literal('STIMPIE'), stimpieId: z.number().int() };
const stockFields = { itemIndex: z.number().int(), name: z.string(), requested: z.number().int(), available: z.number().int() };
const purchaseFields = { itemIndex: z.number().int(), name: z.string(), reason: z.enum(['INACTIVE', 'DROP_NOT_STARTED', 'DROP_ENDED']) };

export const problemSchema = z
  .union([
    z.object({ ...hoodieRef, ...stockFields }),
    z.object({ ...stimpieRef, ...stockFields }),
    z.object({ ...hoodieRef, ...purchaseFields }),
    z.object({ ...stimpieRef, ...purchaseFields }),
  ])
  .meta({ id: 'CartProblem' });

// ---------------------------------------------------------------- POST /cart/validate

export const cartValidateBody = z.strictObject({ items: cartItems, areaId: id.nullable().optional() });

export const cartValidateResponse = z
  .object({
    ok: z.boolean(),
    lines: z.array(
      z.object({
        itemIndex: z.number().int(),
        ok: z.boolean(),
        unitPriceCents: z.number().int(),
        lineTotalCents: z.number().int(),
        problems: z.array(problemSchema),
      }),
    ),
    subtotalCents: z.number().int(),
    deliveryFeeCents: z.number().int(),
    totalCents: z.number().int(),
    estimateText: z.string(),
  })
  .meta({ id: 'CartValidation' });

// ---------------------------------------------------------------- POST /orders

const PHONE_MESSAGE = 'Enter a Lebanese phone number, like 03 123 456.';
const phoneText = z
  .string()
  .trim()
  .min(1, 'Enter your phone number.')
  .max(40, 'Must be at most 40 characters.')
  .refine((v) => normalizePhone(v) !== null, PHONE_MESSAGE);

const customerBase = {
  name: z.string().trim().min(2, 'Enter your full name (2 to 80 characters).').max(80, 'Enter your full name (2 to 80 characters).'),
  phone: phoneText,
  whatsapp: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === '' || normalizePhone(v) !== null, 'Enter a Lebanese WhatsApp number, like 03 123 456.')
    .nullable()
    .optional(),
  whatsappSameAsPhone: z.boolean(),
};

const deliveryBody = z.strictObject({
  areaId: id.nullable().optional(),
  areaName: z.string().trim().min(1, 'Type your area or town.').max(120, 'Must be at most 120 characters.'),
  address: z.string().trim().min(5, 'Enter your delivery address: street, building, floor.').max(300, 'Must be at most 300 characters.'),
  notes: z.string().max(300, 'Must be at most 300 characters.').nullable().optional(),
});

const attributionBody = z
  .strictObject({
    utmSource: z.string().max(80).regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, digits, dashes, underscores or dots.').optional(),
    utmMedium: z.string().max(80).regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, digits, dashes, underscores or dots.').optional(),
    utmCampaign: z.string().max(80).regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, digits, dashes, underscores or dots.').optional(),
    utmContent: z.string().max(80).regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, digits, dashes, underscores or dots.').optional(),
    utmTerm: z.string().max(80).regex(/^[A-Za-z0-9\-_.]+$/, 'Use letters, digits, dashes, underscores or dots.').optional(),
    referrer: z.string().trim().url().max(500).optional(),
  })
  .nullable()
  .optional();

export const placeOrderBody = z.strictObject({
  customer: z.strictObject({ ...customerBase, email: z.string().trim().email().max(190) }),
  delivery: deliveryBody,
  items: cartItems,
  expectedTotalCents: z.number().int().min(0).max(100_000_000).optional(),
  attribution: attributionBody,
  firstTouch: attributionBody,
  hp: z.string().max(500).optional(),
});

export const idempotencyHeaders = z.object({
  'idempotency-key': z
    .string()
    .regex(/^[A-Za-z0-9._:-]{8,80}$/, 'Use 8 to 80 letters, digits, dots, dashes, colons or underscores.')
    .optional(),
});

const publicItem = z.object({
  id: z.number().int(),
  kind: z.enum(['PACK', 'HOODIE', 'STIMPIE']),
  name: z.string(),
  qty: z.number().int(),
  unitPriceCents: z.number().int(),
  lineTotalCents: z.number().int(),
  details: z.object({ hoodie: z.string().nullable(), color: z.string().nullable(), size: z.string().nullable(), stimpies: z.array(z.string()) }),
});
export const orderItemSchema = publicItem.meta({ id: 'OrderItem' });

export const placeOrderResponse = z
  .object({
    order: z.object({
      number: z.string(),
      status: orderStatus,
      placedAt: z.string(),
      customerName: z.string(),
      contactEmail: z.string().nullable(),
      items: z.array(orderItemSchema),
      subtotalCents: z.number().int(),
      deliveryFeeCents: z.number().int(),
      totalCents: z.number().int(),
      estimateText: z.string(),
    }),
    whatsappUrl: z.string().nullable(),
    trackUrl: z.string(),
  })
  .meta({ id: 'PlacedOrder' });

// ---------------------------------------------------------------- POST /orders/track, /orders/find

export const trackBody = z.strictObject({
  orderNumber: z.string().trim().min(1, 'Enter your order number.').max(30, 'Must be at most 30 characters.'),
  phone: phoneText,
});

export const trackResponse = z
  .object({
    number: z.string(),
    status: orderStatus,
    placedAt: z.string(),
    customerName: z.string(),
    items: z.array(orderItemSchema),
    subtotalCents: z.number().int(),
    deliveryFeeCents: z.number().int(),
    totalCents: z.number().int(),
    deliveryNumber: z.string().nullable(),
    timeline: z.array(z.object({ status: orderStatus, at: z.string() })),
    estimateText: z.string(),
    whatsappNumber: z.string().nullable(),
  })
  .meta({ id: 'TrackedOrder' });

export const findBody = z.strictObject({ email: z.string().trim().email('Enter a valid email address.').max(190) });
export const findResponse = z.object({ message: z.string() });

// ---------------------------------------------------------------- admin shapes

export const adminOrderSummarySchema = z
  .object({
    id: z.number().int(),
    number: z.string(),
    placedAt: z.string(),
    status: orderStatus,
    source: orderSource,
    customerName: z.string(),
    contactPhone: z.string(),
    areaName: z.string(),
    itemsSummary: z.string(),
    totalCents: z.number().int(),
    deliveryNumber: z.string().nullable(),
    cashCollected: z.boolean(),
    cashSettled: z.boolean(),
    holdExpired: z.boolean(),
  })
  .meta({ id: 'AdminOrderSummary' });

export const deliveryWarningSchema = z.object({
  code: z.literal('DUPLICATE_DELIVERY_NUMBER'),
  deliveryNumber: z.string(),
  orderIds: z.array(z.number().int()),
});

export const adminOrderSchema = adminOrderSummarySchema
  .extend({
    customer: z.object({ id: z.number().int(), name: z.string(), email: z.string().nullable(), phone: z.string(), whatsapp: z.string() }),
    contact: z.object({ email: z.string().nullable(), phone: z.string(), whatsapp: z.string() }),
    delivery: z.object({ areaId: z.number().int().nullable(), areaName: z.string(), address: z.string(), notes: z.string().nullable() }),
    items: z.array(orderItemSchema),
    subtotalCents: z.number().int(),
    deliveryFeeCents: z.number().int(),
    costCents: z.number().int(),
    holdExpiresAt: z.string().nullable(),
    outForDeliveryAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    events: z.array(
      z.object({
        id: z.number().int(),
        from: orderStatus.nullable(),
        to: orderStatus,
        at: z.string(),
        by: z.string().nullable(),
        note: z.string().nullable(),
      }),
    ),
    notes: z.array(z.object({ id: z.number().int(), body: z.string(), at: z.string(), by: z.string() })),
    emails: z.array(
      z.object({ id: z.number().int(), template: z.string(), to: z.string(), status: z.enum(['PENDING', 'SENT', 'FAILED']), at: z.string() }),
    ),
    allowedTransitions: z.array(orderStatus),
    warnings: z.array(deliveryWarningSchema),
  })
  .meta({ id: 'AdminOrder' });

// ---------------------------------------------------------------- admin requests

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.');

export const orderFilterShape = {
  status: csvQuery,
  source: orderSource.optional(),
  areaId: z.coerce.number().int().min(1).optional(),
  dropId: z.coerce.number().int().min(1).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  deliveryNumber: z.string().trim().max(60).optional(),
  q: searchQuery,
  holdExpired: boolQuery,
};

export const orderListQuery = pageQuerySchema.extend({
  ...orderFilterShape,
  afterId: z.coerce.number().int().min(0).optional(),
  sort: sortQuery,
});

export const orderCountsResponse = z.object({
  ALL: z.number().int(),
  NEW: z.number().int(),
  CONFIRMED: z.number().int(),
  PACKED: z.number().int(),
  OUT_FOR_DELIVERY: z.number().int(),
  DELIVERED: z.number().int(),
  CANCELLED: z.number().int(),
  RETURNED: z.number().int(),
});

export const manualOrderBody = z.strictObject({
  customer: z.strictObject({ ...customerBase, email: z.string().trim().email().max(190).nullable().optional() }),
  delivery: deliveryBody,
  items: cartItems,
  expectedTotalCents: z.number().int().min(0).max(100_000_000).optional(),
  attribution: attributionBody,
  source: z.enum(['INSTAGRAM', 'WHATSAPP', 'MANUAL']).default('MANUAL'),
  initialStatus: z.enum(['NEW', 'CONFIRMED']).default('CONFIRMED'),
  sendEmail: z.boolean().optional(),
});

export const deliveryPatchBody = z.strictObject({
  delivery: z
    .strictObject({
      areaId: id.nullable().optional(),
      areaName: z.string().max(200).optional(),
      address: z.string().max(400).optional(),
      notes: z.string().max(400).nullable().optional(),
    })
    .optional(),
});

export const contactPatchBody = z.strictObject({
  email: z.string().trim().max(190).nullable().optional(),
  phone: phoneText.optional(),
  whatsapp: phoneText.optional(),
});

export const statusBody = z.strictObject({
  to: orderStatus,
  note: z.string().max(500).optional(),
  cancelReason: z.string().max(255).optional(),
  deliveryNumber: z.string().max(200).optional(),
  restock: z.boolean().optional(),
});

export const bulkStatusBody = z.strictObject({
  ids: z.array(id).min(1).max(200),
  to: z.enum(['CONFIRMED', 'PACKED', 'DELIVERED']),
});
export const bulkStatusResponse = z.object({
  updated: z.array(z.number().int()),
  failed: z.array(z.object({ id: z.number().int(), code: z.string() })),
});

export const deliveryNumberBody = z.strictObject({ deliveryNumber: z.string().max(200) });
export const cashBody = z.strictObject({ collected: z.boolean().optional(), settled: z.boolean().optional() });
export const noteBody = z.strictObject({ body: z.string().max(2000) });
export const extendHoldBody = z.strictObject({ hours: z.number().int() });
export const emailBody = z.union([
  z.strictObject({ template: z.string().min(1).max(60) }),
  z.strictObject({ subject: z.string().max(400), body: z.string().max(10_000), to: z.array(z.string().max(190)).max(20).optional() }),
]);

export const whatsappQuery = z.object({
  template: z.enum(['order_confirmation', 'ready_for_delivery', 'out_for_delivery', 'delivered']),
});
export const whatsappResponse = z.object({ to: z.string(), text: z.string(), url: z.string() });

export const exportBody = z.strictObject({
  ids: z.array(id).min(1).max(5000).optional(),
  status: z.array(orderStatus).max(7).optional(),
  source: orderSource.optional(),
  areaId: id.optional(),
  dropId: id.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  deliveryNumber: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
  holdExpired: z.boolean().optional(),
});
