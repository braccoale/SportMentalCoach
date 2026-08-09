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
