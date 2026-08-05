'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
}: {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
}) {
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
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={closeMenu}>
            <Link
              href="/dashboard/settings"
              onClick={closeMenu}
              className="flex w-full items-center"
            >
              <Settings className="mr-2 h-4 w-4" />
              <span>Impostazioni</span>
            </Link>
          </DropdownMenuItem>
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
                  <span>Admin</span>
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
            <span>Invita un amico</span>
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
                <span>Esci</span>
              </DropdownMenuItem>
            </button>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
