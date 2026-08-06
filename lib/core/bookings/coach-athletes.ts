import type { CoachBooking } from './index';

/**
 * Vista "I miei Atleti": le prenotazioni del coach raggruppate per persona.
 *
 * Nessuna query nuova. La dashboard coach carica già tutte le prenotazioni, e
 * la stessa lista contiene nome, avatar, sport, livello, obiettivi, minore età
 * e servizio: aggregare qui costa una passata in memoria invece di un secondo
 * viaggio al database, e soprattutto garantisce che le due schermate mostrino
 * gli stessi fatti.
 *
 * Modulo puro: nessun I/O, nessun `server-only`, direttamente testabile.
 */

/** Stati che indicano una sessione realmente avvenuta o concordata. */
const ACTIVE_STATUSES = ['requested', 'accepted'];
const DONE_STATUSES = ['completed'];

export type CoachAthleteSummary = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  sport: string | null;
  level: string | null;
  goals: string | null;
  isMinor: boolean;
  /** Sessioni completate: il numero che descrive davvero il percorso. */
  completedSessions: number;
  /** Richieste in attesa di risposta del coach. */
  pendingRequests: number;
  /** Prossima sessione confermata, se c'è. */
  nextSessionAt: Date | null;
  /** Ultima sessione svolta, se c'è. */
  lastSessionAt: Date | null;
  /** Ultima sessione con un Session Compass pronto per la consultazione. */
  latestCompassBookingId: number | null;
  /**
   * "In percorso" quando esiste almeno una prenotazione aperta — richiesta o
   * confermata. Altrimenti l'atleta ha lavorato con il coach in passato.
   */
  status: 'active' | 'past';
};

function displayName(booking: CoachBooking): string {
  return booking.clientName?.trim() || booking.clientEmail.split('@')[0];
}

/**
 * Data effettiva di svolgimento di una sessione: la fine reale della
 * videochiamata quando c'è, altrimenti l'orario concordato. Serve a distinguere
 * "svolta" da "prenotata e mai fatta".
 */
function heldAt(booking: CoachBooking): Date | null {
  return booking.sessionEndedAt ?? booking.scheduledFor ?? null;
}

export function buildCoachAthletes(
  bookings: readonly CoachBooking[],
  now: Date = new Date()
): CoachAthleteSummary[] {
  const byAthlete = new Map<number, CoachBooking[]>();
  for (const booking of bookings) {
    const list = byAthlete.get(booking.clientId);
    if (list) list.push(booking);
    else byAthlete.set(booking.clientId, [booking]);
  }

  const summaries: CoachAthleteSummary[] = [];

  for (const [userId, list] of byAthlete) {
    // Il profilo si legge dalla prenotazione più recente: se l'atleta ha
    // aggiornato sport o obiettivi, è quella a portare il dato aggiornato.
    const latest = [...list].sort(
      (a, b) => b.requestedAt.getTime() - a.requestedAt.getTime()
    )[0];

    const upcoming = list
      .filter(
        (b) =>
          b.status === 'accepted' &&
          b.scheduledFor != null &&
          b.scheduledFor.getTime() > now.getTime()
      )
      .sort(
        (a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime()
      )[0];

    const held = list
      .filter((b) => DONE_STATUSES.includes(b.status) && heldAt(b) != null)
      .sort((a, b) => heldAt(b)!.getTime() - heldAt(a)!.getTime())[0];
    const latestCompass = list
      .filter(
        (b) =>
          DONE_STATUSES.includes(b.status) &&
          ['ready_for_review', 'approved', 'shared'].includes(
            b.aiNotesStatus ?? ''
          )
      )
      .sort(
        (a, b) =>
          (heldAt(b)?.getTime() ?? 0) - (heldAt(a)?.getTime() ?? 0)
      )[0];

    summaries.push({
      userId,
      name: displayName(latest),
      avatarUrl: latest.clientAvatarUrl,
      sport: latest.athleteSport,
      level: latest.athleteLevel,
      goals: latest.athleteGoals,
      isMinor: latest.athleteIsMinor,
      completedSessions: list.filter((b) => DONE_STATUSES.includes(b.status))
        .length,
      pendingRequests: list.filter((b) => b.status === 'requested').length,
      nextSessionAt: upcoming?.scheduledFor ?? null,
      lastSessionAt: held ? heldAt(held) : null,
      latestCompassBookingId: latestCompass?.id ?? null,
      status: list.some((b) => ACTIVE_STATUSES.includes(b.status))
        ? 'active'
        : 'past',
    });
  }

  // Prima chi sta lavorando con il coach in questo periodo: sessione imminente,
  // poi ultima sessione svolta. A parità di attività, il percorso con più
  // sessioni completate viene prima.
  return summaries.sort((a, b) => {
    if (a.nextSessionAt && b.nextSessionAt) {
      const byNextSession =
        a.nextSessionAt.getTime() - b.nextSessionAt.getTime();
      if (byNextSession !== 0) return byNextSession;
    }
    if (a.nextSessionAt) return -1;
    if (b.nextSessionAt) return 1;
    const aLast = a.lastSessionAt?.getTime() ?? 0;
    const bLast = b.lastSessionAt?.getTime() ?? 0;
    if (aLast !== bLast) return bLast - aLast;
    if (a.completedSessions !== b.completedSessions) {
      return b.completedSessions - a.completedSessions;
    }
    return a.name.localeCompare(b.name, 'it');
  });
}

/**
 * Ultimo servizio usato con ciascun atleta, indicizzato per `userId`.
 *
 * Serve a precompilare "Nuovo appuntamento": con la stessa persona un coach
 * ripete quasi sempre lo stesso servizio, quindi il default giusto è l'ultimo
 * concordato. "Ultimo" si misura sulla data della richiesta — anche una
 * sessione poi annullata o rifiutata dice qual è il servizio in uso in quel
 * percorso.
 */
export function lastServiceByAthlete(
  bookings: readonly CoachBooking[]
): Record<number, number> {
  const latestAt = new Map<number, number>();
  const serviceByAthlete: Record<number, number> = {};

  for (const booking of bookings) {
    if (booking.serviceId == null) continue;
    const at = booking.requestedAt.getTime();
    if (at <= (latestAt.get(booking.clientId) ?? -Infinity)) continue;
    latestAt.set(booking.clientId, at);
    serviceByAthlete[booking.clientId] = booking.serviceId;
  }

  return serviceByAthlete;
}

/** Tutte le prenotazioni di un singolo atleta, dalla più recente. */
export function bookingsForAthlete(
  bookings: readonly CoachBooking[],
  athleteUserId: number
): CoachBooking[] {
  return bookings
    .filter((b) => b.clientId === athleteUserId)
    .sort((a, b) => {
      const aAt = heldAt(a)?.getTime() ?? a.requestedAt.getTime();
      const bAt = heldAt(b)?.getTime() ?? b.requestedAt.getTime();
      return bAt - aAt;
    });
}
