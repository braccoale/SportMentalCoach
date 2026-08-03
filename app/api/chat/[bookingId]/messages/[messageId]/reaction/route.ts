import { getUser } from '@/lib/db/queries';
import { toggleMessageReaction } from '@/lib/core/messages';

export async function POST(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ bookingId: string; messageId: string }>;
  }
) {
  const { bookingId: rawBookingId, messageId: rawMessageId } = await params;
  const bookingId = Number(rawBookingId);
  const messageId = Number(rawMessageId);
  const user = await getUser();

  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!Number.isInteger(bookingId) || !Number.isInteger(messageId)) {
    return Response.json({ error: 'Messaggio non valido.' }, { status: 400 });
  }

  let emoji = '';
  try {
    const body = (await req.json()) as { emoji?: unknown };
    emoji = typeof body.emoji === 'string' ? body.emoji : '';
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const result = await toggleMessageReaction(
    bookingId,
    messageId,
    user.id,
    emoji
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
