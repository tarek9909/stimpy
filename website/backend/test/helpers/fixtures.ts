import type { AccentColor, Area, Color, Drop, Hoodie, HoodieVariant, Pack, PrismaClient, Size, Stimpie, StimpieType, AdminUser } from '@prisma/client';
import { EMAIL_TEMPLATES, WHATSAPP_TEMPLATES } from '../../src/lib/templates-catalog';
import { hashPassword } from '../../src/services/auth';
import { ensureVariants } from '../../src/services/variants';
import { now } from '../../src/lib/clock';

/**
 * Fixture builders. Each takes the Prisma client first and returns the created row. They write straight to the
 * database (not through services) so that tests of a service are not coupled to another service.
 * `buildWorld()` creates a complete small shop; use the individual builders when a test needs something specific.
 */

let seq = 0;
const next = (): number => ++seq;

export const DEFAULT_ADMIN = { email: 'owner@test.local', password: 'Correct-Horse-Battery-9' };

export async function createAdmin(
  prisma: PrismaClient,
  o: { email?: string; password?: string; name?: string } = {},
): Promise<{ user: AdminUser; email: string; password: string }> {
  const email = o.email ?? DEFAULT_ADMIN.email;
  const password = o.password ?? DEFAULT_ADMIN.password;
  const user = await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: o.name ?? 'Test Owner', role: 'OWNER', passwordHash: await hashPassword(password) },
    update: {},
  });
  return { user, email, password };
}

export function createColor(prisma: PrismaClient, o: Partial<{ name: string; hex: string; position: number; active: boolean }> = {}): Promise<Color> {
  const n = next();
  return prisma.color.create({
    data: { name: o.name ?? `Color ${n}`, hex: o.hex ?? '#111111', position: o.position ?? n, active: o.active ?? true, images: [] },
  });
}

export function createSize(prisma: PrismaClient, o: Partial<{ label: string; position: number; active: boolean }> = {}): Promise<Size> {
  const n = next();
  return prisma.size.create({ data: { label: o.label ?? `S${n}`, position: o.position ?? n, active: o.active ?? true } });
}

/** Creates a hoodie and its zero-stock variants (hoodie x active colour x active size), then sets `stock` on all of them. */
export async function createHoodie(
  prisma: PrismaClient,
  o: Partial<{ name: string; slug: string; priceCents: number; costCents: number; active: boolean; stock: number }> = {},
): Promise<Hoodie> {
  const n = next();
  const hoodie = await prisma.hoodie.create({
    data: {
      name: o.name ?? `Hoodie ${n}`,
      slug: o.slug ?? `hoodie-${n}`,
      description: 'Test hoodie',
      details: [],
      priceCents: o.priceCents ?? 2500,
      costCents: o.costCents ?? 1000,
      images: [],
      active: o.active ?? true,
      position: n,
    },
  });
  await prisma.$transaction((tx) => ensureVariants(tx, { hoodieId: hoodie.id }));
  if (o.stock !== undefined) await prisma.hoodieVariant.updateMany({ where: { hoodieId: hoodie.id }, data: { quantity: o.stock } });
  return hoodie;
}

export async function setVariantStock(
  prisma: PrismaClient,
  where: { hoodieId: number; colorId: number; sizeId: number },
  quantity: number,
  reserved = 0,
): Promise<HoodieVariant> {
  const v = await prisma.hoodieVariant.findUniqueOrThrow({ where: { hoodieId_colorId_sizeId: where } });
  return prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity, reserved } });
}

export function createDrop(
  prisma: PrismaClient,
  o: Partial<{ name: string; slug: string; accentColor: AccentColor; accentHex: string; startsAt: Date; endsAt: Date | null; endedAt: Date | null }> = {},
): Promise<Drop> {
  const n = next();
  return prisma.drop.create({
    data: {
      name: o.name ?? `Drop ${n}`,
      slug: o.slug ?? `drop-${n}`,
      story: 'Test drop',
      accentColor: o.accentColor ?? 'BUTTER',
      accentHex: o.accentHex ?? (o.accentColor === 'SKY' ? '#5CC8FF' : o.accentColor === 'LILAC' ? '#C9B6FF' : '#FFE45C'),
      startsAt: o.startsAt ?? new Date(now().getTime() - 3_600_000),
      endsAt: o.endsAt ?? null,
      endedAt: o.endedAt ?? null,
    },
  });
}

