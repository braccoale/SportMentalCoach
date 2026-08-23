import { SharedSessionReportPanel } from '@/components/shared-session-report';
import { getSharedReportForAthlete } from '@/lib/core/ai-session-notes/shared-report-store';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';
import { RETURN_TO_PARAM } from '@/lib/core/ai-session-notes/return-to';
import Link from 'next/link';
import { after } from 'next/server';
import { headers } from 'next/headers';
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
import { OrbitDecor } from '@/components/session-compass/decor';
import { PointsToRevisitSection } from '@/components/mental-journey';
import { SessionGoalsCheck } from '@/components/session-compass/session-goals-check';
import {
  listGoalSessionLinks,
  listJourneyGoals,
} from '@/lib/core/ai-session-notes/journey-goals-store';
import { toggleJourneyGoalSessionAction } from '@/app/(dashboard)/dashboard/coach/athletes/[athleteId]/actions';
import { RecordingCoverageNotice } from '@/components/session-compass/recording-coverage-notice';
import { loadConversationMap } from '@/lib/core/ai-session-notes/conversation-map-loader';
import { Button } from '@/components/ui/button';
import { VideoCallButton } from '@/components/video-call-button';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { BackToTop } from '@/components/back-to-top';
import { getSessionRecordingCoverage } from '@/lib/core/ai-session-notes/recording';
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
import { runAiNotesQueueAfterResponse } from '@/lib/core/ai-session-notes/queue-runner';
import { isPendingAiNotesStatus } from '@/lib/core/ai-session-notes/worker-nudge';
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

/**
 * Il riepilogo impiega dai dieci ai venti secondi, e qui dentro gira la coda.
 *
 * Senza questa riga la funzione eredita il limite predefinito e viene uccisa
 * a meta' generazione: il job resta appeso, viene recuperato e riparte. E'
 * esattamente il doppio tentativo visto su due sedute di fila — non un
 * guasto del modello, un budget di tempo troppo stretto.
 */
export const maxDuration = 60;


export const dynamic = 'force-dynamic';

