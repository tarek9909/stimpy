import { z } from 'zod';
import { boolQuery, pageQuerySchema, pageSchema, slugField } from '../../lib/http';
import { assetUrl, longText } from '../catalog/schemas';

// ---------------------------------------------------------------- text limits (api-reference section 1)

export const POLICY_MAX = 20_000;
export const ANNOUNCEMENT_MAX = 120;
export const HEADLINE_MAX = 80;

/** `https://...` or a site-relative path starting with a single `/`; anything else (javascript:, data:, //host) is refused. */
export const linkUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\/[^\s/]+[^\s]*$/i.test(v) || /^\/(?!\/)[^\s]*$/.test(v), 'Use an https:// link or a path starting with /.');

// ---------------------------------------------------------------- public GET /content

const howItWorksSchema = z.object({
  steps: z.array(z.object({ title: z.string(), text: z.string(), mediaUrl: z.string().nullable() })),
  promises: z.array(z.string()),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
});

export const publicContentSchema = z
  .object({
    business: z.object({
      name: z.string(),
      whatsappNumber: z.string().nullable(),
      supportEmail: z.string().nullable(),
      instagramUrl: z.string().nullable(),
      timezone: z.string(),
    }),
    announcement: z.object({ text: z.string(), linkUrl: z.string().nullable() }).nullable(),
    homepage: z.object({
      heroHeadline: z.string(),
      heroSubheadline: z.string(),
      heroVideoUrl: z.string().nullable(),
      heroImageUrl: z.string().nullable(),
      featuredDropSlug: z.string().nullable(),
      featuredStimpieSlug: z.string().nullable(),
      showDropSections: z.boolean(),
    }),
    policies: z.object({ deliveryReturns: z.string(), care: z.string(), terms: z.string(), privacy: z.string() }),
    about: z.string(),
    howItWorks: howItWorksSchema,
    faqs: pageSchema(z.object({ id: z.number().int(), question: z.string(), answer: z.string(), group: z.string().nullable(), showOnHome: z.boolean() })),
    reviews: pageSchema(z.object({ id: z.number().int(), name: z.string(), text: z.string(), mediaUrl: z.string().nullable() })),
  })
  .meta({ id: 'Content' });

// ---------------------------------------------------------------- admin content blocks

export const CONTENT_KEYS = ['announcement', 'homepage', 'policies', 'about', 'how-it-works'] as const;
export type ContentKey = (typeof CONTENT_KEYS)[number];
export const contentKeyParams = z.object({ key: z.enum(CONTENT_KEYS) });

export const announcementShape = z.object({ enabled: z.boolean(), text: z.string(), linkUrl: z.string().nullable() });
export const homepageShape = z.object({
  heroHeadline: z.string(),
  heroSubheadline: z.string(),
  heroVideoUrl: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
  featuredDropSlug: z.string().nullable(),
  featuredStimpieSlug: z.string().nullable(),
  showDropSections: z.boolean(),
});
export const policiesShape = z.object({ deliveryReturns: z.string(), care: z.string(), terms: z.string(), privacy: z.string() });
export const aboutShape = z.object({ about: z.string() });

/** GET/PUT /admin/content/:key response: the matching part of the public content (`enabled` added for the announcement). */
export const adminContentResponse = z
  .union([announcementShape, homepageShape, policiesShape, aboutShape, howItWorksSchema])
  .meta({ id: 'AdminContentBlock' });

const step = z.strictObject({
  title: z.string().trim().min(1).max(120),
  text: z.string().max(2000).default(''),
  mediaUrl: assetUrl.nullable().default(null),
});
const howFaq = z.strictObject({ question: z.string().trim().min(1).max(200), answer: z.string().trim().min(1).max(2000) });
const howItWorksFields = {
  steps: z.array(step).max(20).default([]),
  promises: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  faqs: z.array(howFaq).max(30).default([]),
};

export const announcementPut = z
  .strictObject({
    enabled: z.boolean(),
    text: z.string().trim().max(ANNOUNCEMENT_MAX).default(''),
    linkUrl: linkUrl.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.enabled && v.text === '') ctx.addIssue({ code: 'custom', path: ['text'], message: 'Enter the announcement text.' });
  });

export const homepagePut = z.strictObject({
  heroHeadline: z.string().trim().min(1).max(HEADLINE_MAX),
  heroSubheadline: z.string().trim().max(300).default(''),
  heroVideoUrl: assetUrl.nullable().default(null),
  heroImageUrl: assetUrl.nullable().default(null),
  featuredDropSlug: slugField.nullable().default(null),
  featuredStimpieSlug: slugField.nullable().default(null),
  showDropSections: z.boolean().default(true),
});

export const policiesPut = z.strictObject({
  deliveryReturns: z.string().max(POLICY_MAX),
  care: z.string().max(POLICY_MAX),
  terms: z.string().max(POLICY_MAX),
  privacy: z.string().max(POLICY_MAX),
});

/** `{ about }` (canonical) or the stored shape `{ text }` (chosen by key in the service so errors keep their field paths). */
export const aboutPut = z.strictObject({ about: z.string().max(POLICY_MAX) });
export const aboutPutText = z.strictObject({ text: z.string().max(POLICY_MAX) });

/** `{ steps, promises, faqs }` (canonical) or the same wrapped as `{ howItWorks: { ... } }`. */
export const howItWorksPut = z.strictObject(howItWorksFields);
export const howItWorksPutWrapped = z.strictObject({ howItWorks: z.strictObject(howItWorksFields) });

export const contentBody = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------- FAQs

export const adminFaqSchema = z
  .object({
    id: z.number().int(),
    question: z.string(),
    answer: z.string(),
    group: z.string().nullable(),
    showOnHome: z.boolean(),
    position: z.number().int(),
  })
  .meta({ id: 'AdminFaq' });

export const faqCreateBody = z.strictObject({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(2000),
  group: z.string().trim().min(1).max(60).nullable().optional(),
  showOnHome: z.boolean().optional(),
});
export const faqUpdateBody = faqCreateBody.partial();
export const faqListQuery = pageQuerySchema.extend({ group: z.string().max(60).optional(), showOnHome: boolQuery });
export type FaqListQuery = z.infer<typeof faqListQuery>;

// ---------------------------------------------------------------- reviews

export const adminReviewSchema = z
  .object({ id: z.number().int(), name: z.string(), text: z.string(), mediaUrl: z.string().nullable(), visible: z.boolean() })
  .meta({ id: 'AdminReview' });

export const reviewCreateBody = z.strictObject({
  name: z.string().trim().min(1).max(120),
  text: longText.refine((v) => v.trim().length > 0, 'This field is required.'),
  mediaUrl: assetUrl.nullable().optional(),
  visible: z.boolean().optional(),
});
export const reviewUpdateBody = reviewCreateBody.partial();
export const reviewListQuery = pageQuerySchema.extend({ visible: boolQuery });
export type ReviewListQuery = z.infer<typeof reviewListQuery>;
