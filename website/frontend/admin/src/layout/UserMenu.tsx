import { ChevronDown, KeyRound, LogOut, Settings } from 'lucide-react';
import { Avatar, useToast } from '@stimpy/ui';
import { useSessionFlow } from '../auth/SessionFlowContext';
import { useSession } from '../auth/session';
import { Menu } from '../components/Menu';

const ROLE_LABEL: Record<string, string> = { OWNER: 'Owner', PACKER: 'Packer' };

/** Avatar + menu: Settings, Change password, Log out (shows name, e-mail and role). */
export function UserMenu() {
  const { user } = useSession();
  const flow = useSessionFlow();
  const toast = useToast();

  return (
    <Menu
      label="Account menu"
      align="end"
      trigger={<span className="admin-user-trigger"><Avatar name={user.name || user.email} size="sm" /><span className="admin-user-copy hidden xl:flex"><strong>{user.name || user.email}</strong><span>{ROLE_LABEL[user.role] ?? user.role}</span></span><ChevronDown size={13} aria-hidden="true" className="hidden text-fg-muted xl:block" /></span>}
      header={
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium">{user.name}</p>
          <p className="truncate text-body-sm text-fg-muted">{user.email}</p>
          <p className="text-caption text-fg-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
        </div>
      }
      items={[
        { id: 'settings', label: 'Settings', href: '/settings', icon: <Settings size={18} /> },
        { id: 'password', label: 'Change password', href: '/settings?tab=account', icon: <KeyRound size={18} /> },
        {
          id: 'logout',
          label: 'Log out',
          icon: <LogOut size={18} />,
          separatorBefore: true,
          onSelect: () => {
            void flow.logout().then(({ networkFailed }) => {
              if (networkFailed) {
                toast.info("Logged out here. We couldn't reach the server, so the session may still be active. Close this browser tab and try again later.", { durationMs: 0 });
              }
            });
          },
        },
      ]}
    />
  );
}
