import { getApiUser } from '@/lib/auth/api-user';
import { setClosingNote } from '@/lib/core/ai-session-notes/session-close';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';

/** L'osservazione a caldo, scritta uscendo dalla videochiamata. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!allowRecordingMutation(user.id, 'bookmark')) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra un minuto.' },
      { status: 429 }
    );
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  let note: unknown;
  try {
    note = ((await request.json()) as { note?: unknown })?.note;
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }
  if (typeof note !== 'string') {
    return Response.json({ error: 'Nota non valida.' }, { status: 400 });
  }
  try {
    const saved = await setClosingNote({ sessionId, actorUserId: user.id, note });
    return Response.json({ saved });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
