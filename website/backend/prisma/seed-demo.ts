/**
 * seed:demo: ~30 fake orders in every status over the last weeks, so the dashboard has something to show.
 * NEVER run in production. Run `npm run db:seed` first (it creates the catalog the orders are placed against).
 *
 *   npm run db:seed:demo
 *
 * Orders are created through the real service (`placeOrder`, then `changeStatus`), so stock, counters, events and
 * e-mail rows are exactly what production code produces. Each order's timeline is spread over hours after it was placed
 * (every status change gets an explicit `at`, never later than now), and stock movements carry the same timestamps.
 * Refuses to run when orders already exist (pass --force to add more).
 */
import { pathToFileURL } from 'node:url';
import { loadConfigOrExit } from '../src/config';
import { createContext, type AppContext } from '../src/context';
import { DAY, HOUR, now } from '../src/lib/clock';
import { changeStatus, placeOrder, type OrderStatusName, type PlaceOrderInput } from '../src/services/orders';
import type { CartItemInput } from '../src/services/pricing';

const FIRST = ['Rami', 'Lara', 'Karim', 'Nour', 'Elie', 'Maya', 'Joe', 'Dana', 'Tony', 'Rita', 'Sami', 'Yara', 'Omar', 'Hala', 'Fadi'];
const LAST = ['Haddad', 'Khoury', 'Nasr', 'Saab', 'Aoun', 'Gemayel', 'Hage', 'Daher', 'Mansour', 'Frem'];
const STREETS = ['Hamra Street', 'Gemmayzeh, Armenia St', 'Jounieh Highway', 'Zahle Main Road', 'Sidon Corniche', 'Tripoli, Azmi St', 'Nabatieh Souk'];
const STATUS_MIX: OrderStatusName[] = [
  'NEW', 'NEW', 'NEW', 'NEW', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'PACKED', 'PACKED', 'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY',
  ...Array<OrderStatusName>(10).fill('DELIVERED'), 'CANCELLED', 'CANCELLED', 'RETURNED', 'RETURNED',
];
/** The legal path from NEW to each target status. */
const PATH: Record<OrderStatusName, OrderStatusName[]> = {
  NEW: [], CONFIRMED: ['CONFIRMED'], PACKED: ['CONFIRMED', 'PACKED'], OUT_FOR_DELIVERY: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'],
  DELIVERED: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'], CANCELLED: ['CANCELLED'],
  RETURNED: ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'RETURNED'],
};

const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length]!;

export async function seedDemoOrders(ctx: AppContext, count = 30): Promise<number> {
  const { prisma } = ctx;
  const [hoodie, packs, areas, stimpies] = await Promise.all([
    prisma.hoodie.findFirst({ where: { active: true }, include: { variants: { where: { quantity: { gt: 0 } } } } }),
    prisma.pack.findMany({ where: { active: true }, orderBy: { position: 'asc' } }),
    prisma.area.findMany({ where: { active: true } }),
    prisma.stimpie.findMany({ where: { active: true, quantity: { gt: 5 }, OR: [{ dropId: null }, { drop: { endedAt: null, startsAt: { lte: new Date() } } }] } }),
  ]);
  if (!hoodie || !hoodie.variants.length || !packs.length || !stimpies.length) throw new Error('Run `npm run db:seed` first: the catalog is empty.');

  let placed = 0;
  for (let i = 0; i < count; i++) {
    const variant = pick(hoodie.variants, i * 3);
    const pack = pick(packs, i);
    const chosen: number[] = [];
    for (let k = 0; chosen.length < pack.stimpieCount; k++) {
      const s = pick(stimpies, i * 5 + k * 2 + 1);
      if (!chosen.includes(s.id)) chosen.push(s.id);
    }
    const items: CartItemInput[] = [
      { kind: 'pack', packId: pack.id, hoodieId: hoodie.id, colorId: variant.colorId, sizeId: variant.sizeId, stimpieIds: chosen, qty: 1 },
    ];
    if (i % 4 === 0) items.push({ kind: 'stimpie', stimpieId: pick(stimpies, i + 7).id, qty: 1 });
    const area = pick(areas, i);
    const daysAgo = Math.floor((i / count) * 28);
    const phone = `+9613${String(100000 + i * 7919).slice(0, 6)}`;
    const input: PlaceOrderInput = {
      customer: { name: `${pick(FIRST, i)} ${pick(LAST, i * 3)}`, email: `${pick(FIRST, i).toLowerCase()}${i}@example.com`, phone, whatsapp: null, whatsappSameAsPhone: true },
      delivery: { areaId: area.id, areaName: area.name, address: `${pick(STREETS, i)}, building ${i + 1}`, notes: i % 5 === 0 ? 'Call before arriving' : null },
      items,
      source: i % 6 === 0 ? 'INSTAGRAM' : i % 9 === 0 ? 'WHATSAPP' : 'WEBSITE',
      attribution: i % 3 === 0 ? { utmSource: 'instagram', utmMedium: 'story', utmCampaign: 'drop-001' } : undefined,
      placedAt: new Date(Date.now() - daysAgo * DAY - i * 3_600_000),
    };
    const { orderId } = await placeOrder(ctx, input);
    let step = 0;
    for (const to of PATH[pick(STATUS_MIX, i)]) {
      step += 1;
      // confirmed a few hours after placing, then roughly half a day per step; never in the future
      const at = new Date(Math.min(input.placedAt!.getTime() + (step === 1 ? 3 : 10 * step) * HOUR, now().getTime()));
      await changeStatus(ctx, {
        orderId, to, userId: null, at,
        ...(to === 'OUT_FOR_DELIVERY' ? { deliveryNumber: `DLV-${1000 + Math.floor(i / 3)}` } : {}),
        ...(to === 'CANCELLED' ? { cancelReason: 'Demo: customer changed their mind' } : {}),
      });
    }
    placed++;
  }
  return placed;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const config = loadConfigOrExit();
  if (config.isProduction) {
    console.error('seed:demo is refused in production.');
    process.exit(1);
  }
  const ctx = createContext(config);
  try {
    if ((await ctx.prisma.order.count()) > 0 && !process.argv.includes('--force')) {
      console.error('Orders already exist. Pass --force to add 30 more demo orders.');
      process.exit(1);
    }
    const n = await seedDemoOrders(ctx, 30);
    console.log(`Created ${n} demo orders.`);
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    console.error(e.message ?? err);
    process.exitCode = 1;
  } finally {
    await ctx.prisma.$disconnect();
  }
}
