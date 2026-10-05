/**
 * Keys, names, default copy and allowed placeholders of every email and WhatsApp template
 * (integrations.md sections 3-5). The seed writes these rows; the comms module validates saves against `placeholders`.
 */
export const ALL_PLACEHOLDERS = [
  'customer_name',
  'order_number',
  'items',
  'total',
  'delivery_number',
  'tracking_url',
  'cancel_reason',
  'order_list',
] as const;

export type EmailTemplateKey =
  | 'order_received'
  | 'order_confirmed'
  | 'order_out_for_delivery'
  | 'order_delivered'
  | 'order_cancelled'
  | 'orders_lookup'
  | 'marketing_update';
export type WhatsappTemplateKey = 'order_confirmation' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'marketing_update';

type EmailDef = { key: EmailTemplateKey; name: string; subject: string; body: string; placeholders: readonly string[] };
type WaDef = { key: WhatsappTemplateKey; name: string; body: string; placeholders: readonly string[] };

const orderPlaceholders = ['customer_name', 'order_number', 'items', 'total', 'delivery_number', 'tracking_url', 'cancel_reason'];

export const EMAIL_TEMPLATES: EmailDef[] = [
  {
    key: 'order_received',
    name: 'Order received',
    subject: 'We got your order {order_number}',
    body: "Hi {customer_name},\n\nThanks for your order. Here's what you asked for:\n\n{items}\n\nTotal to pay at the door: {total} (cash on delivery).\n\nWe'll confirm it shortly. You can follow it any time here: {tracking_url}\n\nKeep your order number: {order_number}.\n\nStimpy\nOne hoodie. Multiple identities.",
    placeholders: orderPlaceholders,
  },
  {
    key: 'order_confirmed',
    name: 'Order confirmed',
    subject: 'Order {order_number} is confirmed',
    body: "Hi {customer_name},\n\nYour order {order_number} is confirmed and we're getting it ready.\n\n{items}\n\nTotal: {total} (cash on delivery).\nTrack it: {tracking_url}",
    placeholders: orderPlaceholders,
  },
  {
    key: 'order_out_for_delivery',
    name: 'Out for delivery',
    subject: 'Order {order_number} is on its way',
    body: 'Hi {customer_name},\n\nYour order is out for delivery.\n\nDelivery number: {delivery_number}\nOrder number: {order_number}\nTotal to pay: {total}\n\nPlease keep your phone nearby. Track it: {tracking_url}',
    placeholders: orderPlaceholders,
  },
  {
    key: 'order_delivered',
    name: 'Delivered',
    subject: 'Your Stimpy has arrived',
    body: 'Hi {customer_name},\n\nYour order {order_number} was delivered. Enjoy it, and try swapping the back.\n\nWant another look? Extra Stimpies zip on in seconds.\n\nStimpy',
    placeholders: orderPlaceholders,
  },
  {
    key: 'order_cancelled',
    name: 'Cancelled',
    subject: 'Order {order_number} was cancelled',
    body: "Hi {customer_name},\n\nYour order {order_number} has been cancelled.{cancel_reason}\n\nIf this is a surprise, reply to this email and we'll help.\n\nStimpy",
    placeholders: orderPlaceholders,
  },
  {
    key: 'orders_lookup',
    name: 'Lost order number',
    subject: 'Your Stimpy order numbers',
    body: 'Hi,\n\nHere are the orders linked to this email:\n\n{order_list}\n\nUse an order number and the phone number you ordered with to track it: {tracking_url}\n\nStimpy',
    placeholders: ['order_list', 'tracking_url'],
  },
  {
    key: 'marketing_update',
    name: 'Marketing update',
    subject: 'A little more Stimpy for your day',
    body: 'Hi {customer_name},\n\nNew looks are waiting at Stimpy. Browse the latest collection: {shop_url}\n\nStimpy',
    placeholders: ['customer_name', 'shop_url'],
  },
];

export const WHATSAPP_TEMPLATES: WaDef[] = [
  {
    key: 'order_confirmation',
    name: 'Order confirmation',
    body: "Hi {customer_name}, this is Stimpy. We received your order {order_number}: {items}. Total {total}, cash on delivery. Can you confirm your address and that you'd like us to prepare it?",
    placeholders: orderPlaceholders,
  },
  {
    key: 'ready_for_delivery',
    name: 'Ready for delivery',
    body: 'Hi {customer_name}, your Stimpy order {order_number} is packed and going out for delivery soon. Please keep your phone nearby.',
    placeholders: orderPlaceholders,
  },
  {
    key: 'out_for_delivery',
    name: 'Out for delivery',
    body: 'Hi {customer_name}, your order {order_number} is out for delivery (delivery number {delivery_number}). Total to pay: {total}.',
    placeholders: orderPlaceholders,
  },
  {
    key: 'delivered',
    name: 'Delivered',
    body: 'Hi {customer_name}, hope you love your Stimpy! If you try swapping the back, send us a photo. Order {order_number}.',
    placeholders: orderPlaceholders,
  },
  {
    key: 'marketing_update',
    name: 'Marketing update',
    body: 'Hi {customer_name}, Stimpy has new looks ready to explore. Browse them here: {shop_url}',
    placeholders: ['customer_name', 'shop_url'],
  },
];

export const EMAIL_TEMPLATE_KEYS = EMAIL_TEMPLATES.map((t) => t.key);
export const WHATSAPP_TEMPLATE_KEYS = WHATSAPP_TEMPLATES.map((t) => t.key);
