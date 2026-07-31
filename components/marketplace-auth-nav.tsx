'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { NotificationBell } from '@/components/notification-bell';
import { fetcher } from '@/lib/fetcher';

type SessionUser = {
  id: number;
  name: string | null;
  lastName?: string | null;
  email: string;
};

/**
 * Auth-aware call to action for the marketplace header. Shows the user's
 * avatar menu (Dashboard / Sign out) when authenticated, otherwise a sign-in
 * button. Auth state is shared app-wide via the root layout's SWR fallback.
 */
export function MarketplaceAuthNav() {
  const { data: user } = useSWR<SessionUser | null>('/api/user', fetcher);

  if (user) {
    return (
      <div className="flex items-center gap-2.5">
        <NotificationBell appearance="light" />
        <Link
          href="/dashboard"
          className="hidden text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 sm:inline"
        >
          {user.name ?? 'Dashboard'}
        </Link>
        <UserMenu name={[user.name, user.lastName].filter(Boolean).join(' ') || null} email={user.email} />
      </div>
    );
  }

  return (
    <Button asChild className="rounded-full">
      <Link href="/sign-in">Accedi</Link>
    </Button>
  );
}
