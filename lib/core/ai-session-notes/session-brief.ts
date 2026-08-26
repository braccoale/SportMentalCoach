import type { PointToRevisit } from './mental-journey';
import type { StoredJourneyGoal } from './journey-goals';
import { JOURNEY_GOAL_STATUS_LABELS } from './journey-goals';

/**
 * La sintesi che il coach legge nei minuti prima della seduta.
 *
 * **Perché esiste.** «Da portare in questa seduta» mostrava tre sole sorgenti:
 * i temi ricorrenti delle ultime sedute, gli impegni dell'atleta ancora
 * aperti, e i punti che l'ultimo riepilogo aveva lasciato. In produzione gli
 * impegni aperti sono una decina **in tutto**, circa uno per atleta: era
 * l'unica sorgente ricca usata, ed era la più povera che ci fosse.
 *
 * Intanto restavano inutilizzate tre cose che il coach aveva già prodotto di
 * suo pugno: i **segnalibri** messi dal vivo durante la chiamata (i momenti
 * che lui stesso ha marcato dicendo «questo conta»), la **nota libera** che
 * l'AI non scrive e non sovrascrive mai, e gli **obiettivi** concordati con
 * l'atleta. Nessuna delle tre arrivava al momento in cui servono.
 *
 * Questo modulo non produce contenuto nuovo: monta quello che c'è. Nessuna
 * chiamata al modello, nessun testo generato, niente che il coach non abbia
 * già letto e validato. È il motivo per cui può essere una funzione pura, e
 * per cui non può inventare niente di sbagliato.
 *
 * Modulo puro: nessun accesso al database, nessun `server-only`. Web e app
 * ricevono lo stesso esito, perché la regola è scritta una volta sola.
 */

/** Un obiettivo, ridotto a ciò che si legge in tre secondi. */
export type BriefGoal = {
  id: number;
  title: string;
  isPrimary: boolean;
  /** Etichetta già in italiano: il client non traduce uno stato. */
  statusLabel: string;
};

/** Che cosa resta dell'ultima seduta, in forma breve. */
export type BriefLastSession = {
  sessionId: number;
  bookingId: number | null;
  date: Date | null;
  /** La sintesi del riepilogo, tagliata se lunga. */
  summary: string | null;
  /** La nota libera del coach. L'AI non la produce mai. */
  coachNote: string | null;
  /** I momenti che il coach ha marcato dal vivo, con il minuto. */
  bookmarks: BriefBookmark[];
};

export type BriefBookmark = {
  id: number;
  /** Minuto della seduta, arrotondato per difetto. */
  minute: number;
  note: string | null;
  /**
   * Lo scambio attorno a quell'istante, **parola per parola** dalla
   * trascrizione, diviso per chi parla.
   *
   * Non un segmento solo: quelli durano due secondi e valgono trenta
   * caratteri, e citarne uno mostrava cose come «ad ascoltare di più» — un
   * frammento di respiro, non una cosa detta. Servono alcune battute perché si
   * capisca di che si stava parlando.
   *
   * È una citazione, non un riassunto: nessun modello la tocca, ed è questo
   * che la rende sicura da mostrare. Vuoto quando la trascrizione manca, e in
   * quel caso la riga lo dichiara invece di riempirsi.
   */
  turns: BriefTurn[];
};

/** Un pezzo di trascrizione, ridotto a ciò che serve per collocare un segnalibro. */
export type BriefTranscriptSegment = {
  startedAtMs: number;
  endedAtMs: number;
  text: string;
  speaker: 'coach' | 'athlete';
};

/** Una battuta: tutto quello che una persona dice di fila. */
export type BriefTurn = {
  speaker: 'coach' | 'athlete';
  text: string;
};

/**
 * Oltre questi numeri lo stralcio smette di essere un promemoria e diventa
 * la trascrizione. `EXPANDED` è quello che si vede aprendo; `COLLAPSED` è
 * quello che sta nella riga senza spingere via il resto della sintesi.
 */
export const MAX_EXCERPT_TURNS = 6;
export const MAX_EXCERPT_CHARS = 900;
export const COLLAPSED_EXCERPT_TURNS = 2;

/**
 * Quanto silenzio separa due battute della stessa persona.
 *
 * Sotto questa soglia sono la stessa frase spezzata dalla trascrizione; sopra,
 * è tornata a parlare dopo che ha parlato l'altro, o dopo una pausa vera.
 */
const TURN_GAP_MS = 10_000;

