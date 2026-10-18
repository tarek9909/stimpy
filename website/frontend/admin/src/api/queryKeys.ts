/**
 * One place for TanStack Query keys (dashboard-pages 1.4). Keys start with the resource so
 * invalidation is predictable: `invalidateQueries({ queryKey: ['orders'] })` hits every order query.
 * Add keys here, never inline in components.
 */
export const queryKeys = {
  session: ['session'] as const,
  settings: ['settings'] as const,
  deliverySettings: ['settings', 'delivery'] as const,
  overview: ['overview'] as const,

  search: (q: string) => ['search', q] as const,

  orders: ['orders'] as const,
  ordersList: (filters: object) => ['orders', 'list', filters] as const,
  ordersCounts: ['orders', 'counts'] as const,
  orderDetail: (id: number | string) => ['orders', 'detail', id] as const,
  orderWhatsapp: (id: number | string, template: string) => ['orders', 'whatsapp', id, template] as const,

  hoodies: ['hoodies'] as const,
  hoodie: (id: number | string) => ['hoodies', id] as const,
  stimpies: ['stimpies'] as const,
  stimpiesList: (filters: object) => ['stimpies', 'list', filters] as const,
  stimpie: (id: number | string) => ['stimpies', id] as const,
  packs: ['packs'] as const,
  pack: (id: number | string) => ['packs', id] as const,
  colors: ['colors'] as const,
  sizes: ['sizes'] as const,
  sizeChart: ['size-chart'] as const,

  stockHoodies: ['stock', 'hoodies'] as const,
  stockStimpies: ['stock', 'stimpies'] as const,
  stockMovements: (filters: object) => ['stock', 'movements', filters] as const,
  stock: ['stock'] as const,

  drops: (state?: string) => (state ? (['drops', state] as const) : (['drops'] as const)),
  dropDetail: (id: number | string) => ['drops', 'detail', id] as const,
  promotions: ['promotions'] as const,
  promotionDetail: (id: number | string) => ['promotions', 'detail', id] as const,

  customers: (filters?: object) => (filters ? (['customers', filters] as const) : (['customers'] as const)),
  customerDetail: (id: number | string) => ['customers', 'detail', id] as const,
  customerProfile: (id: number | string) => ['customers', 'profile', id] as const,
  customerTimeline: (id: number | string) => ['customers', 'timeline', id] as const,
  customerTags: (id: number | string) => ['customers', id, 'tags'] as const,
  customerTagCatalog: ['customer-tags'] as const,
  customerNotes: (id: number | string) => ['customers', id, 'notes'] as const,
  customerFollowUps: (id: number | string, due?: string) => ['follow-ups', id, due ?? ''] as const,
  customerDuplicates: ['customers', 'duplicates'] as const,
  subscribers: (filters?: object) => (filters ? (['subscribers', filters] as const) : (['subscribers'] as const)),

  deliveries: (tab?: string, q?: string) => (tab ? (['deliveries', tab, q ?? ''] as const) : (['deliveries'] as const)),
  areas: ['areas'] as const,

  financeProfit: (range: object) => ['finance', 'profit', range] as const,
  financeCash: ['finance', 'cash'] as const,
  finance: ['finance'] as const,
  expenses: (filters?: object) => (filters ? (['expenses', filters] as const) : (['expenses'] as const)),
  adSpend: (filters?: object) => (filters ? (['ad-spend', filters] as const) : (['ad-spend'] as const)),
  insights: (name: string, range: object) => ['insights', name, range] as const,

  content: (key: string) => ['content', key] as const,
  faqs: ['faqs'] as const,
  reviews: ['reviews'] as const,
  builder: ['builder'] as const,
  emailTemplates: ['email-templates'] as const,
  whatsappTemplates: ['whatsapp-templates'] as const,
  emailLog: (filters?: object) => (filters ? (['email-log', filters] as const) : (['email-log'] as const)),
};
