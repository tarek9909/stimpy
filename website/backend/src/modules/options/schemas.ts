import { z } from 'zod';
import { boolQuery, hexColor, pageQuerySchema, searchQuery, sortQuery, urlField } from '../../lib/http';

// ---------------------------------------------------------------- shared types (api-reference section 2)

export const colorSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    hex: z.string(),
    position: z.number().int(),
    active: z.boolean(),
    images: z.array(z.string()),
    builderTint: z.string().nullable(),
    builderTexture: z.string().nullable(),
  })
  .meta({ id: 'Color' });

export const sizeSchema = z
  .object({ id: z.number().int(), label: z.string(), position: z.number().int(), active: z.boolean() })
  .meta({ id: 'Size' });

/** Admin lists add read-only stock summary fields (api-reference 5.4). */
export const adminColorSchema = colorSchema.extend({ available: z.number().int(), reserved: z.number().int() }).meta({ id: 'AdminColor' });
export const adminSizeSchema = sizeSchema.extend({ available: z.number().int(), reserved: z.number().int() }).meta({ id: 'AdminSize' });

export const optionsResponse = z.object({ colors: z.array(colorSchema), sizes: z.array(sizeSchema) });

// ---------------------------------------------------------------- size chart

export const sizeChartResponse = z.object({
  columns: z.array(z.object({ id: z.number().int(), label: z.string(), unit: z.string() })),
  rows: z.array(z.object({ sizeId: z.number().int(), label: z.string(), values: z.record(z.string(), z.string()) })),
  howToMeasure: z.string(),
});

export const adminSizeChartResponse = z
  .object({
    columns: z.array(z.object({ id: z.number().int(), label: z.string(), unit: z.string(), position: z.number().int() })),
    rows: z.array(z.object({ sizeId: z.number().int(), label: z.string(), values: z.record(z.string(), z.string()) })),
    howToMeasure: z.string(),
  })
  .meta({ id: 'AdminSizeChart' });

export const sizeChartPutBody = z.strictObject({
  columns: z
    .array(
      z.strictObject({
        // Omit `id` to create a new column. An id that does not exist yet is treated as a client-side temporary id.
        id: z.number().int().optional(),
        label: z.string().trim().min(1).max(40),
        unit: z.string().trim().max(10),
        position: z.number().int().optional(),
      }),
    )
    .min(1)
    .max(12),
  rows: z
    .array(
      z.strictObject({
        sizeId: z.number().int().min(1),
        label: z.string().optional(),
        // key = column id (or `new:<index in columns>` for a column without an id)
        values: z.record(z.string(), z.string().max(30)),
      }),
    )
    .max(100),
  howToMeasure: z.string().max(20_000),
});

// ---------------------------------------------------------------- colours

export const colorCreateBody = z.strictObject({
  name: z.string().trim().min(1).max(60),
  hex: hexColor,
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  images: z.array(urlField).max(20).optional(),
  builderTint: hexColor.nullable().optional(),
  builderTexture: urlField.nullable().optional(),
});
export const colorUpdateBody = colorCreateBody.partial();

// ---------------------------------------------------------------- sizes

export const sizeCreateBody = z.strictObject({
  label: z.string().trim().min(1).max(20),
  position: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export const sizeUpdateBody = sizeCreateBody.partial();

// ---------------------------------------------------------------- lists / reorder

export const optionListQuery = pageQuerySchema.extend({
  q: searchQuery,
  sort: sortQuery,
  active: boolQuery,
});
export type OptionListQuery = z.infer<typeof optionListQuery>;

export const reorderBody = z.strictObject({ ids: z.array(z.number().int().min(1)).min(1).max(5000) });
