/**
 * Il verdetto su ciascun servizio della piattaforma, separato dalle letture.
 *
 * Nasce da una regola che il cruscotto precedente non rispettava e che è
 * costata una giornata: **verde non è lo stato predefinito.** Un pannello che
 * scrive «Operativo» perché non ha visto errori sta dicendo «non ho guardato»
 * con la faccia di chi ha guardato. Il 16 agosto la coda era verde mentre
 * un'ora di seduta era già persa, e lo era correttamente: non c'era più
 * niente da fare, quindi niente da segnalare.
 *
 * Qui l'assenza di osservazioni ha uno stato suo — `non_monitorato` — e non
 * collassa nel successo. Quattro stati, e il quarto è quello onesto.
 *
 * Modulo puro: il giudizio si prova senza database, senza rete e senza
 * aspettare, come `pipeline-health-policy`.
 */

export type ServiceStatus =
  | 'operativo'
  | 'degradato'
  | 'errore'
  | 'non_monitorato';

/**
 * Oltre questa quota di fallimenti il servizio non è più «degradato»: è
 * rotto. Metà delle operazioni fallite non è un'anomalia di coda, è un
 * guasto.
 */
export const SERVICE_ERROR_RATIO = 0.5;

export type ServiceSignal = {
  key: string;
  label: string;
  /**
   * Il servizio è configurato in questo ambiente.
   *
   * Falso non è un guasto: in locale Deepgram non c'è, e dire «Errore»
   * insegnerebbe a ignorare il pannello proprio dove serve che sia creduto.
   */
  configured: boolean;
  /** Motivo per cui manca la configurazione, quando manca. */
  unconfiguredReason?: string;
  /** Operazioni riuscite nel periodo. `null` quando la misura non esiste. */
  ok: number | null;
  /** Operazioni fallite nel periodo. `null` quando la misura non esiste. */
  failed: number | null;
  /**
   * Un guasto che non ammette gradazioni — la coda ferma, un indirizzo di
   * callback irraggiungibile. Salta il conteggio e vale `errore`.
   */
  hardFailure?: { reason: string };
  /** Cosa stiamo misurando davvero, per il tooltip. */
  measures: string;
};

export type ServiceVerdict = {
  key: string;
  label: string;
  status: ServiceStatus;
  /** Una riga sola, già scritta: chi legge non deve interpretare i numeri. */
  message: string;
  measures: string;
  ok: number | null;
  failed: number | null;
};

export function assessService(signal: ServiceSignal): ServiceVerdict {
  const base = {
    key: signal.key,
    label: signal.label,
    measures: signal.measures,
    ok: signal.ok,
    failed: signal.failed,
  };

  if (!signal.configured) {
    return {
      ...base,
      status: 'non_monitorato',
      message:
        signal.unconfiguredReason ??
        'Non configurato in questo ambiente: nessuna misura disponibile.',
    };
  }

  if (signal.hardFailure) {
    return { ...base, status: 'errore', message: signal.hardFailure.reason };
  }

  if (signal.ok === null && signal.failed === null) {
    return {
      ...base,
      status: 'non_monitorato',
      message: 'Nessuna misura raccolta: il servizio non è osservabile da qui.',
    };
  }

  const ok = signal.ok ?? 0;
  const failed = signal.failed ?? 0;
  const total = ok + failed;

  if (total === 0) {
    return {
      ...base,
      status: 'non_monitorato',
      message:
        'Nessuna operazione nel periodo: non c’è abbastanza per dire che funziona.',
    };
  }

  if (failed === 0) {
    return {
      ...base,
      status: 'operativo',
      message: `${ok} ${ok === 1 ? 'operazione riuscita' : 'operazioni riuscite'}, nessun fallimento nel periodo.`,
    };
  }

  const ratio = failed / total;
  if (ratio >= SERVICE_ERROR_RATIO) {
    return {
      ...base,
      status: 'errore',
      message: `${failed} fallimenti su ${total}: più della metà delle operazioni non riesce.`,
    };
  }

  return {
    ...base,
    status: 'degradato',
    message: `${failed} ${failed === 1 ? 'fallimento' : 'fallimenti'} su ${total} nel periodo.`,
  };
}

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  operativo: 'Operativo',
  degradato: 'Degradato',
  errore: 'Errore',
  non_monitorato: 'Non monitorato',
};

/**
 * Il peggiore fra i verdetti, che è ciò che va scritto in cima.
 *
 * `non_monitorato` non è «peggio» di `operativo`: è un'altra dimensione — non
 * sapere non è un guasto — e non deve mai far diventare rossa una piattaforma
 * che sta funzionando. Conta però come «non tutto verde», e chi guarda deve
 * poterlo distinguere.
 */
export function worstServiceStatus(
  verdicts: readonly ServiceVerdict[]
): ServiceStatus {
  if (verdicts.some((v) => v.status === 'errore')) return 'errore';
  if (verdicts.some((v) => v.status === 'degradato')) return 'degradato';
  if (verdicts.some((v) => v.status === 'operativo')) return 'operativo';
  return 'non_monitorato';
}
