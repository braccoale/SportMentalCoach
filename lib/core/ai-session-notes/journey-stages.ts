/**
 * Le tappe del percorso: la striscia in cima alla scheda atleta.
 *
 * Un coach che apre la scheda di una persona non vuole leggere otto riepiloghi
 * per ricostruire dove sono arrivati insieme: vuole vedere l'arco. Dove il
 * problema è emerso, dove è stata introdotta una strategia, dove quella
 * strategia è stata applicata davvero, e dove si sta lavorando adesso.
 *
 * Quell'arco non è un campo del report, e non viene chiesto a un modello: si
 * ricava dai momenti chiave che il Session Compass ha già estratto e ancorato
 * a una frase della trascrizione. È una regola, quindi è pura, verificabile e
 * gratuita — e soprattutto ogni tappa sa dire da dove viene (`sourceMomentId`),
 * come i punti da riprendere della Mental Journey.
 *
 * La forma di uscita è un contratto con la grafica: il componente disegna
 * `JourneyStage[]` e non sa nient'altro. Se un domani la classificazione
 * diventa più fine — o passa da un modello — la striscia non cambia di un
 * pixel.
 */

import { withReturnTo } from './return-to';
import type { KeyMomentCategory } from './session-compass-contract';
import type { JourneyKeyMoment, MentalJourneyEntry } from './mental-journey';

export const JOURNEY_STAGE_KINDS = [
  'problema',
  'strategia',
  'applicazione',
  'progresso',
  'focus_attuale',
  'pianificata',
] as const;
export type JourneyStageKind = (typeof JOURNEY_STAGE_KINDS)[number];

/**
 * Sei card entrano in una riga su desktop e raccontano un arco. Oltre, la
 * striscia diventa un elenco: si scorre invece di leggersi in un colpo, che è
 * esattamente ciò che lo storico sotto fa già meglio.
 */
export const MAX_JOURNEY_STAGES = 6;

/**
 * Con una tappa sola non c'è un percorso da mostrare, c'è una seduta. La
 * striscia non si disegna: è la stessa regola per cui la linea del tempo del
 * riepilogo compare solo quando c'è dove andare.
 */
export const MIN_JOURNEY_STAGES = 2;

/**
 * Otto categorie di momento chiave, cinque colori nella legenda.
 *
 * Il raggruppamento non è estetico: risponde a «a che punto del lavoro siamo».
 * Un obiettivo dichiarato, una resistenza e un rischio dicono tutti che
 * qualcosa è *emerso*; un esercizio e una presa di consapevolezza che si sta
 * *provando una strada*; un impegno e la sua ripresa che quella strada è
 * *arrivata fuori dalla stanza*. La svolta è l'unica che parla di esito.
 */
const KIND_BY_CATEGORY: Record<
  KeyMomentCategory,
  Exclude<JourneyStageKind, 'focus_attuale'>
> = {
  goal: 'problema',
  resistance: 'problema',
  risk: 'problema',
  awareness: 'strategia',
  exercise: 'strategia',
  commitment: 'applicazione',
  follow_up: 'applicazione',
  turning_point: 'progresso',
};

export const JOURNEY_STAGE_LABELS: Record<JourneyStageKind, string> = {
  problema: 'Problema',
  strategia: 'Strategia',
  applicazione: 'Applicazione',
  progresso: 'Progresso',
  focus_attuale: 'Focus attuale',
  pianificata: 'Pianificata',
};

/**
 * Una seduta gia' fissata ma non ancora avvenuta.
 *
 * Sta nella striscia perche' il percorso non finisce sull'ultima seduta fatta:
 * finisce su quella che viene. Ma non e' una tappa come le altre — non ha un
 * riepilogo, non ha momenti chiave, e non c'e' niente da aprire. Per questo
 * porta `href: null`: e' il tipo stesso a impedire che diventi un link.
 */
export type PlannedSession = {
  bookingId: number;
  /** ISO. */
  scheduledFor: string;
  serviceTitle: string | null;
};

