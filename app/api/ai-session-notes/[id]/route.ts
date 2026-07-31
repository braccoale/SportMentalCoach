import { getUser } from '@/lib/db/queries';
import { getAiNotesSessionById } from '@/lib/core/ai-session-notes';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  const session = await getAiNotesSessionById(sessionId, user.id);
  return session
    ? Response.json({ session })
    : Response.json({ error: 'Non trovato.' }, { status: 404 });
}
