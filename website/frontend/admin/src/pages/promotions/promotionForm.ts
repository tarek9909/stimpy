import { z } from 'zod';
import { parseDollarsToCents } from '@stimpy/ui';
import type { AdminPromotion, PromotionFormBody } from './api';

const targetSchema = z.object({ productType: z.enum(['HOODIE', 'STIMPIE', 'PACK']), productId: z.number().int().positive() });

export const promotionFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a promotion name.').max(120, 'Use at most 120 characters.'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']),
  discountValue: z.string().trim().min(1, 'Enter a discount.'),
  allProducts: z.boolean(),
  targets: z.array(targetSchema),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
}).superRefine((value, ctx) => {
  if (value.discountType === 'PERCENTAGE') {
    const n = Number(value.discountValue);
    if (!Number.isInteger(n) || n < 1 || n > 100) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Enter a whole percentage from 1 to 100.' });
  } else {
    const cents = parseDollarsToCents(value.discountValue);
    if (cents === null || cents < 1) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Enter an amount above $0.00.' });
  }
  if (!value.allProducts && value.targets.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['targets'], message: 'Choose at least one product or pack.' });
  }
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the start.' });
  }
});

export type PromotionFormValues = z.infer<typeof promotionFormSchema>;

export const emptyPromotion: PromotionFormValues = {
  name: '',
  discountType: 'PERCENTAGE',
  discountValue: '10',
  allProducts: false,
  targets: [],
  startsAt: null,
  endsAt: null,
};

export function toPromotionValues(promotion: AdminPromotion): PromotionFormValues {
  return {
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountType === 'FIXED' ? (promotion.discountValue / 100).toFixed(2) : String(promotion.discountValue),
    allProducts: promotion.allProducts,
    targets: promotion.targets,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
  };
}

export function toPromotionBody(value: PromotionFormValues): PromotionFormBody {
  const discountValue = value.discountType === 'PERCENTAGE' ? Number(value.discountValue) : parseDollarsToCents(value.discountValue);
  if (discountValue === null) throw new Error('Enter a valid discount amount.');
  return {
    name: value.name.trim(),
    discountType: value.discountType,
    discountValue,
    allProducts: value.allProducts,
    targets: value.allProducts ? [] : value.targets,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
  };
}

export function promotionDiscountLabel(promotion: Pick<AdminPromotion, 'discountType' | 'discountValue'>): string {
  return promotion.discountType === 'PERCENTAGE' ? `${promotion.discountValue}% off` : `$${(promotion.discountValue / 100).toFixed(2)} off`;
}
