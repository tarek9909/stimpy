/**
 * Seed (data-model.md section 8 + a rich demo catalog built from the real Stimpie artwork).
 *
 *   npm run db:seed                 idempotent: creates what is missing, never overwrites what the owner edited
 *   npm run db:seed -- --reset      WIPES every table first (dev only), then seeds from scratch
 *   npm run db:seed -- --minimal    skip the demo Stimpies / drops / placeholder images (config + options + hoodie only)
 *   npm run db:seed -- --no-admin   do not create the admin user
 *
 * Environment: ADMIN_EMAIL / ADMIN_PASSWORD (admin user), DATABASE_URL, UPLOAD_DIR, API_PUBLIC_URL (see .env.example).
 * Everything seeded is editable in the dashboard; values that are guesses are flagged in docs/HANDOFF.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AccentColor, PrismaClient, StimpieType } from '@prisma/client';
import { API_ROOT, loadConfigOrExit } from '../src/config';
import { createContext, type AppContext } from '../src/context';
import { addMs, DAY } from '../src/lib/clock';
import { EMAIL_TEMPLATES, WHATSAPP_TEMPLATES } from '../src/lib/templates-catalog';
import { slugify } from '../src/lib/slug';
import { SETTINGS_DEFAULTS, SETTING_GROUPS } from '../src/services/settings';
import { upsertAdminUser } from '../src/services/auth';
import { ensureVariants } from '../src/services/variants';
import { SEED_PLACEMENT_2D, seedBinary, seedBuilderBack, seedBuilderOverlay, seedHoodiePhoto, seedStimpieArtwork, seedWidePhoto } from './seed-assets';

export type SeedOptions = { minimal?: boolean; admin?: boolean; log?: (msg: string) => void };

const ARTWORK_DIRS = [
  resolve(API_ROOT, '..', 'seed-assets', 'stimpies'),
  resolve(API_ROOT, '..', '..', 'stimpy-video', 'out', 'stimpies'),
  resolve(API_ROOT, '..', '..', 'content', 'stimpy-video', 'out', 'stimpies'),
];
const GLB_FILE = join(API_ROOT, 'seed-assets', 'models', 'hoodie.glb');
const GLB_META_FILE = join(API_ROOT, 'seed-assets', 'models', 'hoodie.meta.json');

type Camera = { position: [number, number, number]; target: [number, number, number]; fov: number };

/** The generator's recommended back-view camera (the model faces +Z, so the back camera sits on -Z). */
function modelCamera(): Camera {
  const fallback: Camera = { position: [0, 0.02, -2.4], target: [0, 0, 0], fov: 32 };
  try {
    const meta = JSON.parse(readFileSync(GLB_META_FILE, 'utf8')) as { recommendedCamera?: Camera };
    return meta.recommendedCamera ?? fallback;
  } catch {
    return fallback;
  }
}

function findArtwork(n: number): string | null {
  const file = `stimpie-${String(n).padStart(3, '0')}.png`;
  for (const d of ARTWORK_DIRS) if (existsSync(join(d, file))) return join(d, file);
  return null;
}
function findPhoto(name: string): string | null {
  for (const d of ARTWORK_DIRS) if (existsSync(join(d, name))) return join(d, name);
  return null;
}

// ================================================================ catalog data

