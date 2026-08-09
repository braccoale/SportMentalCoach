import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Video,
  X,
} from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { EditAppointmentButton } from '@/components/edit-appointment-button';
import {
  SessionCompassPanel,
} from '@/components/session-compass-panel';
import { CoverageCard } from '@/components/session-compass/coverage-card';
import { loadSessionCoverage } from '@/lib/core/ai-session-notes/session-coverage-loader';
import { loadConversationMap } from '@/lib/core/ai-session-notes/conversation-map-loader';
import { describeSessionCoverage } from '@/lib/core/ai-session-notes/session-coverage-text';
import { Button } from '@/components/ui/button';
import { VideoCallButton } from '@/components/video-call-button';
import { getAppBaseUrl } from '@/lib/core/app-url';
import {
  getBookableDays,
  getCoachAvailabilityByProviderId,
  getCoachBusyIntervalsByProviderIds,
} from '@/lib/core/availability';
import { buildBookingCalendarEvent } from '@/lib/core/booking-calendar';
import { bookingStatusLabel, getParticipantBooking } from '@/lib/core/bookings';
import { FEATURE_CODES, hasFeatureEntitlement } from '@/lib/core/features';
import {
  formatDateTime,
  formatMinutes,
  formatRomeDateValue,
  formatTime,
  getSessionDurationMinutes,
} from '@/lib/core/format';
import { getAiNotesSessionForBooking } from '@/lib/core/ai-session-notes';
import {
  getMentalJourney,
  MentalJourneyError,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';
import { canShowAiSessionReport } from '@/lib/core/ai-session-notes/report-visibility';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';
import { canJoinVideoNow, isSessionJoinable } from '@/lib/core/sessions';
import { getUser } from '@/lib/db/queries';
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
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(detailPath)}`);

  const bookingId = Number(rawId);
  const booking = await getParticipantBooking(bookingId, user.id);
  if (!booking) notFound();

  const [availability, busyByProvider, aiNotesSession, aiNotesEnabled, mentalJourney] = await Promise.all([
    getCoachAvailabilityByProviderId(booking.providerId),
    getCoachBusyIntervalsByProviderIds([booking.providerId]),
    booking.viewerRole === 'coach'
      ? getAiNotesSessionForBooking(booking.id, user.id)
      : Promise.resolve(null),
    booking.viewerRole === 'coach'
      ? hasFeatureEntitlement(user.id, FEATURE_CODES.AI_SESSION_NOTES)
      : Promise.resolve(false),
    booking.viewerRole === 'coach'
      ? getMentalJourney(
          { athleteUserId: booking.athleteUserId, actorUserId: user.id },
          mentalJourneyDependencies()
        ).catch((error: unknown) => {
          if (error instanceof MentalJourneyError) return null;
          throw error;
        })
      : Promise.resolve(null),
  ]);
  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(booking.providerId) ?? [],
  });

  const created = (await searchParams).created === '1';
  const calendarEvent = buildBookingCalendarEvent({
    id: booking.id,
    status: booking.status,
    scheduledFor: booking.scheduledFor,
    durationMin: booking.durationMin,
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
    booking.viewerRole === 'athlete' ? '/dashboard/athlete' : '/dashboard/coach';
  const isOpen = ['requested', 'accepted'].includes(booking.status);
  const canCancel = isOpen && isSessionJoinable(booking.scheduledFor, booking.durationMin);
  const cancelAction =
    booking.viewerRole === 'athlete' ? cancelAthleteBookingAction : cancelCoachBookingAction;
  const calendarUnavailableMessage = !booking.scheduledFor
    ? 'La sessione non ha ancora una data e un orario concordati.'
    : !booking.serviceTitle
      ? 'Questa richiesta è stata creata senza un servizio associato. Il coach deve configurare un servizio con durata; poi annulla questa richiesta e inviane una nuova.'
      : !booking.durationMin
        ? 'Il servizio associato non ha una durata. Il coach deve completarlo prima di una nuova prenotazione.'
        : 'La sessione è già trascorsa e non può più essere aggiunta al calendario.';
  // La copertura si legge solo quando il riepilogo è visibile: fuori di lì
  // non c'è nulla da dichiarare, e non vale una query in più.
  const coverage =
    booking.viewerRole === 'coach' && aiNotesSession
      ? await loadSessionCoverage(aiNotesSession.id).catch((error: unknown) => {
          // Un guasto qui non deve togliere al coach il riepilogo: la
          // copertura è un'informazione in più, non un prerequisito.
          console.error('[appointments] copertura non calcolabile', error);
          return null;
        })
      : null;
  const coverageMessage = coverage ? describeSessionCoverage(coverage) : null;

  // Caricata col server, non su richiesta: la fascia deve esserci al primo
  // colpo d'occhio, e uno spinner in cima alla Panoramica annullerebbe
  // proprio l'effetto che deve produrre.
  const conversationMap =
    booking.viewerRole === 'coach' && aiNotesSession
      ? await loadConversationMap(aiNotesSession.id).catch((error: unknown) => {
          console.error('[appointments] mappa conversazione non disponibile', error);
          return null;
        })
      : null;

  const showAiReport =
    canShowAiSessionReport({
      viewerRole: booking.viewerRole,
      aiNotesEnabled,
      hasAiNotesSession: !!aiNotesSession,
    }) && !!aiNotesSession;
  const realDurationMin = getSessionDurationMinutes(
    booking.sessionStartedAt,
    booking.sessionEndedAt
  );
  const displayedDurationMin = realDurationMin ?? booking.durationMin;

  return (
    <section
      className={`mx-auto flex w-full min-w-0 flex-col gap-4 p-4 sm:p-6 lg:py-8 ${
        showAiReport ? 'max-w-[1400px]' : 'max-w-3xl'
      }`}
    >
      <Link
        href={dashboardPath}
        className="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <ArrowLeft className="h-4 w-4" />
        {booking.viewerRole === 'coach' ? 'Torna alle sessioni' : 'Torna alla dashboard'}
      </Link>

      <div
        className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${
          showAiReport ? 'p-4 sm:p-5' : 'p-5 sm:p-6'
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">
                {created
                  ? booking.status === 'accepted'
                    ? 'Appuntamento confermato'
                    : 'Richiesta inviata'
                  : 'Dettaglio sessione'}
              </p>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  booking.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {booking.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                {bookingStatusLabel(booking.status)}
              </span>
            </div>
            <h1
              className={`mt-2 font-bold tracking-tight text-gray-950 ${
                showAiReport ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'
              }`}
            >
              Sessione KaiPai con {counterpart}
            </h1>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
              <Meta icon={<Clock3 className="h-4 w-4" />} label="Data e ora">
                {booking.scheduledFor ? formatDateTime(booking.scheduledFor) : 'Da concordare'}
              </Meta>
              <Meta icon={<CalendarCheck className="h-4 w-4" />} label="Durata">
                {displayedDurationMin
                  ? formatMinutes(displayedDurationMin)
                  : 'Durata non definita'}
              </Meta>
              <Meta icon={<Video className="h-4 w-4" />} label="Modalità">
                Videochiamata
              </Meta>
            </dl>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {booking.status === 'accepted' && calendarEvent?.videoUrl ? (
              <VideoCallButton
                bookingId={booking.id}
                enabled={canJoinVideoNow(booking.scheduledFor, booking.durationMin)}
                scheduledFor={booking.scheduledFor?.toISOString() ?? null}
                label={booking.sessionStartedAt ? 'Rientra nella call' : 'Apri videochiamata'}
                prominent
              />
            ) : null}
            {isOpen ? (
              <Button asChild variant="outline">
                <Link href={`/dashboard/chat/${booking.id}`}>
                  <MessageSquare className="h-4 w-4" /> Messaggio
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {isOpen ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5">
            {!calendarEvent && isOpen ? (
              <p className="text-sm text-gray-500">{calendarUnavailableMessage}</p>
            ) : null}
            {isOpen ? (
              <div className="flex flex-wrap items-start gap-3">
                {booking.scheduledFor ? (
                  <EditAppointmentButton
                    bookingId={booking.id}
                    bookableDays={bookableDays}
                    currentDay={formatRomeDateValue(booking.scheduledFor)}
                    currentTime={formatTime(booking.scheduledFor)}
                    durationMin={booking.durationMin ?? DEFAULT_SERVICE_DURATION_MIN}
                  />
                ) : null}
                <AddToGoogleCalendarButton
                  url={calendarEvent?.url ?? null}
                  uiSource={created ? 'booking_confirmation' : 'appointment_detail'}
                  userRole={booking.viewerRole}
                  compact
                />
                {canCancel ? (
                  <ActionForm
                    action={cancelAction}
                    confirmTitle="Annullare la sessione?"
                    confirmMessage="La sessione verrà annullata. Potrai prenotarne una nuova in qualsiasi momento."
                    confirmActionLabel="Annulla sessione"
                  >
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <Button type="submit" variant="destructive" className="rounded-full">
                      <X className="h-4 w-4" /> Annulla
                    </Button>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showAiReport && aiNotesSession ? (
        <>
          {/* Prima del riepilogo, non dopo: sapere quanta parte della seduta
              e' stata registrata cambia come si legge tutto cio' che segue. */}
          {coverageMessage ? <CoverageCard message={coverageMessage} /> : null}
          <SessionCompassPanel
            sessionId={aiNotesSession.id}
            sessionDate={booking.scheduledFor?.toISOString() ?? null}
            athleteName={counterpart}
            initialJourney={mentalJourney}
            conversationMap={conversationMap}
          />
        </>
      ) : null}
    </section>
  );
}

function Meta({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-gray-400">{icon}</span>
      <dt className="sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
