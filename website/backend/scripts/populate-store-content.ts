import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { createContext } from '../src/context';
import { loadConfigOrExit } from '../src/config';
import { putSizeChart } from '../src/modules/options/service';
import { ABOUT_TEXT, DESIGN_STORY_UPDATES, DROP_STORY_UPDATES, FAQS, HOODIE_COPY, HOW_IT_WORKS, POLICIES, SIZE_GUIDE, STORE_CONTACT, STORE_DELIVERY } from '../prisma/store-content';

type JsonObject = Record<string, unknown>;
const asObject = (value: Prisma.JsonValue | null | undefined): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
const toJson = (value: JsonObject): Prisma.InputJsonValue => value as Prisma.InputJsonObject;

const legacyStimpieStories: Record<string, string> = {
  'the-dreamer': 'Eyes closed, mind somewhere better. Currently out of stock.',
  'the-static': 'The noise between stations. Almost gone.',
  'the-flame': 'Burned through the first day. Sold out.',
  'the-mountain': 'First light on the highest ridge. Sold out in a weekend.',
  'the-rose': 'Beautiful and a little dangerous. Gone.',
  'the-skull': 'A reminder with good posture. Gone.',
};
const legacyDropStories: Record<string, string> = {
  'drop-000': 'Where it started. Three Stimpies, three days, all gone.',
  'drop-001': 'The first numbered drop. Limited, never restocked.',
  'drop-002': 'Moths, mazes and one very long snake. Starts in two weeks.',
};
const legacyFaqAnswers: Record<string, string> = {
  'What is a Stimpie?': 'A Stimpie is a 30 × 40 cm interchangeable artwork panel for the back of your Stimpy hoodie. Choose one that feels like you, then swap it for another whenever you want a different look.',
  'How do I wash it?': 'Remove the Stimpie, wash the hoodie cold inside out, and hand wash or gently machine wash the Stimpie on its own. Line dry.',
  'Which size should I take?': 'Check the size chart on the Help page and compare it with a hoodie you already like. Between two sizes, take the larger one.',
  'How long does delivery take?': 'We deliver across Lebanon. Most orders arrive in 2-3 working days (the estimate is shown at checkout for your area).',
  'Can I exchange something?': 'Yes. If it does not fit or you changed your mind, message us within the return window and we will arrange an exchange.',
  'What is a drop?': 'A drop is a limited set of Stimpies released for a short time. When a limited Stimpie sells out it is never restocked.',
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const config = loadConfigOrExit();
  const ctx = createContext(config);
  const prisma = ctx.prisma;
  try {
    const [businessRow, emailRow, deliveryRow, announcement, about, how, policies, howTo, hoodie, columns, sizes, chartValues, faqs, stimpies, drops, packs] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'business' } }),
      prisma.setting.findUnique({ where: { key: 'email' } }),
      prisma.setting.findUnique({ where: { key: 'delivery' } }),
      prisma.contentBlock.findUnique({ where: { key: 'announcement' } }),
      prisma.contentBlock.findUnique({ where: { key: 'about' } }),
      prisma.contentBlock.findUnique({ where: { key: 'how_it_works' } }),
      prisma.contentBlock.findUnique({ where: { key: 'policies' } }),
      prisma.contentBlock.findUnique({ where: { key: 'size_chart_howto' } }),
      prisma.hoodie.findUnique({ where: { slug: 'stimpy-hoodie' }, select: { id: true, name: true, slug: true, description: true, details: true } }),
      prisma.sizeChartColumn.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      prisma.size.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      prisma.sizeChartValue.findMany(),
      prisma.faq.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      prisma.stimpie.findMany({ where: { slug: { in: Object.keys(DESIGN_STORY_UPDATES) } }, select: { slug: true, story: true } }),
      prisma.drop.findMany({ where: { slug: { in: Object.keys(DROP_STORY_UPDATES) } }, select: { slug: true, story: true } }),
      prisma.pack.findMany({ where: { slug: { in: ['hoodie-2-stimpies', 'asdasdasdadasd'] } }, select: { id: true, slug: true, name: true, description: true, stimpieCount: true, priceCents: true, badge: true, active: true, position: true } }),
    ]);

    // A review copy of only the content this script may change. SMTP credentials and customer/order data are excluded.
    const backupDir = resolve(process.cwd(), '.tmp-content');
    await mkdir(backupDir, { recursive: true });
    const backupPath = resolve(backupDir, `store-content-before-${new Date().toISOString().replaceAll(':', '-')}.json`);
    const emailSettings = asObject(emailRow?.value);
    const backup = {
      createdAt: new Date().toISOString(),
      settings: {
        business: (() => { const b = asObject(businessRow?.value); return { supportEmail: b.supportEmail ?? null, whatsappNumber: b.whatsappNumber ?? null }; })(),
        email: { senderName: emailSettings.senderName ?? null, senderAddress: emailSettings.senderAddress ?? null, replyTo: emailSettings.replyTo ?? null, footerText: emailSettings.footerText ?? null },
        delivery: (() => { const d = asObject(deliveryRow?.value); return { defaultFeeCents: d.defaultFeeCents ?? null, estimateText: d.estimateText ?? null }; })(),
      },
      contentBlocks: { announcement: announcement?.value ?? null, about: about?.value ?? null, how_it_works: how?.value ?? null, policies: policies?.value ?? null, size_chart_howto: howTo?.value ?? null },
      hoodie,
      sizeChart: { columns, sizes: sizes.map(({ id, label, position, active }) => ({ id, label, position, active })), values: chartValues },
      faqs,
      stimpieStories: stimpies,
      dropStories: drops,
      packs,
    };
    await writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf8');

    if (!apply) {
      console.log(`Dry run. Review ${backupPath}, then pass --apply to update saved store content.`);
      console.log(`Would publish ${Object.keys(SIZE_GUIDE.rows).length} size rows and update approved contact, delivery, policy, FAQ, product and story copy.`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const business = asObject((await tx.setting.findUnique({ where: { key: 'business' } }))?.value);
      await tx.setting.upsert({
        where: { key: 'business' },
        create: { key: 'business', value: toJson({ ...business, supportEmail: STORE_CONTACT.supportEmail, whatsappNumber: null }) },
        update: { value: toJson({ ...business, supportEmail: STORE_CONTACT.supportEmail, whatsappNumber: null }) },
      });

      const delivery = asObject((await tx.setting.findUnique({ where: { key: 'delivery' } }))?.value);
      await tx.setting.upsert({
        where: { key: 'delivery' },
        create: { key: 'delivery', value: toJson({ ...delivery, ...STORE_DELIVERY }) },
        update: { value: toJson({ ...delivery, ...STORE_DELIVERY }) },
      });

      const email = asObject((await tx.setting.findUnique({ where: { key: 'email' } }))?.value);
      const currentSender = typeof email.senderAddress === 'string' ? email.senderAddress : '';
      const currentReplyTo = typeof email.replyTo === 'string' ? email.replyTo : '';
      const isPlaceholderAddress = (value: string) => !value || /@stimpy\.local$/i.test(value);
      if (isPlaceholderAddress(currentSender) || isPlaceholderAddress(currentReplyTo)) {
        await tx.setting.upsert({
          where: { key: 'email' },
          create: { key: 'email', value: toJson({ ...email, senderAddress: STORE_CONTACT.supportEmail, replyTo: STORE_CONTACT.supportEmail }) },
          update: { value: toJson({ ...email, senderAddress: isPlaceholderAddress(currentSender) ? STORE_CONTACT.supportEmail : currentSender, replyTo: isPlaceholderAddress(currentReplyTo) ? STORE_CONTACT.supportEmail : currentReplyTo }) },
        });
      }

      await tx.contentBlock.upsert({ where: { key: 'about' }, create: { key: 'about', value: { text: ABOUT_TEXT } }, update: { value: { text: ABOUT_TEXT } } });
      await tx.contentBlock.upsert({ where: { key: 'how_it_works' }, create: { key: 'how_it_works', value: HOW_IT_WORKS }, update: { value: HOW_IT_WORKS } });
      await tx.contentBlock.upsert({ where: { key: 'policies' }, create: { key: 'policies', value: POLICIES }, update: { value: POLICIES } });

      const currentAnnouncement = await tx.contentBlock.findUnique({ where: { key: 'announcement' } });
      const announcementValue = asObject(currentAnnouncement?.value);
      if (/drop\s*002\s*lands\s*soon/i.test(String(announcementValue.text ?? ''))) {
        await tx.contentBlock.update({ where: { key: 'announcement' }, data: { value: { ...announcementValue, text: 'One hoodie. Multiple identities.' } } });
      }

      await tx.hoodie.updateMany({ where: { slug: 'stimpy-hoodie' }, data: { description: HOODIE_COPY.description, details: HOODIE_COPY.details } });
      // This label was an unsupported popularity claim. The pack description already explains the two-look offer.
      await tx.pack.updateMany({ where: { slug: 'hoodie-2-stimpies', badge: 'Most popular' }, data: { badge: null } });
      // This is the clearly identifiable dashboard test pack; deactivate it without deleting historical records.
      await tx.pack.updateMany({ where: { slug: 'asdasdasdadasd', name: 'asdasdasdadasd', active: true }, data: { active: false } });

      for (const [slug, story] of Object.entries(DESIGN_STORY_UPDATES)) {
        const current = legacyStimpieStories[slug];
        if (current) await tx.stimpie.updateMany({ where: { slug, story: current }, data: { story } });
      }
      for (const [slug, story] of Object.entries(DROP_STORY_UPDATES)) {
        const current = legacyDropStories[slug];
        if (current) await tx.drop.updateMany({ where: { slug, story: current }, data: { story } });
      }

      const desiredByQuestion = new Map(FAQS.map((f) => [f.question, f]));
      for (const [oldQuestion, staleAnswer] of Object.entries(legacyFaqAnswers)) {
        const existing = await tx.faq.findFirst({ where: { question: oldQuestion } });
        if (!existing || existing.answer !== staleAnswer) continue;
        const replacement = oldQuestion === 'How do I wash it?'
          ? desiredByQuestion.get('Where can I ask about care instructions?')
          : oldQuestion === 'Can I exchange something?'
            ? desiredByQuestion.get('How can I contact Stimpy about my order?')
            : desiredByQuestion.get(oldQuestion);
        if (replacement) await tx.faq.update({ where: { id: existing.id }, data: { question: replacement.question, answer: replacement.answer, group: replacement.group, showOnHome: replacement.showOnHome } });
      }

      // Retain the original, already-good plain-hoodie FAQ instead of publishing a second version of the same answer.
      await tx.faq.deleteMany({ where: { question: 'Can I wear the hoodie without a Stimpie?' } });

      let nextFaqPosition = (await tx.faq.aggregate({ _max: { position: true } }))._max.position ?? 0;
      for (const faq of FAQS) {
        if (await tx.faq.findFirst({ where: { question: faq.question } })) continue;
        nextFaqPosition += 1;
        await tx.faq.create({ data: { ...faq, position: nextFaqPosition } });
      }
    });

    const labels = Object.keys(SIZE_GUIDE.rows);
    for (const [i, label] of labels.entries()) {
      await prisma.size.upsert({
        where: { label },
        create: { label, position: i + 1, active: true },
        update: { position: i + 1 },
      });
    }

    const existingColumns = await prisma.sizeChartColumn.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
    const chartColumns = SIZE_GUIDE.columns.map((column, index) => ({
      ...(existingColumns[index] ? { id: existingColumns[index]!.id } : {}),
      ...column,
      position: index,
    }));
    const chartRows = await prisma.size.findMany({ where: { label: { in: labels } } });
    const sizeIdByLabel = new Map(chartRows.map((size) => [size.label, size.id]));
    const rows = labels.map((label) => {
      const values = SIZE_GUIDE.rows[label]!;
      return {
        sizeId: sizeIdByLabel.get(label)!,
        values: Object.fromEntries(values.map((value, index) => [chartColumns[index]?.id === undefined ? `new:${index}` : String(chartColumns[index]!.id), value])),
      };
    });
    await putSizeChart(ctx, { columns: chartColumns, rows, howToMeasure: SIZE_GUIDE.howTo });

    console.log(`Updated content. Backup saved at ${backupPath}.`);
    console.log('Updated public contact and delivery settings, customer content, hoodie facts, size chart, and stale catalog copy. Prices, stock, promotion visibility, homepage selections, and SMTP credentials were preserved.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
