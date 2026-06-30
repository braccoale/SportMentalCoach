import { getUser } from '@/lib/db/queries';
import { getChat } from '@/lib/core/messages';

// Participant-guarded message fetch. Realtime only nudges the client to call
// this endpoint; all access control (participant + accepted) lives here, never
// over the realtime channel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const chat = await getChat(id, user.id);
  if (!chat) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const messages = chat.messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    senderEmail: m.senderEmail,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  }));

  return Response.json({ messages });
}
