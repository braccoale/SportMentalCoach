import { after } from 'next/server';
import { ingestTranscriptionCallback } from '@/lib/core/ai-session-notes/stt-callback';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { triggerAiNotesWorker } from '@/lib/core/ai-session-notes/worker-trigger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** L'ingestione è scrittura su database, non attesa di rete: bastano pochi secondi. */
export const maxDuration = 60;

/**
 * Riceve i risultati della trascrizione dal provider Speech-to-Text.
 *
 * Il token nel percorso è l'unica credenziale, ed è per singola richiesta:
 * l'header `dg-token` di Deepgram è un identificatore di chiave, non un
 * segreto, e non basterebbe. Un token sconosciuto riceve 404, così chi sonda
 * dall'esterno non distingue una richiesta inesistente da una già consumata.
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
    const dependencies = createProductionAiSessionNotesDependencies();
    const outcome = await ingestTranscriptionCallback(
      { token, payload },
      dependencies
    );
    if (outcome === 'unknown') {
      return Response.json({ error: 'Non trovato.' }, { status: 404 });
    }
    if (outcome === 'ingested') {
      after(async () => {
        // Se restano segmenti da consegnare il job è tornato in coda: va
        // risvegliato subito, non alla prossima corsa del cron.
        await triggerAiNotesWorker().catch(() => {});
      });
    }
    // Una consegna già vista risponde comunque 2xx: altrimenti il provider
    // continuerebbe a ritentare qualcosa che abbiamo già trattato.
    return Response.json({ received: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    // Un 5xx fa ritentare il provider, che è il comportamento voluto quando
    // il guasto è nostro. Il messaggio resta nei log, mai nella risposta.
    console.error('[stt-callback] ingestione non riuscita', error);
    return Response.json({ error: 'Non elaborato.' }, { status: 500 });
  }
}
