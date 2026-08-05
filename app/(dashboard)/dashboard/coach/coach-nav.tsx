'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  CalendarDays,
  MessageSquare,
  Users2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CoachBadge } from '@/components/coach-badge';

const TABS = [
  { href: '/dashboard/coach', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/coach/athletes', label: 'I miei Atleti', icon: Users2 },
  { href: '/dashboard/coach/calendar', label: 'Calendario', icon: CalendarDays },
  { href: '/dashboard/coach/messages', label: 'Messaggi', icon: MessageSquare },
  { href: '/dashboard/coach/profile', label: 'Profilo', icon: UserRound },
  { href: '/dashboard/coach/services', label: 'Servizi', icon: Briefcase },
];

export function CoachNav({
  pendingCount = 0,
  unreadMessages = 0,
  coachName,
}: {
  pendingCount?: number;
  unreadMessages?: number;
  /** Printed on the hanging badge. */
  coachName?: string | null;
}) {
  const pathname = usePathname();

  return (
    <div className="relative border-b border-gray-200">
      <CoachBadge
        name={coachName}
        className="pointer-events-none absolute -top-1 right-10 z-10 hidden md:block"
      />
      <div className="flex items-center gap-3 px-6 pt-6">
        {/* Coach area branding. TODO: replace /logo.jpg with a dedicated
            coach-area icon asset when available. */}
        <Link href="/" aria-label="KaiPai — home">
          <img
            src="/logo.jpg"
            alt="KaiPai"
            className="h-9 w-9 rounded-lg object-cover"
          />
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">
          Area Coach
          {coachName && (
            <span className="font-normal text-gray-400"> · {coachName}</span>
          )}
        </h1>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => {
          // Exact match for the dashboard root, prefix match for sub-sections.
          const active =
            tab.href === '/dashboard/coach'
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
              {/* Pending-requests count on the Dashboard tab */}
              {tab.href === '/dashboard/coach' && pendingCount > 0 && (
                <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {/* Unread-messages count on the Messaggi tab */}
              {tab.href === '/dashboard/coach/messages' && unreadMessages > 0 && (
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
