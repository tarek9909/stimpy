import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../lib/errors';
import { errorResponses, idParams, pageQuerySchema, parseSort, toSkipTake } from '../../lib/http';
import { dateColumnFilter, ymdString } from '../../lib/range';
import { noContent } from '../auth/schemas';

/**
 * Expenses and ad spend share one shape (api-reference 5.9): `category` or `channel`, `amountCents`, `note`, `spentOn`.
 * One factory builds both route sets so they cannot drift apart.
 */
type Row = { id: number; amountCents: number; note: string | null; spentOn: Date; [k: string]: unknown };
/** Both Prisma delegates (`expense`, `adSpend`) have these methods with the same shapes. */
type Delegate = {
  findMany(a: object): Promise<Row[]>;
  count(a: object): Promise<number>;
  aggregate(a: object): Promise<{ _sum: { amountCents: number | null } }>;
  create(a: object): Promise<Row>;
  update(a: object): Promise<Row>;
  delete(a: object): Promise<Row>;
  findUnique(a: object): Promise<Row | null>;
};

const SORT_FIELDS = ['spentOn', 'amountCents', 'label', 'createdAt'] as const;
const midnightUtc = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

export function costRoutes(o: { prefix: '/expenses' | '/ad-spend'; label: 'category' | 'channel'; model: 'expense' | 'adSpend'; noun: string; schemaId: string }): FastifyPluginAsyncZod {
  const L = o.label;
  const tags = ['finance'];

  const itemSchema = z
    .object({ id: z.number().int(), [L]: z.string(), amountCents: z.number().int(), note: z.string().nullable(), spentOn: z.string() })
    .meta({ id: o.schemaId });
  const listResponse = z.object({
    items: z.array(itemSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    /** Sum of `amountCents` over the whole filtered range, not only this page. */
    totalCents: z.number().int(),
  });
  const labelField = z.string().trim().min(1, 'Enter a value.').max(60);
  const amount = z.number().int().min(1, 'Enter an amount above zero.').max(100_000_000);
  const note = z.string().trim().max(255).transform((v) => (v === '' ? null : v)).nullable();
  const createBody = z.strictObject({ [L]: labelField, amountCents: amount, note: note.optional(), spentOn: ymdString });
  const patchBody = z.strictObject({ [L]: labelField.optional(), amountCents: amount.optional(), note: note.optional(), spentOn: ymdString.optional() });
  // The label filter key (`category` or `channel`) is dynamic, so the schema's static type is declared by hand.
  type Query = { page: number; pageSize: number; from?: string; to?: string; sort?: string };
  const query = pageQuerySchema.extend({
    from: ymdString.optional(),
    to: ymdString.optional(),
    [L]: z.string().trim().max(60).optional(),
    sort: z.string().max(40).optional(),
  }) as unknown as z.ZodType<Query>;

  const toDto = (r: Row) => ({ id: r.id, [L]: r[L] as string, amountCents: r.amountCents, note: r.note, spentOn: r.spentOn.toISOString().slice(0, 10) });

  return async (app) => {
    const db = (): Delegate => app.ctx.prisma[o.model] as unknown as Delegate;
    const mustExist = async (id: number): Promise<Row> => {
      const row = await db().findUnique({ where: { id } });
      if (!row) throw AppError.notFound(`That ${o.noun} was not found.`);
      return row;
    };

    app.get(o.prefix, {
      schema: { tags, summary: `List ${o.noun}s (from, to, ${L}, sort); totalCents covers the whole filtered range`, querystring: query, response: { 200: listResponse, ...errorResponses } },
    }, async (req) => {
      const q = req.query;
      const extra = req.query as unknown as Record<string, string | undefined>;
      if (q.from && q.to && q.from > q.to) throw AppError.validation({ to: 'The end date must not be before the start date.' });
      const dateF = dateColumnFilter({ from: q.from ?? null, to: q.to ?? null });
      const label = extra[L];
      const where = { ...(dateF ? { spentOn: dateF } : {}), ...(label ? { [L]: label } : {}) };
      const sort = parseSort(q.sort, SORT_FIELDS, { field: 'spentOn', dir: 'desc' });
      const field = sort.field === 'label' ? L : sort.field;
      const [total, rows, sum] = await Promise.all([
        db().count({ where }),
        db().findMany({ where, orderBy: [{ [field]: sort.dir }, { id: 'desc' }], ...toSkipTake(q) }),
        db().aggregate({ where, _sum: { amountCents: true } }),
      ]);
      return { items: rows.map(toDto), page: q.page, pageSize: q.pageSize, total, totalCents: sum._sum.amountCents ?? 0 };
    });

    app.post(o.prefix, {
      schema: { tags, summary: `Record ${o.noun}`, body: createBody, response: { 201: itemSchema, ...errorResponses } },
    }, async (req, reply) => {
      const b = req.body as Record<string, unknown>;
      const row = await db().create({ data: { [L]: b[L], amountCents: b.amountCents, note: b.note ?? null, spentOn: midnightUtc(b.spentOn as string) } });
      return reply.code(201).send(toDto(row));
    });

    app.patch(`${o.prefix}/:id`, {
      schema: { tags, summary: `Edit ${o.noun}`, params: idParams, body: patchBody, response: { 200: itemSchema, ...errorResponses } },
    }, async (req) => {
      const b = req.body as Record<string, unknown>;
      const current = await mustExist(req.params.id);
      const data: Record<string, unknown> = {};
      if (b[L] !== undefined) data[L] = b[L];
      if (b.amountCents !== undefined) data.amountCents = b.amountCents;
      if (b.note !== undefined) data.note = b.note;
      if (b.spentOn !== undefined) data.spentOn = midnightUtc(b.spentOn as string);
      return toDto(Object.keys(data).length ? await db().update({ where: { id: current.id }, data }) : current);
    });

    app.delete(`${o.prefix}/:id`, {
      schema: { tags, summary: `Delete ${o.noun} (changes profit figures)`, params: idParams, response: { 204: noContent, ...errorResponses } },
    }, async (req, reply) => {
      await mustExist(req.params.id);
      await db().delete({ where: { id: req.params.id } });
      return reply.code(204).send(null);
    });
  };
}
