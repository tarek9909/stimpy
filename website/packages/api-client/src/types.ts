/**
 * Convenient names for the generated schema. Everything here is DERIVED from `schema.d.ts`
 * (generated from docs/openapi.json); nothing is hand-written API shape. Regenerate with
 * `npm run docs:api && npm run client:generate` when the API changes.
 */
import type { components, paths } from './schema';

type Schemas = components['schemas'];

/** The JSON body of a successful response of `METHOD path`. */
export type ResponseBody<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer B } } };
}
  ? B
  : paths[P][M] extends { responses: { 201: { content: { 'application/json': infer B } } } }
    ? B
    : never;

/** The JSON request body of `METHOD path`. */
export type RequestBody<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody?: { content: { 'application/json': infer B } };
}
  ? B
  : never;

/** The query parameters of `METHOD path`. */
export type QueryParams<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  parameters: { query?: infer Q };
}
  ? Q
  : never;

// ---- Shared catalog types (named components) ----
export type Color = Schemas['Color'];
export type Size = Schemas['Size'];
export type Stimpie = Schemas['Stimpie'];
export type HoodieSummary = Schemas['HoodieSummary'];
export type HoodieDetail = Schemas['HoodieDetail'];
export type Pack = Schemas['Pack'];

export type StimpieStatus = Stimpie['status'];
export type StimpieType = Stimpie['type'];
export type AccentColor = NonNullable<Stimpie['drop']>['accentColor'];

// ---- Public responses (derived from the paths) ----
export type OptionsResponse = ResponseBody<'/api/v1/options', 'get'>;
export type SizeChartResponse = ResponseBody<'/api/v1/size-chart', 'get'>;
export type HealthResponse = ResponseBody<'/api/v1/health', 'get'>;

// ---- Cart and orders (derived) ----
export type ValidateCartRequest = RequestBody<'/api/v1/cart/validate', 'post'>;
export type ValidateCartResponse = Schemas['CartValidation'];
export type CartItem = ValidateCartRequest['items'][number];
export type CartProblem = Schemas['CartProblem'];
/** `SOLD_OUT` / stock problem: has `requested` and `available`. */
export type StockProblem = Extract<CartProblem, { requested: number }>;
/** `NOT_PURCHASABLE` problem: has a `reason`. */
export type PurchaseProblem = Extract<CartProblem, { reason: string }>;
export type CreateOrderRequest = RequestBody<'/api/v1/orders', 'post'>;
export type PlacedOrder = Schemas['PlacedOrder'];
export type TrackedOrder = Schemas['TrackedOrder'];
export type OrderItem = Schemas['OrderItem'];

// ---- Drops and delivery (derived) ----
export type Drop = Schemas['Drop'];
export type DropState = Drop['state'];
export type DropsOverview = Schemas['DropsOverview'];
export type SubscribeRequest = RequestBody<'/api/v1/drops/{id}/subscribe', 'post'>;
export type DeliveryFees = ResponseBody<'/api/v1/delivery/fees', 'get'>;

// ---- Content and builder (derived) ----
export type Content = ResponseBody<'/api/v1/content', 'get'>;
export type BuilderConfig = ResponseBody<'/api/v1/builder/config', 'get'>;
export type Faq = Content['faqs'][number];
export type Review = Content['reviews'][number];
