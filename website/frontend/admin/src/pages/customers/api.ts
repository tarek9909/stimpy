import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { filenameFromDisposition, todayStamp } from '../../lib/download';
import { fetchAllPages } from '../../lib/pagination';
import type { paths } from '@stimpy/api-client';

export type CustomerRow = NonNullable<ReturnType<typeof useCustomers>['data']>['items'][number];
export type CustomerDetail = NonNullable<ReturnType<typeof useCustomer>['data']>;
export type CustomerProfile = Schemas['CustomerProfile'];
export type CustomerTimelineItem = Schemas['CustomerTimelineItem'];
export type CustomerTimelineResponse = Schemas['CustomerTimelineResponse'];
export type Subscriber = Schemas['Subscriber'];
type CustomerPatch = NonNullable<NonNullable<paths['/api/v1/admin/customers/{id}']['patch']['requestBody']>['content']['application/json']>;

export type YesNo = 'any' | 'yes' | 'no';

/** The list filters (what the URL holds). Money is whole dollars here and cents on the wire. */
export interface CustomerFilters {
  filter: 'all' | 'repeat';
  q?: string;
  areaId?: number | null;
  ordersMin?: number | null;
  ordersMax?: number | null;
  spentMin?: number | null;
  spentMax?: number | null;
  lastOrderBefore?: string | null;
  lastOrderAfter?: string | null;
  hasEmail?: YesNo;
  returned?: YesNo;
  optedOut?: YesNo;
  tagId?: number | null;
  relationship?: 'SUBSCRIBED_NEVER_BOUGHT' | 'BOUGHT_NOT_SUBSCRIBED' | null;
  page: number;
  pageSize: number;
}

const yn = (v: YesNo | undefined) => (v === 'yes' || v === 'no' ? v : undefined);
const cents = (dollars: number | null | undefined) => (dollars === null || dollars === undefined ? undefined : Math.round(dollars * 100));

/** Filters without paging, in the API's wire shape (`GET` query and the bulk `target.filters` body). */
export function toFilterBody(f: Omit<CustomerFilters, 'page' | 'pageSize'>) {
  return {
    filter: f.filter,
    q: f.q || undefined,
    areaId: f.areaId ?? undefined,
    ordersMin: f.ordersMin ?? undefined,
    ordersMax: f.ordersMax ?? undefined,
    spentMinCents: cents(f.spentMin),
    spentMaxCents: cents(f.spentMax),
    lastOrderBefore: f.lastOrderBefore || undefined,
    lastOrderAfter: f.lastOrderAfter || undefined,
    hasEmail: f.hasEmail === 'yes' ? true : f.hasEmail === 'no' ? false : undefined,
    returned: f.returned === 'yes' ? true : f.returned === 'no' ? false : undefined,
    optedOut: f.optedOut === 'yes' ? true : f.optedOut === 'no' ? false : undefined,
    tagId: f.tagId ?? undefined,
    relationship: f.relationship ?? undefined,
  };
}

export type BulkTarget = { ids: number[] } | { filters: ReturnType<typeof toFilterBody> };
export type BulkChannel = 'EMAIL' | 'WHATSAPP';

export function useCustomers(filters: CustomerFilters) {
  return useQuery({
    queryKey: queryKeys.customers(filters),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers', { params: {
          query: {
            filter: filters.filter,
            q: filters.q || undefined,
            areaId: filters.areaId ?? undefined,
            ordersMin: filters.ordersMin ?? undefined,
            ordersMax: filters.ordersMax ?? undefined,
            spentMinCents: cents(filters.spentMin),
            spentMaxCents: cents(filters.spentMax),
            lastOrderBefore: filters.lastOrderBefore || undefined,
            lastOrderAfter: filters.lastOrderAfter || undefined,
            hasEmail: yn(filters.hasEmail),
            returned: yn(filters.returned),
            optedOut: yn(filters.optedOut),
            tagId: filters.tagId ?? undefined,
            relationship: filters.relationship ?? undefined,
            page: filters.page,
            pageSize: filters.pageSize,
          },
        },
      })),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: queryKeys.customerDetail(id),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers/{id}', { params: { path: { id } } })),
    staleTime: 0,
    enabled: id > 0,
  });
}