/** Oltre due, il futuro occupa la striscia piu' del percorso gia' fatto. */
export const MAX_PLANNED_STAGES = 2;

/**
 * Una seduta che sta fra due tappe.
 *
 * Sei card raccontano l'arco, ma da sole nascondono la densità: un anno e
 * mezzo di lavoro e sei incontri disegnerebbero la stessa identica linea. I
 * segni intermedi rimettono il ritmo — quante sedute, e con quali pause.
 */
export type JourneyTick = {
  sessionId: number;
  sessionDate: string | null;
  /** Dove cade fra la sua tappa e la successiva, da 0 a 1. */
  fraction: number;
};

/**
 * Un segno non si sovrappone mai a un pallino di tappa: sotto un pallino
 * grande sparirebbe, e una seduta che non si vede è una seduta che non c'è.
 */
const MIN_TICK_FRACTION = 0.07;
const MAX_TICK_FRACTION = 0.93;

export type JourneyStage = {
  sessionId: number;
  bookingId: number;
  kind: JourneyStageKind;
  /**
   * La categoria del momento che ha deciso la tappa. Serve alla grafica per
   * scegliere l'icona: dentro «Strategia» un esercizio e una presa di
   * consapevolezza sono la stessa fase ma non la stessa cosa, e due icone
   * diverse lo dicono senza aggiungere una parola.
   */
  category: KeyMomentCategory | null;
  title: string;
  /** Una riga: il tema principale della seduta. */
  description: string | null;
  sessionDate: string | null;
  /** L'ultima tappa del percorso: dove si sta lavorando adesso. */
  isCurrent: boolean;
  /** `null` su una seduta pianificata: non c'e' ancora niente da aprire. */
  href: string | null;
  /** Il momento chiave che ha deciso la tappa. Nessuna tappa senza provenienza. */
  sourceMomentId: string | null;
  relevance: 1 | 2 | 3;
  /**
   * `false` quando il riepilogo di quella seduta aspetta ancora la validazione
   * del coach. La tappa si disegna comunque — la seduta si è svolta, e un
   * percorso che comincia a esistere solo quando qualcuno preme «approva» è
   * più corto di quello reale — ma dichiara di essere provvisoria.
   */
  isApproved: boolean;
  /**
   * Consegnato all'atleta.
   *
   * Sta sulla tappa e non solo nella pagina della seduta perche' la domanda
   * del coach e' «di questo percorso, che cosa ha letto lui?»: una risposta
   * che si ottiene aprendo le sedute una per una non e' una risposta.
   */
  isShared: boolean;
  /** Una seduta in agenda, non ancora avvenuta: si guarda, non si apre. */
  isPlanned: boolean;
  /**
   * Le sedute fra questa tappa e la prossima. Vuoto sull'ultima.
   *
   * Vive dentro la tappa e non in un secondo array parallelo: due liste da
   * tenere allineate per indice sono due liste che prima o poi si disallineano.
   */
  ticksToNext: JourneyTick[];
};

/** Ordine cronologico crescente; una seduta senza data finisce in coda. */
function byDateAscending(
  left: { sessionDate: string | null },
  right: { sessionDate: string | null }
): number {
  const a = left.sessionDate
    ? Date.parse(left.sessionDate)
    : Number.MAX_SAFE_INTEGER;
  const b = right.sessionDate
    ? Date.parse(right.sessionDate)
    : Number.MAX_SAFE_INTEGER;
  return a - b;
}

/**
 * Il momento che decide la tappa: il più rilevante della seduta, e a parità di
 * rilevanza il primo in ordine di tempo — in un arco conta quando una cosa
 * accade la prima volta, non l'ultima volta che se ne è parlato.
 *
 * Un momento senza categoria non decide nulla: il campo è opzionale nei report
 * v1 già salvati, e tirare a indovinare una fase dal titolo sarebbe inventare.
 */
function decidingMoment(
  moments: readonly JourneyKeyMoment[]
): JourneyKeyMoment | null {
  const classifiable = moments.filter((moment) => moment.category != null);
  if (classifiable.length === 0) return null;
  return [...classifiable].sort((left, right) => {
    const byRelevance = (right.relevance ?? 1) - (left.relevance ?? 1);
    if (byRelevance !== 0) return byRelevance;
    return left.minute - right.minute;
  })[0];
}

