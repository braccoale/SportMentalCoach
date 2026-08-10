/**
 * Quando vale la pena svegliare il worker da una richiesta dell'utente.
 *
 * Il worker ha due sveglie: il webhook LiveKit, che a volte non arriva, e il
 * cron, che sul piano Hobby scatta una volta al giorno. Fra le due c'è un
 * buco in cui la coda resta ferma per ore mentre il coach guarda la pagina e
 * aspetta.
 *
 * Questa è la terza sveglia: chi apre la pagina di una sessione in
 * elaborazione fa avanzare la propria coda. È la chiamata più affidabile che
 * abbiamo, perché parte dal browser di qualcuno che sta effettivamente
 * aspettando quel risultato.
 *
 * Modulo puro e senza dipendenze: la decisione si prova senza rete, senza
 * database e senza aspettare.
 */

/** Sotto questa soglia la sveglia è rumore: il worker sta già girando. */
export const WORKER_NUDGE_INTERVAL_MS = 20_000;

/**
 * Gli stati in cui c'è qualcosa da far avanzare.
 *
 * Mescola due vocabolari — quello della sessione e quello del report — perché
 * la domanda che ci si pone è una sola: c'è lavoro in sospeso? Chi chiama sa
 * quale stato ha in mano, e non deve tradurlo.
 */
const PENDING_STATUSES = new Set([
  'processing',
  'transcribing',
  'normalizing',
  'generating',
  'queued',
]);

export function isPendingAiNotesStatus(status: string | null | undefined): boolean {
  return typeof status === 'string' && PENDING_STATUSES.has(status);
}

/**
 * Gli stati in cui il lavoro è finito male ma può ancora ripartire.
 *
 * Il report fallisce regolarmente al primo tentativo — è un budget di tempo
 * stretto, non un guasto del modello — e il job torna in coda con i tentativi
 * che gli restano. Il punto è che la sessione, nel frattempo, è passata a
 * `report_failed`: prima quella parola spegneva la sveglia più affidabile che
 * abbiamo, proprio nel momento in cui c'era un tentativo pronto a partire. La
 * coda restava ferma fino al cron, che sul piano Hobby passa una volta al
 * giorno.
 *
 * Sono tenuti separati dagli stati "in corso" di proposito: all'interfaccia
 * una sessione fallita deve continuare a dirsi fallita, non a mostrare una
 * rotellina. Qui si risponde a un'altra domanda — vale la pena riprovare? —
 * e le due risposte non devono coincidere per forza.
 *
 * Se i tentativi sono esauriti la sveglia è innocua: il worker trova la coda
 * vuota e chiude. La soglia di `WORKER_NUDGE_INTERVAL_MS` evita comunque che
 * una pagina aperta la ripeta di continuo.
 */
const RETRYABLE_STATUSES = new Set(['report_failed', 'transcription_failed']);

export function isRetryableAiNotesStatus(
  status: string | null | undefined
): boolean {
  return typeof status === 'string' && RETRYABLE_STATUSES.has(status);
}

/**
 * Decide se questa richiesta debba svegliare il worker.
 *
 * `lastNudgeAt` è per sessione e vive in memoria: su serverless si azzera a
 * ogni istanza fredda, e va benissimo. Non serve una garanzia globale — serve
 * che una pagina aperta con il polling attivo non spari una sveglia al
 * secondo.
 */
export function shouldNudgeWorker(params: {
  status: string | null | undefined;
  lastNudgeAt: number | null;
  now: number;
}): boolean {
  if (
    !isPendingAiNotesStatus(params.status) &&
    !isRetryableAiNotesStatus(params.status)
  ) {
    return false;
  }
  if (params.lastNudgeAt === null) return true;
  return params.now - params.lastNudgeAt >= WORKER_NUDGE_INTERVAL_MS;
}
