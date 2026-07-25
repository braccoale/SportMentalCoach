'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, LogOut, UserPlus } from 'lucide-react';
import { mutate } from 'swr';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { InviteModal } from '@/components/invite/invite-modal';
import { signOut } from '@/app/(login)/actions';

/**
 * Authenticated user menu: the initials avatar as trigger, with a dropdown
 * (Dashboard / Sign out). Shared by the dashboard, landing and marketplace
 * headers so the account entry point looks and behaves the same everywhere.
 */
export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }

  return (
    <>
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger>
          {/* Initials (first + last name, uppercase) on the brand-red disc. */}
          <UserAvatar name={name || email} className="cursor-pointer size-9" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="flex flex-col gap-1">
          <DropdownMenuItem className="cursor-pointer">
            <Link href="/dashboard" className="flex w-full items-center">
              <Home className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={() => setInviteOpen(true)}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            <span>Invita un amico</span>
          </DropdownMenuItem>
          <form action={handleSignOut} className="w-full">
            <button type="submit" className="flex w-full">
              <DropdownMenuItem className="w-full flex-1 cursor-pointer">
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
