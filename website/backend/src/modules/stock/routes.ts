import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { errorResponses, pageQuerySchema, pageSchema } from '../../lib/http';
import { adjustStock, setStock, type StockRef } from '../../services/stock';
import { colorSchema, sizeSchema } from '../options/schemas';
import type { ModuleDef } from '../module';
import { stockHoodies, stockMovements, stockStimpies } from './service';

const itemType = z.enum(['HOODIE_VARIANT', 'STIMPIE']);
const itemId = z.number().int().min(1);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.');

const MOVEMENT_REASONS = ['INITIAL', 'RESTOCK', 'CORRECTION', 'DAMAGED', 'ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_SOLD', 'ORDER_RETURNED', 'ORDER_WRITTEN_OFF'] as const;

const snapshot = z.object({ quantity: z.number().int(), reserved: z.number().int().optional(), available: z.number().int() }).meta({ id: 'StockSnapshot' });

const hoodiesResponse = z.object({
  colors: z.array(colorSchema).optional(),
  sizes: z.array(sizeSchema).optional(),
  items: z.array(z.object({
    hoodieId: z.number().int(),
    name: z.string(),
    colors: z.array(colorSchema),
    sizes: z.array(sizeSchema),
    cells: z.array(z.object({ variantId: z.number().int(), colorId: z.number().int(), sizeId: z.number().int(), quantity: z.number().int(), reserved: z.number().int().optional(), available: z.number().int() })),
  })),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

const stockStimpieSchema = z.object({
  stimpieId: z.number().int(),
  name: z.string(),
  type: z.enum(['CORE', 'LIMITED']),
  dropName: z.string().nullable(),
  quantity: z.number().int(),
  reserved: z.number().int().optional(),
  available: z.number().int(),
  low: z.boolean(),
  artworkUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
const stimpiesResponse = pageSchema(stockStimpieSchema);

const adjustBody = z.strictObject({
  itemType,
  itemId,
  delta: z.number().int(),
  reason: z.enum(['RESTOCK', 'CORRECTION', 'DAMAGED']).default('CORRECTION').optional(),
  note: z.string().max(1000),
});
const setBody = z.strictObject({
  itemType,
  itemId,
  quantity: z.number().int().min(0).max(1_000_000).optional(),
  note: z.string().max(1000),
});

const movementsQuery = pageQuerySchema.extend({
  itemType: itemType.optional(),
  itemId: z.coerce.number().int().min(1).optional(),
  reason: z.enum(MOVEMENT_REASONS).optional(),
  orderId: z.coerce.number().int().min(1).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

const movementSchema = z.object({
  id: z.number().int(),
  at: z.string(),
  itemType,
  itemId: z.number().int(),
  itemName: z.string(),
  field: z.enum(['QUANTITY', 'RESERVED']),
  delta: z.number().int(),
  reason: z.enum(MOVEMENT_REASONS),
  orderNumber: z.string().nullable(),
  note: z.string().nullable(),
  by: z.string().nullable(),
});

const toRef = (t: 'HOODIE_VARIANT' | 'STIMPIE', id: number): StockRef => (t === 'HOODIE_VARIANT' ? { itemType: t, variantId: id } : { itemType: t, stimpieId: id });

const publicRoutes: FastifyPluginAsyncZod = async () => {};

const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const tags = ['stock'];

  app.get('/stock/hoodies', {
    schema: { tags, summary: 'Stock for each hoodie and its selected colour/size variants (paginated by hoodie)', querystring: pageQuerySchema, response: { 200: hoodiesResponse, ...errorResponses } },
  }, async (req) => stockHoodies(app.ctx, req.query));

  app.get('/stock/stimpies', {
    schema: { tags, summary: 'Stimpie stock list', querystring: pageQuerySchema, response: { 200: stimpiesResponse, ...errorResponses } },
  }, async (req) => stockStimpies(app.ctx, req.query));

  app.post('/stock/adjust', {
    schema: { tags, summary: 'Adjust on-hand quantity (note required; cannot reduce units committed to open orders)', body: adjustBody, response: { 200: snapshot, ...errorResponses } },
  }, async (req) =>
    adjustStock(app.ctx, {
      ref: toRef(req.body.itemType, req.body.itemId),
      delta: req.body.delta,
      reason: req.body.reason,
      note: req.body.note,
      userId: req.auth!.user.id,
    }),
  );

  app.post('/stock/set', {
    schema: { tags, summary: 'Set the on-hand quantity (CORRECTION movement for the difference)', body: setBody, response: { 200: snapshot, ...errorResponses } },
  }, async (req) =>
    setStock(app.ctx, {
      ref: toRef(req.body.itemType, req.body.itemId),
      quantity: req.body.quantity,
      note: req.body.note,
      userId: req.auth!.user.id,
    }),
  );

  app.get('/stock/movements', {
    schema: { tags, summary: 'Stock movement log (newest first)', querystring: movementsQuery, response: { 200: pageSchema(movementSchema), ...errorResponses } },
  }, async (req) => stockMovements(app.ctx, req.query));
};

export const stockModule: ModuleDef = { name: 'stock', publicRoutes, adminRoutes };
