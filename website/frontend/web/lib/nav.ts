/** Primary navigation (website-pages 3.2). Labels are UI chrome, not business data. */
export const PRIMARY_NAV = [
  { href: '/shop', label: 'Shop' },
  { href: '/builder', label: 'Builder' },
  { href: '/drops', label: 'Drops' },
  { href: '/how-it-works', label: 'How it works' },
] as const;

export const SECONDARY_NAV = [
  { href: '/track', label: 'Track order' },
  { href: '/help', label: 'Help' },
] as const;

/** `true` when `pathname` is `href` or below it. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
