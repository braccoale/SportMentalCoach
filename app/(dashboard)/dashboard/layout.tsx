'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  Home,
  Settings,
  Shield,
  Activity,
  Menu,
  LayoutDashboard
} from 'lucide-react';
import { ROLE_PRIORITY, ROLE_DASHBOARDS } from '@/lib/core/auth/role-routes';
import { getRoleLabel } from '@/lib/core/config';
import { fetcher } from '@/lib/fetcher';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { data } = useSWR<{ roles: string[] }>('/api/user/roles', fetcher);
  const roles = data?.roles ?? [];

  // Role dashboards the user can reach, highest-priority first.
  const roleNavItems = ROLE_PRIORITY.filter((r) => roles.includes(r)).map(
    (r) => ({
      href: ROLE_DASHBOARDS[r],
      icon: LayoutDashboard,
      label: getRoleLabel(r)
    })
  );

  const settingsNavItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/dashboard/general', icon: Settings, label: 'Generale' },
    { href: '/dashboard/activity', icon: Activity, label: 'Attività' },
    { href: '/dashboard/security', icon: Shield, label: 'Sicurezza' }
  ];

  const navItems = [...roleNavItems, ...settingsNavItems];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-68px)] max-w-7xl mx-auto w-full">
      {/* Mobile header */}
      <div className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 p-4">
        <div className="flex items-center">
          <span className="font-medium">Dashboard</span>
        </div>
        <Button
          className="-mr-3"
          variant="ghost"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden h-full">
        {/* Sidebar */}
        <aside
          className={`w-64 bg-white lg:bg-gray-50 border-r border-gray-200 lg:block ${
            isSidebarOpen ? 'block' : 'hidden'
          } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="h-full overflow-y-auto p-4">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={`shadow-none my-1 w-full justify-start ${
                    pathname === item.href ? 'bg-gray-100' : ''
                  }`}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-0 lg:p-4">{children}</main>
      </div>
    </div>
  );
}
