import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { fetchAllPages } from '../../lib/pagination';

export type ContentKey = 'announcement' | 'homepage' | 'policies' | 'about' | 'how-it-works';

export interface AnnouncementBlock { enabled: boolean; text: string; linkUrl: string | null }
export interface HomepageBlock { heroHeadline: string; heroSubheadline: string; heroVideoUrl: string | null; heroImageUrl: string | null; featuredDropSlug: string | null; featuredStimpieSlug: string | null; showDropSections: boolean }
export interface PoliciesBlock { deliveryReturns: string; care: string; terms: string; privacy: string }
export interface AboutBlock { about: string }
export interface HowItWorksBlock {
  steps: { title: string; text: string; mediaUrl: string | null }[];
  promises: string[];
  faqs: { question: string; answer: string }[];
}
export interface ContentBlocks {
  announcement: AnnouncementBlock;
  homepage: HomepageBlock;
  policies: PoliciesBlock;
  about: AboutBlock;
  'how-it-works': HowItWorksBlock;
}

/** `GET /admin/content/:key`. The generated type is a union of all blocks, so the key picks the shape. */
export function useContentBlock<K extends ContentKey>(key: K) {
  return useQuery({
    queryKey: queryKeys.content(key),
    queryFn: async () => (await unwrap(api.GET('/api/v1/admin/content/{key}', { params: { path: { key } } }))) as unknown as ContentBlocks[K],
    staleTime: 15_000,
  });
}

/** `PUT /admin/content/:key` (replace semantics: always send the whole block). */
export function useSaveContent<K extends ContentKey>(key: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.content(key),
    mutationFn: async (body: ContentBlocks[K]) =>
      (await unwrap(api.PUT('/api/v1/admin/content/{key}', { params: { path: { key } }, body: body as unknown as Record<string, unknown> }))) as unknown as ContentBlocks[K],
    onSuccess: (saved) => {
      qc.setQueryData(queryKeys.content(key), saved);
      void qc.invalidateQueries({ queryKey: queryKeys.overview });
    },
  });
}

// ------------------------------------------------------------------ FAQs
export type AdminFaq = Schemas['AdminFaq'];
export interface FaqBody { question: string; answer: string; group: string | null; showOnHome: boolean }

export const useFaqs = () =>
  useQuery({
    queryKey: queryKeys.faqs,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/faqs', { params: { query: { page, pageSize } } }))),
    staleTime: 15_000,
  });

export function useFaqMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: queryKeys.faqs });
  const create = useMutation({ mutationFn: (body: FaqBody) => unwrap(api.POST('/api/v1/admin/faqs', { body })), onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<FaqBody> }) => unwrap(api.PATCH('/api/v1/admin/faqs/{id}', { params: { path: { id } }, body })),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: number) => api.DELETE('/api/v1/admin/faqs/{id}', { params: { path: { id } } }), onSuccess: done });
  return { create, update, remove };
}

// ------------------------------------------------------------------ Reviews
export type AdminReview = Schemas['AdminReview'];
export interface ReviewBody { name: string; text: string; mediaUrl: string | null; visible: boolean }

export const useReviews = () =>
  useQuery({
    queryKey: queryKeys.reviews,
    queryFn: () => fetchAllPages((page, pageSize) => unwrap(api.GET('/api/v1/admin/reviews', { params: { query: { page, pageSize } } }))),
    staleTime: 15_000,
  });

export function useReviewMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: queryKeys.reviews });
  const create = useMutation({ mutationFn: (body: ReviewBody) => unwrap(api.POST('/api/v1/admin/reviews', { body })), onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ReviewBody> }) => unwrap(api.PATCH('/api/v1/admin/reviews/{id}', { params: { path: { id } }, body })),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: number) => api.DELETE('/api/v1/admin/reviews/{id}', { params: { path: { id } } }), onSuccess: done });
  return { create, update, remove };
}

// ------------------------------------------------------------------ Builder
export type { AdminBuilder } from './builderForm';
export const useAdminBuilder = () =>
  useQuery({ queryKey: queryKeys.builder, queryFn: () => unwrap(api.GET('/api/v1/admin/builder')), staleTime: 0 });

// ------------------------------------------------------------------ Emails
export type EmailTemplate = Schemas['EmailTemplate'];
export type WhatsappTemplate = Schemas['WhatsappTemplate'];
export type EmailLogItem = Schemas['EmailLogItem'];

export const useEmailTemplates = () =>
  useQuery({ queryKey: queryKeys.emailTemplates, queryFn: () => unwrap(api.GET('/api/v1/admin/email-templates')), staleTime: 30_000 });
export const useWhatsappTemplates = () =>
  useQuery({ queryKey: queryKeys.whatsappTemplates, queryFn: () => unwrap(api.GET('/api/v1/admin/whatsapp-templates')), staleTime: 30_000 });

export interface EmailLogFilters {
  status?: 'PENDING' | 'SENT' | 'FAILED';
  template?: string;
  orderId?: number;
  page: number;
  pageSize: number;
}
export const useEmailLog = (f: EmailLogFilters, refetchInterval?: number | false) =>
  useQuery({
    queryKey: queryKeys.emailLog(f),
    queryFn: () => unwrap(api.GET('/api/v1/admin/email-log', { params: { query: f } })),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
    refetchInterval,
  });
