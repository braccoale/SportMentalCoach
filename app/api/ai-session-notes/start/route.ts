import { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import {
  getAiNotesSessionById,
  startAiNotesSession,
} from '@/lib/core/ai-session-notes';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';

const startSchema = z.object({
  appointmentId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const parsed = startSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Appuntamento non valido.' }, { status: 400 });
  }

  try {
    const { sessionId } = await startAiNotesSession({
      bookingId: parsed.data.appointmentId,
      actorUserId: user.id,
    });
    const session = await getAiNotesSessionById(sessionId, user.id);
    return Response.json({ session }, { status: 201 });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