const COLORS = [
  { name: 'Black', hex: '#111111' },
  { name: 'Cream', hex: '#FFF4E6' },
  { name: 'Stone', hex: '#B8B2A7' },
  { name: 'Coral', hex: '#FF7A59' },
];
const SIZES = ['S', 'M', 'L', 'XL'];
/** Placeholder numbers: clearly flagged for the owner to replace. */
const SIZE_CHART = {
  columns: [{ label: 'Chest', unit: 'cm' }, { label: 'Length', unit: 'cm' }, { label: 'Sleeve', unit: 'cm' }],
  rows: { S: ['54', '66', '60'], M: ['57', '69', '62'], L: ['60', '72', '64'], XL: ['63', '75', '66'] } as Record<string, string[]>,
  howTo:
    'PLACEHOLDER MEASUREMENTS: edit me in the dashboard (Products > Size chart).\n\n- **Chest:** lay the hoodie flat and measure straight across, armpit to armpit.\n- **Length:** from the highest point of the shoulder down to the hem.\n- **Sleeve:** from the shoulder seam to the end of the cuff.\n\nBetween two sizes? Take the larger one for a relaxed fit.',
};
/** Stock per variant (colour -> size -> units). Anything not listed gets 20. Includes LOW and SOLD_OUT cases. */
const VARIANT_STOCK: Record<string, Record<string, number>> = {
  Black: { S: 20, M: 4, L: 20, XL: 0 },
  Cream: { S: 0, M: 20, L: 20, XL: 12 },
  Stone: { S: 20, M: 20, L: 7, XL: 20 },
  Coral: { S: 0, M: 3, L: 0, XL: 0 },
};

type DesignSeed = {
  n: number;
  name: string;
  type: StimpieType;
  group: 'core' | 'live' | 'upcoming' | 'archive';
  priceCents: number;
  quantity: number;
  story: string;
};
const DESIGNS: DesignSeed[] = [
  // ---- Core (always available, restocked by hand)
  { n: 0, name: 'STIMPY', type: 'CORE', group: 'core', priceCents: 1000, quantity: 60, story: 'The original mark. The one that started the swap.' },
  { n: 1, name: 'THE VOID', type: 'CORE', group: 'core', priceCents: 1000, quantity: 50, story: 'Everything, switched off. Pure black with a single point of light.' },
  { n: 2, name: 'AFTER DARK', type: 'CORE', group: 'core', priceCents: 1000, quantity: 40, story: 'The city after the last tram. Neon, quiet streets, wet asphalt.' },
  { n: 3, name: 'THE CEDAR', type: 'CORE', group: 'core', priceCents: 1000, quantity: 8, story: 'A tree older than the borders around it. Calm, green, rooted.' },
  { n: 4, name: 'THE DREAMER', type: 'CORE', group: 'core', priceCents: 1000, quantity: 0, story: 'Eyes closed, mind somewhere better. Currently out of stock.' },
  { n: 9, name: 'THE ORBIT', type: 'CORE', group: 'core', priceCents: 1000, quantity: 35, story: 'Small things circling a big idea.' },
  { n: 10, name: 'THE WAVE', type: 'CORE', group: 'core', priceCents: 1000, quantity: 35, story: 'One long line that never breaks.' },
  { n: 11, name: 'THE EYE', type: 'CORE', group: 'core', priceCents: 1000, quantity: 25, story: 'It sees you wearing it.' },
  // ---- Drop 001 (live, Butter)
  { n: 5, name: 'THE SIGNAL', type: 'LIMITED', group: 'live', priceCents: 1200, quantity: 30, story: 'A transmission from nowhere. Tune in while it lasts.' },
  { n: 6, name: 'THE STATIC', type: 'LIMITED', group: 'live', priceCents: 1200, quantity: 4, story: 'The noise between stations. Almost gone.' },
  { n: 12, name: 'THE FLAME', type: 'LIMITED', group: 'live', priceCents: 1500, quantity: 0, story: 'Burned through the first day. Sold out.' },
  // ---- Drop 002 (upcoming, Sky)
  { n: 7, name: 'THE MOTH', type: 'LIMITED', group: 'upcoming', priceCents: 1300, quantity: 30, story: 'Drawn to the light, never to the point.' },
  { n: 8, name: 'THE MAZE', type: 'LIMITED', group: 'upcoming', priceCents: 1300, quantity: 30, story: 'There is a way out. Probably.' },
  { n: 13, name: 'THE SERPENT', type: 'LIMITED', group: 'upcoming', priceCents: 1500, quantity: 25, story: 'Shedding the old skin, one zip at a time.' },
  // ---- Drop 000 (ended, Lilac, sold out)
  { n: 14, name: 'THE MOUNTAIN', type: 'LIMITED', group: 'archive', priceCents: 1400, quantity: 0, story: 'First light on the highest ridge. Sold out in a weekend.' },
  { n: 15, name: 'THE ROSE', type: 'LIMITED', group: 'archive', priceCents: 1400, quantity: 0, story: 'Beautiful and a little dangerous. Gone.' },
  { n: 16, name: 'THE SKULL', type: 'LIMITED', group: 'archive', priceCents: 1400, quantity: 0, story: 'A reminder with good posture. Gone.' },
];

