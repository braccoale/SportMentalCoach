/**
 * Segnalibri posati dal coach durante la sessione.
 *
 * Modulo puro: dove cade un segnalibro e quali si fondono sono regole, non
 * accessi al database, e vanno potute verificare senza.
 */

export type CoachBookmarkInput = {
  /** Quando il coach ha premuto. */
  pressedAt: Date;
  /** Inizio della sessione; senza, il segnalibro non e' collocabile. */
  sessionStartedAt: Date | null;
};

/**
 * Un coach che rivede un momento lo cerca qualche secondo *prima* di quando
 * ha premuto: quando lo nota, la frase e' gia' stata detta. Il segnalibro
 * arretra, cosi' riascoltando si parte da dove la cosa e' cominciata.
 */
export const BOOKMARK_LOOKBACK_MS = 15_000;

/** `null` quando la sessione non e' ancora partita: non c'e' un istante a cui legarlo. */
export function bookmarkPositionMs(input: CoachBookmarkInput): number | null {
  if (!input.sessionStartedAt) return null;
  const elapsed = input.pressedAt.getTime() - input.sessionStartedAt.getTime();
  if (elapsed < 0) return null;
  return Math.max(0, elapsed - BOOKMARK_LOOKBACK_MS);
}

/**
 * Due segnalibri a pochi secondi l'uno dall'altro sono lo stesso momento
 * marcato due volte — succede quando si preme di nuovo per sicurezza. Tenerli
 * separati riempirebbe la mappa di rombi che indicano la stessa cosa.
 */
export const BOOKMARK_MERGE_WINDOW_MS = 20_000;

export function isDuplicateBookmark(
  atMs: number,
  existing: readonly number[]
): boolean {
  return existing.some(
    (value) => Math.abs(value - atMs) <= BOOKMARK_MERGE_WINDOW_MS
  );
}