/**
 * Unisce i segmenti in battute.
 *
 * **Perché serve.** Deepgram non produce frasi: produce segmenti da un paio di
 * secondi e una trentina di caratteri. In una seduta reale sono seicento pezzi
 * come «Cioè in in campo» o «ad ascoltare di più» — citarne uno solo mostra un
 * frammento di respiro, non una cosa detta. Una seduta di prova con dodici
 * segmenti da cinquanta secondi funzionava benissimo, ed è esattamente il
 * motivo per cui il difetto non si è visto prima.
 *
 * L'unione non riformula niente: concatena il testo così com'è.
 */
export function buildTranscriptTurns(
  segments: readonly BriefTranscriptSegment[]
): (BriefTurn & { startedAtMs: number; endedAtMs: number })[] {
  const ordered = [...segments].sort((a, b) => a.startedAtMs - b.startedAtMs);
  const turns: (BriefTurn & { startedAtMs: number; endedAtMs: number })[] = [];

  for (const segment of ordered) {
    const text = segment.text.trim();
    if (!text) continue;
    const last = turns.at(-1);
    if (
      last &&
      last.speaker === segment.speaker &&
      segment.startedAtMs - last.endedAtMs <= TURN_GAP_MS
    ) {
      last.text = `${last.text} ${text}`.replace(/\s+/g, ' ');
      last.endedAtMs = Math.max(last.endedAtMs, segment.endedAtMs);
      continue;
    }
    turns.push({
      speaker: segment.speaker,
      text,
      startedAtMs: segment.startedAtMs,
      endedAtMs: segment.endedAtMs,
    });
  }

  return turns;
}

/**
 * Lo scambio attorno a un istante.
 *
 * Parte dalla battuta che contiene il segnalibro — o dalla prima che comincia
 * dopo, perché un segnalibro può cadere in un silenzio — e prosegue in avanti
 * finché non ha abbastanza materiale. In avanti e non indietro:
 * `bookmarkPositionMs` ha già arretrato l'istante di quindici secondi, quindi
 * quello che serve è ciò che viene dopo.
 */
export function excerptAt(
  segments: readonly BriefTranscriptSegment[],
  atMs: number,
  limits: { maxTurns?: number; maxChars?: number } = {}
): BriefTurn[] {
  const maxTurns = limits.maxTurns ?? MAX_EXCERPT_TURNS;
  const maxChars = limits.maxChars ?? MAX_EXCERPT_CHARS;

  const turns = buildTranscriptTurns(segments);
  const startIndex = turns.findIndex(
    (turn) => turn.endedAtMs >= atMs || turn.startedAtMs > atMs
  );
  if (startIndex === -1) return [];

  const excerpt: BriefTurn[] = [];
  let chars = 0;
  for (const turn of turns.slice(startIndex, startIndex + maxTurns)) {
    if (excerpt.length > 0 && chars + turn.text.length > maxChars) break;
    excerpt.push({ speaker: turn.speaker, text: turn.text });
    chars += turn.text.length;
  }
  return excerpt;
}

/**
 * Perché la sintesi è vuota. Non è una sfumatura: le due frasi da mostrare
 * sono diverse, e dire «non c'è ancora niente da riprendere» a un coach al
 * primo incontro con un atleta suona come un guasto, mentre «non ci sono
 * ancora sedute con un riepilogo» è semplicemente vero.
 */
export type BriefEmptyReason = 'no_sessions' | 'nothing_to_carry';

export type SessionBrief = {
  goals: BriefGoal[];
  lastSession: BriefLastSession | null;
  pointsToRevisit: readonly PointToRevisit[];
  /** Falso quando non c'è proprio niente da mostrare: il vuoto va spiegato. */
  hasContent: boolean;
  /** Valorizzato solo quando `hasContent` è falso. */
  emptyReason: BriefEmptyReason | null;
};

/**
 * Tetti scelti perché la sintesi resti leggibile in piedi, su un telefono, nel
 * quarto d'ora prima di una call. Oltre questi numeri non è più una sintesi.
 */
export const MAX_BRIEF_GOALS = 3;
export const MAX_BRIEF_BOOKMARKS = 3;
export const MAX_SUMMARY_CHARS = 240;

/**
 * Taglia sull'ultimo confine di parola prima del limite, e chiude con un
 * carattere di ellissi. Tagliare a metà parola fa sembrare il dato corrotto
 * invece che abbreviato.
 */
