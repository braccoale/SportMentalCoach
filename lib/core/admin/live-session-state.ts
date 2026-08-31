/**
 * Quando una sessione è viva **adesso**.
 *
 * Il segnale non è l'orario dell'appuntamento: una seduta fissata alle 18:00
 * può non essere mai iniziata, o essere finita dopo dieci minuti. Si guarda il
 * battito che il client manda mentre qualcuno è davvero collegato — lo stesso
 * che serve a misurare la durata reale della sessione. Se l'ultimo battito è
 * di pochi istanti fa, in quella stanza c'è qualcuno.
 *
 * È l'unica lettura che distingue «doveva esserci» da «c'è».
 *
 * Vive qui, fuori dal file con la query, perché la stessa domanda la fanno in
 * due: l'elenco dei coach (chi è in chiamata) e le sessioni di oggi (quale
 * riga è in corso in questo momento). Modulo puro: nessun I/O, testabile con
 * un `now` fisso — che per una regola sul tempo è l'unico modo di verificarla.
 */

/**
 * Oltre questo silenzio la sessione non è più considerata viva.
 *
 * Il battito arriva a intervalli regolari; due minuti lasciano spazio a un
 * ritardo di rete o a una scheda che rallenta, senza tenere accesa una spia
 * per una chiamata chiusa male — che è il modo più rapido per far smettere di
 * fidarsi di quella spia.
 */
export const LIVE_SESSION_SILENCE_MS = 2 * 60_000;

export function isSessionLive(
  lastHeartbeatAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!lastHeartbeatAt) return false;
  const silence = now.getTime() - lastHeartbeatAt.getTime();
  // Un battito dal futuro è un orologio sballato, non una sessione viva.
  return silence >= 0 && silence <= LIVE_SESSION_SILENCE_MS;
}
