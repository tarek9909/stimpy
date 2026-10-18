import { describe, expect, it, vi } from 'vitest';
import type { Color } from '@prisma/client';
import type { AppContext } from '../src/context';
import { getAdminBuilder, getPublicBuilderConfig } from '../src/modules/content/builder';

const hoodie = { id: 10, slug: 'hoodie-a', name: 'Hoodie A' };
const placement = { x: 0.5, y: 0.5, width: 0.4, rotation: 0 };
const color = (id: number, active = true): Color => ({
  id, name: `Colour ${id}`, hex: '#111111', position: id, active,
  images: [], builderTint: '#111111', builderTexture: null,
  createdAt: new Date(0), updatedAt: new Date(0),
});

function fixture(options: { variantColors?: number[]; noHoodie?: boolean; fallback?: boolean } = {}) {
  const prisma = {
    builderConfig: { findMany: vi.fn(async () => [
      { key: 'hoodieId', value: options.fallback ? 99 : hoodie.id },
      { key: 'colors', value: [1, 2, 3].map((colorId) => ({
        colorId, hoodieImage2d: `/images/${colorId}.webp`, overlay2d: `/images/${colorId}-overlay.webp`, placement2d: placement,
      })) },
    ]) },
    color: { findMany: vi.fn(async () => [color(1), color(2), color(3, false)]) },
    stimpie: { findMany: vi.fn(async () => []) },
    hoodie: { findFirst: vi.fn(async ({ where }: { where: { id?: number } }) =>
      options.noHoodie || (options.fallback && where.id === 99) ? null : hoodie) },
    hoodieVariant: { findMany: vi.fn(async () => (options.variantColors ?? [1, 3]).map((colorId) => ({ colorId }))) },
  };
  return { prisma, ctx: { prisma } as unknown as AppContext };
}

describe('Builder links to its hoodie options', () => {
  it('returns configured looks only for colours assigned to active size combinations on the selected hoodie', async () => {
    const { ctx, prisma } = fixture();
    const out = await getPublicBuilderConfig(ctx);
    expect(out.hoodie).toEqual(hoodie);
    expect(out.colors.map((c) => c.colorId)).toEqual([1]);
    expect(prisma.hoodieVariant.findMany).toHaveBeenCalledWith({
      where: { hoodieId: hoodie.id, active: true, size: { active: true } },
      select: { colorId: true }, distinct: ['colorId'],
    });
  });

  it('keeps shared asset editors while readiness counts only the selected hoodie colours', async () => {
    const { ctx } = fixture();
    const out = await getAdminBuilder(ctx);
    expect(out.colors.map((c) => c.colorId)).toEqual([1, 2, 3]);
    expect(out.assetsReady.colors2d).toEqual([{ colorId: 1, ready: true }]);
    expect(out.assetsReady.overlays2d).toBe(1);
    expect(out.warnings).toEqual([]);
  });

  it('reports that options must be assigned before a hoodie can appear in the Builder', async () => {
    const { ctx } = fixture({ variantColors: [] });
    expect((await getPublicBuilderConfig(ctx)).colors).toEqual([]);
    const out = await getAdminBuilder(ctx);
    expect(out.assetsReady.colors2d).toEqual([]);
    expect(out.warnings).toContain('No active colours and sizes are assigned to the Builder hoodie. Choose them in Products first.');
  });

  it('uses the resolved fallback hoodie for option eligibility and returns no colours without a hoodie', async () => {
    const fallback = fixture({ fallback: true });
    expect((await getPublicBuilderConfig(fallback.ctx)).hoodie).toEqual(hoodie);
    expect(fallback.prisma.hoodieVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hoodieId: hoodie.id }) }));
    const empty = fixture({ noHoodie: true });
    expect((await getPublicBuilderConfig(empty.ctx)).colors).toEqual([]);
    expect(empty.prisma.hoodieVariant.findMany).not.toHaveBeenCalled();
  });
});
