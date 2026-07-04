import { requireRole } from '@/lib/core/auth';
import { getConversations } from '@/lib/core/messages';
import { ConversationsList } from '@/components/conversations-list';

export const dynamic = 'force-dynamic';

export default async function AthleteMessagesPage() {
  const user = await requireRole('athlete');
  const conversations = await getConversations(user.id);

  return (
    <section className="flex flex-col gap-4 p-6">
      <h2 className="text-lg font-medium text-gray-900">
        Messaggi ({conversations.length})
      </h2>
      <ConversationsList conversations={conversations} />
    </section>
  );
}
