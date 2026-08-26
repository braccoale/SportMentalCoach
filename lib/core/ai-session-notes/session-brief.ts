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
};

export type SessionBrief = {
  goals: BriefGoal[];
  lastSession: BriefLastSession | null;
  pointsToRevisit: readonly PointToRevisit[];
  /** Falso quando non c'è proprio niente da mostrare: il vuoto va spiegato. */
  hasContent: boolean;
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
    .map((bookmark) => ({
      id: bookmark.id,
      minute: Math.max(0, Math.floor(bookmark.atMs / 60_000)),
      note: nonEmpty(bookmark.note),
    }));
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
        bookmarks: selectBriefBookmarks(input.bookmarks),
      }
    : null;

  // Un blocco «ultima seduta» che non porta né sintesi, né nota, né segnalibri
  // è un titolo sopra il nulla: meglio non disegnarlo affatto.
  const lastSessionSaysSomething =
    lastSession !== null &&
    (lastSession.summary !== null ||
      lastSession.coachNote !== null ||
      lastSession.bookmarks.length > 0);

  return {
    goals,
    lastSession: lastSessionSaysSomething ? lastSession : null,
    pointsToRevisit: input.pointsToRevisit,
    hasContent:
      goals.length > 0 ||
      lastSessionSaysSomething ||
      input.pointsToRevisit.length > 0,
  };
}
