'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Home,
  LogOut,
  Settings,
  UserPlus,
  ShieldCheck,
} from 'lucide-react';
import useSWR, { mutate } from 'swr';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { InviteModal } from '@/components/invite/invite-modal';
import { fetcher } from '@/lib/fetcher';
import { signOut } from '@/app/(login)/actions';

/**
 * Authenticated user menu: the profile photo (or initials fallback) as trigger, with a dropdown
 * (Dashboard / Sign out). Shared by the dashboard, landing and marketplace
 * headers so the account entry point looks and behaves the same everywhere.
 */
export function UserMenu({
  name,
  email,
  avatarUrl,
  isDemo = false,
}: {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  isDemo?: boolean;
}) {
  const t = useTranslations('UserMenu');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const router = useRouter();

  // A user can hold several roles (e.g. coach + admin). Surface the Admin area
  // in the menu whenever the admin role is present, regardless of primary role.
  const { data: rolesData } = useSWR<{ roles: string[] }>(
    '/api/user/roles',
    fetcher
  );
  const isAdmin = rolesData?.roles?.includes('admin') ?? false;

  function closeMenu() {
    setIsMenuOpen(false);
  }

  async function handleSignOut() {
    closeMenu();
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger>
          <UserAvatar
            name={name || email}
            src={avatarUrl}
            className="cursor-pointer size-9"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="flex flex-col gap-1">
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={closeMenu}
          >
            <Link
              href="/dashboard"
              onClick={closeMenu}
              className="flex w-full items-center"
            >
              <Home className="mr-2 h-4 w-4" />
              <span>{t('dashboard')}</span>
            </Link>
          </DropdownMenuItem>
          {isDemo ? (
            <DropdownMenuItem
              disabled
              aria-disabled="true"
              data-demo-settings-disabled="true"
              title="Non disponibile in modalità demo"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>{t('settings')}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="cursor-pointer" onSelect={closeMenu}>
              <Link
                href="/dashboard/settings"
                onClick={closeMenu}
                className="flex w-full items-center"
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>{t('settings')}</span>
              </Link>
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={closeMenu}
              >
                <Link
                  href="/dashboard/admin"
                  onClick={closeMenu}
                  className="flex w-full items-center"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  <span>{t('admin')}</span>
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => {
              closeMenu();
              setInviteOpen(true);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            <span>{t('inviteFriend')}</span>
          </DropdownMenuItem>
          <form action={handleSignOut} className="w-full">
            <button
              type="submit"
              onClick={closeMenu}
              className="flex w-full"
            >
              <DropdownMenuItem
                className="w-full flex-1 cursor-pointer"
                onSelect={closeMenu}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('signOut')}</span>
              </DropdownMenuItem>
            </button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
