import { getApiUser } from '@/lib/auth/api-user';
import { getRecordingStatus } from '@/lib/core/ai-session-notes/recording';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  const sessionId = Number((await params).id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }
  try {
    return Response.json({
      recording: await getRecordingStatus(sessionId, user.id),
    });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}

