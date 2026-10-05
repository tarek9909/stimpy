import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@stimpy/ui';
import { useSession } from './session';

/**
 * Role map (auth-and-sessions 5.2). Only `OWNER` exists in v1 and has access to everything;
 * `PACKER` is reserved. Unknown roles get nothing (fail closed). Client-side checks are a
 * convenience only: the server is authoritative, never treat hiding a button as security.
 */
export type Role = 'OWNER' | 'PACKER';
export type Area =
  | 'overview'
  | 'orders'
  | 'products'
  | 'stock'
  | 'drops'
  | 'customers'
  | 'finance'
  | 'insights'
  | 'content'
  | 'deliveries'
  | 'settings';

export const ROLE_ACCESS: Record<Role, Area[] | 'all'> = {
  OWNER: 'all',
  PACKER: [], // reserved: defined when staff accounts are specced
};

export function canAccess(role: string | null | undefined, area: Area): boolean {
  if (!role || !Object.prototype.hasOwnProperty.call(ROLE_ACCESS, role)) return false;
  const access = ROLE_ACCESS[role as Role];
  return access === 'all' || access.includes(area);
}

export function useCan(area: Area): boolean {
  const { user } = useSession();
  return canAccess(user.role, area);
}

/** In-page forbidden state (no redirect): "You don't have access to this." */
export function ForbiddenState() {
  return (
    <EmptyState
      icon={<ShieldAlert size={32} />}
      title="You don't have access to this."
      text="Ask the account owner if you need it."
    />
  );
}

export function Can({ area, children, fallback }: { area: Area; children: ReactNode; fallback?: ReactNode }) {
  const allowed = useCan(area);
  return <>{allowed ? children : (fallback ?? <ForbiddenState />)}</>;
}
