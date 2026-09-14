import { getUser } from '@/lib/db/queries';
import { getDirectChat, markDirectMessagesRead, sendDirectMessage } from '@/lib/core/messages/direct';

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(_req: Request, { params }: Context) {
  const id = Number((await params).conversationId);
  const user = await getUser();
  if (!user || !Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'Chat non trovata.' }, { status: 404 });
  const chat = await getDirectChat(id, user.id);
  if (!chat) return Response.json({ error: 'Chat non trovata.' }, { status: 404 });
  if (!user.isDemo) await markDirectMessagesRead(id, user.id);
  return Response.json({ messages: chat.messages }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: Request, { params }: Context) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: 'Richiesta non valida.' }, { status: 403 });
  const id = Number((await params).conversationId);
  const user = await getUser();
  if (!user || !Number.isSafeInteger(id) || id <= 0) return Response.json({ error: 'Chat non trovata.' }, { status: 404 });
  if (user.isDemo) return Response.json({ error: 'La demo è in sola lettura.' }, { status: 403 });
  let data: unknown;
  try { data = await req.json(); } catch { return Response.json({ error: 'Messaggio non valido.' }, { status: 400 }); }
  if (!data || typeof data !== 'object' || !('body' in data) || typeof data.body !== 'string') return Response.json({ error: 'Messaggio non valido.' }, { status: 400 });
  const result = await sendDirectMessage(id, user.id, data.body);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  const chat = await getDirectChat(id, user.id);
  return Response.json({ messages: chat?.messages ?? [] });
}
