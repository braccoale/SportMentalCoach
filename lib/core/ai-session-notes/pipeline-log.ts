/**
 * Il registro della pipeline.
 *
 * Stasera, per capire dove andava il tempo, ho dovuto ricostruire a mano da
 * quattro tabelle diverse. I `console.log` sparsi c'erano, ma dicevano cose
 * scritte a mano, ognuna con un formato suo, senza un identificativo comune
 * su cui raggruppare. Un log che non si può interrogare non è un log: è un
 * diario.
 *
 * Qui ogni riga ha la stessa forma — fase, sessione, esito, durata — quindi
 * si filtra per sessione e si legge il percorso completo, oppure si filtra
 * per fase e si vede dove il sistema perde tempo.
 *
 * Due regole non negoziabili:
 *
 * - **Nessun contenuto.** Mai una frase della trascrizione, mai una nota del
 *   coach, mai il nome dell'atleta. Nel registro entrano identificativi,
 *   conteggi e durate. È materiale sanitario: finisce in log conservati da
 *   terzi, e ciò che l'atleta ha detto in seduta non deve uscire da lì.
 * - **Nessun segreto.** Mai un token, mai una url firmata, mai una chiave.
 *   Degli indirizzi si registra l'origine, che basta a diagnosticare e non
 *   apre nulla.
 *
 * Modulo puro tranne la scrittura: la costruzione della riga si prova senza
 * catturare l'output.
 */

export type PipelinePhase =
  | 'session_close'
  | 'recording_stop'
  | 'transcription_submit'
  | 'transcription_callback'
  | 'transcription_fallback'
  | 'normalization'
  | 'report_generation'
  | 'queue_run'
  | 'session_expiry';

export type PipelineOutcome = 'started' | 'ok' | 'skipped' | 'failed';

export type PipelineEvent = {
  phase: PipelinePhase;
  outcome: PipelineOutcome;
  sessionId?: number;
  jobId?: number;
  /** Durata dell'operazione, quando ha senso misurarla. */
  durationMs?: number;
  /** Codice d'errore nostro, mai il messaggio del provider. */
  errorCode?: string;
  /** Conteggi: segmenti, job, richieste. Numeri, non contenuti. */
  counts?: Record<string, number>;
  /** Qualsiasi altra cosa utile, purche' non sia contenuto ne' segreto. */
  detail?: Record<string, string | number | boolean | null>;
};

/** La riga, prima di essere scritta. Separata per poterla verificare. */
export function pipelineLogLine(event: PipelineEvent): Record<string, unknown> {
  return {
    tag: 'ai-notes',
    phase: event.phase,
    outcome: event.outcome,
    ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
    ...(event.jobId === undefined ? {} : { jobId: event.jobId }),
    ...(event.durationMs === undefined
      ? {}
      : { durationMs: Math.round(event.durationMs) }),
    ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    ...(event.counts ? { counts: event.counts } : {}),
    ...(event.detail ? { detail: event.detail } : {}),
  };
}

/**
 * Scrive la riga.
 *
 * `console.error` per i fallimenti perche' su Vercel finiscono in un flusso
 * separato e si possono filtrare senza leggere tutto il resto.
 */
export function logPipeline(event: PipelineEvent): void {
  const line = pipelineLogLine(event);
  if (event.outcome === 'failed') {
    console.error(JSON.stringify(line));
    return;
  }
  console.log(JSON.stringify(line));
}

/**
 * Misura una fase e la registra, qualunque cosa succeda.
 *
 * Il fallimento viene registrato e poi rilanciato: chi chiama decide cosa
 * farne, il registro non se lo perde. Senza questo, le fasi che vanno male
 * sono esattamente quelle che non lasciano traccia.
 */
export async function trackPipeline<T>(
  event: Omit<PipelineEvent, 'outcome' | 'durationMs'>,
  run: () => Promise<T>,
  describe?: (result: T) => Pick<PipelineEvent, 'counts' | 'detail'>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    logPipeline({
      ...event,
      ...(describe ? describe(result) : {}),
      outcome: 'ok',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logPipeline({
      ...event,
      outcome: 'failed',
      durationMs: Date.now() - startedAt,
      errorCode: pipelineErrorCode(error),
    });
    throw error;
  }
}

/**
 * Il codice d'errore, mai il messaggio.
 *
 * Il messaggio di un provider puo' contenere l'url firmata che gli abbiamo
 * passato: nel registro non ci entra.
 */
export function pipelineErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  return 'UNEXPECTED_ERROR';
}