export function useCustomerProfile(id: number) {
  return useQuery({
    queryKey: queryKeys.customerProfile(id),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers/{id}/profile', { params: { path: { id } } })),
    staleTime: 0,
    enabled: id > 0,
  });
}

export function useCustomerTimeline(id: number, limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.customerTimeline(id),
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/admin/customers/{id}/timeline', {
          params: { path: { id }, query: { limit, cursor: pageParam ?? undefined } },
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: id > 0,
  });
}

export function useUpdateCustomer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomerPatch) =>
      unwrap(api.PATCH('/api/v1/admin/customers/{id}', { params: { path: { id } }, body })),
    onSuccess: (customer) => {
      qc.setQueryData(queryKeys.customerDetail(id), customer);
      void qc.invalidateQueries({ queryKey: queryKeys.customerProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customers() });
      // Order details show the customer's name/contact: re-read them next time.
      void qc.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}

async function fetchCustomerTagCatalog() {
  const response = await fetchAllPages(
    (page, pageSize) => unwrap(api.GET('/api/v1/admin/customer-tags', { params: { query: { page, pageSize } } })),
  );
  return response.items;
}

export function useCustomerTagCatalog() {
  return useQuery({
    queryKey: queryKeys.customerTagCatalog,
    queryFn: fetchCustomerTagCatalog,
    staleTime: 60_000,
  });
}

export function useCustomerTags(id: number) {
  return useQuery({
    queryKey: queryKeys.customerTags(id),
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers/{id}/tags', { params: { path: { id } } })),
    enabled: id > 0,
    staleTime: 30_000,
  });
}

/** Create a missing tag once, then attach it; a uniqueness race is reconciled by refreshing the catalog. */
export function useAddCustomerTag(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const cleanName = name.trim();
      const cached = qc.getQueryData<Awaited<ReturnType<typeof fetchCustomerTagCatalog>>>(queryKeys.customerTagCatalog);
      let tag = cached?.find((candidate) => candidate.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
      if (!tag) {
        try {
          tag = await unwrap(api.POST('/api/v1/admin/customer-tags', { body: { name: cleanName } }));
        } catch (error) {
          const current = await fetchCustomerTagCatalog();
          tag = current.find((candidate) => candidate.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
          if (!tag) throw error;
        }
      }
      return unwrap(api.POST('/api/v1/admin/customers/{id}/tags/{tagId}', { params: { path: { id, tagId: tag.id } } }));
    },
    onSuccess: (tags) => {
      qc.setQueryData(queryKeys.customerTags(id), tags);
      void qc.invalidateQueries({ queryKey: queryKeys.customerTagCatalog });
      void qc.invalidateQueries({ queryKey: queryKeys.customers() });
    },
  });
}

export function useRemoveCustomerTag(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: number) => unwrap(api.DELETE('/api/v1/admin/customers/{id}/tags/{tagId}', { params: { path: { id, tagId } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customerTags(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customers() });
    },
  });
}

export function useCustomerNotes(id: number, pageSize = 25) {
  return useInfiniteQuery({
    queryKey: queryKeys.customerNotes(id),
    queryFn: ({ pageParam }) => unwrap(api.GET('/api/v1/admin/customers/{id}/notes', { params: { path: { id }, query: { page: pageParam, pageSize } } })),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: id > 0,
  });
}

export function useAddCustomerNote(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => unwrap(api.POST('/api/v1/admin/customers/{id}/notes', { params: { path: { id } }, body: { body } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customerNotes(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(id) });
    },
  });
}

export interface FollowUpFilters {
  due?: 'today' | 'overdue' | 'upcoming';
  customerId?: number;
  pageSize?: number;
}

export function useCustomerFollowUps({ due, customerId, pageSize = 25 }: FollowUpFilters = {}) {
  const keyId = customerId ?? 0;
  return useInfiniteQuery({
    queryKey: queryKeys.customerFollowUps(keyId, due),
    queryFn: ({ pageParam }) => unwrap(api.GET('/api/v1/admin/follow-ups', { params: { query: { due, customerId, page: pageParam, pageSize } } })),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

export function useCreateCustomerFollowUp(customerId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { dueAt: string; note: string }) => unwrap(api.POST('/api/v1/admin/follow-ups', { body: { customerId, ...input } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(customerId) });
    },
  });
}