const FAQS = [
  { group: 'How it works', question: 'How does the swap work?', answer: 'The back of every hoodie has a zip panel. Unzip the Stimpie you are wearing, zip in another one, done. It takes a few seconds and needs no tools.' },
  { group: 'Care', question: 'How do I wash it?', answer: 'Remove the Stimpie, wash the hoodie cold inside out, and hand wash or gently machine wash the Stimpie on its own. Line dry.' },
  { group: 'Sizing', question: 'Which size should I take?', answer: 'Check the size chart on the Help page and compare it with a hoodie you already like. Between two sizes, take the larger one.' },
  { group: 'Delivery', question: 'How long does delivery take?', answer: 'We deliver across Lebanon. Most orders arrive in 2-3 working days (the estimate is shown at checkout for your area).' },
  { group: 'Ordering', question: 'How do I pay?', answer: 'Cash on delivery. You pay the courier at the door. No card needed.' },
  { group: 'Ordering', question: 'Can I exchange something?', answer: 'Yes. If it does not fit or you changed your mind, message us within the return window and we will arrange an exchange.' },
  { group: 'Drops', question: 'What is a drop?', answer: 'A drop is a limited set of Stimpies released for a short time. When a limited Stimpie sells out it is never restocked.' },
  { group: 'How it works', question: 'Does the hoodie look good without a Stimpie?', answer: 'Yes. The back panel is a clean blank surface when empty, so the hoodie works on its own.' },
];

const POLICIES = {
  deliveryReturns:
    'PLACEHOLDER: edit me in the dashboard (Content > Policies).\n\n**Delivery.** We deliver across Lebanon, cash on delivery.\n\n**Returns and exchanges.** Contact us after delivery and we will arrange it.',
  care: 'PLACEHOLDER: edit me in the dashboard.\n\n- Wash cold, inside out.\n- Remove the Stimpie before washing.\n- Line dry. Do not tumble dry.',
  terms: 'PLACEHOLDER: edit me in the dashboard.\n\nBy ordering you agree to pay the total on delivery.',
  privacy: 'PLACEHOLDER: edit me in the dashboard.\n\nWe only use your details to deliver and talk about your order.',
};

// ================================================================ helpers

const colorSlug = (name: string): string => slugify(name);

async function createIfMissing(prisma: PrismaClient, table: 'setting' | 'contentBlock' | 'builderConfig', key: string, value: unknown): Promise<boolean> {
  const delegate = prisma[table] as unknown as {
    findUnique(a: { where: { key: string } }): Promise<unknown>;
    create(a: { data: { key: string; value: unknown } }): Promise<unknown>;
  };
  if (await delegate.findUnique({ where: { key } })) return false;
  await delegate.create({ data: { key, value } });
  return true;
}

/** Deletes every row in every table (dev only). */
export async function wipeDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
  await prisma.$transaction([
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...rows.map((r) => prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${r.name}\``)),
    prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}

// ================================================================ the seed

