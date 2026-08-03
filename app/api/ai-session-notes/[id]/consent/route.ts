import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import {
  getAiNotesSessionById,
  recordAiNotesConsent,
} from '@/lib/core/ai-session-notes';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';

const consentSchema = z.object({
  decision: z.enum(['accepted', 'rejected', 'revoked']),
});

export async function POST(
  request: Request,
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
  const parsed = consentSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json({ error: 'Decisione non valida.' }, { status: 400 });
  }

  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await recordAiNotesConsent({
      sessionId,
      actorUserId: user.id,
      decision: parsed.data.decision,
      userAgent: request.headers.get('user-agent'),
    }, dependencies.liveKit);
    const session = await getAiNotesSessionById(sessionId, user.id);
    return Response.json({ session });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
