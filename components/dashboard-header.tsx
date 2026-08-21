'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { NotificationBell } from '@/components/notification-bell';
import type { SessionUser } from '@/lib/auth/session-user';
import { BILLING_ENABLED } from '@/lib/core/flags';
import { fetcher } from '@/lib/fetcher';

function HeaderUserMenu() {
  const t = useTranslations('DashboardShell');
  const { data: user } = useSWR<SessionUser>('/api/user', fetcher);

  if (!user) {
    return (
      <>
        {BILLING_ENABLED && (
          <Link
            href="/pricing"
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {t('pricing')}
          </Link>
        )}
        <Button asChild className="rounded-full">
          <Link href="/sign-up">{t('signUp')}</Link>
        </Button>
      </>
    );
  }

  return (
    <UserMenu
      name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
      email={user.email}
      avatarUrl={user.avatarUrl}
      isDemo={user.isDemo}
    />
  );
}

export function DashboardHeader() {
  const t = useTranslations('DashboardShell');

  return (
    <header className="border-b border-kp-line bg-kp-ink2">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center">
          <img
            src="/logo.jpg"
            alt="KaiPai"
            width={127}
            height={141}
            className="h-9 w-auto rounded-lg"
          />
          <span className="ml-2 text-xl font-semibold text-white">KaiPai</span>
        </Link>
        <div className="flex items-center space-x-4">
          <Link
            href="/coaches"
            className="text-sm font-medium text-gray-300 hover:text-white"
          >
            {t('findCoach')}
          </Link>
          <NotificationBell />
          <Suspense fallback={<div className="h-9" />}>
            <HeaderUserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
