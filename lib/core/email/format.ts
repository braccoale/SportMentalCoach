/**
 * Formattazione di date e orari per le email.
 *
 * Una sola implementazione, un solo fuso: `Europe/Rome`. Il server gira in UTC
 * e i timestamp arrivano in UTC, quindi formattare senza fuso esplicito
 * produrrebbe orari sbagliati di una o due ore a seconda dell'ora legale —
 * l'errore peggiore possibile in un'email che dice a che ora è la sessione.
 *
 * Modulo puro: nessun I/O, nessun `server-only`, direttamente testabile.
 */

export const TIMEZONE = 'Europe/Rome';
export const LOCALE = 'it-IT';

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIMEZONE,
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIMEZONE,
});

const dateFormat = dateTimeFormat;

/**
 * "lunedì 4 agosto 2026, alle 12:18" — il formato usato ovunque nelle email,
 * per data dell'azione e data della sessione.
 */
export function formatDateTimeIt(value: Date | null | undefined): string | null {
  if (!isValidDate(value)) return null;
  return `${dateTimeFormat.format(value)}, alle ${timeFormat.format(value)}`;
}

/** "lunedì 4 agosto 2026" — quando l'orario non aggiunge niente. */
export function formatDateIt(value: Date | null | undefined): string | null {
  if (!isValidDate(value)) return null;
  return dateFormat.format(value);
}

/** "18:00" */
export function formatTimeIt(value: Date | null | undefined): string | null {
  if (!isValidDate(value)) return null;
  return timeFormat.format(value);
}

/** "40 minuti" / "1 ora" / "1 ora e 30 minuti" */
export function formatDurationIt(minutes: number | null | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? '1 ora' : `${hours} ore`);
  if (rest > 0) parts.push(rest === 1 ? '1 minuto' : `${rest} minuti`);
  return parts.join(' e ');
}

/**
 * Nome visualizzato di una persona. Mai vuoto: se non c'è nulla di meglio
 * restituisce la parte locale dell'indirizzo, perché un'email che dice
 * "undefined ti ha inviato una richiesta" è peggio di una un po' impersonale.
 */
export function displayName(person: {
  name?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string | null {
  const full = [person.name?.trim(), person.lastName?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (full) return full;
  const local = person.email?.split('@')[0]?.trim();
  return local || null;
}

/** Etichetta italiana del ruolo nel booking. */
export function roleLabelIt(role: 'athlete' | 'coach' | null | undefined): string | null {
  if (role === 'athlete') return 'Atleta';
  if (role === 'coach') return 'Coach';
  return null;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
