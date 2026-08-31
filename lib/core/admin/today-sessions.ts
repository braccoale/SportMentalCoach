import { athleteDisplayName } from '@/lib/core/bookings/coach-athletes';
import { formatRomeDateValue } from '@/lib/core/format';
import { isSessionLive } from './live-session-state';
import type { AdminBookingRow } from './booking-rows';

/**
 * La giornata di oggi, vista dall'amministrazione: chi vede chi, e quando.
 *
 * **«Oggi» è oggi a Roma.** Non «oggi» sul server, che a Vercel gira in UTC e
 * fra le 22:00 e mezzanotte mostrerebbe già il giorno dopo; e nemmeno «oggi»
 * sul computer di chi guarda. Il confronto passa da `formatRomeDateValue`, la
 * stessa lettura del calendario che usano le disponibilità e gli slot
 * prenotabili: un appuntamento delle 00:30 del primo luglio è del primo
 * luglio anche se in UTC quell'istante è ancora il 30 giugno.
 *
 * Modulo puro: nessun I/O, testabile con un `now` fisso.
 */

/**
 * Cosa sta nella giornata.
 *
 * Confermate e ancora da confermare, perché entrambe occupano l'agenda di un
 * coach; e quelle già svolte, perché alle 18:00 la seduta delle 9:00 fa
 * ancora parte di oggi. Fuori restano disdette, rifiutate e scadute: non
 * succedono, e un elenco della giornata che le contiene fa contare male.
 *
 * Gli stati sono quelli dello schema (`requested`, `accepted`, `declined`,
 * `cancelled`, `completed`, `expired`), non quelli che sembrano plausibili.
 */
const TODAY_STATUSES = ['accepted', 'requested', 'completed'];

export type AdminTodaySession = {
  bookingId: number;
  scheduledFor: Date;
  durationMin: number | null;
  coachProviderId: number;
  coachName: string;
  athleteUserId: number;
  athleteName: string;
  serviceTitle: string | null;
  /** `accepted`, `requested` o `completed`: vanno mostrati diversi. */
  status: string;
  /** Qualcuno è collegato in questo istante, non «doveva esserci». */
  isLive: boolean;
};

export function buildTodaySessions(
  rows: readonly AdminBookingRow[],
  now: Date = new Date()
): AdminTodaySession[] {
  const today = formatRomeDateValue(now);

  return rows
    .filter(
      (row) =>
        row.scheduledFor != null &&
        TODAY_STATUSES.includes(row.status) &&
        formatRomeDateValue(row.scheduledFor) === today
    )
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime())
    .map((row) => ({
      bookingId: row.id,
      scheduledFor: row.scheduledFor!,
      durationMin: row.durationMin,
      coachProviderId: row.providerId,
      coachName: row.coachName,
      athleteUserId: row.clientId,
      athleteName: athleteDisplayName(row),
      serviceTitle: row.serviceTitle,
      status: row.status,
      isLive: isSessionLive(row.sessionEndedAt, now),
    }));
}
