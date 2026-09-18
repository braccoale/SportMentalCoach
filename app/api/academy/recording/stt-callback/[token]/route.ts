import { ingestAcademyTranscriptionCallback } from '@/lib/core/academy/recording/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Generazione del recap inclusa: una chiamata OpenAI, non solo scrittura su database. */
export const maxDuration = 60;

/**
 * Riceve la trascrizione Deepgram per una sessione Academy e, in caso di
 * successo, genera già il recap — nessun passaggio manuale in mezzo. Stesso
 * schema del token della pipeline prenotazioni: un 404 su un token
 * sconosciuto, indistinguibile dall'esterno tra "mai esistito" e "già usato".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  try {
    const outcome = await ingestAcademyTranscriptionCallback({ token, payload });
    if (outcome === 'unknown') {
      return Response.json({ error: 'Non trovato.' }, { status: 404 });
    }
    return Response.json({ received: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    console.error('[academy stt-callback] ingestione non riuscita', error);
    return Response.json({ error: 'Non elaborato.' }, { status: 500 });
  }
}
