/**
 * Le regole del percorso fra un coach e un atleta.
 *
 * **Che problema risolve.** Finora «questo coach segue questo atleta» era una
 * deduzione fatta a ogni lettura: esiste almeno una prenotazione fra i due, in
 * qualunque stato, da sempre (`coachHasRelationship`), più i preferiti
 * (`getAthleteRelationshipCoaches`). Una richiesta rifiutata bastava. Va bene
 * per ordinare un elenco di coach; non va bene per decidere a chi arriva quello
 * che una persona scrive di sé.
 *
 * Qui la relazione ha un inizio con un nome e una fine con una data, e ogni
 * decisione che la riguarda è una funzione pura: si può verificare senza
 * database, senza rete e senza un browser.
 *
 * **I quattro livelli restano separati.** È la distinzione che regge tutto il
 * resto:
 *
 * | | Cosa | Chiusura | Revoca |
 * |---|---|---|---|
 * | A | ricevere contributi nuovi | si spegne | si spegne |
 * | B | leggere lo storico condiviso | resta a entrambi | si spegne per il coach |
 * | C | revocare la condivisione | gesto a sé, solo dell'atleta | — |
 * | D | cancellare i dati | mai implicita | mai implicita |
 *
 * Chiudere un percorso non cancella la memoria di ciò che ci si è detti, e
 * revocare la condivisione non chiude il percorso. Sono due gesti, con due
 * testi e due conseguenze.
 *
 * Modulo puro: nessun `server-only`, nessun accesso al database.
 */

export type PathStatus = 'active' | 'closed';
export type PathActorRole = 'coach' | 'athlete';

/** Un percorso, ridotto a ciò che serve per decidere. */
export type PathState = {
  id: number;
  coachUserId: number;
  athleteUserId: number;
  status: PathStatus;
  closedByRole: PathActorRole | null;
  /** L'atleta ha revocato la condivisione dei propri contributi. */
  contributionsRevokedAt: Date | null;
};

export type PathDecision<T> =
  | { allowed: true; outcome: T }
  | { allowed: false; reason: PathRefusal; message: string };

export type PathRefusal =
  | 'NOT_A_PARTICIPANT'
  | 'PATH_CLOSED'
  | 'PATH_ALREADY_ACTIVE'
  | 'CONTRIBUTIONS_REVOKED'
  | 'FUTURE_BOOKING_EXISTS'
  | 'NOT_THE_CLOSER'
  | 'SAME_PERSON';

const MESSAGES: Record<PathRefusal, string> = {
  NOT_A_PARTICIPANT: 'Non fai parte di questo percorso.',
  PATH_CLOSED: 'Il percorso è chiuso: non puoi aggiungere altro.',
  PATH_ALREADY_ACTIVE: 'Il percorso è già attivo.',
  CONTRIBUTIONS_REVOKED:
    'Hai smesso di condividere i tuoi contributi in questo percorso.',
  FUTURE_BOOKING_EXISTS:
    'C’è ancora una sessione in calendario. Annullala, oppure chiudi il percorso dopo.',
  NOT_THE_CLOSER: 'Il percorso è chiuso dall’altra persona: solo lei può riaprirlo.',
  SAME_PERSON: 'Coach e atleta non possono essere la stessa persona.',
};

function refuse<T>(reason: PathRefusal, message?: string): PathDecision<T> {
  return { allowed: false, reason, message: message ?? MESSAGES[reason] };
}

function allow<T>(outcome: T): PathDecision<T> {
  return { allowed: true, outcome };
}

/**
 * Chi partecipa a questo percorso, e in che veste.
 *
 * `null` non significa «errore»: significa che chi sta chiedendo non c'entra,
 * ed è la risposta corretta anche per un amministratore, che infatti passa da
 * un'altra strada.
 */
export function roleInPath(
  path: PathState,
  userId: number
): PathActorRole | null {
  if (path.coachUserId === userId) return 'coach';
  if (path.athleteUserId === userId) return 'athlete';
  return null;
}

// ---------------------------------------------------------------------------
// Attivazione
// ---------------------------------------------------------------------------

/**
 * Gli stati di prenotazione che autorizzano l'apertura di un percorso.
 *
 * **Uno solo**, e non per prudenza: `accepted` è il primo istante in cui il
 * coach ha detto sì *a questa persona*. `requested` è una domanda senza
 * risposta; `declined`, `expired` e `cancelled` sono risposte negative; un
 * preferito è una scelta unilaterale dell'atleta, che il coach potrebbe non
 * sapere nemmeno. Nessuno dei quattro è un consenso, e nessuno dei quattro può
 * aprire la porta a cui poi si affacciano i contributi.
 */
export const PATH_ACTIVATING_BOOKING_STATUSES = ['accepted'] as const;

export function bookingActivatesPath(status: string): boolean {
  return (PATH_ACTIVATING_BOOKING_STATUSES as readonly string[]).includes(status);
}

export type PathActivationPlan =
  /** Non esiste: si crea, attivo. */
  | { kind: 'create' }
  /** Esiste ed è già attivo: non si tocca. */
  | { kind: 'noop' }
  /**
   * Esiste ma è chiuso. **Non si riapre da soli.** Si propone a chi l'ha
   * chiuso, e finché non accetta la sessione si svolge lo stesso — la chiamata
   * non dipende dal percorso — ma non si registrano contributi.
   */
  | { kind: 'propose_reopen'; toRole: PathActorRole };

/**
 * Cosa fare quando una prenotazione raggiunge `accepted`.
 *
 * Non riaprire in automatico è la regola che costa di più scrivere e vale di
 * più: chi ha chiuso un percorso lo ha fatto per una ragione, e riaprirlo
 * perché è comparso un appuntamento rimetterebbe in circolo contributi che
 * qualcuno aveva deliberatamente fermato — senza dirglielo.
 */
