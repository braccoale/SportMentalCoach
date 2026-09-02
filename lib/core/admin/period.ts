/**
 * Il periodo su cui l'amministrazione guarda i numeri.
 *
 * Esiste come modulo a sé perché è la sola cosa che rende confrontabili due
 * KPI: «sessioni completate» senza un intervallo dichiarato non è un numero,
 * è un'impressione. Ogni card della panoramica porta con sé il periodo da cui
 * viene, e quel periodo nasce qui.
 *
 * **Il giorno è quello di Roma, non quello del server.** Vercel gira in UTC:
 * fra le 22:00 e mezzanotte «oggi» sul server è già domani, e l'ultima seduta
 * della giornata scomparirebbe dal conteggio proprio mentre la si sta
 * facendo. È la stessa regola di `today-sessions.ts`, applicata agli estremi
 * di un intervallo invece che a un confronto di date.
 *
 * Modulo puro: nessun I/O, si verifica con un `now` fisso.
 */

import { formatRomeDateValue } from '@/lib/core/format';

/** Il fuso in cui il prodotto vive, come in `lib/core/format.ts`. */
const DISPLAY_TIME_ZONE = 'Europe/Rome';

export type AdminPeriodKey = 'oggi' | '7g' | '30g';

export type AdminPeriodOption = {
  key: AdminPeriodKey;
  label: string;
  /** Giorni di calendario coperti, oggi incluso. */
  days: number;
};

export const ADMIN_PERIODS: readonly AdminPeriodOption[] = [
  { key: 'oggi', label: 'Oggi', days: 1 },
  { key: '7g', label: '7 giorni', days: 7 },
  { key: '30g', label: '30 giorni', days: 30 },
] as const;

export const DEFAULT_ADMIN_PERIOD: AdminPeriodKey = '7g';

/**
 * Il periodo chiesto nella query string, o quello di default.
 *
 * Non solleva e non propaga: un parametro storto in un indirizzo condiviso
 * non deve rompere la pagina che qualcuno sta aprendo di corsa.
 */
export function resolveAdminPeriod(
  raw: string | string[] | null | undefined
): AdminPeriodKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = ADMIN_PERIODS.find((period) => period.key === value);
  return match ? match.key : DEFAULT_ADMIN_PERIOD;
}

/**
 * Di quanti minuti Roma è avanti rispetto a UTC in un dato istante.
 *
 * Si ricava dal calendario, non da una costante: fra ora solare e ora legale
 * ballano sessanta minuti, e un intervallo calcolato con l'offset sbagliato
 * perde o raddoppia un'ora di sedute due volte l'anno.
 */
function romeOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // `hour` vale 24 a mezzanotte con `hour12: false` in alcune versioni di ICU.
  const hour = value('hour') % 24;
  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    hour,
    value('minute'),
    value('second')
  );
  return Math.round((asIfUtc - at.getTime()) / 60_000);
}

/**
 * L'istante in cui comincia, a Roma, il giorno di calendario che contiene
 * `at`.
 *
 * Due passaggi e non uno: l'offset va misurato **nel giorno di destinazione**,
 * non in quello di partenza. Alle 23:00 del 25 ottobre l'offset è ancora
 * +2, ma la mezzanotte di quel giorno stava a +2 e quella del giorno dopo a
 * +1: usare un offset solo sposta il confine di un'ora esatta, che è
 * esattamente quanto basta a far sparire una seduta.
 */
export function romeDayStart(at: Date): Date {
  const [year, month, day] = formatRomeDateValue(at).split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const firstGuess = new Date(midnightAsUtc - romeOffsetMinutes(at) * 60_000);
  return new Date(midnightAsUtc - romeOffsetMinutes(firstGuess) * 60_000);
}

/** Lo stesso confine, spostato di N giorni di calendario. */
export function romeDayStartShifted(at: Date, days: number): Date {
  const [year, month, day] = formatRomeDateValue(at).split('-').map(Number);
  const shiftedAsUtc = Date.UTC(year, month - 1, day + days, 0, 0, 0);
  const firstGuess = new Date(shiftedAsUtc - romeOffsetMinutes(at) * 60_000);
  return new Date(shiftedAsUtc - romeOffsetMinutes(firstGuess) * 60_000);
}

/**
 * Un giorno di calendario `YYYY-MM-DD` scritto da una persona in un filtro,
 * riportato all'istante in cui quel giorno comincia a Roma.
 *
 * `null` per qualunque cosa non sia una data: i filtri della console arrivano
 * dalla query string, e una data storta deve sparire, non propagarsi.
 */
export function romeDayValueToInstant(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const midnightAsUtc = Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0);
  if (!Number.isFinite(midnightAsUtc)) return null;
  const probe = new Date(midnightAsUtc);
  const firstGuess = new Date(midnightAsUtc - romeOffsetMinutes(probe) * 60_000);
  return new Date(midnightAsUtc - romeOffsetMinutes(firstGuess) * 60_000);
}

export type AdminPeriod = {
  key: AdminPeriodKey;
  label: string;
  days: number;
  /** Primo istante compreso: mezzanotte a Roma. */
  from: Date;
  /** Adesso. Il periodo non guarda mai avanti. */
  to: Date;
  /**
   * L'inizio del periodo immediatamente precedente, di pari durata.
   *
   * Serve alle variazioni, e serve che sia **di pari durata**: confrontare
   * sette giorni con i trenta che li precedono produce una percentuale vera
   * e priva di significato.
   */
  previousFrom: Date;
  previousTo: Date;
};

export function adminPeriodRange(
  key: AdminPeriodKey,
  now: Date = new Date()
): AdminPeriod {
  const option =
    ADMIN_PERIODS.find((period) => period.key === key) ?? ADMIN_PERIODS[1];
  const from = romeDayStartShifted(now, -(option.days - 1));
  const previousFrom = romeDayStartShifted(now, -(option.days * 2 - 1));
  const previousTo = from;

  return {
    key: option.key,
    label: option.label,
    days: option.days,
    from,
    to: now,
    previousFrom,
    previousTo,
  };
}

/**
 * La variazione fra due periodi, quando ha senso calcolarla.
 *
 * `null` quando il periodo precedente è a zero: da zero non si cresce del
 * 100%, si cresce e basta, e una percentuale inventata su un denominatore
 * nullo è il modo più rapido per far prendere una decisione sbagliata a chi
 * legge di fretta.
 */
export function periodDelta(
  current: number,
  previous: number
): { percent: number; direction: 'up' | 'down' | 'flat' } | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous <= 0) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    percent,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  };
}
