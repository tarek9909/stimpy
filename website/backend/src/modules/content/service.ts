import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AppContext } from '../../context';
import { jsonStringArray, type Db } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { toPage, toSkipTake } from '../../lib/http';
import { applyOrder } from '../../lib/reorder';
import { parseOrThrow } from '../../lib/zod-errors';
import {
  aboutPut,
  aboutPutText,
  announcementPut,
  homepagePut,
  howItWorksPut,
  howItWorksPutWrapped,
  policiesPut,
  type ContentKey,
  type FaqListQuery,
  type ReviewListQuery,
  type faqCreateBody,
  type faqUpdateBody,
  type reviewCreateBody,
  type reviewUpdateBody,
} from './schemas';

// ================================================================ content blocks

/** Keys in `content_blocks` (`how_it_works` uses an underscore there; the URL key is `how-it-works`). */
const BLOCK_KEY: Record<ContentKey, string> = {
  announcement: 'announcement',
  homepage: 'homepage',
  policies: 'policies',
  about: 'about',
  'how-it-works': 'how_it_works',
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

async function readBlock(db: Db, key: ContentKey): Promise<Obj> {
  const row = await db.contentBlock.findUnique({ where: { key: BLOCK_KEY[key] } });
  return obj(row?.value);
}

export type AnnouncementBlock = { enabled: boolean; text: string; linkUrl: string | null };
export type HomepageBlock = { heroHeadline: string; heroSubheadline: string; heroVideoUrl: string | null; heroImageUrl: string | null; featuredDropSlug: string | null };
export type PoliciesBlock = { deliveryReturns: string; care: string; terms: string; privacy: string };
export type HowItWorksBlock = {
  steps: { title: string; text: string; mediaUrl: string | null }[];
  promises: string[];
  faqs: { question: string; answer: string }[];
};

export async function readAnnouncement(db: Db): Promise<AnnouncementBlock> {
  const v = await readBlock(db, 'announcement');
  return { enabled: v.enabled === true, text: str(v.text), linkUrl: strOrNull(v.linkUrl) };
}
export async function readHomepage(db: Db): Promise<HomepageBlock> {
  const v = await readBlock(db, 'homepage');
  return {
    heroHeadline: str(v.heroHeadline),
    heroSubheadline: str(v.heroSubheadline),
    heroVideoUrl: strOrNull(v.heroVideoUrl),
    heroImageUrl: strOrNull(v.heroImageUrl),
    featuredDropSlug: strOrNull(v.featuredDropSlug),
  };
}
export async function readPolicies(db: Db): Promise<PoliciesBlock> {
  const v = await readBlock(db, 'policies');
  return { deliveryReturns: str(v.deliveryReturns), care: str(v.care), terms: str(v.terms), privacy: str(v.privacy) };
}
export async function readAbout(db: Db): Promise<string> {
  return str((await readBlock(db, 'about')).text);
}
export async function readHowItWorks(db: Db): Promise<HowItWorksBlock> {
  const v = await readBlock(db, 'how-it-works');
  const list = (x: unknown): Obj[] => (Array.isArray(x) ? x.map(obj) : []);
  return {
    steps: list(v.steps).map((s) => ({ title: str(s.title), text: str(s.text), mediaUrl: strOrNull(s.mediaUrl) })),
    promises: jsonStringArray(v.promises),
    faqs: list(v.faqs).map((f) => ({ question: str(f.question), answer: str(f.answer) })),
  };
}

/** `GET /content` (public). */
export async function getPublicContent(ctx: AppContext) {
  const [business, announcement, homepage, policies, about, howItWorks, faqs, reviews] = await Promise.all([
    ctx.settings.get('business'),
    readAnnouncement(ctx.prisma),
    readHomepage(ctx.prisma),
    readPolicies(ctx.prisma),
    readAbout(ctx.prisma),
    readHowItWorks(ctx.prisma),
    ctx.prisma.faq.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    ctx.prisma.review.findMany({ where: { visible: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
  ]);
  return {
    business: {
      name: business.name,
      whatsappNumber: business.whatsappNumber,
      supportEmail: business.supportEmail,
      instagramUrl: business.instagramUrl,
      timezone: business.timezone,
    },
    // Off (or without text) means null: the bar is simply not rendered.
    announcement: announcement.enabled && announcement.text.trim() !== '' ? { text: announcement.text, linkUrl: announcement.linkUrl } : null,
    homepage,
    policies,
    about,
    howItWorks,
    faqs: faqs.map((f) => ({ id: f.id, question: f.question, answer: f.answer, group: f.group, showOnHome: f.showOnHome })),
    reviews: reviews.map((r) => ({ id: r.id, name: r.name, text: r.text, mediaUrl: r.mediaUrl })),
  };
}

export async function getContentBlock(ctx: AppContext, key: ContentKey): Promise<AnnouncementBlock | HomepageBlock | PoliciesBlock | { about: string } | HowItWorksBlock> {
  switch (key) {
    case 'announcement':
      return readAnnouncement(ctx.prisma);
    case 'homepage':
      return readHomepage(ctx.prisma);
    case 'policies':
      return readPolicies(ctx.prisma);
    case 'about':
      return { about: await readAbout(ctx.prisma) };
    case 'how-it-works':
      return readHowItWorks(ctx.prisma);
  }
}

async function writeBlock(db: Db, key: ContentKey, value: Prisma.InputJsonValue): Promise<void> {
  await db.contentBlock.upsert({ where: { key: BLOCK_KEY[key] }, create: { key: BLOCK_KEY[key], value }, update: { value } });
}

/** `PUT /admin/content/:key`: validates the body for that key (VALIDATION_ERROR with dotted `fields`), replaces the block, returns it. */
export async function putContentBlock(ctx: AppContext, key: ContentKey, body: unknown) {
  switch (key) {
    case 'announcement': {
      const v = parseOrThrow(announcementPut, body);
      await writeBlock(ctx.prisma, key, v);
      return readAnnouncement(ctx.prisma);
    }
    case 'homepage': {
      const v = parseOrThrow(homepagePut, body);
      if (v.featuredDropSlug && !(await ctx.prisma.drop.findUnique({ where: { slug: v.featuredDropSlug }, select: { id: true } }))) {
        throw AppError.validation({ featuredDropSlug: 'That drop does not exist.' });
      }
      await writeBlock(ctx.prisma, key, v);
      return readHomepage(ctx.prisma);
    }
    case 'policies': {
      await writeBlock(ctx.prisma, key, parseOrThrow(policiesPut, body));
      return readPolicies(ctx.prisma);
    }
    case 'about': {
      const useText = obj(body).text !== undefined && obj(body).about === undefined;
      const text = useText ? parseOrThrow(aboutPutText, body).text : parseOrThrow(aboutPut, body).about;
      await writeBlock(ctx.prisma, key, { text });
      return { about: await readAbout(ctx.prisma) };
    }
    case 'how-it-works': {
      const v = obj(body).howItWorks !== undefined ? parseOrThrow(howItWorksPutWrapped, body).howItWorks : parseOrThrow(howItWorksPut, body);
      await writeBlock(ctx.prisma, key, v);
      return readHowItWorks(ctx.prisma);
    }
  }
}

// ================================================================ FAQs

type FaqRow = { id: number; question: string; answer: string; group: string | null; showOnHome: boolean; position: number };
const toFaq = (f: FaqRow) => ({ id: f.id, question: f.question, answer: f.answer, group: f.group, showOnHome: f.showOnHome, position: f.position });

export async function listFaqs(ctx: AppContext, q: FaqListQuery) {
  const where: Prisma.FaqWhereInput = {
    ...(q.group !== undefined ? { group: q.group } : {}),
    ...(q.showOnHome !== undefined ? { showOnHome: q.showOnHome } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.faq.count({ where }),
    ctx.prisma.faq.findMany({ where, orderBy: [{ position: 'asc' }, { id: 'asc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map(toFaq), total, q);
}

export async function getFaq(ctx: AppContext, id: number) {
  const row = await ctx.prisma.faq.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Question not found.');
  return toFaq(row);
}

export async function createFaq(ctx: AppContext, input: z.infer<typeof faqCreateBody>) {
  const position = ((await ctx.prisma.faq.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
  const row = await ctx.prisma.faq.create({
    data: { question: input.question, answer: input.answer, group: input.group ?? null, showOnHome: input.showOnHome ?? false, position },
  });
  return toFaq(row);
}

export async function updateFaq(ctx: AppContext, id: number, input: z.infer<typeof faqUpdateBody>) {
  if (!(await ctx.prisma.faq.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Question not found.');
  const row = await ctx.prisma.faq.update({
    where: { id },
    data: {
      ...(input.question !== undefined ? { question: input.question } : {}),
      ...(input.answer !== undefined ? { answer: input.answer } : {}),
      ...(input.group !== undefined ? { group: input.group } : {}),
      ...(input.showOnHome !== undefined ? { showOnHome: input.showOnHome } : {}),
    },
  });
  return toFaq(row);
}

export async function deleteFaq(ctx: AppContext, id: number): Promise<void> {
  if (!(await ctx.prisma.faq.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Question not found.');
  await ctx.prisma.faq.delete({ where: { id } });
}

export async function reorderFaqs(ctx: AppContext, ids: number[]): Promise<void> {
  const existing = (await ctx.prisma.faq.findMany({ select: { id: true } })).map((r) => r.id);
  await applyOrder(ctx.prisma, ids, existing, (id, position) => ctx.prisma.faq.update({ where: { id }, data: { position } }));
}

// ================================================================ reviews

type ReviewRow = { id: number; name: string; text: string; mediaUrl: string | null; visible: boolean };
const toReview = (r: ReviewRow) => ({ id: r.id, name: r.name, text: r.text, mediaUrl: r.mediaUrl, visible: r.visible });

export async function listReviews(ctx: AppContext, q: ReviewListQuery) {
  const where: Prisma.ReviewWhereInput = q.visible !== undefined ? { visible: q.visible } : {};
  const [total, rows] = await Promise.all([
    ctx.prisma.review.count({ where }),
    ctx.prisma.review.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...toSkipTake(q) }),
  ]);
  return toPage(rows.map(toReview), total, q);
}

export async function getReview(ctx: AppContext, id: number) {
  const row = await ctx.prisma.review.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Review not found.');
  return toReview(row);
}

export async function createReview(ctx: AppContext, input: z.infer<typeof reviewCreateBody>) {
  const row = await ctx.prisma.review.create({
    data: { name: input.name, text: input.text.trim(), mediaUrl: input.mediaUrl ?? null, visible: input.visible ?? true },
  });
  return toReview(row);
}

export async function updateReview(ctx: AppContext, id: number, input: z.infer<typeof reviewUpdateBody>) {
  if (!(await ctx.prisma.review.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Review not found.');
  const row = await ctx.prisma.review.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.text !== undefined ? { text: input.text.trim() } : {}),
      ...(input.mediaUrl !== undefined ? { mediaUrl: input.mediaUrl } : {}),
      ...(input.visible !== undefined ? { visible: input.visible } : {}),
    },
  });
  return toReview(row);
}

export async function deleteReview(ctx: AppContext, id: number): Promise<void> {
  if (!(await ctx.prisma.review.findUnique({ where: { id }, select: { id: true } }))) throw AppError.notFound('Review not found.');
  await ctx.prisma.review.delete({ where: { id } });
}
