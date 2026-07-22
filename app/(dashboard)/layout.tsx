'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/user-menu';
import { User } from '@/lib/db/schema';
import { BILLING_ENABLED } from '@/lib/core/flags';
import { Footer } from '@/components/footer';
import { NotificationBell } from '@/components/notification-bell';
import { IncomingCallListener } from '@/components/incoming-call-listener';
import { fetcher } from '@/lib/fetcher';
import useSWR from 'swr';

function HeaderUserMenu() {
  const { data: user } = useSWR<User>('/api/user', fetcher);

  if (!user) {
    return (
      <>
        {BILLING_ENABLED && (
          <Link
            href="/pricing"
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Pricing
          </Link>
        )}
        <Button asChild className="rounded-full">
          <Link href="/sign-up">Registrati</Link>
        </Button>
      </>
    );
  }

  return (
    <UserMenu
      name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
      email={user.email}
    />
  );
}

function Header() {
  return (
    // Same dark surface as the site footer (kp-ink2), white type.
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
          <span className="ml-2 text-xl font-semibold text-white">
            KaiPai
          </span>
        </Link>
        <div className="flex items-center space-x-4">
          <Link
            href="/coaches"
            className="text-sm font-medium text-gray-300 hover:text-white"
          >
            Trova un coach
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

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      {children}
      <Footer />
      <IncomingCallListener />
    </section>
  );
}
