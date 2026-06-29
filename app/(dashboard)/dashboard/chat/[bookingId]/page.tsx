import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getChat } from '@/lib/core/messages';
import { formatDateTime } from '@/lib/core/format';
import { ChatComposer } from './chat-composer';

export const dynamic = 'force-dynamic';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    notFound();
  }

  const chat = await getChat(id, user.id);
  if (!chat) {
    // Not a participant, not found, or booking not accepted.
    notFound();
  }

  const { context, messages } = chat;
  const isClient = user.id === context.clientId;
  const otherName = isClient
    ? context.coachName ?? 'Coach'
    : context.clientName ?? context.clientEmail;
  const backHref = isClient ? '/dashboard/athlete' : '/dashboard/coach';

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <Link
        href={backHref}
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← Torna alla dashboard
      </Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          Chat con {otherName}
        </h1>
        <p className="text-sm text-gray-500">
          {context.serviceTitle ?? 'Sessione'}
          {context.scheduledFor
            ? ` · ${formatDateTime(context.scheduledFor)}`
            : ''}
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nessun messaggio. Inizia la conversazione.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user.id;
            return (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  mine
                    ? 'self-end bg-orange-500 text-white'
                    : 'self-start bg-gray-100 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    mine ? 'text-orange-100' : 'text-gray-400'
                  }`}
                >
                  {mine ? 'Tu' : m.senderName ?? m.senderEmail} ·{' '}
                  {formatDateTime(m.createdAt)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <ChatComposer bookingId={id} />
    </section>
  );
}
