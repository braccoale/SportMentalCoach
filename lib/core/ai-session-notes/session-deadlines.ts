/**
 * Le scadenze di ogni stato non terminale.
 *
 * La regola che governa tutta l'affidabilità della pipeline sta qui, in una
 * riga: **nessuno stato non terminale dura per sempre**. Alla scadenza
 * qualcuno decide, sempre, anche a costo di decidere male. Uno stato
 * terminale sbagliato si corregge; una rotellina che gira all'infinito no —
 * e il coach non ha modo nemmeno di sapere che c'è un problema.
 *
 * Le scadenze vivono in un unico posto invece che sparse fra worker e
 * manutenzione: erano tre costanti in tre file, e la quarta — quella che
 * mancava — è il difetto che ha lasciato una sessione a girare tutta la sera.
 *
 * Modulo puro e senza dipendenze: si prova che una sessione è scaduta senza
 * database, senza rete e senza aspettare.
 */

/** Come si chiama il tempo, quando la sessione non ha più lavoro vivo. */
export const NO_ACTIVE_WORK_MINUTES = 5;

/** Quanto si concede a una sessione che ha ancora lavoro in corso. */
export const ACTIVE_WORK_MINUTES = 45;

/**
 * Quanto si concede a una richiesta consegnata al provider.
 *
 * Deepgram in modalità callback risponde in secondi su audio breve e in
 * minuti su audio lungo. Venti minuti coprono entrambi con abbondanza: oltre,
 * la risposta non arriverà più e conviene riconsegnare l'audio.
 */
export const PROVIDER_RESPONSE_MINUTES = 20;

export type SessionDeadlineVerdict =
  | { expired: false }
  | { expired: true; reason: SessionDeadlineReason };

/**
 * Perché la sessione è scaduta.
 *
 * Non è un dettaglio interno: determina in quale stato terminale finisce e
 * che cosa legge il coach. `no_active_work` con una trascrizione vuota è
 * silenzio; con una trascrizione piena è un riepilogo che non è mai partito.
 */
export type SessionDeadlineReason = 'no_active_work' | 'work_too_slow';

/**
 * Se una sessione in `processing` ha superato la sua scadenza.
 *
 * Due scadenze diverse perché sono due situazioni diverse. Senza lavoro
 * attivo non c'è niente da aspettare: nessuno la farà avanzare, e cinque
 * minuti bastano a escludere una corsa del worker appena partita. Con lavoro
 * attivo si aspetta molto di più, perché una callback che tarda è normale e
 * chiudere una sessione che stava per completarsi è peggio del problema.
 */
export function processingDeadlineVerdict(params: {
  /** Ultimo momento in cui qualcosa si è mosso su questa sessione. */
  lastProgressAt: Date;
  activeJobCount: number;
  now: Date;
}): SessionDeadlineVerdict {
  const elapsedMinutes =
    (params.now.getTime() - params.lastProgressAt.getTime()) / 60_000;
  if (params.activeJobCount === 0) {
    return elapsedMinutes > NO_ACTIVE_WORK_MINUTES
      ? { expired: true, reason: 'no_active_work' }
      : { expired: false };
  }
  return elapsedMinutes > ACTIVE_WORK_MINUTES
    ? { expired: true, reason: 'work_too_slow' }
    : { expired: false };
}

/**
 * Lo stato terminale in cui far finire una sessione scaduta.
 *
 * Con una trascrizione in mano il guasto è a valle: la trascrizione c'è, è il
 * riepilogo che non è arrivato. Senza, il problema è a monte. Chiamarli
 * entrambi «trascrizione non riuscita» manderebbe a cercare nel posto
 * sbagliato metà delle volte.
 */
export function terminalStatusForExpiredSession(params: {
  hasTranscript: boolean;
}): 'transcription_failed' | 'report_failed' {
  return params.hasTranscript ? 'report_failed' : 'transcription_failed';
}

/**
 * Il codice motivo da scrivere sulla sessione.
 *
 * Il silenzio non è un guasto e non va raccontato come tale: è la differenza
 * fra mandare qualcuno a cercare un problema e dirgli che non c'era nulla da
 * trascrivere.
 */
export function expiryErrorCode(params: {
  reason: SessionDeadlineReason;
  hasTranscript: boolean;
  hasRecordedAudio: boolean;
}): string {
  if (params.hasTranscript) return 'REPORT_NOT_GENERATED';
  if (params.reason === 'no_active_work' && params.hasRecordedAudio) {
    return 'NO_SPEECH_DETECTED';
  }
  return 'TRANSCRIPTION_INCOMPLETE';
}
