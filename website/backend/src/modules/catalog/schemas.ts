import { z } from 'zod';
import { boolQuery, centsField, pageQuerySchema, searchQuery, slugField, sortQuery } from '../../lib/http';
import { colorSchema, sizeSchema } from '../options/schemas';

// ---------------------------------------------------------------- shared field schemas

/** Uploaded-file URL (absolute). Only http(s): a `javascript:` or `data:` URL in an image field is rejected. */
export const assetUrl = z
  .string()
  .max(500)
  .url('Enter a full URL, e.g. one returned by the upload.')
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs are allowed.');

export const nameField = z.string().trim().min(1, 'This field is required.').max(120);
export const longText = z.string().max(2000);
export const imageList = z.array(assetUrl).max(20);

export const accentColorEnum = z.enum(['BUTTER', 'SKY', 'LILAC']);

/** `?flag=true|false`, with a default when absent. */
export const boolQueryDefault = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .transform((v) => v ?? fallback);

// ---------------------------------------------------------------- public responses (api-reference section 2)

const stimpieDropSummary = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  accentColor: accentColorEnum,
  accentHex: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
});

export const publicStimpieSchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    type: z.enum(['CORE', 'LIMITED']),
    priceCents: z.number().int(),
    story: z.string(),
    images: z.array(z.string()),
    artworkUrl: z.string(),
    artworkWidth: z.number().int().nullable(),
    artworkHeight: z.number().int().nullable(),
    drop: stimpieDropSummary.nullable(),
    status: z.enum(['AVAILABLE', 'LOW', 'SOLD_OUT', 'UPCOMING', 'ENDED']),
    remaining: z.number().int().nullable(),
    purchasable: z.boolean(),
  })
  .meta({ id: 'Stimpie' });

export const hoodieSummarySchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    images: z.array(z.string()),
    colors: z.array(z.object({ id: z.number().int(), name: z.string(), hex: z.string() })),
    inStock: z.boolean(),
  })
  .meta({ id: 'HoodieSummary' });

export const hoodieDetailSchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    images: z.array(z.string()),
    inStock: z.boolean(),
    details: z.array(z.string()),
    colors: z.array(colorSchema),
    sizes: z.array(sizeSchema),
    variants: z.array(
      z.object({ colorId: z.number().int(), sizeId: z.number().int(), inStock: z.boolean(), remaining: z.number().int().nullable() }),
    ),
  })
  .meta({ id: 'HoodieDetail' });

export const packSchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    stimpieCount: z.number().int(),
    priceCents: z.number().int(),
    badge: z.string().nullable(),
  })
  .meta({ id: 'Pack' });

export const slugParams = z.object({ slug: z.string().min(1).max(140) });

export const publicStimpieQuery = z.object({
  type: z.enum(['CORE', 'LIMITED']).optional(),
  drop: z.string().min(1).max(140).optional(),
  includeSoldOut: boolQueryDefault(true),
  includeUpcoming: boolQueryDefault(false),
  includeEnded: boolQueryDefault(false),
});
export type PublicStimpieQuery = z.infer<typeof publicStimpieQuery>;

// ---------------------------------------------------------------- admin responses

export const adminHoodieSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    details: z.array(z.string()),
    priceCents: z.number().int(),
    costCents: z.number().int(),
    images: z.array(z.string()),
    active: z.boolean(),
    position: z.number().int(),
    available: z.number().int(),
    reserved: z.number().int(),
  })
  .meta({ id: 'AdminHoodie' });

export const adminStimpieSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    type: z.enum(['CORE', 'LIMITED']),
    dropId: z.number().int().nullable(),
    priceCents: z.number().int(),
    costCents: z.number().int(),
    story: z.string(),
    images: z.array(z.string()),
    artworkUrl: z.string(),
    artworkWidth: z.number().int().nullable(),
    artworkHeight: z.number().int().nullable(),
    active: z.boolean(),
    position: z.number().int(),
    quantity: z.number().int(),
    available: z.number().int(),
    reserved: z.number().int(),
  })
  .meta({ id: 'AdminStimpie' });

export const adminPackSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    stimpieCount: z.number().int(),
    priceCents: z.number().int(),
    badge: z.string().nullable(),
    active: z.boolean(),
    position: z.number().int(),
  })
  .meta({ id: 'AdminPack' });

// ---------------------------------------------------------------- admin request bodies

const detailBullets = z.array(z.string().trim().min(1).max(200)).max(30);

export const hoodieCreateBody = z.strictObject({
  name: nameField,
  slug: slugField.optional(),
  description: longText.optional(),
  details: detailBullets.optional(),
  priceCents: centsField,
  costCents: centsField.optional(),
  images: imageList.optional(),
  active: z.boolean().optional(),
});
export const hoodieUpdateBody = hoodieCreateBody.partial();

export const stimpieCreateBody = z.strictObject({
  name: nameField,
  slug: slugField.optional(),
  type: z.enum(['CORE', 'LIMITED']).optional(),
  dropId: z.number().int().min(1).nullable().optional(),
  priceCents: centsField,
  costCents: centsField.optional(),
  /** Initial stock, creation only (later changes go through stock adjustments). */
  quantity: z.number().int().min(0).max(1_000_000).optional(),
  story: longText.optional(),
  images: imageList.optional(),
  artworkUrl: assetUrl,
  active: z.boolean().optional(),
});
export const stimpieUpdateBody = stimpieCreateBody.partial();

export const packCreateBody = z.strictObject({
  name: nameField,
  slug: slugField.optional(),
  description: longText.optional(),
  stimpieCount: z.number().int().min(1).max(5),
  priceCents: centsField,
  badge: z.string().trim().min(1).max(40).nullable().optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});
export const packUpdateBody = packCreateBody.partial();

// ---------------------------------------------------------------- admin list queries

const listBase = pageQuerySchema.extend({ q: searchQuery, sort: sortQuery, active: boolQuery });
export const hoodieListQuery = listBase;
export const packListQuery = listBase;
export const stimpieListQuery = listBase.extend({
  type: z.enum(['CORE', 'LIMITED']).optional(),
  dropId: z.coerce.number().int().min(1).optional(),
});
export type HoodieListQuery = z.infer<typeof hoodieListQuery>;
export type PackListQuery = z.infer<typeof packListQuery>;
export type StimpieListQuery = z.infer<typeof stimpieListQuery>;
