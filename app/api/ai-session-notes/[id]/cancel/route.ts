import { getUser } from '@/lib/db/queries';
import {
  getAiNotesSessionById,
  transitionAiNotesSession,
} from '@/lib/core/ai-session-notes';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';

export async function POST(
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

  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await transitionAiNotesSession({
      sessionId,
      nextStatus: 'cancelled',
      actorUserId: user.id,
    }, dependencies.liveKit);
    const session = await getAiNotesSessionById(sessionId, user.id);
    return Response.json({ session });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
