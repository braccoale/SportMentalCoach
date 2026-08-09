import { getUser } from '@/lib/db/queries';
import { addCoachBookmark } from '@/lib/core/ai-session-notes/coach-bookmarks-store';
import { aiNotesErrorResponse } from '@/lib/core/ai-session-notes/http';
import { allowRecordingMutation } from '@/lib/core/ai-session-notes/rate-limit';
import { isEmptyRecordingMutationBody } from '@/lib/core/ai-session-notes/recording-policy';

/**
 * Posa un segnalibro sulla sessione in corso.
 *
 * Un tocco durante la chiamata: nessun testo da scrivere, perché un coach
 * che scrive smette di guardare l'atleta. La posizione la calcola il server
 * dall'inizio della sessione, così il client non può spostarla.
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
  const raw = await request.text();
  if (!isEmptyRecordingMutationBody(raw)) {
    return Response.json(
      { error: 'Il momento del segnalibro è calcolato dal server.' },
      { status: 400 }
    );
  }
  try {
    const bookmark = await addCoachBookmark({
      sessionId,
      actorUserId: user.id,
    });
    // Un doppio tocco ravvicinato non e' un errore: si risponde comunque bene.
    return Response.json({ bookmark, duplicate: bookmark === null });
  } catch (error) {
    return aiNotesErrorResponse(error);
  }
}
