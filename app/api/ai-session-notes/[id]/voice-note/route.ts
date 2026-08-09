import { getUser } from '@/lib/db/queries';
import {
  createCoachVoiceNote,
  MAX_VOICE_NOTE_BYTES,
} from '@/lib/core/ai-session-notes/voice-notes';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'];

/**
 * Riceve una nota vocale del coach.
 *
 * L'audio arriva come corpo grezzo, non come form: e' un solo file e non ha
 * campi che lo accompagnano, quindi il multipart aggiungerebbe solo peso.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
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

  const mimeType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim();
  if (!ALLOWED.includes(mimeType)) {
    return Response.json({ error: 'Formato audio non ammesso.' }, { status: 415 });
  }

  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.byteLength > MAX_VOICE_NOTE_BYTES) {
    return Response.json({ error: 'Nota vocale troppo lunga.' }, { status: 413 });
  }

  const rawDuration = Number(request.headers.get('x-duration-ms'));
  const durationMs =
    Number.isInteger(rawDuration) && rawDuration > 0 && rawDuration < 600_000
      ? rawDuration
      : null;

  try {
    const note = await createCoachVoiceNote({
      sessionId,
      actorUserId: user.id,
      audio,
      mimeType,
      durationMs,
    });
    return Response.json({ note });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