function stageFor(
  entry: MentalJourneyEntry,
  backTo: string | null
): JourneyStage | null {
  const moment = decidingMoment(entry.keyMoments);
  if (!moment || !moment.category) return null;

  return {
    sessionId: entry.sessionId,
    bookingId: entry.bookingId,
    kind: KIND_BY_CATEGORY[moment.category],
    category: moment.category,
    title: moment.title,
    // Il tema principale della seduta, non la sintesi: sotto un titolo in
    // grassetto serve una riga che dica «di cosa si trattava», non tre.
    description: entry.focus,
    sessionDate: entry.sessionDate,
    isCurrent: false,
    // L'ancora, che `compassHref` non porta: senza, dalla striscia si atterra
    // in cima all'appuntamento invece che sul riepilogo.
    href: withReturnTo(`${entry.compassHref}#session-compass`, backTo),
    sourceMomentId: moment.id,
    relevance: moment.relevance ?? 1,
    isApproved: entry.isApproved,
    isShared: entry.sharedAt !== null,
    isPlanned: false,
    ticksToNext: [],
  };
}

/**
 * Le sedute comprese fra due tappe, collocate in proporzione al tempo.
 *
 * L'asse è volutamente spezzato: i pallini delle tappe restano incollati al
 * centro della loro card — quella è la grafica, e non si tocca — mentre tutto
 * ciò che sta in mezzo si distribuisce sul tempo reale dentro il segmento. Due
 * incontri ravvicinati e poi un mese di pausa si vedono; le card restano dove
 * devono stare.
 *
 * Conta tutte le sedute della cronistoria, validate e non: un segno dice «qui
 * c'è stato un incontro», e un incontro c'è stato a prescindere da chi ha
 * premuto approva.
 */
function ticksBetween(
  sessions: readonly { sessionId: number; sessionDate: string | null }[],
  from: JourneyStage,
  to: JourneyStage
): JourneyTick[] {
  const start = from.sessionDate ? Date.parse(from.sessionDate) : Number.NaN;
  const end = to.sessionDate ? Date.parse(to.sessionDate) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const between = sessions.filter((session) => {
    if (session.sessionId === from.sessionId) return false;
    if (session.sessionId === to.sessionId) return false;
    const at = session.sessionDate ? Date.parse(session.sessionDate) : Number.NaN;
    return Number.isFinite(at) && at >= start && at <= end;
  });

  const span = end - start;
  return between.map((session, index) => {
    // Segmento a durata nulla — più sedute nello stesso giorno: non c'è un
    // tempo che le separi, quindi si spartiscono lo spazio in parti uguali.
    const raw =
      span > 0
        ? (Date.parse(session.sessionDate!) - start) / span
        : (index + 1) / (between.length + 1);
    return {
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      fraction: Math.min(MAX_TICK_FRACTION, Math.max(MIN_TICK_FRACTION, raw)),
    };
  });
}

/**
 * Quali sedute meritano una tappa, quando sono più di quante ne entrino.
 *
 * La prima e l'ultima non si toccano mai: sono l'inizio del lavoro e il punto
 * in cui si è adesso, e un arco senza i suoi estremi non è un arco.
 *
 * Per le altre non basta ordinare per rilevanza e tagliare. Su cinquanta
 * sedute quella regola sceglieva le prime cinque «molto rilevanti» in ordine
 * di data e lasciava scoperto tutto l'ultimo anno: l'arco raccontava un
 * percorso finito ad aprile, con un salto fino a oggi. Un coach che apre la
 * scheda guarda soprattutto il lavoro recente, ed era proprio quello a
 * sparire.
 *
 * Quindi il percorso si divide prima in tante finestre quanti sono i posti
 * liberi, e ogni finestra manda la sua tappa più rilevante. La copertura è
 * garantita per costruzione: nessun tratto del percorso resta muto, per
 * quanto lungo sia. Dentro la finestra, a parità di rilevanza, vince la più
 * vecchia — lì la regola di prima è ancora quella giusta: conta la prima
 * volta che una cosa accade.
 *
 * Le finestre si contano in sedute, non in giorni: una pausa estiva non deve
 * consumare un posto, e una finestra vuota lascerebbe la striscia con meno
 * card del previsto.
 */
