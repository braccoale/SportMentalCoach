import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getDirectChat, markDirectMessagesRead } from '@/lib/core/messages/direct';
import { DirectChatPanel } from './chat-panel';

export const dynamic = 'force-dynamic';

export default async function DirectChatPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const id = Number((await params).conversationId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(`/dashboard/messages/direct/${id}`)}`);
  const chat = await getDirectChat(id, user.id);
  if (!chat) notFound();
  if (!user.isDemo) await markDirectMessagesRead(id, user.id);
  const isAthlete = user.id === chat.context.athleteId;
  const name = (isAthlete ? chat.context.coachName : chat.context.athleteName) || (isAthlete ? 'Coach' : 'Atleta');
  return (
    <section className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <Link href={`/dashboard/${isAthlete ? 'athlete' : 'coach'}/messages`} className="text-sm text-gray-500 hover:text-gray-900">← Torna ai messaggi</Link>
      <header className="mb-5 mt-4">
        <h1 className="text-2xl font-semibold text-gray-900">Chat con {name}</h1>
        <p className="mt-1 text-sm text-gray-500">Parlate dei tuoi obiettivi e del percorso di coaching.</p>
        {isAthlete && <Link href={`/coaches/${chat.context.coachSlug}`} className="mt-2 inline-block text-sm text-blue-700 hover:underline">Vedi scheda coach</Link>}
      </header>
      <DirectChatPanel conversationId={id} currentUserId={user.id} initialMessages={chat.messages} readOnly={user.isDemo || chat.context.coachStatus !== 'approved'} />
    </section>
  );
}