export function trimToLength(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Ordina gli obiettivi come il coach se li aspetta: prima quello primario,
 * poi la posizione che ha scelto lui. Gli archiviati non arrivano qui — li
 * esclude già `listJourneyGoals` — ma un `archivedAt` valorizzato verrebbe
 * comunque scartato a monte, non qui: questa funzione non decide chi è vivo.
 */
export function selectBriefGoals(
  goals: readonly StoredJourneyGoal[],
  max: number = MAX_BRIEF_GOALS
): BriefGoal[] {
  return [...goals]
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.position - b.position;
    })
    .slice(0, max)
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      isPrimary: goal.isPrimary,
      statusLabel: JOURNEY_GOAL_STATUS_LABELS[goal.status],
    }));
}

/**
 * I segnalibri più significativi dell'ultima seduta.
 *
 * Quelli **con una nota vengono prima**, e non per ordine cronologico: se il
 * coach si è fermato a scrivere qualcosa mentre parlava con qualcuno, quel
 * segnalibro vale più di uno lasciato muto. Fra pari resta l'ordine della
 * seduta, perché è così che la ricorda.
 */
export function selectBriefBookmarks(
  bookmarks: readonly { id: number; atMs: number; note: string | null }[],
  segments: readonly BriefTranscriptSegment[] = [],
  max: number = MAX_BRIEF_BOOKMARKS
): BriefBookmark[] {
  return [...bookmarks]
    .sort((a, b) => {
      const aHasNote = nonEmpty(a.note) !== null;
      const bHasNote = nonEmpty(b.note) !== null;
      if (aHasNote !== bHasNote) return aHasNote ? -1 : 1;
      return a.atMs - b.atMs;
    })
    .slice(0, max)
    .map((bookmark) => {
      return {
        id: bookmark.id,
        minute: Math.max(0, Math.floor(bookmark.atMs / 60_000)),
        note: nonEmpty(bookmark.note),
        turns: excerptAt(segments, bookmark.atMs),
      };
    });
}

export type SessionBriefInput = {
  goals: readonly StoredJourneyGoal[];
  pointsToRevisit: readonly PointToRevisit[];
  /** L'ultima seduta con un riepilogo, se ce n'è una. */
  lastSession: {
    sessionId: number;
    bookingId: number | null;
    date: Date | null;
    summary: string | null;
    coachNote: string | null;
  } | null;
  /** I segnalibri di quella seduta, non di tutto il percorso. */
  bookmarks: readonly { id: number; atMs: number; note: string | null }[];
  /**
   * I pezzi di trascrizione che coprono quei segnalibri. Servono a dire che
   * cosa si stava dicendo: senza, un segnalibro senza nota resta un minuto e
   * basta. Vuoto e' un caso legittimo — una seduta puo' non avere trascrizione.
   */
  transcriptSegments?: readonly BriefTranscriptSegment[];
  /**
   * Quante sedute con un riepilogo esistono in questo percorso. Serve solo a
   * distinguere i due vuoti: zero significa che non c'è ancora materiale, più
   * di zero che c'è ma non ha lasciato niente in sospeso.
   */
  sessionCount: number;
};

export function buildSessionBrief(input: SessionBriefInput): SessionBrief {
  const goals = selectBriefGoals(input.goals);

  const lastSession: BriefLastSession | null = input.lastSession
    ? {
        sessionId: input.lastSession.sessionId,
        bookingId: input.lastSession.bookingId,
        date: input.lastSession.date,
        summary: (() => {
          const summary = nonEmpty(input.lastSession.summary);
          return summary ? trimToLength(summary, MAX_SUMMARY_CHARS) : null;
        })(),
        coachNote: (() => {
          const note = nonEmpty(input.lastSession.coachNote);
          return note ? trimToLength(note, MAX_SUMMARY_CHARS) : null;
        })(),
        bookmarks: selectBriefBookmarks(
          input.bookmarks,
          input.transcriptSegments ?? []
        ),
      }
    : null;

  // Un blocco «ultima seduta» che non porta né sintesi, né nota, né segnalibri
  // è un titolo sopra il nulla: meglio non disegnarlo affatto.
  const lastSessionSaysSomething =
    lastSession !== null &&
    (lastSession.summary !== null ||
      lastSession.coachNote !== null ||
      lastSession.bookmarks.length > 0);

  const hasContent =
    goals.length > 0 ||
    lastSessionSaysSomething ||
    input.pointsToRevisit.length > 0;

  return {
    goals,
    lastSession: lastSessionSaysSomething ? lastSession : null,
    pointsToRevisit: input.pointsToRevisit,
    hasContent,
    emptyReason: hasContent
      ? null
      : input.sessionCount > 0
        ? 'nothing_to_carry'
        : 'no_sessions',
  };
}
