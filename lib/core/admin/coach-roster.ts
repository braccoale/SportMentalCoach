import {
  athleteDisplayName,
  buildCoachAthletes,
  type CoachAthleteBooking,
  type CoachAthleteSummary,
} from '@/lib/core/bookings/coach-athletes';
import { isSessionUpcoming } from '@/lib/core/sessions';

/**
 * Chi segue un coach, e cosa ha in agenda — visto dall'amministrazione.
 *
 * Non è una seconda definizione di «atleta di un coach»: il raggruppamento è
 * `buildCoachAthletes`, lo stesso che il coach vede nella sua dashboard, e
 * «in arrivo» è `isSessionUpcoming`, lo stesso che decide se un appuntamento
 * si può ancora raggiungere. Se un giorno le due schermate divergessero,
 * divergerebbero insieme — che è tutto il punto di passare di qui invece di
 * riscrivere due `filter` con due idee diverse di cosa sia una sessione viva.
 *
 * Modulo puro: nessun I/O, direttamente testabile.
 */

export type AdminRosterBooking = CoachAthleteBooking & {
  /** Il coach a cui la prenotazione appartiene: qui i coach sono tutti insieme. */
  providerId: number;
  serviceTitle: string | null;
};

export type CoachUpcomingSession = {
  bookingId: number;
  athleteUserId: number;
  athleteName: string;
  scheduledFor: Date;
  durationMin: number | null;
  serviceTitle: string | null;
  /**
   * `accepted` è un appuntamento confermato, `requested` una richiesta che il
   * coach non ha ancora deciso. Vanno distinte: la seconda è un impegno
   * dell'atleta, non del coach, e in agenda potrebbe non esserci mai.
   */
  status: string;
};

export type CoachRoster = {
  /** Tutti, in percorso e passati, nell'ordine della dashboard coach. */
  athletes: CoachAthleteSummary[];
  /** Quanti hanno una prenotazione aperta: è il numero che dice «segue». */
  activeAthletes: number;
  /** Prossimi appuntamenti dal più vicino, quello in corso incluso. */
  upcoming: CoachUpcomingSession[];
};

/**
 * Un elenco per coach, indicizzato per `providerId`.
 *
 * I coach senza prenotazioni non compaiono nella mappa: non hanno un elenco
 * vuoto, non hanno un elenco. Chi la legge distingue così «nessun atleta» da
 * «coach che non ha ancora iniziato», e la pagina non stampa due blocchi a
 * zero sotto ogni profilo appena registrato.
 */
export function buildCoachRosters(
  rows: readonly AdminRosterBooking[],
  now: Date = new Date()
): Map<number, CoachRoster> {
  const byProvider = new Map<number, AdminRosterBooking[]>();
  for (const row of rows) {
    const list = byProvider.get(row.providerId);
    if (list) list.push(row);
    else byProvider.set(row.providerId, [row]);
  }

  const rosters = new Map<number, CoachRoster>();

  for (const [providerId, list] of byProvider) {
    const athletes = buildCoachAthletes(list, now);
    const nameByAthlete = new Map(athletes.map((a) => [a.userId, a.name]));

    const upcoming = list
      .filter(
        (booking) =>
          booking.scheduledFor != null &&
          isSessionUpcoming(
            {
              scheduledFor: booking.scheduledFor,
              durationMin: booking.durationMin,
              status: booking.status,
              lastHeartbeatAt: booking.sessionEndedAt,
            },
            now
          )
      )
      .sort(
        (a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime()
      )
      .map((booking) => ({
        bookingId: booking.id,
        athleteUserId: booking.clientId,
        athleteName:
          nameByAthlete.get(booking.clientId) ?? athleteDisplayName(booking),
        scheduledFor: booking.scheduledFor!,
        durationMin: booking.durationMin,
        serviceTitle: booking.serviceTitle,
        status: booking.status,
      }));

    rosters.set(providerId, {
      athletes,
      activeAthletes: athletes.filter((a) => a.status === 'active').length,
      upcoming,
    });
  }

  return rosters;
}
