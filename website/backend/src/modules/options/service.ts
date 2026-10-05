import type { Color, Prisma, Size } from '@prisma/client';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { jsonStringArray, isUniqueViolation } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { parseSort, toPage, toSkipTake, type Page } from '../../lib/http';
import { ensureVariants } from '../../services/variants';
import type {
  OptionListQuery,
  colorCreateBody,
  colorUpdateBody,
  sizeChartPutBody,
  sizeCreateBody,
  sizeUpdateBody,
} from './schemas';

export type ColorDto = {
  id: number;
  name: string;
  hex: string;
  position: number;
  active: boolean;
  images: string[];
  builderTint: string | null;
  builderTexture: string | null;
};
export type SizeDto = { id: number; label: string; position: number; active: boolean };
export type StockSummary = { available: number; reserved: number };

export const toColorDto = (c: Color): ColorDto => ({
  id: c.id,
  name: c.name,
  hex: c.hex,
  position: c.position,
  active: c.active,
  images: jsonStringArray(c.images),
  builderTint: c.builderTint,
  builderTexture: c.builderTexture,
});
export const toSizeDto = (s: Size): SizeDto => ({ id: s.id, label: s.label, position: s.position, active: s.active });

const USED_BY_ORDERS = 'Used by past orders. Hide it instead.';

// ================================================================ public reads

