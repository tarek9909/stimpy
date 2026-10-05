import {
  BarChart3,
  Boxes,
  FileText,
  LayoutDashboard,
  Rocket,
  Settings,
  Shirt,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Area } from '../auth/roles';

/**
 * ONE array drives the sidebar, the phone bottom bar, the "More" sheet and the route guard
 * (auth-and-sessions 5.2): navigation and permissions cannot drift. `area` is the permission area.
 */
export interface NavItem {
  area: Area;
  path: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for the active state (Overview `/`). Others match by prefix: `/orders/123` highlights Orders. */
  end?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { area: 'overview', path: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { area: 'orders', path: '/orders', label: 'Orders', icon: ShoppingBag },
  { area: 'products', path: '/products', label: 'Products', icon: Shirt },
  { area: 'stock', path: '/stock', label: 'Stock', icon: Boxes },
  { area: 'drops', path: '/drops', label: 'Drops', icon: Rocket },
  { area: 'customers', path: '/customers', label: 'Customers', icon: Users },
  { area: 'finance', path: '/finance', label: 'Finance', icon: Wallet },
  { area: 'insights', path: '/insights', label: 'Insights', icon: BarChart3 },
  { area: 'content', path: '/content', label: 'Content', icon: FileText },
  { area: 'deliveries', path: '/deliveries', label: 'Deliveries', icon: Truck },
  { area: 'settings', path: '/settings', label: 'Settings', icon: Settings },
];

/** Phone bottom bar slots (dashboard-pages 2.2); everything else is under "More". */
export const BOTTOM_BAR_AREAS: readonly Area[] = ['overview', 'orders', 'deliveries', 'stock'];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export const NEW_ORDER_PATH = '/orders/new';