function selectStages(
  stages: readonly JourneyStage[],
  max: number
): JourneyStage[] {
  if (stages.length <= max) return [...stages];

  const first = stages[0];
  const last = stages[stages.length - 1];
  const middle = stages.slice(1, -1);
  const slots = Math.max(0, max - 2);
  if (slots === 0) return [first, last];

  const chosen: JourneyStage[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    const from = Math.floor((slot * middle.length) / slots);
    const to = Math.floor(((slot + 1) * middle.length) / slots);
    const window = middle.slice(from, to);
    if (window.length === 0) continue;
    // `>` stretto: a parità la campionessa resta la prima incontrata, cioè la
    // più vecchia della finestra.
    chosen.push(
      window.reduce((champion, candidate) =>
        candidate.relevance > champion.relevance ? candidate : champion
      )
    );
  }

  return [first, ...chosen, last].sort(byDateAscending);
}

/**
 * Costruisce la striscia a partire dalla timeline della Mental Journey.
 *
 * Riordina per conto proprio: la timeline arriva dalla più recente alla più
 * vecchia, e un percorso si legge nell'altro verso.
 */
function plannedStage(session: PlannedSession): JourneyStage {
  return {
    sessionId: -session.bookingId,
    bookingId: session.bookingId,
    kind: 'pianificata',
    category: null,
    title: 'Sessione pianificata',
    description: session.serviceTitle,
    sessionDate: session.scheduledFor,
    isCurrent: false,
    href: null,
    sourceMomentId: null,
    relevance: 1,
    isApproved: false,
    isShared: false,
    isPlanned: true,
    ticksToNext: [],
  };
}

export function buildJourneyStages(
  timeline: readonly MentalJourneyEntry[],
  options: {
    max?: number;
    planned?: readonly PlannedSession[];
    /** Dove riportare chi clicca una giornata: di norma la scheda da cui parte. */
    backTo?: string | null;
  } = {}
): JourneyStage[] {
  const max = options.max ?? MAX_JOURNEY_STAGES;

  const stages = timeline
    .map((entry) => stageFor(entry, options.backTo ?? null))
    .filter((stage): stage is JourneyStage => stage !== null)
    .sort(byDateAscending);

  const selected = selectStages(stages, max);

  // Le sedute in agenda si aggiungono in coda: sono il seguito del percorso,
  // non concorrono per un posto con quelle gia' avvenute.
  const planned = [...(options.planned ?? [])]
    .sort((left, right) => Date.parse(left.scheduledFor) - Date.parse(right.scheduledFor))
    .slice(0, MAX_PLANNED_STAGES)
    .map(plannedStage);

  if (selected.length === 0) {
    // Senza percorso alle spalle una sola seduta in agenda non racconta
    // niente: non e' un arco, e' un appuntamento.
    return planned.length >= MIN_JOURNEY_STAGES ? planned : [];
  }

  // Tutte le sedute del percorso, non solo quelle diventate tappa: i segni
  // intermedi devono contare anche gli incontri che non hanno prodotto una
  // svolta: sono lavoro anche quelli.
  const allSessions = timeline
    .map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
    }))
    .sort(byDateAscending);

  // «Dove siamo adesso» è l'ultima seduta **avvenuta**: una in agenda è dove
  // si andrà, che è un'altra cosa.
  const currentIndex = selected.length - 1;
  const past = selected.map((stage, index) => ({
    ...stage,
    ...(index === currentIndex
      ? { kind: 'focus_attuale' as const, isCurrent: true }
      : {}),
    ticksToNext:
      index < currentIndex
        ? ticksBetween(allSessions, stage, selected[index + 1])
        : [],
  }));

  return [...past, ...planned];
}
