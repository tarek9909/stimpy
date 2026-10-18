import { z } from 'zod';
import { pageQuerySchema } from '../../lib/http';

export const promotionProductTypeSchema = z.enum(['HOODIE', 'STIMPIE', 'PACK']);
export const promotionDiscountTypeSchema = z.enum(['PERCENTAGE', 'FIXED']);
export const promotionTargetSchema = z.object({ productType: promotionProductTypeSchema, productId: z.number().int().min(1) });

const dateTimeField = z.string().datetime({ offset: true }).nullable();
const targetArray = z.array(promotionTargetSchema).max(5000).superRefine((targets, ctx) => {
  const seen = new Set<string>();
  targets.forEach((target, index) => {
    const key = `${target.productType}:${target.productId}`;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Choose each product only once.' });
    seen.add(key);
  });
});

function validatePromotionFields(value: { discountType?: 'PERCENTAGE' | 'FIXED'; discountValue?: number; allProducts?: boolean; targets?: { productType: string; productId: number }[]; startsAt?: string | null; endsAt?: string | null }, ctx: z.RefinementCtx) {
  if (value.discountType === 'PERCENTAGE' && value.discountValue !== undefined && value.discountValue > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Percentage discounts can be at most 100%.' });
  }
  if ((value.discountType !== undefined) !== (value.discountValue !== undefined)) {
    ctx.addIssue({ code: 'custom', path: [value.discountType === undefined ? 'discountType' : 'discountValue'], message: 'Choose a discount type and value together.' });
  }
  if (value.allProducts && value.targets && value.targets.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['targets'], message: 'Clear the product selection when applying this to all products.' });
  }
  if (value.allProducts === false && value.targets && value.targets.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['targets'], message: 'Choose at least one product or pack.' });
  }
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' });
  }
}

export const promotionCreateBody = z.strictObject({
  name: z.string().trim().min(1).max(120),
  discountType: promotionDiscountTypeSchema,
  discountValue: z.number().int().min(1).max(100_000_000),
  allProducts: z.boolean(),
  targets: targetArray,
  enabled: z.boolean().optional(),
  startsAt: dateTimeField.optional(),
  endsAt: dateTimeField.optional(),
}).superRefine(validatePromotionFields);

export const promotionUpdateBody = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  discountType: promotionDiscountTypeSchema.optional(),
  discountValue: z.number().int().min(1).max(100_000_000).optional(),
  allProducts: z.boolean().optional(),
  targets: targetArray.optional(),
  enabled: z.boolean().optional(),
  startsAt: dateTimeField.optional(),
  endsAt: dateTimeField.optional(),
}).superRefine(validatePromotionFields);

export const promotionListQuery = pageQuerySchema;

export const promotionTargetResponseSchema = z.object({ productType: promotionProductTypeSchema, productId: z.number().int() });
export const publicPromotionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  discountType: promotionDiscountTypeSchema,
  discountValue: z.number().int(),
  allProducts: z.boolean(),
  targets: z.array(promotionTargetResponseSchema),
}).meta({ id: 'PublicPromotion' });

export const adminPromotionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  discountType: promotionDiscountTypeSchema,
  discountValue: z.number().int(),
  allProducts: z.boolean(),
  targets: z.array(promotionTargetResponseSchema),
  enabled: z.boolean(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  state: z.enum(['ACTIVE', 'SCHEDULED', 'ENDED', 'PAUSED']),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'AdminPromotion' });
