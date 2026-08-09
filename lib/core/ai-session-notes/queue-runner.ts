import 'server-only';
import { after } from 'next/server';
import {
  enqueueReadySessionCompassJobs,
  processAiNotesBatch,
} from './processing';
import { createProductionAiSessionNotesDependencies } from './dependencies';
import { logPipeline, pipelineErrorCode } from './pipeline-log';

/**
 * Fa avanzare la coda dentro la richiesta in corso, senza passare dalla rete.
 *
 * Il worker aveva una sola strada: una rotta HTTP che si sveglia da sola
 * richiamandosi. Quella strada ha tre modi di rompersi — il segreto, l'origine
 * da ricostruire, il dominio che redirige — e li ha usati tutti. Il lavoro
 * pero' non ha bisogno di attraversare la rete: gira benissimo qui, nello
 * stesso processo che sta gia' servendo la pagina.
 *
 * La rotta HTTP resta per il cron e per l'invocazione manuale. Questa e' la
 * strada che non puo' fallire per motivi di trasporto.
 *
 * Il lavoro e' breve per costruzione: consegnare l'audio al provider e
 * ritirarsi. La trascrizione vera arriva dopo, per callback, e non tiene
 * occupata nessuna invocazione.
 */

/** Poche unita' per volta: questa gira dentro la richiesta di un utente. */
const INLINE_LIMIT = 3;

/**
 * Una corsa per volta per istanza.
 *
 * Due richieste simultanee della stessa pagina non devono lanciare due corse:
 * il claim dei job e' gia' atomico sul database, ma il lavoro sprecato
 * rallenta la risposta di chi sta aspettando.
 */
let running = false;

export async function runAiNotesQueueInline(
  limit: number = INLINE_LIMIT
): Promise<void> {
  if (running) {
    // Non e' un errore: due richieste della stessa pagina non devono
    // lanciare due corse. Va registrato perche' se succede sempre, il
    // limite per corsa e' troppo basso.
    logPipeline({ phase: 'queue_run', outcome: 'skipped' });
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const dependencies = createProductionAiSessionNotesDependencies();
    await enqueueReadySessionCompassJobs({ limit }, dependencies);
    const result = await processAiNotesBatch(
      { workerId: `inline-${Date.now().toString(36)}`, limit },
      dependencies
    );
    logPipeline({
      phase: 'queue_run',
      outcome: 'ok',
      durationMs: Date.now() - startedAt,
      counts: {
        presi: result.claimed ?? 0,
        completati: result.completed ?? 0,
        falliti: result.failed ?? 0,
      },
    });
  } catch (error) {
    // Non deve mai far fallire la richiesta che l'ha ospitata: chi sta
    // guardando la pagina non c'entra nulla con la coda.
    logPipeline({
      phase: 'queue_run',
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      errorCode: pipelineErrorCode(error),
    });
  } finally {
    running = false;
  }
}

/** Come sopra, ma dopo la risposta: la pagina non deve rallentare. */
export function runAiNotesQueueAfterResponse(limit?: number): void {
  after(async () => {
    await runAiNotesQueueInline(limit);
  });
}
