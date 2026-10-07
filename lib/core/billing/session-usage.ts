/**
 * Quante sedute di un abbonamento sono state fatte, quante sono prenotate e
 * quante restano nel periodo corrente. È la mini dashboard dell'atleta.
 *
 * Non è ancora un sistema di crediti: **non impedisce niente**, conta. Le
 * sedute si assegnano al periodo in cui sono *fissate* (`scheduledFor`), non
 * a quello in cui sono state prenotate: così una seduta prenotata oggi per
 * dopo il rinnovo pesa sul periodo nuovo, non su questo.
 *
 * Regola di conteggio, con gli stati veri delle prenotazioni:
 *  - fatta       → `completed`;
 *  - prenotata   → `requested` o `accepted` (anche una richiesta in attesa
 *                  occupa un posto: se viene rifiutata o scade, lo restituisce);
 *  - non contano → `declined`, `cancelled`, `expired`.
 *
 * Una seduta già passata ma non ancora segnata come completata resta
 * «prenotata»: finché il coach non la chiude non si sa se è stata fatta, e
 * mostrare una seduta in più disponibile sarebbe l'errore peggiore.
 *
 * Modulo puro: si prova con un `now` fisso.
 */

import type { BookingStatus } from '@/lib/db/schema';

const DONE: readonly BookingStatus[] = ['completed'];
const BOOKED: readonly BookingStatus[] = ['requested', 'accepted'];

export type UsageBooking = {
  status: string;
  scheduledFor: Date | null;
};

export type SessionUsage =
  | { known: false }
  | {
      known: true;
      total: number;
      done: number;
      booked: number;
      /** Sedute ancora disponibili: mai negative. */
      remaining: number;
      /** Più sedute fissate del piano: succede finché nulla le impedisce. */
      overBooked: boolean;
    };

export function sessionUsageForPeriod(params: {
  sessionsPerMonth: number;
  periodStart: Date | null;
  periodEnd: Date | null;
  bookings: UsageBooking[];
}): SessionUsage {
  const { sessionsPerMonth, periodStart, periodEnd } = params;
  // Senza un periodo certo non si inventano numeri.
  if (!periodStart || !periodEnd || !(sessionsPerMonth > 0)) {
    return { known: false };
  }

  let done = 0;
  let booked = 0;
  for (const booking of params.bookings) {
    const at = booking.scheduledFor;
    if (!at) continue;
    // Il periodo è semiaperto: l'istante del rinnovo appartiene al periodo nuovo.
    if (at.getTime() < periodStart.getTime() || at.getTime() >= periodEnd.getTime()) {
      continue;
    }
    if ((DONE as readonly string[]).includes(booking.status)) done++;
    else if ((BOOKED as readonly string[]).includes(booking.status)) booked++;
  }

  const used = done + booked;
  return {
    known: true,
    total: sessionsPerMonth,
    done,
    booked,
    remaining: Math.max(0, sessionsPerMonth - used),
    overBooked: used > sessionsPerMonth,
  };
}
