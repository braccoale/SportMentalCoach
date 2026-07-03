import { requireRole } from '@/lib/core/auth';
import { getAthleteBookings } from '@/lib/core/bookings';
import {
  BookingCalendar,
  type CalendarEvent,
} from '@/components/calendar/booking-calendar';

export default async function AthleteCalendarPage() {
  const user = await requireRole('athlete');
  const bookings = await getAthleteBookings(user.id);

  const events: CalendarEvent[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    scheduledFor: b.scheduledFor ? b.scheduledFor.toISOString() : null,
    requestedAt: b.requestedAt.toISOString(),
    title: b.coachName ?? 'Coach',
    serviceTitle: b.serviceTitle,
    note: b.note,
  }));

  // Read-only for athletes: no complete/cancel actions in the drawer.
  return (
    <section className="p-4 sm:p-6">
      <BookingCalendar events={events} role="athlete" />
    </section>
  );
}
