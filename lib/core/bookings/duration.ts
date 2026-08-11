/**
 * Durata di una singola sessione, scelta dal coach quando fissa
 * l'appuntamento.
 *
 * È un insieme chiuso di opzioni, non un numero libero: una sessione di 37
 * minuti non esiste nella pratica, e un elenco fisso rende la scelta un click
 * invece che una digitazione. Il valore vive sulla prenotazione e ha la
 * precedenza sulla durata del servizio — lo stesso servizio può durare 30
 * minuti con un atleta e 60 con un altro.
 *
 * Modulo puro: nessun I/O, condiviso fra client e server perché l'elenco
 * mostrato nel form e quello validato nell'action devono essere lo stesso.
 */

/** Dalla più lunga alla più breve: è l'ordine in cui un coach le cerca. */
export const SESSION_DURATION_OPTIONS = [60, 50, 40, 30, 20, 10] as const;

export type SessionDurationMin = (typeof SESSION_DURATION_OPTIONS)[number];

/** Durata proposta di default: la seduta tipo. */
export const DEFAULT_SESSION_DURATION_MIN: SessionDurationMin = 40;

export function isSessionDuration(value: unknown): value is SessionDurationMin {
  return (SESSION_DURATION_OPTIONS as readonly unknown[]).includes(value);
}

/**
 * Legge la durata da un campo di form. Restituisce `null` — non un default —
 * quando il valore manca o è fuori elenco: il campo è obbligatorio, e far
 * scivolare silenziosamente un valore non valido sui 40 minuti nasconderebbe
 * un form rotto invece di segnalarlo.
 */
export function parseSessionDuration(
  raw: FormDataEntryValue | null | undefined
): SessionDurationMin | null {
  const value = Number(String(raw ?? '').trim());
  return isSessionDuration(value) ? value : null;
}

/**
 * La durata più lunga fra quelle proponibili che sta in `maxMin` minuti.
 *
 * Serve agli slot troppo stretti: dire «Solo 30 min» e poi non far scegliere
 * quell'orario è un'informazione che non serve a nulla. Chi lo sceglie
 * accetta implicitamente quella durata, e la scelta va portata a termine per
 * lui invece di lasciargli l'onere di indovinare quale valore rimettere nel
 * campo durata.
 *
 * `null` quando nemmeno la sessione più corta ci sta: quello slot resta
 * inutilizzabile, e va lasciato disabilitato invece che offerto a vuoto.
 */
export function largestFittingDuration(
  maxMin: number
): SessionDurationMin | null {
  // L'elenco è già dal più lungo al più corto: il primo che entra è il
  // migliore, e mantenerlo così evita un ordinamento a ogni chiamata.
  return SESSION_DURATION_OPTIONS.find((minutes) => minutes <= maxMin) ?? null;
}
