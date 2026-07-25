import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  CalendarCheck,
  Clock3,
  MessageSquare,
  X,
  UserRound,
  Video,
} from 'lucide-react';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/db/queries';
import {
  bookingStatusLabel,
  getParticipantBooking,
} from '@/lib/core/bookings';
import {
  buildBookingCalendarEvent,
  BOOKING_TIME_ZONE,
} from '@/lib/core/booking-calendar';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { formatDateTime, formatMinutes } from '@/lib/core/format';
import { isSessionJoinable } from '@/lib/core/sessions';
import { cancelBookingAction as cancelAthleteBookingAction } from '../../athlete/actions';
import { cancelBookingAction as cancelCoachBookingAction } from '../../coach/actions';

export const dynamic = 'force-dynamic';

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await getUser();
  const { id: rawId } = await params;
  const detailPath = `/dashboard/appointments/${rawId}`;
  if (!user) {
    redirect(`/sign-in?redirect=${encodeURIComponent(detailPath)}`);
  }

  const bookingId = Number(rawId);
  const booking = await getParticipantBooking(bookingId, user.id);
  if (!booking) notFound();

  const created = (await searchParams).created === '1';
  const calendarEvent = buildBookingCalendarEvent({
    id: booking.id,
    status: booking.status,
    scheduledFor: booking.scheduledFor,
    durationMin: booking.serviceDurationMin,
    coachName: booking.coachName,
    athleteName: booking.athleteName,
    viewerRole: booking.viewerRole,
    appBaseUrl: getAppBaseUrl(),
    canView: true,
    isOnline: true,
  });
  const counterpart =
    booking.viewerRole === 'athlete'
      ? booking.coachName || 'Coach'
      : booking.athleteName || 'Atleta';
  const dashboardPath =
    booking.viewerRole === 'athlete'
      ? '/dashboard/athlete'
      : '/dashboard/coach';
  const isOpen = ['requested', 'accepted'].includes(booking.status);
  const canCancel =
    isOpen && isSessionJoinable(booking.scheduledFor);
  const cancelAction =
    booking.viewerRole === 'athlete'
      ? cancelAthleteBookingAction
      : cancelCoachBookingAction;
  const calendarUnavailableMessage = !booking.scheduledFor
    ? 'La sessione non ha ancora una data e un orario concordati.'
    : !booking.serviceTitle
      ? 'Questa richiesta è stata creata senza un servizio associato. Il coach deve configurare un servizio con durata; poi annulla questa richiesta e inviane una nuova.'
      : !booking.serviceDurationMin
        ? 'Il servizio associato non ha una durata. Il coach deve completarlo prima di una nuova prenotazione.'
        : 'La sessione è già trascorsa e non può più essere aggiunta al calendario.';

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 lg:py-10">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50">
            <CalendarCheck className="h-7 w-7 text-emerald-600" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">
              {created
                ? booking.status === 'accepted'
                  ? 'Appuntamento confermato'
                  : 'Richiesta inviata'
                : 'Dettaglio appuntamento'}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
              Sessione KaiPai con {counterpart}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Stato: {bookingStatusLabel(booking.status)}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-5 sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Clock3 className="h-4 w-4" /> Data e ora
            </dt>
            <dd className="mt-1 font-medium text-gray-900">
              {booking.scheduledFor
                ? formatDateTime(booking.scheduledFor)
                : 'Da concordare'}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <CalendarCheck className="h-4 w-4" /> Durata
            </dt>
            <dd className="mt-1 font-medium text-gray-900">
              {booking.serviceDurationMin
                ? formatMinutes(booking.serviceDurationMin)
                : 'Non definita'}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <UserRound className="h-4 w-4" /> Partecipante
            </dt>
            <dd className="mt-1 font-medium text-gray-900">{counterpart}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Video className="h-4 w-4" /> Modalità
            </dt>
            <dd className="mt-1 font-medium text-gray-900">
              Online su KaiPai · {BOOKING_TIME_ZONE}
            </dd>
          </div>
          {booking.serviceTitle && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sessione
              </dt>
              <dd className="mt-1 font-medium text-gray-900">
                {booking.serviceTitle}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-6">
          <AddToGoogleCalendarButton
            url={calendarEvent?.url ?? null}
            uiSource={created ? 'booking_confirmation' : 'appointment_detail'}
            userRole={booking.viewerRole}
          />

          {!calendarEvent && isOpen && (
            <p className="text-sm text-gray-500">
              {calendarUnavailableMessage}
            </p>
          )}
          {!isOpen && (
            <p className="text-sm text-gray-500">
              Le sessioni concluse, annullate, rifiutate o scadute non possono
              essere aggiunte al calendario.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {isOpen && (
            <Button asChild className="rounded-full">
              <Link href={`/dashboard/chat/${booking.id}`}>
                <MessageSquare className="h-4 w-4" /> Manda un messaggio
              </Link>
            </Button>
          )}
          {booking.status === 'accepted' && calendarEvent?.videoUrl && (
            <>
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/dashboard/video/${booking.id}`}>
                  <Video className="h-4 w-4" /> Apri videochiamata
                </Link>
              </Button>
            </>
          )}
          {canCancel && (
            <ActionForm
              action={cancelAction}
              confirmMessage="Vuoi davvero annullare questa sessione?"
            >
              <input type="hidden" name="bookingId" value={booking.id} />
              <Button
                type="submit"
                variant="destructive"
                className="rounded-full"
              >
                <X className="h-4 w-4" /> Annulla
              </Button>
            </ActionForm>
          )}
          <Button asChild variant="outline" className="rounded-full">
            <Link href={dashboardPath}>Torna alla dashboard</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
