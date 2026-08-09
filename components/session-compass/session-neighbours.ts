/**
 * Dove si va, indietro e avanti, lungo il percorso dell'atleta.
 *
 * Il riepilogo di una seduta si legge quasi sempre confrontandolo con quello
 * prima: «questo tema torna?», «l'impegno di due settimane fa è stato
 * ripreso?». La navigazione c'era ma richiedeva di aprire una scheda,
 * scegliere una seduta da una linea del tempo e premere «apri»: tre gesti per
 * una cosa che ne merita uno.
 *
 * Modulo puro: la scelta del vicino è un calcolo su una lista ordinata, e va
 * potuta verificare senza rendere nulla.
 */

export type NavigableSession = {
  sessionId: number;
  sessionDate: string | null;
  compassHref: string;
};

export type SessionNeighbours = {
  /** La seduta immediatamente precedente, o null se questa è la prima. */
  previous: NavigableSession | null;
  /** La successiva, o null se questa è l'ultima. */
  next: NavigableSession | null;
  /** Posizione nel percorso, per «3 di 8». Zero se la seduta non è in lista. */
  position: number;
  total: number;
};

/**
 * Ordina per data, dalla più vecchia alla più recente.
 *
 * Una seduta senza data finisce in fondo invece di essere scartata: manca
 * l'informazione per collocarla, non la seduta.
 */
function chronological(
  sessions: readonly NavigableSession[]
): NavigableSession[] {
  return [...sessions].sort((left, right) => {
    const a = left.sessionDate ? Date.parse(left.sessionDate) : Number.MAX_SAFE_INTEGER;
    const b = right.sessionDate ? Date.parse(right.sessionDate) : Number.MAX_SAFE_INTEGER;
    return a - b;
  });
}

export function sessionNeighbours(params: {
  sessions: readonly NavigableSession[];
  currentSessionId: number;
}): SessionNeighbours {
  const ordered = chronological(params.sessions);
  const index = ordered.findIndex(
    (entry) => entry.sessionId === params.currentSessionId
  );

  /*
   * La seduta corrente non è ancora nel percorso finché il coach non ne ha
   * approvato il riepilogo. Non è un caso limite: è il caso normale mentre
   * si legge una bozza. Da lì si torna indietro, ma non si va avanti — avanti
   * non c'è nulla.
   */
  if (index === -1) {
    return {
      previous: ordered.length > 0 ? ordered[ordered.length - 1] : null,
      next: null,
      position: ordered.length + 1,
      total: ordered.length + 1,
    };
  }

  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index < ordered.length - 1 ? ordered[index + 1] : null,
    position: index + 1,
    total: ordered.length,
  };
}

/**
 * Dove cade ogni seduta lungo la linea del tempo, in percentuale.
 *
 * Le sedute non sono equidistanti nella realtà e non devono esserlo sullo
 * schermo: due incontri a due giorni di distanza e poi un mese di pausa
 * raccontano qualcosa, e distribuirli a intervalli uguali cancellerebbe
 * proprio quel qualcosa. La posizione è proporzionale al tempo trascorso.
 *
 * Due sedute troppo vicine diventerebbero un solo punto: si tiene una
 * distanza minima fra i centri, perché un punto che non si può cliccare non
 * esiste.
 */
export const MIN_DOT_GAP_PERCENT = 4;

export type PlacedSession = NavigableSession & {
  /** Da 0 (la più vecchia) a 100 (la più recente). */
  offsetPercent: number;
};

export function placeSessionsOnTimeline(
  sessions: readonly NavigableSession[]
): PlacedSession[] {
  const ordered = chronological(sessions);
  if (ordered.length === 0) return [];
  if (ordered.length === 1) {
    return [{ ...ordered[0], offsetPercent: 50 }];
  }

  const times = ordered.map((entry) =>
    entry.sessionDate ? Date.parse(entry.sessionDate) : Number.NaN
  );
  const known = times.filter((time) => Number.isFinite(time));
  const first = known.length > 0 ? Math.min(...known) : 0;
  const last = known.length > 0 ? Math.max(...known) : 0;
  const span = last - first;

  const placed = ordered.map((entry, index) => {
    // Senza data non c'è modo di collocarla nel tempo: la si mette in coda,
    // dove la lista l'ha già ordinata.
    if (span <= 0 || !Number.isFinite(times[index])) {
      return {
        ...entry,
        offsetPercent: (index / (ordered.length - 1)) * 100,
      };
    }
    return {
      ...entry,
      offsetPercent: ((times[index] - first) / span) * 100,
    };
  });

  // Una passata da sinistra: ogni punto cede il minimo indispensabile al
  // precedente, così l'ordine resta e nessuno sparisce sotto un altro.
  for (let index = 1; index < placed.length; index += 1) {
    const minimum = placed[index - 1].offsetPercent + MIN_DOT_GAP_PERCENT;
    if (placed[index].offsetPercent < minimum) {
      placed[index].offsetPercent = minimum;
    }
  }

  // Se lo scostamento ha spinto oltre il bordo, si ricomprime tutto.
  const overflow = placed[placed.length - 1].offsetPercent;
  if (overflow > 100) {
    for (const entry of placed) {
      entry.offsetPercent = (entry.offsetPercent / overflow) * 100;
    }
  }
  return placed;
}
