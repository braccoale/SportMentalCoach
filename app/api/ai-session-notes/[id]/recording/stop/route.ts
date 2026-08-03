import { getUser } from '@/lib/db/queries';
import {
  getRecordingStatus,
  stopAiNotesRecordings,
} from '@/lib/core/ai-session-notes/recording';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';
import { isEmptyRecordingMutationBody } from '@/lib/core/ai-session-notes/recording-policy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!allowRecordingMutation(user.id, 'stop')) {
    return Response.json(
      { error: 'Troppe richieste. Riprova tra un minuto.' },
      { status: 429 }
    );
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  const raw = await request.text();
  if (!isEmptyRecordingMutationBody(raw)) {
    return Response.json(
      { error: 'La destinazione della registrazione è risolta dal server.' },
      { status: 400 }
    );
  }
  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await stopAiNotesRecordings({
      sessionId,
      actorUserId: user.id,
      reason: 'coach_requested',
      enforceCoach: true,
    }, dependencies.liveKit);
    return Response.json({
      recording: await getRecordingStatus(sessionId, user.id),
    });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