export async function runSeed(ctx: AppContext, opts: SeedOptions = {}): Promise<void> {
  const prisma = ctx.prisma;
  const log = opts.log ?? ((m: string) => console.log(m));
  const now = new Date();

  // ---- admin user
  if (opts.admin !== false) {
    const { adminEmail, adminPassword } = ctx.config;
    if (!adminEmail || !adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the admin user (or pass --no-admin).');
    const { user, created } = await upsertAdminUser(ctx, { email: adminEmail, password: adminPassword }, { updatePassword: false });
    log(`admin: ${user.email} (${created ? 'created' : 'already existed, password unchanged'})`);
  }

  // ---- settings (all six groups, defaults) + order counter
  for (const g of SETTING_GROUPS) await createIfMissing(prisma, 'setting', g, SETTINGS_DEFAULTS[g]);
  await prisma.counter.upsert({
    where: { name: 'order_number' },
    create: { name: 'order_number', value: SETTINGS_DEFAULTS.orders.firstNumber - 1 },
    update: {},
  });

  // ---- colours and sizes
  const colors = [];
  for (const [i, c] of COLORS.entries()) {
    colors.push(
      await prisma.color.upsert({
        where: { name: c.name },
        create: { name: c.name, hex: c.hex, position: i + 1, active: true, images: [], builderTint: c.hex },
        update: {},
      }),
    );
  }
  const sizes = [];
  for (const [i, label] of SIZES.entries()) {
    sizes.push(await prisma.size.upsert({ where: { label }, create: { label, position: i + 1, active: true }, update: {} }));
  }

  // ---- size chart (placeholder numbers) + how to measure
  if ((await prisma.sizeChartColumn.count()) === 0) {
    const cols = [];
    for (const [i, c] of SIZE_CHART.columns.entries()) cols.push(await prisma.sizeChartColumn.create({ data: { ...c, position: i } }));
    for (const s of sizes) {
      const vals = SIZE_CHART.rows[s.label];
      if (!vals) continue;
      await prisma.sizeChartValue.createMany({ data: cols.map((c, i) => ({ sizeId: s.id, columnId: c.id, value: vals[i]! })) });
    }
  }
  await createIfMissing(prisma, 'contentBlock', 'size_chart_howto', { text: SIZE_CHART.howTo });

  // ---- hoodie + variants + stock
  const hoodie = await prisma.hoodie.upsert({
    where: { slug: 'stimpy-hoodie' },
    create: {
      name: 'Stimpy Hoodie',
      slug: 'stimpy-hoodie',
      description: 'The one hoodie. A heavyweight zip hoodie with a swappable back panel: change your look in seconds.',
      details: ['Heavyweight brushed fleece (placeholder spec)', 'Zip-in back panel for any Stimpie', 'Relaxed unisex fit', 'Ribbed cuffs and hem'],
      priceCents: 2500,
      costCents: 1000,
      images: [],
      active: true,
      position: 1,
    },
    update: {},
  });
  await prisma.$transaction((tx) => ensureVariants(tx, { hoodieId: hoodie.id }));
  const variants = await prisma.hoodieVariant.findMany({ where: { hoodieId: hoodie.id } });
  let stocked = 0;
  for (const v of variants) {
    if ((await prisma.stockMovement.count({ where: { variantId: v.id } })) > 0) continue; // never touch a variant that has history
    const color = colors.find((c) => c.id === v.colorId)!;
    const size = sizes.find((s) => s.id === v.sizeId)!;
    const qty = VARIANT_STOCK[color.name]?.[size.label] ?? 20;
    if (qty > 0) {
      await prisma.$transaction([
        prisma.hoodieVariant.update({ where: { id: v.id }, data: { quantity: qty } }),
        prisma.stockMovement.create({ data: { itemType: 'HOODIE_VARIANT', variantId: v.id, field: 'QUANTITY', delta: qty, reason: 'INITIAL', note: 'Seed data' } }),
      ]);
      stocked++;
    }
  }
  log(`hoodie: ${hoodie.name}, ${variants.length} variants (${stocked} newly stocked)`);

  // ---- packs
  await prisma.pack.upsert({
    where: { slug: 'hoodie-1-stimpie' },
    create: { name: 'Hoodie + 1 Stimpie', slug: 'hoodie-1-stimpie', description: 'The hoodie and one Stimpie of your choice.', stimpieCount: 1, priceCents: 3500, badge: null, active: true, position: 1 },
    update: {},
  });
  await prisma.pack.upsert({
    where: { slug: 'hoodie-2-stimpies' },
    create: { name: 'Hoodie + 2 Stimpies', slug: 'hoodie-2-stimpies', description: 'The hoodie and two different Stimpies: two looks from day one.', stimpieCount: 2, priceCents: 4500, badge: 'Most popular', active: true, position: 2 },
    update: {},
  });

  // ---- areas (names only, no fees)
  for (const name of ['Beirut', 'Mount Lebanon', 'North', 'South', 'Bekaa', 'Nabatieh']) {
    await prisma.area.upsert({ where: { name }, create: { name, feeCents: null, estDays: null, active: true }, update: {} });
  }

  // ---- email + WhatsApp templates
  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { key: t.key }, create: { key: t.key, name: t.name, subject: t.subject, body: t.body, enabled: true }, update: {} });
  }
  for (const t of WHATSAPP_TEMPLATES) {
    await prisma.whatsappTemplate.upsert({ where: { key: t.key }, create: { key: t.key, name: t.name, body: t.body }, update: {} });
  }

  // ---- FAQs
  for (const [i, f] of FAQS.entries()) {
    if (!(await prisma.faq.findFirst({ where: { question: f.question } }))) {
      await prisma.faq.create({ data: { ...f, showOnHome: i < 4, position: i + 1 } });
    }
  }

  // ---- content blocks (placeholder copy; shapes documented in docs/HANDOFF.md)
  await createIfMissing(prisma, 'contentBlock', 'announcement', { enabled: false, text: 'Drop 002 lands soon. Subscribe to be first.', linkUrl: null });
  await createIfMissing(prisma, 'contentBlock', 'homepage', {
    heroHeadline: 'One hoodie. Multiple identities.',
    heroSubheadline: 'Zip in a new back in seconds.',
    heroVideoUrl: null,
    heroImageUrl: null,
    featuredDropSlug: null,
  });
  await createIfMissing(prisma, 'contentBlock', 'about', { text: 'PLACEHOLDER: edit me in the dashboard (Content > About).\n\nStimpy is one hoodie with a swappable back. Wear your mood.' });
  await createIfMissing(prisma, 'contentBlock', 'how_it_works', {
    steps: [
      { title: 'Pick your hoodie', text: 'Choose a colour and size.', mediaUrl: null },
      { title: 'Pick your Stimpie', text: 'Choose the back panel that matches your mood.', mediaUrl: null },
      { title: 'Zip it in', text: 'Swap it any time in seconds.', mediaUrl: null },
    ],
    promises: ['Zip cycles tested for daily swapping', 'Wash-tested fabric that keeps its shape', 'Panels that hang flat, never bunch'],
    faqs: [],
  });
  await createIfMissing(prisma, 'contentBlock', 'policies', POLICIES);

  // ---- builder config (2D until a model exists)
  const back2d: { colorId: number; asset: Awaited<ReturnType<typeof seedBuilderOverlay>> }[] = [];
  let overlay: Awaited<ReturnType<typeof seedBuilderOverlay>> | null = null;
  if (!opts.minimal) {
    // placeholder product photos (front + back per colour) and the 2D builder assets
    for (const c of colors) {
      const front = await seedHoodiePhoto(ctx, { colorSlug: colorSlug(c.name), hex: c.hex, view: 'front' });
      const back = await seedHoodiePhoto(ctx, { colorSlug: colorSlug(c.name), hex: c.hex, view: 'back' });
      const fresh = await prisma.color.findUniqueOrThrow({ where: { id: c.id } });
      if (Array.isArray(fresh.images) && fresh.images.length === 0) {
        await prisma.color.update({ where: { id: c.id }, data: { images: [front.url, back.url] } });
      }
      back2d.push({ colorId: c.id, asset: await seedBuilderBack(ctx, { colorSlug: colorSlug(c.name), hex: c.hex }) });
    }
    overlay = await seedBuilderOverlay(ctx);
    const h = (await prisma.hoodie.findUniqueOrThrow({ where: { id: hoodie.id } }));
    if (Array.isArray(h.images) && h.images.length === 0) {
      const black = colors[0]!;
      const f = await seedHoodiePhoto(ctx, { colorSlug: colorSlug(black.name), hex: black.hex, view: 'front' });
      const b = await seedHoodiePhoto(ctx, { colorSlug: colorSlug(black.name), hex: black.hex, view: 'back' });
      await prisma.hoodie.update({ where: { id: hoodie.id }, data: { images: [f.url, b.url] } });
    }
  }

  // ---- demo catalog: drops + 17 Stimpies from the real artwork
  const textures: { stimpieId: number; textureUrl: string }[] = [];
  if (!opts.minimal) {
    const lookbookSrc = findPhoto('lookbook.jpg');
    const lookbook = lookbookSrc ? await seedWidePhoto(ctx, { name: 'lookbook', sourceFile: lookbookSrc }) : null;
    if (lookbook) {
      const home = await prisma.contentBlock.findUnique({ where: { key: 'homepage' } });
      const hv = home?.value as Record<string, unknown> | null;
      if (hv && hv.heroImageUrl == null) await prisma.contentBlock.update({ where: { key: 'homepage' }, data: { value: { ...hv, heroImageUrl: lookbook.url } } });
    }

    const dropDefs: { group: DesignSeed['group']; slug: string; name: string; accent: AccentColor; story: string; startsAt: Date; endsAt: Date | null; endedAt: Date | null; teaser: string | null }[] = [
      { group: 'archive', slug: 'drop-000', name: 'Drop 000: First Light', accent: 'LILAC', story: 'Where it started. Three Stimpies, three days, all gone.', startsAt: addMs(now, -60 * DAY), endsAt: addMs(now, -45 * DAY), endedAt: addMs(now, -45 * DAY), teaser: null },
      { group: 'live', slug: 'drop-001', name: 'Drop 001: Signal', accent: 'BUTTER', story: 'The first numbered drop. Limited, never restocked.', startsAt: addMs(now, -2 * DAY), endsAt: addMs(now, 12 * DAY), endedAt: null, teaser: lookbook?.url ?? null },
      { group: 'upcoming', slug: 'drop-002', name: 'Drop 002: Night Flight', accent: 'SKY', story: 'Moths, mazes and one very long snake. Starts in two weeks.', startsAt: addMs(now, 14 * DAY), endsAt: addMs(now, 28 * DAY), endedAt: null, teaser: null },
    ];
    const dropIds: Record<string, number> = {};
    for (const d of dropDefs) {
      const row = await prisma.drop.upsert({
        where: { slug: d.slug },
        create: { name: d.name, slug: d.slug, story: d.story, accentColor: d.accent, startsAt: d.startsAt, endsAt: d.endsAt, endedAt: d.endedAt, teaserImage: d.teaser, teaserVideo: null },
        update: {},
      });
      dropIds[d.group] = row.id;
    }

    let position = 0;
    for (const d of DESIGNS) {
      position++;
      const slug = slugify(d.name);
      const source = findArtwork(d.n);
      if (!source) {
        log(`WARNING: artwork for ${d.name} (stimpie-${String(d.n).padStart(3, '0')}.png) not found, skipped`);
        continue;
      }
      const { artwork, texture } = await seedStimpieArtwork(ctx, { slug, sourceFile: source });
      const dropId = d.group === 'core' ? null : dropIds[d.group]!;
      const existing = await prisma.stimpie.findUnique({ where: { slug } });
      const row =
        existing ??
        (await prisma.stimpie.create({
          data: {
            name: d.name, slug, type: d.type, dropId, priceCents: d.priceCents, costCents: d.type === 'CORE' ? 600 : 700,
            quantity: 0, reserved: 0, story: d.story, images: [artwork.url], artworkUrl: artwork.url,
            artworkWidth: artwork.width, artworkHeight: artwork.height, active: true, position,
          },
        }));
      if (!existing && d.quantity > 0) {
        await prisma.$transaction([
          prisma.stimpie.update({ where: { id: row.id }, data: { quantity: d.quantity } }),
          prisma.stockMovement.create({ data: { itemType: 'STIMPIE', stimpieId: row.id, field: 'QUANTITY', delta: d.quantity, reason: 'INITIAL', note: 'Seed data' } }),
        ]);
      }
      textures.push({ stimpieId: row.id, textureUrl: texture.url });
    }
    log(`catalog: ${DESIGNS.length} Stimpies, 3 drops`);
  }

  // ---- builder config
  const model = existsSync(GLB_FILE) ? await seedBinary(ctx, { name: 'hoodie', ext: 'glb', mime: 'model/gltf-binary', buffer: readFileSync(GLB_FILE) }) : null;
  await createIfMissing(prisma, 'builderConfig', 'mode', model ? 'BOTH' : '2D');
  await createIfMissing(prisma, 'builderConfig', 'defaultView', model ? '3D' : '2D');
  await createIfMissing(prisma, 'builderConfig', 'hoodieId', hoodie.id);
  await createIfMissing(prisma, 'builderConfig', 'model3d', null);
  await createIfMissing(
    prisma,
    'builderConfig',
    'colors',
    back2d.map((b) => ({ colorId: b.colorId, hoodieImage2d: b.asset.url, overlay2d: overlay?.url ?? null, placement2d: { ...SEED_PLACEMENT_2D } })),
  );
  await createIfMissing(prisma, 'builderConfig', 'stimpieTextures', textures);
  // A model that appears after the first run is picked up here (only while no model is configured).
  const current = await prisma.builderConfig.findUnique({ where: { key: 'model3d' } });
  if (model && (current?.value ?? null) === null) {
    await prisma.builderConfig.update({
      where: { key: 'model3d' },
      data: {
        value: {
          url: model.url,
          sizeBytes: model.sizeBytes,
          backPanelMesh: 'back_panel',
          panelAspect: 0.64,
          camera: modelCamera(),
          lighting: 'STUDIO',
        },
      },
    });
    await prisma.builderConfig.update({ where: { key: 'mode' }, data: { value: 'BOTH' } });
    await prisma.builderConfig.update({ where: { key: 'defaultView' }, data: { value: '3D' } });
    log('builder: 3D model attached from seed-assets/models/hoodie.glb, mode BOTH');
  } else {
    log(`builder: ${model ? '3D model already configured' : 'no seed-assets/models/hoodie.glb yet: mode 2D (re-run the seed once the file exists)'}`);
  }
}

// ================================================================ CLI

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const config = loadConfigOrExit();
  const ctx = createContext(config);
  try {
    const db = new URL(config.databaseUrl).pathname.replace(/^\//, '');
    if (args.has('--reset')) {
      if (config.isProduction) throw new Error('--reset is refused in production.');
      console.log(`Resetting database "${db}" (all tables emptied)...`);
      await wipeDatabase(ctx.prisma);
    }
    console.log(`Seeding database "${db}"...`);
    await runSeed(ctx, { minimal: args.has('--minimal'), admin: !args.has('--no-admin') });
    console.log('Seed finished.');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await ctx.prisma.$disconnect();
  }
}
