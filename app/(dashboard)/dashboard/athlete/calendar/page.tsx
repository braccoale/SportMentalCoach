import { requireRole } from '@/lib/core/auth';
import {
  getAthleteBookings,
  getAthleteRelationshipCoaches,
} from '@/lib/core/bookings';
import {
  BookingCalendar,
  type CalendarEvent,
} from '@/components/calendar/booking-calendar';
import { NewAppointmentButton } from '../new-appointment-button';

export default async function AthleteCalendarPage() {
  const user = await requireRole('athlete');
  const [bookings, relationshipCoaches] = await Promise.all([
    getAthleteBookings(user.id),
    getAthleteRelationshipCoaches(user.id),
  ]);

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
    <section className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-medium text-gray-900">Il tuo calendario</h1>
        <NewAppointmentButton coaches={relationshipCoaches} />
      </div>
      <BookingCalendar events={events} role="athlete" />
    </section>
  );
}
