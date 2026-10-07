/**
 * Orari di Roma <-> istanti. Modulo puro (niente database), così si prova
 * senza un server.
 */

const ROME_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Minutes Europe/Rome is ahead of UTC at the given instant (60 in winter, 120 in summer). */
export function romeOffsetMinutes(at: Date): number {
  const parts = ROME_OFFSET_FORMATTER.formatToParts(at);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Parses a `datetime-local` string (e.g. "2026-07-21T08:39") as Rome
 * wall-clock time and returns the corresponding UTC `Date`. Plain
 * `new Date(str)` interprets the string in the *server* timezone (UTC on
 * Vercel), silently shifting the intended time by the Rome offset — this fixes
 * that so "08:39" the athlete typed means 08:39 in Italy.
 */
export function parseRomeLocalDateTime(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Rome's offset can differ side-of-DST; resolve against the tentative
  // instant, then re-check once in case the guess landed across a transition.
  const offset1 = romeOffsetMinutes(new Date(asUtc));
  let result = new Date(asUtc - offset1 * 60_000);
  const offset2 = romeOffsetMinutes(result);
  if (offset2 !== offset1) result = new Date(asUtc - offset2 * 60_000);
  return result;
}

/**
 * Converte molti orari «HH:mm» dello stesso giorno (`YYYY-MM-DD`, ora di Roma)
 * in istanti senza ripetere il calcolo del fuso per ciascuno.
 *
 * L'offset di Roma è lo stesso per tutta la giornata tranne nei due giorni
 * dell'anno in cui cambia l'ora: lì si converte orario per orario con
 * `parseRomeLocalDateTime`, altrove si calcola l'offset una volta sola. La
 * conversione orario per orario (due `formatToParts` ciascuna) pesava ~700 ms
 * su quattro coach e ~19.000 orari, ed era il grosso del tempo della pagina
 * dei coach.
 */
export function makeRomeDayConverter(day: string): (time: string) => Date {
  const startOffset = romeOffsetMinutes(parseRomeLocalDateTime(`${day}T00:00`)!);
  const endOffset = romeOffsetMinutes(parseRomeLocalDateTime(`${day}T23:59`)!);
  if (startOffset !== endOffset) {
    return (time) => parseRomeLocalDateTime(`${day}T${time}`)!;
  }
  const [y, mo, d] = day.split('-').map(Number);
  return (time) =>
    new Date(
      Date.UTC(y, mo - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5))) -
        startOffset * 60_000
    );
}
