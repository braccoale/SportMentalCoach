'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/athlete', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/dashboard/athlete/calendar',
    label: 'Calendario',
    icon: CalendarDays,
  },
];

export function AthleteNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200">
      <div className="flex items-center gap-3 px-6 pt-6">
        <img
          src="/logo.jpg"
          alt="Kai Pai"
          className="h-9 w-9 rounded-lg object-cover"
        />
        <h1 className="text-xl font-semibold text-gray-900">Area Atleta</h1>
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
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
