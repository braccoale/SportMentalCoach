/**
 * Quando è cominciata e quando è finita davvero una videochiamata, e quanto è
 * durata. Modulo puro, testabile con un `now` fisso.
 *
 * `sessionStartedAt` è il primo battito di un partecipante collegato;
 * `sessionEndedAt` è **l'ultimo battito**, riscritto ogni 15 secondi mentre la
 * chiamata è aperta — non una chiusura (vedi skill booking-scheduling). Per
 * questo, finché la seduta è in corso (`isLive`), la fine non si mostra: è
 * solo «adesso», e cambia fra un secondo. La durata, invece, sì: quella
 * trascorsa fino a ora.
 */
export type CallSpan = {
  startedAt: Date | null;
  /** Null se la chiamata non è mai partita o è ancora in corso. */
  endedAt: Date | null;
  /** Minuti interi; null se la chiamata non è mai partita. */
  durationMin: number | null;
  inProgress: boolean;
};

export function callSpan(input: {
  sessionStartedAt: Date | null;
  sessionEndedAt: Date | null;
  isLive: boolean;
  now?: Date;
}): CallSpan {
  const { sessionStartedAt: start, sessionEndedAt: end, isLive } = input;
  if (!start) {
    return { startedAt: null, endedAt: null, durationMin: null, inProgress: false };
  }
  const until = isLive ? (input.now ?? new Date()) : end;
  const durationMin =
    until && until.getTime() >= start.getTime()
      ? Math.round((until.getTime() - start.getTime()) / 60_000)
      : null;
  return {
    startedAt: start,
    endedAt: isLive ? null : end,
    durationMin,
    inProgress: isLive,
  };
}

/** «52′», «1 h 05′»: una durata leggibile a colpo d'occhio in tabella. */
export function formatCallDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}′`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')}′`;
}
