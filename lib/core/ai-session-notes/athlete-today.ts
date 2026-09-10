/**
 * Che cosa mostra «Oggi», e perché quella e non un'altra.
 *
 * **I due difetti che questa versione corregge.** Nella prima stesura gli stati
 * «coach assegnato ma nessuna azione» e «tutto completato» potevano essere veri
 * insieme, e non c'era modo di sapere quale vincesse. E «riscontro da
 * registrare» era uno stato, mentre registrare un riscontro è una cosa che si
 * può fare sempre: farne uno stato significava che la schermata cambiava faccia
 * per una condizione che non finisce mai.
 *
 * Qui gli stati sono sette, si valutano in ordine, e **la prima condizione vera
 * vince**: ciascuna nega quelle sopra, quindi non possono essere vere insieme.
 * «Per adesso è tutto» non è più fra loro — dopo una prova l'azione resta
 * aperta, e la schermata torna a mostrarla con una prova in più.
 *
 * **La regola sta sul server.** Il client riceve l'esito, non gli ingredienti:
 * è il modo in cui, in questo prodotto, web e app hanno smesso di divergere su
 * orari e stato delle richieste.
 *
 * Modulo puro: nessun `server-only`, nessun accesso al database.
 */

import { canJoinVideoNow, isRequestExpired } from '../sessions';

/** Quanto prima di una sessione la schermata smette di parlare d'altro. */
export const SESSION_SOON_MINUTES = 120;

/**
 * Finestra entro cui una sessione «tira» l'azione del suo percorso in cima.
 *
 * Con due coach, l'azione di cui si parlerà lunedì conta più di una concordata
 * un mese fa con l'altro. Sette giorni è l'intervallo tipico fra due sedute.
 */
export const UPCOMING_SESSION_WINDOW_DAYS = 7;

export type TodayStateKey =
  | 'can_join'
  | 'session_soon'
  | 'action'
  | 'awaiting_request'
  | 'no_action'
  | 'no_active_path'
  | 'brand_new';

/** Un'azione assegnata all'atleta, come la vede «Oggi». */
export type TodayAction = {
  commitmentId: number;
  pathId: number;
  title: string;
  coachName: string;
  dueDate: string | null;
  /** Quando è stata concordata: la data della seduta di origine. */
  agreedOn: Date | null;
  pausedAt: Date | null;
  pausedReason: string | null;
  /** Quante prove sono già state registrate, e quando l'ultima. */
  attemptCount: number;
  lastAttemptOn: string | null;
};

export type TodayBooking = {
  bookingId: number;
  pathId: number | null;
  scheduledFor: Date | null;
  durationMin: number | null;
  coachName: string;
};

export type TodayRequest = {
  bookingId: number;
  coachName: string;
  requestedAt: Date;
  scheduledFor: Date | null;
  durationMin: number | null;
};

export type TodayInput = {
  /** Percorsi attivi, cioè quelli che possono ricevere contributi. */
  activePathCount: number;
  /** Percorsi in tutto, chiusi compresi: distingue «mai iniziato» da «finito». */
  knownPathCount: number;
  closedPath: {
    pathId: number;
    coachName: string;
    closedByRole: 'coach' | 'athlete';
    closedAt: Date;
  } | null;
  actions: readonly TodayAction[];
  nextBooking: TodayBooking | null;
  requests: readonly TodayRequest[];
  now: Date;
};

export type TodayState = {
  key: TodayStateKey;
  /** L'azione da mostrare grande, quando lo stato ne ha una. */
  action: TodayAction | null;
  /** Le altre azioni aperte, in pausa comprese: restano raggiungibili. */
  otherActions: TodayAction[];
  /** Quante azioni aperte in tutto, incluse quelle in pausa. */
  openActionCount: number;
  nextBooking: TodayBooking | null;
  /** Vero solo quando la stanza è aperta adesso, secondo la regola del server. */
  canJoinNow: boolean;
  request: TodayRequest | null;
  closedPath: TodayInput['closedPath'];
};

/**
 * Un'azione in pausa non viene proposta, ma non sparisce.
 *
 * È la differenza fra «messa da parte» e «non esiste più»: resta nell'elenco,
 * con il pulsante per riprenderla, e il coach continua a vederla nella
 * preparazione.
 */
function isProposable(action: TodayAction): boolean {
  return action.pausedAt === null;
}

/**
 * Quale azione va in cima, con più azioni e più coach.
 *
 * Tre criteri, in quest'ordine: quella del percorso con una sessione vicina,
 * perché è quella di cui si parlerà; poi la più recente, perché è la più viva;
 * poi quella con meno prove, perché è quella su cui c'è meno da dire. Il numero
 * identificativo chiude i pareggi, così l'ordine non cambia fra due letture.
 */
export function selectPrincipalAction(
  actions: readonly TodayAction[],
  options: { pathsWithUpcomingSession?: ReadonlySet<number> } = {}
): TodayAction | null {
  const upcoming = options.pathsWithUpcomingSession ?? new Set<number>();
  const candidates = actions.filter(isProposable);
  if (candidates.length === 0) return null;

  return candidates.slice().sort((left, right) => {
    const byUpcoming =
      Number(upcoming.has(right.pathId)) - Number(upcoming.has(left.pathId));
    if (byUpcoming !== 0) return byUpcoming;

    const byRecency =
      (right.agreedOn?.getTime() ?? 0) - (left.agreedOn?.getTime() ?? 0);
    if (byRecency !== 0) return byRecency;

    const byAttempts = left.attemptCount - right.attemptCount;
    if (byAttempts !== 0) return byAttempts;

    return left.commitmentId - right.commitmentId;
  })[0];
}

