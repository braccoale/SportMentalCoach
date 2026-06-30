import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getNotifications } from '@/lib/core/notifications';
import { formatDateTime } from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const items = await getNotifications(user.id);
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Notifiche</h1>
        {hasUnread && (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm" className="rounded-full">
              Segna tutte come lette
            </Button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-gray-500">Non hai ancora notifiche.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {items.map((n) => {
            const link = (n.data?.link as string | undefined) ?? null;
            return (
              <li
                key={n.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-4 ${
                  n.readAt
                    ? 'border-gray-100 bg-white'
                    : 'border-orange-200 bg-orange-50'
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-gray-900">
                    {!n.readAt && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                    )}
                    {link ? (
                      <Link href={link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
                {!n.readAt && (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                    >
                      Segna come letta
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
