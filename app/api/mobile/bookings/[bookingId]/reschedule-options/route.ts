import { getApiUser } from '@/lib/auth/api-user';
import { getParticipantBooking } from '@/lib/core/bookings';
import {
  getBookableDays,
  getCoachAvailabilityByProviderId,
  getCoachBusyIntervalsByProviderIds,
} from '@/lib/core/availability';
import {
  busyIntervalsAt,
  dropPastStarts,
  slotPresentation,
} from '@/lib/core/availability/validation';
import { getSystemConfigNumber } from '@/lib/core/system-config';

/**
 * I giorni e orari in cui si può spostare questa prenotazione, dal telefono.
 *
 * Prima «Modifica giorno e ora» nel menu mobile proponeva un elenco fisso di
 * ore piene (8, 9, 10…), lo stesso difetto già corretto per la creazione di
 * un nuovo appuntamento: ignorava la disponibilità vera del coach e gli
 * appuntamenti già presi, e il rifiuto arrivava solo al momento dell'invio.
 * Qui gira `getBookableDays`, la stessa funzione della dashboard e della
 * creazione — una regola sola, in un posto solo — con `excludeBookingId` per
 * non far bloccare la prenotazione da se stessa.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const bookingId = Number((await params).bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }

  // Autorizzazione e stato: solo un partecipante, e solo una prenotazione
  // ancora aperta ha senso da spostare.
  const booking = await getParticipantBooking(bookingId, user.id);
  if (!booking) {
    return Response.json({ error: 'Prenotazione non trovata.' }, { status: 404 });
  }
  if (!['requested', 'accepted'].includes(booking.status)) {
    return Response.json({ bookableDays: [] });
  }

  const now = new Date();
  const [availability, busyByProvider, stepMinutes, daysAhead] = await Promise.all([
    getCoachAvailabilityByProviderId(booking.providerId),
    getCoachBusyIntervalsByProviderIds([booking.providerId]),
    getSystemConfigNumber('AVAILABILITY_BOOKING_START_STEP_MINUTES', 10),
    getSystemConfigNumber('AVAILABILITY_BOOKING_DAYS_AHEAD', 90),
  ]);

  const days = dropPastStarts(
    getBookableDays(availability, {
      busyIntervals: busyIntervalsAt(
        busyByProvider.get(booking.providerId) ?? [],
        now
      ),
      excludeBookingId: bookingId,
      stepMinutes,
      daysAhead,
    }),
    now
  );

  const bookableDays = days.map((day) => ({
    value: day.value,
    label: day.label,
    slots: day.times.map((time) => {
      const slot = slotPresentation(day.maxDurationMin, time, booking.durationMin, true);
      return {
        time,
        suffix: slot.suffix,
        selectable: slot.selectable,
        tone: slot.tone,
        fitsDurationMin: slot.fitsDurationMin,
      };
    }),
  }));

  return Response.json({ bookableDays });
}
