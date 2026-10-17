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
export type NavGroup = 'Workspace' | 'Catalog' | 'Business' | 'Store';

export interface NavItem {
  area: Area;
  group: NavGroup;
  path: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for the active state (Overview `/`). Others match by prefix: `/orders/123` highlights Orders. */
  end?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { area: 'overview', group: 'Workspace', path: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { area: 'orders', group: 'Workspace', path: '/orders', label: 'Orders', icon: ShoppingBag },
  { area: 'products', group: 'Catalog', path: '/products', label: 'Products', icon: Shirt },
  { area: 'stock', group: 'Catalog', path: '/stock', label: 'Stock', icon: Boxes },
  { area: 'drops', group: 'Catalog', path: '/drops', label: 'Drops', icon: Rocket },
  { area: 'customers', group: 'Business', path: '/customers', label: 'Customers', icon: Users },
  { area: 'finance', group: 'Business', path: '/finance', label: 'Finance', icon: Wallet },
  { area: 'insights', group: 'Business', path: '/insights', label: 'Insights', icon: BarChart3 },
  { area: 'content', group: 'Store', path: '/content', label: 'Content', icon: FileText },
  { area: 'deliveries', group: 'Workspace', path: '/deliveries', label: 'Deliveries', icon: Truck },
  { area: 'settings', group: 'Store', path: '/settings', label: 'Settings', icon: Settings },
];

export const NAV_GROUPS: readonly NavGroup[] = ['Workspace', 'Catalog', 'Business', 'Store'];

/** Phone bottom bar slots (dashboard-pages 2.2); everything else is under "More". */
export const BOTTOM_BAR_AREAS: readonly Area[] = ['overview', 'orders', 'deliveries', 'stock'];

export function isNavActive(item: Pick<NavItem, 'path' | 'end'>, pathname: string): boolean {
  if (item.end) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export const NEW_ORDER_PATH = '/orders/new';