export function createStimpie(
  prisma: PrismaClient,
  o: Partial<{
    name: string; slug: string; type: StimpieType; dropId: number | null; priceCents: number; costCents: number;
    quantity: number; reserved: number; active: boolean;
  }> = {},
): Promise<Stimpie> {
  const n = next();
  return prisma.stimpie.create({
    data: {
      name: o.name ?? `STIMPIE ${n}`,
      slug: o.slug ?? `stimpie-${n}`,
      type: o.type ?? (o.dropId ? 'LIMITED' : 'CORE'),
      dropId: o.dropId ?? null,
      priceCents: o.priceCents ?? 1000,
      costCents: o.costCents ?? 600,
      quantity: o.quantity ?? 20,
      reserved: o.reserved ?? 0,
      story: 'Test story',
      images: [],
      artworkUrl: 'http://localhost:4000/uploads/test/art.webp',
      artworkWidth: 800,
      artworkHeight: 1250,
      active: o.active ?? true,
      position: n,
    },
  });
}

export function createPack(prisma: PrismaClient, o: Partial<{ name: string; slug: string; stimpieCount: number; priceCents: number; badge: string | null; active: boolean }> = {}): Promise<Pack> {
  const n = next();
  const count = o.stimpieCount ?? 1;
  return prisma.pack.create({
    data: {
      name: o.name ?? `Hoodie + ${count} Stimpie${count > 1 ? 's' : ''}`,
      slug: o.slug ?? `pack-${n}`,
      description: 'Test pack',
      stimpieCount: count,
      priceCents: o.priceCents ?? (count === 1 ? 3500 : 4500),
      badge: o.badge ?? null,
      active: o.active ?? true,
      position: n,
    },
  });
}

export function createArea(prisma: PrismaClient, o: Partial<{ name: string; feeCents: number | null; estDays: number | null; active: boolean }> = {}): Promise<Area> {
  const n = next();
  return prisma.area.create({ data: { name: o.name ?? `Area ${n}`, feeCents: o.feeCents ?? null, estDays: o.estDays ?? null, active: o.active ?? true } });
}

/** The six email and four WhatsApp templates with their default copy. */
export async function seedTemplates(prisma: PrismaClient): Promise<void> {
  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { key: t.key }, create: { key: t.key, name: t.name, subject: t.subject, body: t.body, enabled: true }, update: {} });
  }
  for (const t of WHATSAPP_TEMPLATES) {
    await prisma.whatsappTemplate.upsert({ where: { key: t.key }, create: { key: t.key, name: t.name, body: t.body }, update: {} });
  }
}

/** `counters.order_number` row: last issued number (first order gets last + 1). */
export async function seedOrderCounter(prisma: PrismaClient, lastIssued = 1000): Promise<void> {
  await prisma.counter.upsert({ where: { name: 'order_number' }, create: { name: 'order_number', value: lastIssued }, update: { value: lastIssued } });
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

/**
 * A complete small shop: admin, colours Black/Cream, sizes S/M/L, one hoodie (20 units in every variant), packs of 1 and 2
 * Stimpies, core Stimpies (20 each), a LIVE drop with two limited Stimpies (30 each), two areas, templates, counter.
 */
export async function buildWorld(prisma: PrismaClient, o: { hoodieStock?: number; withAdmin?: boolean } = {}) {
  const admin = o.withAdmin === false ? null : await createAdmin(prisma);
  const [black, cream] = [await createColor(prisma, { name: 'Black', hex: '#111111' }), await createColor(prisma, { name: 'Cream', hex: '#FFF4E6' })];
  const [s, m, l] = [await createSize(prisma, { label: 'S' }), await createSize(prisma, { label: 'M' }), await createSize(prisma, { label: 'L' })];
  const hoodie = await createHoodie(prisma, { name: 'Stimpy Hoodie', slug: 'stimpy-hoodie', stock: o.hoodieStock ?? 20 });
  const pack1 = await createPack(prisma, { stimpieCount: 1 });
  const pack2 = await createPack(prisma, { stimpieCount: 2, badge: 'Most popular' });
  const core = [
    await createStimpie(prisma, { name: 'THE VOID', slug: 'the-void' }),
    await createStimpie(prisma, { name: 'AFTER DARK', slug: 'after-dark' }),
    await createStimpie(prisma, { name: 'THE CEDAR', slug: 'the-cedar' }),
  ];
  const drop = await createDrop(prisma, { name: 'Drop 001', slug: 'drop-001' });
  const limited = [
    await createStimpie(prisma, { name: 'THE SIGNAL', slug: 'the-signal', dropId: drop.id, quantity: 30, priceCents: 1200 }),
    await createStimpie(prisma, { name: 'THE STATIC', slug: 'the-static', dropId: drop.id, quantity: 30, priceCents: 1200 }),
  ];
  const areas = [await createArea(prisma, { name: 'Beirut' }), await createArea(prisma, { name: 'Mount Lebanon', feeCents: 500, estDays: 3 })];
  await seedTemplates(prisma);
  await seedOrderCounter(prisma);
  return { admin, colors: { black, cream }, sizes: { s, m, l }, hoodie, packs: { one: pack1, two: pack2 }, core, drop, limited, areas };
}
