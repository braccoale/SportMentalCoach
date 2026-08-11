/**
 * Il giudizio sulla salute della pipeline, separato dalle letture.
 *
 * Modulo puro come `session-deadlines`: i numeri li dà il database, il
 * verdetto lo dà questa funzione — e un verdetto si prova senza rete, senza
 * database e senza aspettare. È la parte che deve restare corretta anche
 * quando tutto il resto cambia.
 */

/** Oltre questo, un job pronto e non tentato non è più «sta per partire». */
export const STUCK_JOB_MINUTES = 10;

/**
 * Oltre questo una sessione in `processing` è sospetta. Generoso: una seduta
 * lunga con audio da trascrivere può occupare parecchio.
 */
export const STUCK_SESSION_MINUTES = 45;

export type PipelineHealth = {
  verdict: 'ok' | 'idle' | 'stuck';
  /** Job pronti da lavorare, e da quanto aspetta il più vecchio. */
  readyJobs: number;
  oldestReadyMinutes: number | null;
  /** Job pronti che nessuno ha mai tentato: il segnale che conta. */
  untouchedJobs: number;
  /** Sessioni ferme in `processing` oltre la scadenza. */
  stuckSessions: number;
  /** Ultimo momento in cui un job si è mosso davvero. */
  lastJobActivityAt: Date | null;
  /** Cosa dire a chi guarda, senza fargli interpretare i numeri. */
  message: string;
};

/**
 * Il verdetto, separato dalle letture perché è la parte che vale la pena
 * provare: i numeri li dà il database, il giudizio lo dà questa funzione.
 */
export function assessPipeline(input: {
  readyJobs: number;
  oldestReadyMinutes: number | null;
  untouchedJobs: number;
  stuckSessions: number;
  lastJobActivityAt: Date | null;
}): Pick<PipelineHealth, 'verdict' | 'message'> {
  const { untouchedJobs, oldestReadyMinutes, stuckSessions, readyJobs } = input;

  if (
    untouchedJobs > 0 &&
    oldestReadyMinutes !== null &&
    oldestReadyMinutes >= STUCK_JOB_MINUTES
  ) {
    return {
      verdict: 'stuck',
      message: `${untouchedJobs} ${untouchedJobs === 1 ? 'lavoro fermo' : 'lavori fermi'} da ${oldestReadyMinutes} minuti senza che nessuno li abbia presi: il worker non sta girando.`,
    };
  }

  if (stuckSessions > 0) {
    return {
      verdict: 'stuck',
      message: `${stuckSessions} ${stuckSessions === 1 ? 'sessione ferma' : 'sessioni ferme'} in elaborazione oltre la scadenza.`,
    };
  }

  if (readyJobs > 0) {
    return {
      verdict: 'ok',
      message: `${readyJobs} in coda, presi in carico da poco: la pipeline sta lavorando.`,
    };
  }

  return { verdict: 'idle', message: 'Nessun lavoro in coda: tutto smaltito.' };
}