export function useUpdateCustomerFollowUp(customerId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; done?: boolean; dueAt?: string; note?: string }) =>
      unwrap(api.PATCH('/api/v1/admin/follow-ups/{id}', { params: { path: { id } }, body })),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      if (customerId) void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(customerId) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerFollowUps(customerId ?? 0) });
    },
  });
}

export function useDeleteCustomerFollowUp(customerId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/v1/admin/follow-ups/{id}', { params: { path: { id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
      if (customerId) void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(customerId) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerFollowUps(customerId ?? 0) });
    },
  });
}

export function useCustomerDuplicates(page: number, pageSize: number) {
  return useQuery({
    queryKey: [...queryKeys.customerDuplicates, { page, pageSize }],
    queryFn: () => unwrap(api.GET('/api/v1/admin/customers/duplicates', { params: { query: { page, pageSize } } })),
    staleTime: 30_000,
  });
}

export function useMergeCustomer(survivorId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (duplicateCustomerId: number) => unwrap(api.POST('/api/v1/admin/customers/{id}/merge', { params: { path: { id: survivorId } }, body: { duplicateCustomerId } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customerDuplicates });
      void qc.invalidateQueries({ queryKey: queryKeys.customers() });
      void qc.invalidateQueries({ queryKey: queryKeys.customerProfile(survivorId) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(survivorId) });
    },
  });
}

export async function exportCustomerData(id: number): Promise<{ blob: Blob; filename: string }> {
  const data = await unwrap(api.GET('/api/v1/admin/customers/{id}/export', { params: { path: { id } } }));
  return {
    blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    filename: `customer-${id}-data-${todayStamp()}.json`,
  };
}

export function useAnonymiseCustomer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.DELETE('/api/v1/admin/customers/{id}/personal-data', { params: { path: { id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.customers() });
      void qc.invalidateQueries({ queryKey: queryKeys.customerProfile(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerTimeline(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customerNotes(id) });
      void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    },
  });
}

export interface SubscriberFilters {
  q?: string;
  page: number;
  pageSize: number;
}

export function useSubscribers(filters: SubscriberFilters) {
  return useQuery({
    queryKey: queryKeys.subscribers(filters),
    queryFn: async () => {
      const res = await unwrap(api.GET('/api/v1/admin/subscribers', { params: { query: { q: filters.q || undefined, page: filters.page, pageSize: filters.pageSize } } }));
      if (typeof res === 'string') throw new Error('Unexpected CSV response');
      return res;
    },
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/** `GET /admin/subscribers?format=csv` -> blob + the server's file name. */
export async function exportSubscribersCsv(): Promise<{ blob: Blob; filename: string }> {
  const result = await api.GET('/api/v1/admin/subscribers', { params: { query: { format: 'csv' } }, parseAs: 'blob' });
  const type = result.response.headers.get('content-type') ?? '';
  if (!type.startsWith('text/csv')) throw new Error('The export did not return a CSV file.');
  return { blob: result.data as unknown as Blob, filename: filenameFromDisposition(result.response.headers.get('content-disposition'), `subscribers-${todayStamp()}.csv`) };
}

export function useBulkPreview() {
  return useMutation({
    mutationFn: (v: { target: BulkTarget; channel: BulkChannel }) => unwrap(api.POST('/api/v1/admin/customers/bulk/preview', { body: v })),
  });
}

export function useBulkEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { target: BulkTarget; subject: string; body: string }) => unwrap(api.POST('/api/v1/admin/customers/bulk/email', { body: v })),
    // Queued emails show up in customers' timelines and the email log.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['email-log'] }),
  });
}

export function useBulkWhatsapp() {
  return useMutation({
    mutationFn: (v: { target: BulkTarget; text: string }) => unwrap(api.POST('/api/v1/admin/customers/bulk/whatsapp', { body: v })),
  });
}
