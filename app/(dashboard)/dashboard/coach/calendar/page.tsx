import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import {
  BookingCalendar,
  type CalendarEvent,
} from '@/components/calendar/booking-calendar';
import { completeBookingAction, cancelBookingAction } from '../actions';

export default async function CoachCalendarPage() {
  const user = await requireRole('coach');
  const bookings = await getCoachBookings(user.id);

  const events: CalendarEvent[] = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    scheduledFor: b.scheduledFor ? b.scheduledFor.toISOString() : null,
    requestedAt: b.requestedAt.toISOString(),
    title: b.clientName || b.clientEmail,
    serviceTitle: b.serviceTitle,
    durationMin: b.durationMin,
    note: b.note,
  }));

  return (
    <section className="p-4 sm:p-6">
      <BookingCalendar
        events={events}
        role="coach"
        completeAction={completeBookingAction}
        cancelAction={cancelBookingAction}
      />
    </section>
  );
}
