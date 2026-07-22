'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  Shield,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/athlete', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/dashboard/athlete/calendar',
    label: 'Calendario',
    icon: CalendarDays,
  },
  {
    href: '/dashboard/athlete/messages',
    label: 'Messaggi',
    icon: MessageSquare,
  },
  {
    href: '/dashboard/athlete/profile',
    label: 'Atleta',
    icon: UserRound,
  },
  {
    href: '/dashboard/athlete/security',
    label: 'Sicurezza',
    icon: Shield,
  },
];

export function AthleteNav({
  unreadMessages = 0,
  athleteName,
}: {
  unreadMessages?: number;
  /** Shown next to the area title. */
  athleteName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="relative border-b border-gray-200">
      {/* KaiPai bottle — decorative, same spot as the coach badge. Desktop-only
          (`md:block`), so it's lazy-loaded: mobile never pays for it. */}
      <Image
        src="/BorracciaAI.jpg"
        alt=""
        aria-hidden
        width={268}
        height={320}
        loading="lazy"
        sizes="121px"
        className="pointer-events-none absolute -top-1 right-10 z-10 hidden h-36 w-auto rotate-6 rounded-xl object-cover shadow-xl ring-1 ring-black/10 md:block"
      />
      <div className="flex items-center gap-3 px-6 pt-6">
        <img
          src="/logo.jpg"
          alt="KaiPai"
          className="h-9 w-9 rounded-lg object-cover"
        />
        <h1 className="text-xl font-semibold text-gray-900">
          Area Atleta
          {athleteName && (
            <span className="font-normal text-gray-400"> · {athleteName}</span>
          )}
        </h1>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => {
          const active =
            tab.href === '/dashboard/athlete'
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-blue-900 text-blue-900'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {/* Unread-messages count on the Messaggi tab */}
              {tab.href === '/dashboard/athlete/messages' &&
                unreadMessages > 0 && (
                  <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {unreadMessages}
                  </span>
                )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
