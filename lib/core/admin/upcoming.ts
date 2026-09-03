/**
 * I prossimi giorni, compresi quelli vuoti.
 *
 * Nasce da un buco che la prima Control Room aveva per costruzione: **il
 * periodo non guardava mai avanti.** Era una scelta, ed era giusta per la
 * domanda «com'e' andata» — ma rendeva impossibile la domanda piu' semplice
 * che un'amministrazione si fa, cioe' «domani cosa c'e'». Nessuna delle tre
 * finestre — oggi, sette giorni, trenta giorni — conteneva domani.
 *
 * **I giorni senza sedute devono comparire.** Un elenco che salta i giorni
 * vuoti si legge come un calendario fitto: cinque righe di fila sembrano
 * cinque giorni consecutivi di lavoro, e sono invece cinque appuntamenti
 * sparsi in tre settimane. Il vuoto e' l'informazione, e va disegnato.
 *
 * Modulo puro: si prova con un `now` fisso, senza database.
 */

import { formatRomeDateValue } from '@/lib/core/format';
import { romeDayStartShifted } from './period';

/** Quanti giorni avanti mostra la panoramica. Una settimana si legge intera. */
export const UPCOMING_DAYS = 7;

export type UpcomingDayCounts = {
  /** Giorno di calendario a Roma, `YYYY-MM-DD`. */
  day: string;
  confermate: number;
  daConfermare: number;
};

export type UpcomingDay = UpcomingDayCounts & {
  totale: number;
  /** Distanza in giorni da oggi: 0 e' oggi, 1 domani. Decide l'etichetta. */
  offset: number;
};

export type UpcomingAgenda = {
  days: UpcomingDay[];
  oggi: number;
  domani: number;
  /** Totale sulla finestra, oggi compreso. */
  totale: number;
  /** Vero quando non c'e' niente in agenda: lo stato vuoto ha da dire. */
  vuota: boolean;
};

/**
 * Riempie la finestra con i giorni che il database non ha restituito.
 *
 * Le righe arrivano dal `GROUP BY` e contengono solo i giorni con almeno una
 * seduta. Qui la finestra torna continua.
 */
export function buildUpcomingAgenda(
  rows: readonly UpcomingDayCounts[],
  now: Date = new Date(),
  days: number = UPCOMING_DAYS
): UpcomingAgenda {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const span = Math.max(1, Math.floor(days));

  const list: UpcomingDay[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = formatRomeDateValue(romeDayStartShifted(now, offset));
    const found = byDay.get(day);
    const confermate = Number(found?.confermate ?? 0);
    const daConfermare = Number(found?.daConfermare ?? 0);
    list.push({
      day,
      offset,
      confermate,
      daConfermare,
      totale: confermate + daConfermare,
    });
  }

  const totale = list.reduce((sum, entry) => sum + entry.totale, 0);

  return {
    days: list,
    oggi: list[0]?.totale ?? 0,
    domani: list[1]?.totale ?? 0,
    totale,
    vuota: totale === 0,
  };
}

/**
 * Come si chiama un giorno, quando ha un nome.
 *
 * Torna un simbolo e non una stringa formattata: la formattazione dipende da
 * `Intl`, e su CI l'ICU e' ridotta. Il componente decide come scrivere
 * `data`; qui si decide soltanto che oggi e domani hanno un nome proprio, e
 * che chiamarli per data li renderebbe indistinguibili dagli altri cinque.
 */
export function upcomingDayName(offset: number): 'oggi' | 'domani' | 'data' {
  if (offset === 0) return 'oggi';
  if (offset === 1) return 'domani';
  return 'data';
}
