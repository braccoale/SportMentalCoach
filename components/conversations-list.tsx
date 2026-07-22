import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { formatDateTime } from '@/lib/core/format';
import { UserAvatar } from '@/components/user-avatar';
import type { Conversation } from '@/lib/core/messages';

/**
 * Conversation list for the "Messaggi" tab (coach + athlete). Each row links
 * to the booking chat; unread conversations show a red counter.
 */
export function ConversationsList({
  conversations,
}: {
  conversations: Conversation[];
}) {
  if (conversations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-gray-600">Nessuna conversazione.</p>
        <p className="mt-1 text-sm text-gray-400">
          La chat si apre quando una sessione viene accettata e resta
          disponibile con i coach con cui hai già lavorato.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => (
        <li key={c.bookingId}>
          <Link
            href={`/dashboard/chat/${c.bookingId}`}
            className={`flex items-center gap-4 rounded-xl border bg-white p-4 transition-colors hover:border-red-300 ${
              c.unread > 0 ? 'border-red-200' : 'border-gray-200'
            }`}
          >
            <UserAvatar
              name={c.otherName}
              src={c.otherAvatarUrl}
              className="size-11 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span
                  className={`truncate ${
                    c.unread > 0
                      ? 'font-semibold text-gray-900'
                      : 'font-medium text-gray-900'
                  }`}
                >
                  {c.otherName ?? 'Utente'}
                </span>
                {c.lastAt && (
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatDateTime(c.lastAt)}
                  </span>
                )}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span
                  className={`truncate text-sm ${
                    c.unread > 0 ? 'text-gray-800' : 'text-gray-500'
                  }`}
                >
                  {c.lastBody
                    ? `${c.lastFromMe ? 'Tu: ' : ''}${c.lastBody}`
                    : (c.serviceTitle ?? 'Nessun messaggio — scrivi tu il primo!')}
                </span>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
