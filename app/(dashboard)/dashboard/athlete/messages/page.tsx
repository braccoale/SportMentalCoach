import { requireRole } from '@/lib/core/auth';
import { getConversations } from '@/lib/core/messages';
import { getDirectConversations, getMessageableCoaches } from '@/lib/core/messages/direct';
import { NewMessageDialog } from '@/components/new-message-dialog';
import { ConversationsList } from '@/components/conversations-list';

export const dynamic = 'force-dynamic';

export default async function AthleteMessagesPage() {
  const user = await requireRole('athlete');
  const [sessionChats, directChats, messageableCoaches] = await Promise.all([getConversations(user.id), getDirectConversations(user.id), getMessageableCoaches(user.id)]);
  const conversations = [...sessionChats, ...directChats].sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));

  return (
    <section className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-gray-900">
          Messaggi ({conversations.length})
        </h2>
        <NewMessageDialog coaches={messageableCoaches} />
      </div>
      <ConversationsList conversations={conversations} />
    </section>
  );
}
