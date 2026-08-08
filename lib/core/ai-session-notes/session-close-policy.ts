/**
 * Politica del fermo di sicurezza per le sessioni Appunti AI.
 *
 * Modulo puro e senza dipendenze: la decisione «questa sessione non si
 * chiuderà più da sola» è una regola, non un accesso al database, e va
 * potuta verificare senza.
 */

/**
 * Se una sessione ha superato il limite oltre il quale non si chiuderà da
 * sola.
 *
 * Il riferimento è l'inizio effettivo, non la creazione della riga: fra la
 * richiesta e il primo consenso può passare del tempo, e conteggiarlo
 * accorcerebbe la seduta di altrettanto. Senza un inizio registrato resta
 * solo la creazione, che è comunque un limite superiore onesto.
 */
export function isSessionPastSafetyLimit(params: {
  startedAt: Date | null;
  createdDate: Date;
  now: Date;
  safetyTimeoutMinutes: number;
}): boolean {
  const reference = params.startedAt ?? params.createdDate;
  const elapsedMinutes = (params.now.getTime() - reference.getTime()) / 60_000;
  return elapsedMinutes > params.safetyTimeoutMinutes;
}
