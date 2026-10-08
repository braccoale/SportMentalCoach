/**
 * Ricorda per un po' il risultato di una lettura costosa e uguale per tutti.
 *
 * Serve a ciò che descrive il **sistema** e non la persona che apre la pagina
 * (per esempio lo stato della coda dell'AI): ricalcolarlo a ogni visita di ogni
 * coach costa viaggi al database per una risposta che non cambia da una
 * richiesta all'altra. La memoria è del processo (una istanza serverless): non
 * è condivisa e non va mai usata per dati di una persona.
 *
 * Una lettura che fallisce non si ricorda, e due richieste vicine condividono
 * la stessa lettura in corso invece di farne due.
 */
export function ttlMemo<T>(
  read: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now
): () => Promise<T> {
  let stored: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;
  return async () => {
    if (stored && stored.expiresAt > now()) return stored.value;
    if (inFlight) return inFlight;
    inFlight = read()
      .then((value) => {
        stored = { value, expiresAt: now() + ttlMs };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
