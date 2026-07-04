'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  Shield,
  CalendarDays,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/coach', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/coach/calendar', label: 'Calendario', icon: CalendarDays },
  { href: '/dashboard/coach/messages', label: 'Messaggi', icon: MessageSquare },
  { href: '/dashboard/coach/profile', label: 'Coach', icon: UserRound },
  { href: '/dashboard/coach/services', label: 'Servizi', icon: Briefcase },
  { href: '/dashboard/coach/security', label: 'Sicurezza', icon: Shield },
];

export function CoachNav({
  pendingCount = 0,
  unreadMessages = 0,
}: {
  pendingCount?: number;
  unreadMessages?: number;
}) {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center gap-3 px-6 pt-6">
        {/* Coach area branding. TODO: replace /logo.jpg with a dedicated
            coach-area icon asset when available. */}
        <img
          src="/logo.jpg"
          alt="Kai Pai"
          className="h-9 w-9 rounded-lg object-cover"
        />
        <h1 className="text-xl font-semibold text-gray-900">Area Coach</h1>
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
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {/* Pending-requests count on the Dashboard tab */}
              {tab.href === '/dashboard/coach' && pendingCount > 0 && (
                <span className="absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                  {pendingCount}
                </span>
              )}
              {/* Unread-messages count on the Messaggi tab */}
              {tab.href === '/dashboard/coach/messages' && unreadMessages > 0 && (
                <span className="absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
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
