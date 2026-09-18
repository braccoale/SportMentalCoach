import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { listSessionsForUser } from '@/lib/core/academy/sessions';
import {
  BookingCalendar,
  type CalendarEvent,
} from '@/components/calendar/booking-calendar';
import { completeBookingAction, cancelBookingAction } from '../actions';

export default async function CoachCalendarPage() {
  const user = await requireRole('coach');
  const [bookings, academySessions] = await Promise.all([
    getCoachBookings(user.id),
    listSessionsForUser(user.id),
  ]);

  const bookingEvents: CalendarEvent[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    scheduledFor: b.scheduledFor ? b.scheduledFor.toISOString() : null,
    requestedAt: b.requestedAt.toISOString(),
    title: b.clientName || b.clientEmail,
    serviceTitle: b.serviceTitle,
    durationMin: b.durationMin,
    note: b.note,
  }));

  // Le sessioni Academy annullate restano nello storico (non si eliminano),
  // ma non hanno senso nel calendario in corso — la lista del corso è già
  // il posto dove restano visibili.
  const academyEvents: CalendarEvent[] = academySessions
    .filter((s) => s.status === 'scheduled')
    .map((s) => ({
      id: s.id,
      status: s.status,
      scheduledFor: s.scheduledFor.toISOString(),
      requestedAt: s.scheduledFor.toISOString(),
      title: `Academy — ${s.courseTitle}`,
      serviceTitle: `Modulo: ${s.moduleTitle}`,
      durationMin: s.durationMin,
      note: s.description,
      kind: 'academy_session',
      href: s.asInstructor
        ? `/dashboard/coach/academy/${s.courseId}`
        : `/dashboard/coach/academy`,
      subtitle: `${s.moduleTitle} · ${s.mode === 'group' ? 'sessione di gruppo' : 'sessione individuale'}`,
      participantsLabel: s.asInstructor
        ? s.participants.map((p) => p.displayName).join(', ') || 'Nessun partecipante'
        : `Docente: ${s.instructorName}`,
    }));

  return (
    <section className="p-4 sm:p-6">
      <BookingCalendar
        events={[...bookingEvents, ...academyEvents]}
        role="coach"
        completeAction={completeBookingAction}
        cancelAction={cancelBookingAction}
      />
    </section>
  );
}