export default async function AppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; back?: string }>;
}) {
  const user = await getUser();
  const { id: rawId } = await params;
  const detailPath = `/dashboard/appointments/${rawId}`;
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(detailPath)}`);

  const bookingId = Number(rawId);
  const booking = await getParticipantBooking(bookingId, user.id);
  if (!booking) notFound();

  const [availability, busyByProvider, aiNotesSession, aiNotesEnabled, mentalJourney,
    sharedReport,
  ] = await Promise.all([
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
    /*
     * Il riepilogo che il coach ha consegnato a questa persona.
     *
     * Solo per l'atleta: il coach la stessa cosa la vede dal pannello
     * completo, con dentro anche cio' che non esce. Legge
     * `shared_report_json`, che contiene gia' soltanto la parte consegnabile —
     * il documento intero non passa mai da questa parte del codice.
     */
    booking.viewerRole === 'athlete'
      ? getSharedReportForAthlete({
          bookingId: booking.id,
          athleteUserId: booking.athleteUserId,
        })
      : Promise.resolve(null),
  ]);
  /*
   * Aprire l'appuntamento fa avanzare la coda.
   *
   * E' il gesto che il coach compie davvero quando aspetta il riepilogo, e
   * questa pagina si carica lato server: senza questa riga la sveglia sulla
   * rotta API non scatterebbe mai, perche' quella rotta la pagina non la
   * chiama. Best effort e dopo la risposta: la pagina non deve rallentare.
   */
  // La copertura si legge solo quando c'e' una sessione AI: senza, non c'e'
  // nessun riepilogo da qualificare.
  const recordingCoverage = aiNotesSession
    ? await getSessionRecordingCoverage(aiNotesSession.id)
    : null;

  if (isPendingAiNotesStatus(aiNotesSession?.status)) {
    runAiNotesQueueAfterResponse();
  }

  const bookableDays = getBookableDays(availability, {
    busyIntervals: busyByProvider.get(booking.providerId) ?? [],
  });

  const query = await searchParams;
  const created = query.created === '1';
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

  /**
   * Il collegamento «indietro» torna dove si era, non dove si finisce di solito.
   *
   * A questa pagina si arriva da posti diversi — l'elenco delle sessioni, la
   * scheda di un atleta, una notifica — e finora ne conosceva uno solo: chi
   * apriva una giornata dal percorso di un atleta si ritrovava sulla dashboard,
   * e per riprendere il filo doveva rifare la strada.
   *
   * Il valore arriva dall'indirizzo, quindi e' scritto da chi ci arriva: passa
   * dalla stessa guardia di ogni altra destinazione del prodotto, che accetta
   * solo percorsi di questo sito.
   */
  const returnTo = safeRedirectPath(query[RETURN_TO_PARAM]) ?? dashboardPath;
  const cameFromJourney = returnTo.startsWith('/dashboard/coach/athletes/');
  const backLabel = cameFromJourney
    ? 'Torna al percorso'
    : booking.viewerRole === 'coach'
      ? 'Torna alle sessioni'
      : 'Torna alla dashboard';
  const isOpen = ['requested', 'accepted'].includes(booking.status);
  /*
   * La seduta e' gia' avvenuta.
   *
   * Resta «aperta» finche' il coach non la chiude, ma il tempo e' passato: da
   * quel momento spostarla, aggiungerla al calendario o scriverne nell'intestazione
   * non sono piu' azioni possibili, sono ingombro sopra la cosa per cui si e'
   * aperta la pagina — il riepilogo. Un pulsante che non puo' fare nulla non e'
   * neutro: chiede attenzione e la restituisce vuota.
   */
  const alreadyHappened = !isSessionJoinable(
    booking.scheduledFor,
    booking.durationMin
  );
  const canCancel = isOpen && !alreadyHappened;
  const cancelAction =
    booking.viewerRole === 'athlete' ? cancelAthleteBookingAction : cancelCoachBookingAction;
  const calendarUnavailableMessage = !booking.scheduledFor
    ? 'La sessione non ha ancora una data e un orario concordati.'
    : !booking.serviceTitle
      ? 'Questa richiesta è stata creata senza un servizio associato. Il coach deve configurare un servizio con durata; poi annulla questa richiesta e inviane una nuova.'
      : !booking.durationMin
        ? 'Il servizio associato non ha una durata. Il coach deve completarlo prima di una nuova prenotazione.'
        : 'La sessione è già trascorsa e non può più essere aggiunta al calendario.';

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
  /**
   * Gli obiettivi su cui si può spuntare questa seduta.
   *
   * Solo per il coach, e solo quando la seduta ha un riepilogo: sono gli
   * obiettivi che lui stesso ha scritto per quella persona, con l'indicazione
   * di quali risultano già segnati su questa seduta.
   */
  const sessionGoals =
    showAiReport && aiNotesSession && booking.viewerRole === 'coach'
      ? await (async () => {
          const goals = await listJourneyGoals({
            coachUserId: user.id,
            athleteUserId: booking.athleteUserId,
          });
          const links = await listGoalSessionLinks(goals.map((goal) => goal.id));
          return goals.map((goal) => ({
            id: goal.id,
            title: goal.title,
            isPrimary: goal.isPrimary,
            status: goal.status,
            touched: links.get(goal.id)?.has(aiNotesSession.id) ?? false,
          }));
        })()
      : null;

  /**
   * Che cosa riprendere, sulla pagina della seduta che deve ancora svolgersi.
   *
   * Il percorso era gia' caricato qui — `mentalJourney` — ma finiva solo
   * dentro il pannello del riepilogo, che su una seduta futura non si disegna
   * affatto. Cioè: il coach apriva il prossimo appuntamento per prepararlo e
   * non trovava niente, mentre il dato che cercava era già in memoria.
   *
   * Solo per il coach, e solo prima dell'incontro: dopo, la pagina ha il
   * riepilogo di quella seduta, ed è quello che si legge.
   */
  const showPreparation =
    booking.viewerRole === 'coach' &&
    booking.scheduledFor !== null &&
    booking.scheduledFor.getTime() > Date.now();
  const preparationPoints = showPreparation
    ? (mentalJourney?.pointsToRevisit ?? [])
    : [];

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
        href={returnTo}
        className="inline-flex w-fit items-center gap-2 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div
        className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${
          showAiReport ? 'p-4 sm:p-5' : 'p-5 sm:p-6'
        }`}
      >
        {/* Orbita disegnata nell'angolo: sta sotto al contenuto, non prende
            eventi, e sparisce sotto lg dove lo spazio serve al testo. */}
        {showAiReport ? (
          <OrbitDecor className="-right-8 -top-10 hidden size-56 opacity-90 lg:block" />
        ) : null}
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
            {isOpen && !alreadyHappened ? (
              <Button asChild variant="outline">
                <Link href={`/dashboard/chat/${booking.id}`}>
                  <MessageSquare className="h-4 w-4" /> Messaggio
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {isOpen && !alreadyHappened ? (
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
                    confirmMessage="Confermi di voler annullare questo appuntamento? L’operazione non può essere annullata."
                    confirmActionLabel="Annulla sessione"
                    collectCancellationMessage
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

      {/* Prima del riepilogo, perche' prima dell'incontro non c'e' nessun
          riepilogo da leggere: qui questa sezione non e' una voce fra le
          altre, e' la ragione per cui si apre la pagina. */}
      {showPreparation ? (
        <PointsToRevisitSection
          points={preparationPoints}
          heading="Da portare in questa seduta"
          intro="Ricavato dalle sedute precedenti: che cosa era rimasto aperto e che cosa il riepilogo dell'ultima volta aveva lasciato per oggi."
          /*
           * Vuota, questa sezione si mostra lo stesso.
           * «Preparati», nella scheda della prossima call, punta qui: se la
           * sezione sparisce il pulsante porta a una pagina che si apre in
           * cima, e sembra rotto. Un percorso senza spunti non e' un guasto —
           * va detto, con il motivo.
           */
          emptyMessage="Niente da riprendere, per ora. Gli spunti nascono dai riepiloghi delle sedute precedenti e dagli impegni rimasti aperti: dopo questa seduta, qui trovi che cosa portare alla prossima."
        />
      ) : null}

      {/* Il riepilogo consegnato all'atleta.
          Sta sulla pagina della seduta, e con l'ancora `#session-compass`,
          perche' e' esattamente dove punta la notifica che riceve: prima quel
          collegamento portava a un'ancora che per lui non esisteva. */}
      {sharedReport ? (
        <SharedSessionReportPanel
          report={sharedReport}
          coachName={booking.coachName}
        />
      ) : null}

      {showAiReport && aiNotesSession ? (
        <>
          {/* Un contrassegno di una riga, non piu' un riquadro: il dettaglio
              sta nel fumetto. Ma resta sopra il riepilogo — sapere che una
              voce manca cambia come si legge tutto cio' che segue. */}
          {recordingCoverage ? (
            <RecordingCoverageNotice coverage={recordingCoverage} />
          ) : null}
          <SessionCompassPanel
            sessionId={aiNotesSession.id}
            sessionDate={booking.scheduledFor?.toISOString() ?? null}
            athleteName={counterpart}
            initialJourney={mentalJourney}
            conversationMap={conversationMap}
          />

          {/* La spunta degli obiettivi sta **dopo** il riepilogo, e solo per
              il coach: la domanda «su che cosa avete lavorato oggi» ha senso
              quando si è appena letto di che cosa si è parlato. Nella scheda
              dell'atleta arrivava lontano dai riepiloghi, e infatti nessuno
              rispondeva. */}
          {sessionGoals ? (
            <SessionGoalsCheck
              goals={sessionGoals}
              athleteUserId={booking.athleteUserId}
              sessionId={aiNotesSession.id}
              toggleAction={toggleJourneyGoalSessionAction}
              athleteCardHref={`/dashboard/coach/athletes/${booking.athleteUserId}`}
            />
          ) : null}
        </>
      ) : null}

      {/* La pagina piu' lunga del prodotto: panoramica, racconto, percorso,
          indicatori e trascrizione. Tornare in cima per approvare o cambiare
          scheda significava trascinare per parecchi schermi. */}
      <BackToTop />
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
