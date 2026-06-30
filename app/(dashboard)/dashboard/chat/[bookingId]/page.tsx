import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getChat } from '@/lib/core/messages';
import { formatDateTime } from '@/lib/core/format';
import { ChatPanel, type SerializedMessage } from './chat-panel';

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

  // Serialize for the client component (Date → ISO string).
  const initialMessages: SerializedMessage[] = messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    senderEmail: m.senderEmail,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));

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

      <ChatPanel
        bookingId={id}
        currentUserId={user.id}
        initialMessages={initialMessages}
      />
    </section>
  );
}