/** I percorsi che hanno una sessione entro la finestra. */
export function pathsWithUpcomingSession(
  bookings: readonly TodayBooking[],
  now: Date
): Set<number> {
  const limit = now.getTime() + UPCOMING_SESSION_WINDOW_DAYS * 86_400_000;
  const paths = new Set<number>();
  for (const booking of bookings) {
    if (booking.pathId === null || !booking.scheduledFor) continue;
    const at = booking.scheduledFor.getTime();
    if (at >= now.getTime() && at <= limit) paths.add(booking.pathId);
  }
  return paths;
}

/**
 * La richiesta ancora in attesa che vale la pena mostrare.
 *
 * Le scadute non sono attese: sono risposte mancate, e dirle «in attesa»
 * farebbe aspettare qualcuno per niente. La regola di scadenza è quella del
 * server, `isRequestExpired`, non una soglia riscritta qui.
 */
export function selectPendingRequest(
  requests: readonly TodayRequest[],
  now: Date
): TodayRequest | null {
  const live = requests.filter(
    (request) => !isRequestExpired(request.requestedAt, request.scheduledFor, now)
  );
  if (live.length === 0) return null;
  return live
    .slice()
    .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())[0];
}

/**
 * Lo stato di «Oggi».
 *
 * L'ordine è quello dell'urgenza vera: una sessione che sta per cominciare è
 * l'unica cosa con una scadenza al minuto, e batte tutto il resto.
 */
export function selectTodayState(input: TodayInput): TodayState {
  const { now } = input;

  const openActions = input.actions;
  const upcomingPaths = pathsWithUpcomingSession(
    input.nextBooking ? [input.nextBooking] : [],
    now
  );
  const principal = selectPrincipalAction(openActions, {
    pathsWithUpcomingSession: upcomingPaths,
  });
  const request = selectPendingRequest(input.requests, now);

  /*
   * «Si può entrare adesso?» la decide `canJoinVideoNow`, la stessa funzione
   * che apre la stanza sul web e nell'app. La prima stesura di questo modulo
   * usava una soglia di sessanta minuti inventata: la stanza in realtà apre
   * cinque minuti prima e chiude alla fine della durata concordata, e una
   * schermata che dicesse «Entra» un'ora prima manderebbe qualcuno a sbattere
   * contro un rifiuto del server.
   */
  const canJoin = input.nextBooking
    ? canJoinVideoNow(
        input.nextBooking.scheduledFor,
        input.nextBooking.durationMin,
        now
      )
    : false;

  const base = {
    action: principal,
    otherActions: openActions.filter(
      (action) => action.commitmentId !== principal?.commitmentId
    ),
    openActionCount: openActions.length,
    nextBooking: input.nextBooking,
    canJoinNow: canJoin,
    request,
    closedPath: input.closedPath,
  };

  if (canJoin) return { ...base, key: 'can_join' };

  if (input.nextBooking?.scheduledFor) {
    const minutesAway =
      (input.nextBooking.scheduledFor.getTime() - now.getTime()) / 60_000;
    if (minutesAway > 0 && minutesAway <= SESSION_SOON_MINUTES) {
      return { ...base, key: 'session_soon' };
    }
  }

  if (principal) return { ...base, key: 'action' };
  if (request) return { ...base, key: 'awaiting_request' };
  if (input.activePathCount > 0) return { ...base, key: 'no_action' };
  if (input.knownPathCount > 0) return { ...base, key: 'no_active_path' };
  return { ...base, key: 'brand_new' };
}

/**
 * Il testo di ogni stato, in italiano, già pronto.
 *
 * Sta qui e non nella schermata per due ragioni: web e app devono dire la
 * stessa cosa, e un vuoto va spiegato — «Nessun elemento» non è uno stato
 * vuoto finito. Ogni vuoto dice **perché** è vuoto e che cosa lo riempirebbe,
 * e nessuno dei quattro propone un esercizio inventato.
 */
export function todayCopy(state: TodayState): { title: string; body: string } {
  const coach =
    state.action?.coachName ??
    state.nextBooking?.coachName ??
    state.request?.coachName ??
    state.closedPath?.coachName ??
    'il tuo coach';

  switch (state.key) {
    case 'can_join':
      return { title: 'Puoi entrare.', body: `Sessione con ${coach}.` };
    case 'session_soon':
      return {
        title: 'Fra poco cominci.',
        body: 'La stanza apre 5 minuti prima dell’orario.',
      };
    case 'action':
      return {
        title: state.action?.title ?? '',
        body:
          state.action && state.action.attemptCount > 0
            ? `Concordata con ${coach}. L’hai già provata ${state.action.attemptCount} ${
                state.action.attemptCount === 1 ? 'volta' : 'volte'
              }.`
            : `Concordata con ${coach}.`,
      };
    case 'awaiting_request':
      return {
        title: `Hai chiesto una sessione a ${coach}.`,
        body: 'Ti avvisiamo appena risponde.',
      };
    case 'no_action':
      return {
        title: 'Non c’è un’azione in corso.',
        body: `Le azioni nascono da una seduta, quando ne concordate una con ${coach}.`,
      };
    case 'no_active_path':
      return {
        title: `Il percorso con ${coach} è chiuso.`,
        body:
          state.closedPath?.closedByRole === 'athlete'
            ? 'L’hai chiuso tu. Quello che vi siete scritti resta qui, e puoi riaprirlo quando vuoi.'
            : `L’ha chiuso ${coach}. Quello che vi siete scritti resta qui.`,
      };
    case 'brand_new':
      return {
        title: 'Non hai ancora un coach.',
        body: 'Scegli un coach e prenota la prima sessione: il percorso comincia da lì.',
      };
  }
}
