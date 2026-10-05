import { z } from 'zod';

const day = z.iso.date('Use a real date in YYYY-MM-DD format.');

export const crmCampaignFiltersSchema = z.strictObject({
  orderCountMin: z.number().int().min(0).max(100_000).optional(),
  orderCountMax: z.number().int().min(0).max(100_000).optional(),
  lifetimeValueMinCents: z.number().int().min(0).max(1_000_000_000).optional(),
  lifetimeValueMaxCents: z.number().int().min(0).max(1_000_000_000).optional(),
  lastOrderBefore: day.optional(),
  lastOrderAfter: day.optional(),
  areaId: z.number().int().positive().optional(),
  tagIds: z.array(z.number().int().positive()).max(100).default([]),
  subscribedToDropId: z.number().int().positive().optional(),
  subscribedNeverOrdered: z.boolean().optional(),
  hasEmail: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.orderCountMin !== undefined && value.orderCountMax !== undefined && value.orderCountMin > value.orderCountMax) {
    ctx.addIssue({ code: 'custom', path: ['orderCountMax'], message: 'Must be greater than or equal to the minimum.' });
  }
  if (value.lifetimeValueMinCents !== undefined && value.lifetimeValueMaxCents !== undefined && value.lifetimeValueMinCents > value.lifetimeValueMaxCents) {
    ctx.addIssue({ code: 'custom', path: ['lifetimeValueMaxCents'], message: 'Must be greater than or equal to the minimum.' });
  }
  if (new Set(value.tagIds).size !== value.tagIds.length) {
    ctx.addIssue({ code: 'custom', path: ['tagIds'], message: 'Choose each tag once.' });
  }
});

export const campaignChannelSchema = z.enum(['EMAIL', 'WHATSAPP']);
export type CrmCampaignFilters = z.infer<typeof crmCampaignFiltersSchema>;
export type CampaignChannel = z.infer<typeof campaignChannelSchema>;
