import { z } from 'zod';
import { pageQuerySchema, pageSchema, searchQuery, sortQuery } from '../../lib/http';
import { accentColorEnum, accentHexField, assetUrl, longText, nameField, publicStimpieSchema } from '../catalog/schemas';

// ---------------------------------------------------------------- public

export const dropStateEnum = z.enum(['UPCOMING', 'LIVE', 'SOLD_OUT', 'ENDED']);

export const publicDropSchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    story: z.string(),
    accentColor: accentColorEnum,
    accentHex: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    state: dropStateEnum,
    teaserImage: z.string().nullable(),
    teaserVideo: z.string().nullable(),
    unitsRemaining: z.number().int().nullable(),
    stimpies: z.array(publicStimpieSchema),
  })
  .meta({ id: 'Drop' });

export const dropsResponseSchema = z
  .object({ live: publicDropSchema.nullable(), upcoming: pageSchema(publicDropSchema), archive: pageSchema(publicDropSchema) })
  .meta({ id: 'DropsOverview' });

export const dropSlugParams = z.object({ slug: z.string().min(1).max(140) });

/** Same shapes the checkout uses; the `contact` rule depends on `type` and is checked in the service (fields.contact). */
export const subscribeBody = z.strictObject({
  contact: z.string().trim().min(1, 'Enter your email or WhatsApp number.').max(190),
  type: z.enum(['EMAIL', 'WHATSAPP']),
});

// ---------------------------------------------------------------- admin

const { remaining: _publicRemaining, ...publicStimpieShape } = publicStimpieSchema.shape;
void _publicRemaining;

export const adminDropStimpieSchema = z.object({
  ...publicStimpieShape,
  active: z.boolean(),
  quantity: z.number().int(),
  sold: z.number().int(),
  remaining: z.number().int(),
});

export const adminDropSchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    story: z.string(),
    accentColor: accentColorEnum,
    accentHex: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    state: dropStateEnum,
    teaserImage: z.string().nullable(),
    teaserVideo: z.string().nullable(),
    unitsTotal: z.number().int(),
    unitsSold: z.number().int(),
    unitsRemaining: z.number().int(),
    revenueCents: z.number().int(),
    sellOutAt: z.string().nullable(),
    stimpies: z.array(adminDropStimpieSchema),
  })
  .meta({ id: 'AdminDrop' });

const isoDate = z.iso.datetime({ offset: true, message: 'Enter a valid date and time.' }).transform((s) => new Date(s));

const dropBodyFields = {
  name: nameField,
  story: longText.optional(),
  /** Deprecated compatibility input; new clients send the exact `accentHex`. */
  accentColor: accentColorEnum.optional(),
  accentHex: accentHexField.optional(),
  startsAt: isoDate,
  endsAt: isoDate.nullable().optional(),
  teaserImage: assetUrl.nullable().optional(),
  teaserVideo: assetUrl.nullable().optional(),
  stimpieIds: z.array(z.number().int().min(1)).max(100).optional(),
};
const dropBodySchema = z.strictObject(dropBodyFields);
export const dropCreateBody = z.union([
  z.strictObject({ ...dropBodyFields, accentHex: accentHexField }),
  z.strictObject({ ...dropBodyFields, accentColor: accentColorEnum }),
]);
export const dropUpdateBody = dropBodySchema.partial();

export const dropListQuery = pageQuerySchema.extend({
  state: z.enum(['UPCOMING', 'LIVE', 'ARCHIVE']).optional(),
  q: searchQuery,
  sort: sortQuery,
});
export type DropListQuery = z.infer<typeof dropListQuery>;

export const subscriberSchema = z
  .object({
    id: z.number().int(),
    contact: z.string(),
    type: z.enum(['EMAIL', 'WHATSAPP']),
    customerId: z.number().int().nullable(),
    dropName: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Subscriber' });

export const subscriberListQuery = pageQuerySchema.extend({
  q: searchQuery,
  type: z.enum(['EMAIL', 'WHATSAPP']).optional(),
  dropId: z.coerce.number().int().min(1).optional(),
  customerId: z.coerce.number().int().min(1).optional(),
  format: z.enum(['json', 'csv']).optional(),
});
export type SubscriberListQuery = z.infer<typeof subscriberListQuery>;