export async function listPublicOptions(ctx: AppContext): Promise<{ colors: ColorDto[]; sizes: SizeDto[] }> {
  const [colors, sizes] = await Promise.all([
    ctx.prisma.color.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.size.findMany({ where: { active: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
  ]);
  return { colors: colors.map(toColorDto), sizes: sizes.map(toSizeDto) };
}

// ================================================================ stock summaries

async function variantSums(ctx: AppContext, by: 'colorId' | 'sizeId', ids: number[]): Promise<Map<number, StockSummary>> {
  const out = new Map<number, StockSummary>();
  if (!ids.length) return out;
  const rows = await ctx.prisma.hoodieVariant.groupBy({
    by: [by],
    where: { [by]: { in: ids } } as Prisma.HoodieVariantWhereInput,
    _sum: { quantity: true, reserved: true },
  });
  for (const r of rows) {
    const q = r._sum.quantity ?? 0;
    const res = r._sum.reserved ?? 0;
    out.set(r[by], { available: q - res, reserved: res });
  }
  return out;
}
const noStock: StockSummary = { available: 0, reserved: 0 };

// ================================================================ colours

const COLOR_SORT = ['position', 'name', 'id'] as const;

export async function listColors(ctx: AppContext, q: OptionListQuery): Promise<Page<ColorDto & StockSummary>> {
  const sort = parseSort(q.sort, COLOR_SORT, { field: 'position', dir: 'asc' });
  const where: Prisma.ColorWhereInput = {
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q ? { OR: [{ name: { contains: q.q } }, { hex: { contains: q.q } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.color.count({ where }),
    ctx.prisma.color.findMany({ where, orderBy: [{ [sort.field]: sort.dir }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  const sums = await variantSums(ctx, 'colorId', rows.map((r) => r.id));
  return toPage(rows.map((r) => ({ ...toColorDto(r), ...(sums.get(r.id) ?? noStock) })), total, q);
}

export async function getColor(ctx: AppContext, id: number): Promise<ColorDto & StockSummary> {
  const row = await ctx.prisma.color.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Color not found.');
  const sums = await variantSums(ctx, 'colorId', [id]);
  return { ...toColorDto(row), ...(sums.get(id) ?? noStock) };
}

const dupColor = (): AppError => AppError.conflict('A color with this name already exists.', 'name');

export async function createColor(ctx: AppContext, input: z.infer<typeof colorCreateBody>): Promise<ColorDto & StockSummary> {
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const position = input.position ?? ((await tx.color.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
      const row = await tx.color.create({
        data: {
          name: input.name,
          hex: input.hex.toUpperCase(),
          position,
          active: input.active ?? true,
          images: input.images ?? [],
          builderTint: input.builderTint?.toUpperCase() ?? null,
          builderTexture: input.builderTexture ?? null,
        },
      });
      // A new colour gets zero-stock variants for every hoodie x active size.
      await ensureVariants(tx, { colorId: row.id });
      return row.id;
    });
    return await getColor(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw dupColor();
    throw e;
  }
}

export async function updateColor(ctx: AppContext, id: number, input: z.infer<typeof colorUpdateBody>): Promise<ColorDto & StockSummary> {
  try {
    await ctx.prisma.$transaction(async (tx) => {
      const existing = await tx.color.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('Color not found.');
      const row = await tx.color.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.hex !== undefined ? { hex: input.hex.toUpperCase() } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.images !== undefined ? { images: input.images } : {}),
          ...(input.builderTint !== undefined ? { builderTint: input.builderTint?.toUpperCase() ?? null } : {}),
          ...(input.builderTexture !== undefined ? { builderTexture: input.builderTexture } : {}),
        },
      });
      // Re-activating a colour fills any variants that were never created while it was hidden.
      if (row.active) await ensureVariants(tx, { colorId: id });
    });
    return await getColor(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw dupColor();
    throw e;
  }
}

export async function deleteColor(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    if (!(await tx.color.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Color not found.');
    if ((await tx.orderStockLine.count({ where: { variant: { colorId: id } } })) > 0) throw AppError.conflict(USED_BY_ORDERS);
    await tx.stockMovement.deleteMany({ where: { variant: { colorId: id } } });
    await tx.hoodieVariant.deleteMany({ where: { colorId: id } });
    await tx.color.delete({ where: { id } });
  });
}

export async function reorderColors(ctx: AppContext, ids: number[]): Promise<void> {
  await reorder(ctx, ids, (await ctx.prisma.color.findMany({ select: { id: true } })).map((r) => r.id), (id, position) =>
    ctx.prisma.color.update({ where: { id }, data: { position } }),
  );
}

// ================================================================ sizes

const SIZE_SORT = ['position', 'label', 'id'] as const;

export async function listSizes(ctx: AppContext, q: OptionListQuery): Promise<Page<SizeDto & StockSummary>> {
  const sort = parseSort(q.sort, SIZE_SORT, { field: 'position', dir: 'asc' });
  const where: Prisma.SizeWhereInput = {
    ...(q.active !== undefined ? { active: q.active } : {}),
    ...(q.q ? { label: { contains: q.q } } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.size.count({ where }),
    ctx.prisma.size.findMany({ where, orderBy: [{ [sort.field]: sort.dir }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  const sums = await variantSums(ctx, 'sizeId', rows.map((r) => r.id));
  return toPage(rows.map((r) => ({ ...toSizeDto(r), ...(sums.get(r.id) ?? noStock) })), total, q);
}

export async function getSize(ctx: AppContext, id: number): Promise<SizeDto & StockSummary> {
  const row = await ctx.prisma.size.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Size not found.');
  const sums = await variantSums(ctx, 'sizeId', [id]);
  return { ...toSizeDto(row), ...(sums.get(id) ?? noStock) };
}

const dupSize = (): AppError => AppError.conflict('A size with this label already exists.', 'label');

export async function createSize(ctx: AppContext, input: z.infer<typeof sizeCreateBody>): Promise<SizeDto & StockSummary> {
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const position = input.position ?? ((await tx.size.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
      const row = await tx.size.create({ data: { label: input.label, position, active: input.active ?? true } });
      // A new size gets zero-stock variants for every hoodie x active colour.
      await ensureVariants(tx, { sizeId: row.id });
      return row.id;
    });
    return await getSize(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw dupSize();
    throw e;
  }
}

export async function updateSize(ctx: AppContext, id: number, input: z.infer<typeof sizeUpdateBody>): Promise<SizeDto & StockSummary> {
  try {
    await ctx.prisma.$transaction(async (tx) => {
      if (!(await tx.size.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Size not found.');
      const row = await tx.size.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (row.active) await ensureVariants(tx, { sizeId: id });
    });
    return await getSize(ctx, id);
  } catch (e) {
    if (isUniqueViolation(e)) throw dupSize();
    throw e;
  }
}

export async function deleteSize(ctx: AppContext, id: number): Promise<void> {
  await ctx.prisma.$transaction(async (tx) => {
    if (!(await tx.size.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Size not found.');
    if ((await tx.orderStockLine.count({ where: { variant: { sizeId: id } } })) > 0) throw AppError.conflict(USED_BY_ORDERS);
    await tx.stockMovement.deleteMany({ where: { variant: { sizeId: id } } });
    await tx.hoodieVariant.deleteMany({ where: { sizeId: id } });
    await tx.sizeChartValue.deleteMany({ where: { sizeId: id } });
    await tx.size.delete({ where: { id } });
  });
}

export async function reorderSizes(ctx: AppContext, ids: number[]): Promise<void> {
  await reorder(ctx, ids, (await ctx.prisma.size.findMany({ select: { id: true } })).map((r) => r.id), (id, position) =>
    ctx.prisma.size.update({ where: { id }, data: { position } }),
  );
}

/** `{ ids }` must be exactly the full list of existing ids (no duplicates, none missing, none unknown). */
async function reorder(
  ctx: AppContext,
  ids: number[],
  existing: number[],
  update: (id: number, position: number) => Prisma.PrismaPromise<unknown>,
): Promise<void> {
  if (new Set(ids).size !== ids.length) throw AppError.validation({ ids: 'Each id may appear only once.' });
  const have = new Set(existing);
  const unknown = ids.filter((i) => !have.has(i));
  if (unknown.length) throw AppError.validation({ ids: `Unknown id(s): ${unknown.join(', ')}.` });
  if (ids.length !== existing.length) throw AppError.validation({ ids: 'Send the full list of ids in the new order.' });
  await ctx.prisma.$transaction(ids.map((id, i) => update(id, i + 1)));
}

// ================================================================ size chart

const HOWTO_KEY = 'size_chart_howto';

async function readHowTo(ctx: AppContext): Promise<string> {
  const row = await ctx.prisma.contentBlock.findUnique({ where: { key: HOWTO_KEY } });
  const v = row?.value as { text?: unknown } | null | undefined;
  return typeof v?.text === 'string' ? v.text : '';
}

export type SizeChartDto = {
  columns: { id: number; label: string; unit: string; position: number }[];
  rows: { sizeId: number; label: string; values: Record<string, string> }[];
  howToMeasure: string;
};

/** Public chart: active sizes only, empty cells shown as "-". Admin chart: every size, empty cells as "". */
export async function getSizeChart(ctx: AppContext, mode: 'public' | 'admin'): Promise<SizeChartDto> {
  const [columns, sizes, values, howToMeasure] = await Promise.all([
    ctx.prisma.sizeChartColumn.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.size.findMany({ where: mode === 'public' ? { active: true } : {}, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.sizeChartValue.findMany(),
    readHowTo(ctx),
  ]);
  const byCell = new Map(values.map((v) => [`${v.sizeId}:${v.columnId}`, v.value]));
  const blank = mode === 'public' ? '-' : '';
  return {
    columns: columns.map((c) => ({ id: c.id, label: c.label, unit: c.unit, position: c.position })),
    rows: sizes.map((s) => ({
      sizeId: s.id,
      label: s.label,
      values: Object.fromEntries(columns.map((c) => [String(c.id), byCell.get(`${s.id}:${c.id}`) || blank])),
    })),
    howToMeasure,
  };
}

/**
 * Replaces the whole chart atomically. Columns with a known `id` are updated, the rest are created, existing columns
 * that are not sent are removed (with their values). Row `values` are keyed by column id, or by `new:<index>` for a
 * column sent without an id (an unknown numeric id is treated as the client's temporary id for a new column).
 */
export async function putSizeChart(ctx: AppContext, input: z.infer<typeof sizeChartPutBody>): Promise<SizeChartDto> {
  const fields: Record<string, string> = {};
  const [existingColumns, sizes] = await Promise.all([
    ctx.prisma.sizeChartColumn.findMany({ select: { id: true } }),
    ctx.prisma.size.findMany({ select: { id: true } }),
  ]);
  const existingIds = new Set(existingColumns.map((c) => c.id));
  const sizeIds = new Set(sizes.map((s) => s.id));

  // 1. validate columns
  const seenLabels = new Map<string, number>();
  const seenIds = new Set<number>();
  const keyForColumn: string[] = [];
  input.columns.forEach((c, i) => {
    const lbl = c.label.toLowerCase();
    if (seenLabels.has(lbl)) fields[`columns.${i}.label`] = 'Column names must be unique.';
    seenLabels.set(lbl, i);
    if (c.id !== undefined) {
      if (seenIds.has(c.id)) fields[`columns.${i}.id`] = 'Duplicate column id.';
      seenIds.add(c.id);
    }
    keyForColumn.push(c.id !== undefined ? String(c.id) : `new:${i}`);
  });
  const validKeys = new Set(keyForColumn);

  // 2. validate rows
  const seenSizes = new Set<number>();
  input.rows.forEach((r, n) => {
    if (!sizeIds.has(r.sizeId)) fields[`rows.${n}.sizeId`] = 'Unknown size.';
    if (seenSizes.has(r.sizeId)) fields[`rows.${n}.sizeId`] = 'Each size may appear only once.';
    seenSizes.add(r.sizeId);
    for (const key of Object.keys(r.values)) if (!validKeys.has(key)) fields[`rows.${n}.values.${key}`] = 'Unknown column.';
  });
  if (Object.keys(fields).length) throw AppError.validation(fields);

  await ctx.prisma.$transaction(async (tx) => {
    const keep = new Set(input.columns.filter((c) => c.id !== undefined && existingIds.has(c.id)).map((c) => c.id!));
    await tx.sizeChartValue.deleteMany({});
    await tx.sizeChartColumn.deleteMany({ where: { id: { notIn: [...keep] } } });

    const idByKey = new Map<string, number>();
    for (let i = 0; i < input.columns.length; i++) {
      const c = input.columns[i]!;
      if (c.id !== undefined && existingIds.has(c.id)) {
        await tx.sizeChartColumn.update({ where: { id: c.id }, data: { label: c.label, unit: c.unit, position: i } });
        idByKey.set(keyForColumn[i]!, c.id);
      } else {
        const created = await tx.sizeChartColumn.create({ data: { label: c.label, unit: c.unit, position: i } });
        idByKey.set(keyForColumn[i]!, created.id);
      }
    }
    const data: { sizeId: number; columnId: number; value: string }[] = [];
    for (const r of input.rows) {
      for (const [key, raw] of Object.entries(r.values)) {
        const value = raw.trim();
        if (value) data.push({ sizeId: r.sizeId, columnId: idByKey.get(key)!, value });
      }
    }
    if (data.length) await tx.sizeChartValue.createMany({ data });
    await tx.contentBlock.upsert({
      where: { key: HOWTO_KEY },
      create: { key: HOWTO_KEY, value: { text: input.howToMeasure } },
      update: { value: { text: input.howToMeasure } },
    });
  });
  return getSizeChart(ctx, 'admin');
}
