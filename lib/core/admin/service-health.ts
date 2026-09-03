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

/**
 * Una causa concreta dietro un servizio degradato.
 *
 * Esiste perche' «60 fallimenti su 159» non dice a nessuno se deve
 * intervenire. Ottantuno errori di dispositivo sparsi su otto sedute e
 * ottantuno sparsi su quaranta sono due situazioni opposte: la prima e' il
 * microfono di una persona, la seconda e' la piattaforma. Il numero da solo
 * non le distingue; la causa e la sua concentrazione si'.
 */
export type ServiceCause = {
  /** Codice tecnico, come sta in database: e' quello che si cerca nei log. */
  code: string;
  /** Come si chiama per una persona. */
  label: string;
  /** Quante volte, nell'unita' del servizio (sedute, consegne, tracce). */
  count: number;
  /** Che cosa vuol dire, e se e' il caso di fare qualcosa. */
  hint: string;
};

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
  /**
   * L'unita' del conteggio, al plurale: «sedute», «consegne», «tracce».
   *
   * Non e' cosmesi. La prima versione diceva «60 fallimenti su 159» dove il
   * 159 sommava eventi di natura diversa — stanze aperte, partecipanti
   * entrati, tracce pubblicate — cioe' volume di attivita', non operazioni
   * riuscite. Un rapporto costruito cosi' e' aritmeticamente vero e
   * semanticamente falso: dichiarare l'unita' costringe a scegliere un
   * denominatore che voglia dire qualcosa.
   */
  unit: string;
  /** La stessa unita' al singolare: «1 sedute» era la prima versione. */
  unitOne?: string;
  /** Le cause piu' frequenti, gia' ordinate. Vuoto quando non ce ne sono. */
  causes?: ServiceCause[];
  /** Dove si va a guardare davvero. */
  href?: string;
  /** L'etichetta del collegamento: un verbo, non «dettagli». */
  hrefLabel?: string;
  /**
   * Che cosa fare, quando c'e' qualcosa da fare.
   *
   * Deve essere ricavata dai dati, non consigliata a caso: «e' concentrato su
   * un coach» si legge dai numeri, «riavvia il servizio» no.
   */
  action?: string | null;
};

export type ServiceVerdict = {
  key: string;
  label: string;
  status: ServiceStatus;
  /** Una riga sola, già scritta: chi legge non deve interpretare i numeri. */
  message: string;
  measures: string;
  unit: string;
  unitOne: string;
  ok: number | null;
  failed: number | null;
  causes: ServiceCause[];
  href: string | null;
  hrefLabel: string | null;
  action: string | null;
  /** Vero quando c'è qualcosa da aprire: la voce diventa apribile. */
  expandable: boolean;
};

export function assessService(signal: ServiceSignal): ServiceVerdict {
  const causes = (signal.causes ?? []).filter((cause) => cause.count > 0);
  const base = {
    key: signal.key,
    label: signal.label,
    measures: signal.measures,
    unit: signal.unit,
    unitOne: signal.unitOne ?? signal.unit,
    ok: signal.ok,
    failed: signal.failed,
    causes,
    href: signal.href ?? null,
    hrefLabel: signal.hrefLabel ?? null,
    action: signal.action ?? null,
    expandable: causes.length > 0 || Boolean(signal.href),
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
      message: `${ok} su ${total} ${signal.unit} senza problemi nel periodo.`,
    };
  }

  const ratio = failed / total;
  const quota = `${failed} su ${total} ${signal.unit}`;
  const principale = causes[0];
  const coda = principale
    ? ` La causa più frequente: ${principale.label.toLowerCase()} (${principale.count}).`
    : '';

  if (ratio >= SERVICE_ERROR_RATIO) {
    return {
      ...base,
      status: 'errore',
      message: `${quota}: più della metà non riesce.${coda}`,
    };
  }

  return {
    ...base,
    status: 'degradato',
    message: `${quota} con problemi nel periodo.${coda}`,
  };
}

/**
 * Quanto e' concentrato un problema, detto in una frase.
 *
 * E' la differenza fra «il microfono di una persona» e «la piattaforma», e
 * nessun conteggio da solo la esprime: ottantuno errori su otto sedute di un
 * coach solo e ottantuno su quaranta sedute di nove coach sono lo stesso
 * numero e due problemi diversi. Si ricava dai dati — non e' un consiglio
 * inventato, e' una lettura.
 */
export function concentrationHint(params: {
  affected: number;
  people: number;
  peopleLabel: string;
}): string {
  if (params.affected === 0) return '';
  if (params.people <= 1) {
    return `Tutto concentrato su un ${params.peopleLabel} solo: è quasi certamente la sua postazione, non la piattaforma.`;
  }
  if (params.people >= params.affected) {
    return `Sparso su ${params.people} ${params.peopleLabel}: se cresce, guarda la piattaforma prima delle singole postazioni.`;
  }
  return `Su ${params.people} ${params.peopleLabel} diversi: guarda prima i più colpiti.`;
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

/**
 * Un conteggio con la sua unita', declinata.
 *
 * «1 sedute su 10» era la prima versione, ed e' il genere di sciatteria che
 * fa sembrare provvisorio tutto il resto della pagina — anche quando i numeri
 * sotto sono giusti.
 */
export function countWithUnit(
  count: number,
  unit: string,
  unitOne: string
): string {
  return `${count} ${count === 1 ? unitOne : unit}`;
}
