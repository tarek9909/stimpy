import type { AdminOrder, AdminOrderSummary } from '../src/pages/orders/api';

export function makeSummary(over: Partial<AdminOrderSummary> = {}): AdminOrderSummary {
  return {
    id: 1,
    number: 'STP-1001',
    placedAt: '2026-10-01T09:30:00.000Z',
    status: 'NEW',
    source: 'WEBSITE',
    customerName: 'Rami Haddad',
    contactPhone: '+9613123456',
    areaName: 'Beirut',
    itemsSummary: 'Hoodie + 1 Stimpie',
    totalCents: 3800,
    deliveryNumber: null,
    cashCollected: false,
    cashSettled: false,
    holdExpired: false,
    ...over,
  };
}

export function makeOrder(over: Partial<AdminOrder> = {}): AdminOrder {
  const base = makeSummary();
  return {
    ...base,
    customer: { id: 7, name: 'Rami Haddad', email: 'rami@example.com', phone: '+9613123456', whatsapp: '+9613123456' },
    contact: { email: 'rami@example.com', phone: '+9613123456', whatsapp: '+9613123456' },
    delivery: { areaId: 1, areaName: 'Beirut', address: 'Main street 5', notes: null },
    items: [],
    subtotalCents: 3500,
    deliveryFeeCents: 300,
    costCents: 1700,
    holdExpiresAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    events: [],
    notes: [],
    emails: [],
    allowedTransitions: ['CONFIRMED', 'CANCELLED'],
    warnings: [],
    ...over,
  };
}

export const SETTINGS = {
  business: { name: 'Stimpy', whatsappNumber: null, supportEmail: null, instagramUrl: null, timezone: 'Asia/Beirut' },
  orders: { numberPrefix: 'STP', firstNumber: 1000, stockHoldHours: 12, autoExpireUnconfirmed: false, lowStockThreshold: 10, hardwareCostCents: 100 },
  email: { enabled: true, senderName: 'Stimpy', senderAddress: 'hi@stimpy.example', replyTo: 'hi@stimpy.example', footerText: '' },
  notifications: { founderEmail: null, onNewOrder: false, onLowStock: false },
};

export const emptyPage = <T,>(items: T[] = [], pageSize = 25) => ({ items, page: 1, pageSize, total: items.length });

/** jsdom has no layout: report every `min-width` query as matching so tables and desktop menus render. */
export function forceDesktop(): void {
  window.matchMedia = ((query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
