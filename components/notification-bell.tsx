'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetcher } from '@/lib/fetcher';
import { formatDateTime } from '@/lib/core/format';
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/(dashboard)/dashboard/notifications/actions';

type Item = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: { link?: string } | null;
  readAt: string | null;
  createdAt: string;
};

type Data = {
  authenticated: boolean;
  unreadCount: number;
  items: Item[];
};

export function NotificationBell() {
  const { data, mutate } = useSWR<Data>('/api/notifications', fetcher, {
    refreshInterval: 30000,
  });
  const router = useRouter();

  if (!data?.authenticated) return null;
  const unread = data.unreadCount;

  async function open(item: Item) {
    const fd = new FormData();
    fd.set('id', String(item.id));
    await markNotificationReadAction(fd);
    await mutate();
    router.push(item.data?.link ?? '/dashboard/notifications');
  }

  async function markAll() {
    await markAllNotificationsReadAction();
    await mutate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="relative rounded-full p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
        <span className="sr-only">Notifiche</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="text-sm font-semibold text-gray-900">Notifiche</span>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="text-xs font-medium text-orange-600 hover:text-orange-700"
            >
              Segna tutte come lette
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">
              Nessuna notifica.
            </p>
          ) : (
            data.items.map((item) => (
              <button
                key={item.id}
                onClick={() => open(item)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-3 py-2 text-left hover:bg-gray-50 ${
                  item.readAt ? 'opacity-70' : ''
                }`}
              >
                <span className="flex w-full items-center gap-2">
                  {!item.readAt && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {item.title}
                  </span>
                </span>
                {item.body && (
                  <span className="text-xs text-gray-600">{item.body}</span>
                )}
                <span className="text-[11px] text-gray-400">
                  {formatDateTime(new Date(item.createdAt))}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-gray-100 px-3 py-2 text-center">
          <Link
            href="/dashboard/notifications"
            className="text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            Vedi tutte
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