export function planPathActivation(params: {
  existing: PathState | null;
  bookingStatus: string;
  coachUserId: number;
  athleteUserId: number;
}): PathDecision<PathActivationPlan> {
  if (params.coachUserId === params.athleteUserId) return refuse('SAME_PERSON');
  if (!bookingActivatesPath(params.bookingStatus)) return allow({ kind: 'noop' });
  if (!params.existing) return allow({ kind: 'create' });
  if (params.existing.status === 'active') return allow({ kind: 'noop' });
  return allow({
    kind: 'propose_reopen',
    // Chi ha chiuso decide. Senza il ruolo registrato — righe vecchie di un
    // eventuale ripristino — si propone all'atleta, che è la parte protetta.
    toRole: params.existing.closedByRole ?? 'athlete',
  });
}

// ---------------------------------------------------------------------------
// Chiusura e riapertura
// ---------------------------------------------------------------------------

export type PathClosurePlan = { closedByRole: PathActorRole };

/**
 * Chiudere un percorso.
 *
 * **Non cancella nessuna prenotazione**, e con una sessione futura in
 * calendario si rifiuta invece di procedere: chiudere sarebbe una disdetta
 * mascherata da impostazione, con conseguenze che il testo del pulsante non
 * annuncia. Chi vuole davvero chiudere passa dalla disdetta, che ha già le sue
 * notifiche e il suo preavviso.
 */
export function authorizePathClosure(params: {
  path: PathState;
  actorUserId: number;
  hasFutureAcceptedBooking: boolean;
}): PathDecision<PathClosurePlan> {
  const role = roleInPath(params.path, params.actorUserId);
  if (!role) return refuse('NOT_A_PARTICIPANT');
  if (params.path.status === 'closed') return refuse('PATH_CLOSED', 'Il percorso è già chiuso.');
  if (params.hasFutureAcceptedBooking) return refuse('FUTURE_BOOKING_EXISTS');
  return allow({ closedByRole: role });
}

/** Riapre solo chi ha chiuso: è la simmetria che rende la chiusura una tutela. */
export function authorizePathReopen(params: {
  path: PathState;
  actorUserId: number;
}): PathDecision<{ role: PathActorRole }> {
  const role = roleInPath(params.path, params.actorUserId);
  if (!role) return refuse('NOT_A_PARTICIPANT');
  if (params.path.status === 'active') return refuse('PATH_ALREADY_ACTIVE');
  if (params.path.closedByRole && params.path.closedByRole !== role) {
    return refuse('NOT_THE_CLOSER');
  }
  return allow({ role });
}

// ---------------------------------------------------------------------------
// I quattro livelli
// ---------------------------------------------------------------------------

/** A — l'atleta può aggiungere qualcosa di nuovo su questo percorso? */
export function authorizeNewContribution(params: {
  path: PathState;
  athleteUserId: number;
}): PathDecision<{ pathId: number }> {
  if (params.path.athleteUserId !== params.athleteUserId) {
    return refuse('NOT_A_PARTICIPANT');
  }
  if (params.path.status !== 'active') return refuse('PATH_CLOSED');
  if (params.path.contributionsRevokedAt) return refuse('CONTRIBUTIONS_REVOKED');
  return allow({ pathId: params.path.id });
}

/**
 * B — il coach può leggere i contributi dell'atleta su questo percorso?
 *
 * Un percorso chiuso **non** toglie la lettura: quello che ci si è detti resta
 * a entrambi. La toglie solo la revoca, che è un gesto dell'atleta e riguarda
 * proprio questo.
 */
export function coachMayReadContributions(params: {
  path: PathState;
  coachUserId: number;
}): boolean {
  return (
    params.path.coachUserId === params.coachUserId &&
    params.path.contributionsRevokedAt === null
  );
}

/** C — la revoca è dell'atleta, e non chiude il percorso. */
export function authorizeContributionRevocation(params: {
  path: PathState;
  actorUserId: number;
}): PathDecision<{ pathId: number }> {
  if (params.path.athleteUserId !== params.actorUserId) {
    return refuse('NOT_A_PARTICIPANT', 'Solo l’atleta può revocare la condivisione.');
  }
  return allow({ pathId: params.path.id });
}

/**
 * Fra più percorsi attivi, quello proposto per primo.
 *
 * Con due coach, un contributo senza destinatario esplicito è un contributo che
 * può arrivare alla persona sbagliata: chi chiama deve **imporre la scelta**
 * quando questa funzione restituisce più di un candidato. Qui si decide solo
 * l'ordine, non che si possa saltare la domanda.
 */
export function activePathsInOrder<T extends PathState>(
  paths: readonly T[],
  options: { nextSessionByPathId?: ReadonlyMap<number, Date | null> } = {}
): T[] {
  const nextSession = options.nextSessionByPathId ?? new Map<number, Date | null>();
  return paths
    .filter((path) => path.status === 'active' && !path.contributionsRevokedAt)
    .slice()
    .sort((left, right) => {
      const l = nextSession.get(left.id)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const r = nextSession.get(right.id)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (l !== r) return l - r;
      return left.id - right.id;
    });
}

/**
 * Il destinatario si sceglie da soli, o lo si deve chiedere?
 *
 * Con un percorso attivo solo, il destinatario è una riga di testo. Con due o
 * più, la scelta è obbligatoria e non precompilata.
 */
export function recipientNeedsExplicitChoice(activePathCount: number): boolean {
  return activePathCount > 1;
}
