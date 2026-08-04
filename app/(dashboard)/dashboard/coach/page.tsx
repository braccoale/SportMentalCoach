import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Hourglass,
  CalendarCheck,
  BarChart3,
  MessageSquare,
  Star,
  Clock,
  Video,
  CalendarPlus,
  ArrowRight,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  bookingStatusLabel,
  bookingStatusTone,
  getCoachBookings,
  getAllAthletes,
  getCoachRelationshipAthletes,
  type CoachBooking,
} from '@/lib/core/bookings';
import { getCoachServices } from '@/lib/core/services';
import { DEFAULT_SERVICE_DURATION_MIN } from '@/lib/core/services/validation';
import {
  getCoachAvailability,
  describeAvailability,
  getBookableDays,
} from '@/lib/core/availability';
import { getProviderProfileByUser } from '@/lib/core/profiles';
import { isSessionJoinable, canJoinVideoNow } from '@/lib/core/sessions';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { getCoachReviews } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  formatBigDateParts,
  formatMinutes,
  formatRomeDateValue,
  formatTime,
  resolveDisplayName,
  getSessionDurationMinutes,
  scheduledForLabel,
} from '@/lib/core/format';
import {
  UpcomingAppointmentCard,
  type UpcomingAppointmentData,
} from '@/components/upcoming-appointment-card';
import {
  CompletedSessionCard,
  type CompletedSessionData,
} from '@/components/completed-session-card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { RatingStars } from '@/components/rating-stars';
import { SummaryCard } from '@/components/summary-card';
import { MentalJourneyLinks } from '@/components/mental-journey-links';
import { CoachRequestCard, type CoachRequestCardData } from '@/components/coach-request-card';
import { replyToReviewAction } from './review-reply-actions';
import {
  acceptBookingAction,
  declineBookingAction,
  completeBookingAction,
  cancelBookingAction,
} from './actions';
import { CoachNewAppointmentButton } from './new-appointment-button';
import { InviteFriendButton } from '@/components/invite/invite-friend-button';
import { computeCoachOnboarding } from '@/lib/core/onboarding';
import { submitForReviewAction } from './profile-actions';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { buildBookingGoogleCalendarUrl } from '@/lib/core/booking-calendar';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { ShareButton } from '@/components/share-button';
import { EditAppointmentButton } from '@/components/edit-appointment-button';
import { VideoCallButton } from '@/components/video-call-button';

/** Sort key for the archive: when the session actually happened, newest first. */
function archiveRecency(b: CoachBooking): number {
  return (
    b.sessionEndedAt?.getTime() ??
    b.scheduledFor?.getTime() ??
    b.decidedAt?.getTime() ??
    b.requestedAt.getTime()
  );
}

/** Inert placeholder matching the button row's height, so hint text lines up with real buttons instead of floating baseline-aligned next to them. */
function HintPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 items-center rounded-full px-3 text-xs text-gray-400">
      {children}
    </span>
  );
}

export default async function CoachDashboardPage() {
  const user = await requireRole('coach');
  const config = getVerticalConfig();
  const appBaseUrl = getAppBaseUrl();
  const coachName =
    [user.name, user.lastName].filter(Boolean).join(' ').trim() || null;

  const [
    provider,
    allBookings,
    unreadMessages,
    athletes,
    journeyAthletes,
    coachServices,
    coachAvailability,
  ] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachBookings(user.id),
    getUnreadCountForType(user.id, 'new_message'),
    getAllAthletes(),
    getCoachRelationshipAthletes(user.id),
    getCoachServices(user.id),
    getCoachAvailability(user.id),
  ]);
  const availabilityHint = describeAvailability(coachAvailability);
  // Same Rome-derived day/time options the athlete sees, so the coach can't
  // pick a slot their own availability would reject on submit.
  const bookableDays = getBookableDays(coachAvailability, {
    busyIntervals: allBookings
      .filter(
        (booking) =>
          booking.scheduledFor &&
          booking.scheduledFor > new Date() &&
          ['requested', 'accepted'].includes(booking.status)
      )
      .map((booking) => ({
        scheduledFor: booking.scheduledFor!,
        durationMin:
          booking.serviceDurationMin ?? DEFAULT_SERVICE_DURATION_MIN,
      })),
  });

  const reviews = provider ? await getCoachReviews(provider.id) : [];

  // Review/publication gate. Appointments unlock only once the ADMIN APPROVES
  // the profile — not merely when it's been submitted (pending still counts as
  // not-yet-usable). The submit CTA lives right on the dashboard.
  const coachOnboarding = provider
    ? computeCoachOnboarding(
        provider,
        coachServices.filter(
          (service) =>
            service.isActive &&
            Number.isInteger(service.durationMin) &&
            (service.durationMin ?? 0) > 0
        ).length
      )
    : null;
  const isApproved = provider?.status === 'approved';
  const isPending = provider?.status === 'pending';

  const pending = allBookings.filter((b) => b.status === 'requested');
  const accepted = allBookings.filter((b) => b.status === 'accepted');
  const upcomingAccepted = accepted
    .filter((booking) => isSessionJoinable(booking.scheduledFor))
    .sort(
      (a, b) =>
        (a.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER)
    );
  const pastAccepted = accepted.filter(
    (booking) => !isSessionJoinable(booking.scheduledFor)
  );
  // Archive newest-first by when the session actually happened (real end or
  // scheduled time), not by when it was first requested.
  const archive = allBookings
    .filter(
      (b) =>
        ['declined', 'expired', 'cancelled', 'completed'].includes(b.status) ||
        pastAccepted.some((past) => past.id === b.id)
    )
    .sort((a, b) => archiveRecency(b) - archiveRecency(a));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfToday.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const newToday = pending.filter((b) => b.requestedAt >= startOfToday).length;
  const acceptedThisWeek = accepted.filter(
    (b) => b.decidedAt && b.decidedAt >= startOfWeek
  ).length;
  const bookingsThisMonth = allBookings.filter(
    (b) => b.requestedAt >= startOfMonth
  ).length;
  const bookingsLastMonth = allBookings.filter(
    (b) => b.requestedAt >= startOfLastMonth && b.requestedAt < startOfMonth
  ).length;
  const monthPct =
    bookingsLastMonth > 0
      ? Math.round(
          ((bookingsThisMonth - bookingsLastMonth) / bookingsLastMonth) * 100
        )
      : null;
  const reviewsThisWeek = reviews.filter(
    (r) => r.createdAt >= startOfWeek
  ).length;

  return (
    <section className="flex flex-col gap-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">
            Ogni richiesta racconta un atleta, non solo una prenotazione.
          </h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            Leggi il momento sportivo della persona che ti sta cercando, capisci
            il suo bisogno e rispondi con il contesto giusto.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isApproved ? (
            <CoachNewAppointmentButton
              athletes={athletes}
              services={coachServices
                .filter(
                  (s) =>
                    s.isActive &&
                    s.title &&
                    Number.isInteger(s.durationMin) &&
                    (s.durationMin ?? 0) > 0
                )
                .map((s) => ({
                  id: s.id,
                  title: s.title as string,
                  durationMin: s.durationMin as number,
                }))}
              availabilityHint={availabilityHint}
              bookableDays={bookableDays}
            />
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                disabled
                className="rounded-full bg-green-600 text-white opacity-50"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Nuovo appuntamento
              </Button>
              <p className="text-xs text-gray-400">
                Disponibile dopo l’approvazione del profilo.
              </p>
            </div>
          )}
          <InviteFriendButton />
        </div>
      </div>

      {/* Approval gate: not yet submitted (draft/rejected) → prompt to send. */}
      {provider && !isApproved && !isPending && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-amber-900">
              Il tuo profilo non è ancora stato inviato per l’approvazione
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              Invialo alla revisione dell’admin. Potrai creare appuntamenti solo
              dopo l’approvazione.
            </p>
          </div>
          {coachOnboarding?.canSubmit ? (
            <form action={submitForReviewAction} className="shrink-0">
              <Button type="submit" className="rounded-full">
                Invia approvazione
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          ) : (
            <Button asChild variant="outline" className="shrink-0 rounded-full">
              <Link href="/dashboard/coach/profile">Completa il profilo</Link>
            </Button>
          )}
        </div>
      )}

      {/* Submitted, awaiting the admin decision — still not usable yet. */}
      {isPending && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Profilo inviato il{' '}
          {formatDate(provider.submittedAt ?? provider.updatedAt)}: è in
          revisione. Potrai creare appuntamenti dopo l’approvazione dell’admin.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard
          icon={Hourglass}
          label="Richieste in attesa"
          value={pending.length}
          tone="red"
          note={newToday > 0 ? `${newToday} nuove oggi` : 'Nessuna nuova oggi'}
          trend={newToday > 0 ? 'up' : 'flat'}
          href="/dashboard/coach#richieste-in-attesa"
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Sessioni accettate"
          value={accepted.length}
          tone="green"
          note={
            acceptedThisWeek > 0
              ? `${acceptedThisWeek} questa settimana`
              : 'Nessuna questa settimana'
          }
          trend={acceptedThisWeek > 0 ? 'up' : 'flat'}
          href="/dashboard/coach#atleti-in-percorso"
        />
        <SummaryCard
          icon={BarChart3}
          label="Sessioni totali"
          value={allBookings.length}
          tone="purple"
          note={
            monthPct !== null
              ? `${monthPct >= 0 ? '+' : ''}${monthPct}% rispetto al mese scorso`
              : `${bookingsThisMonth} questo mese`
          }
          trend={monthPct !== null && monthPct < 0 ? 'down' : 'up'}
          href="/dashboard/coach#percorsi-archiviati"
        />
        <SummaryCard
          icon={Star}
          label="Recensioni"
          value={reviews.length}
          tone="amber"
          note={
            reviewsThisWeek > 0
              ? `${reviewsThisWeek} ${reviewsThisWeek === 1 ? 'nuova' : 'nuove'} questa settimana`
              : 'Nessuna nuova questa settimana'
          }
          trend={reviewsThisWeek > 0 ? 'up' : 'flat'}
          href="/dashboard/coach#recensioni"
        />
        <SummaryCard
          icon={MessageSquare}
          label="Messaggi non letti"
          value={unreadMessages}
          tone="blue"
          note={unreadMessages > 0 ? 'Da leggere ora' : 'Nessun nuovo messaggio'}
          trend="flat"
          href="/dashboard/coach/messages"
        />
      </div>

      <MentalJourneyLinks athletes={journeyAthletes} />

      {/* Il conteggio resta nella KPI qui sopra, che si collega a questa
          sezione solo quando è maggiore di zero: nessuna ancora morta. */}
      <DashboardSection
        hideWhenEmpty
        id="richieste-in-attesa"
        title="Nuove richieste da valutare"
        subtitle="Atleti in attesa di una tua risposta. Qui vedi il loro momento, il bisogno principale e il tipo di supporto che stanno cercando."
        items={pending}
        emptyTitle="Nessuna richiesta in attesa."
        emptySubtitle="Quando arriveranno nuove richieste, le vedrai qui con il loro contesto."
        renderCard={(booking) => (
          <CoachRequestCard
            key={booking.id}
            data={buildCoachRequestCardData(booking, config)}
            actions={
              <>
                <ActionForm action={acceptBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Button type="submit" className="rounded-full">
                    Accetta richiesta
                  </Button>
                </ActionForm>
                <ActionForm action={declineBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="rounded-full"
                  >
                    Rifiuta
                  </Button>
                </ActionForm>
              </>
            }
            detailContent={<CoachRequestDetails booking={booking} config={config} />}
          />
        )}
      />

      <DashboardSection
        hideWhenEmpty
        id="atleti-in-percorso"
        title="Prossimi Appuntamenti"
        titleClassName="text-green-600"
        subtitle="Sessioni confermate ancora da svolgere o attualmente in corso."
        items={upcomingAccepted}
        emptyTitle="Nessuna sessione accettata."
        emptySubtitle="Le sessioni confermate compariranno qui appena dai il via a un nuovo percorso."
        renderCard={(booking) => {
          const calendarUrl = buildBookingGoogleCalendarUrl({
            id: booking.id,
            status: booking.status,
            scheduledFor: booking.scheduledFor,
            durationMin: booking.serviceDurationMin,
            coachName,
            athleteName: booking.clientName,
            viewerRole: 'coach',
            appBaseUrl,
            canView: true,
            isOnline: true,
          });
          return (
            <UpcomingAppointmentCard
              key={booking.id}
              data={buildUpcomingAppointmentData(booking)}
              primaryActions={
                isSessionJoinable(booking.scheduledFor) ? (
                  <>
                    <Link
                      href={`/dashboard/chat/${booking.id}`}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <MessageSquare className="h-4 w-4" /> Apri chat
                    </Link>
                    <VideoCallButton
                      bookingId={booking.id}
                      enabled={canJoinVideoNow(booking.scheduledFor)}
                      scheduledFor={
                        booking.scheduledFor?.toISOString() ?? null
                      }
                      label={
                        booking.sessionStartedAt
                          ? 'Rientra nella call'
                          : undefined
                      }
                    />
                    {booking.scheduledFor && (
                      <EditAppointmentButton
                        bookingId={booking.id}
                        bookableDays={bookableDays}
                        currentDay={formatRomeDateValue(
                          booking.scheduledFor
                        )}
                        currentTime={formatTime(booking.scheduledFor)}
                        durationMin={
                          booking.serviceDurationMin ??
                          DEFAULT_SERVICE_DURATION_MIN
                        }
                        compact
                      />
                    )}
                    <AddToGoogleCalendarButton
                      url={calendarUrl}
                      uiSource="appointment_card"
                      userRole="coach"
                      compact
                    />
                    <ShareButton bookingId={booking.id} />
                    <ActionForm
                      action={cancelBookingAction}
                      confirmTitle="Annullare la sessione?"
                      confirmMessage="La sessione verrà annullata. Potrai prenotarne una nuova in qualsiasi momento."
                      confirmActionLabel="Annulla sessione"
                    >
                      <input
                        type="hidden"
                        name="bookingId"
                        value={booking.id}
                      />
                      <Button
                        type="submit"
                        variant="destructive"
                        className="rounded-full"
                      >
                        Annulla
                      </Button>
                    </ActionForm>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Sessione trascorsa</p>
                )
              }
              overflowActions={
                <>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href={`/dashboard/appointments/${booking.id}`}>
                      Vedi dettagli
                    </Link>
                  </DropdownMenuItem>
                  {booking.sessionStartedAt ? (
                    <ActionForm action={completeBookingAction} className="w-full">
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button type="submit" className="flex w-full">
                        <DropdownMenuItem className="w-full flex-1 cursor-pointer">
                          Completa
                        </DropdownMenuItem>
                      </button>
                    </ActionForm>
                  ) : (
                    <DropdownMenuItem disabled>
                      Completabile dopo la videochiamata
                    </DropdownMenuItem>
                  )}
                </>
              }
              detailContent={
                <CoachRequestDetails booking={booking} config={config} />
              }
            />
          );
        }}
      />

      <DashboardSection
        id="percorsi-archiviati"
        title="Percorsi conclusi o archiviati"
        subtitle="Uno storico piu leggibile delle richieste gia chiuse, completate o annullate."
        items={archive}
        emptyTitle="Nessuna richiesta passata."
        emptySubtitle="Lo storico delle richieste concluse o archiviate comparira qui."
        renderCard={(booking) => (
          <CompletedSessionCard
            key={booking.id}
            data={buildArchiveCardData(booking, config)}
            overflowActions={
              booking.status === 'accepted' ? (
                booking.sessionStartedAt ? (
                  <ActionForm action={completeBookingAction} className="w-full">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <button type="submit" className="flex w-full">
                      <DropdownMenuItem className="w-full flex-1 cursor-pointer">
                        Completa
                      </DropdownMenuItem>
                    </button>
                  </ActionForm>
                ) : (
                  <DropdownMenuItem disabled>
                    Nessuna videochiamata registrata
                  </DropdownMenuItem>
                )
              ) : undefined
            }
            detailContent={
              <CoachRequestDetails booking={booking} config={config} />
            }
          />
        )}
      />

      {provider && (
        <div id="recensioni" className="scroll-mt-24">
          <h2 className="text-lg font-medium text-gray-900">
            Le tue recensioni ({reviews.length})
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-2 text-gray-500">
              Nessuna recensione. Le riceverai dagli atleti dopo le sessioni
              completate.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {r.authorName}
                    </span>
                    <RatingStars value={r.rating} size="sm" />
                  </div>
                  {r.body && (
                    <p className="mt-1.5 text-sm text-gray-600">{r.body}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(r.createdAt)}
                  </p>

                  {r.reply ? (
                    <div className="mt-3 rounded-md border-l-2 border-red-200 bg-red-50/50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-700">
                        La tua risposta
                      </p>
                      <p className="mt-0.5 text-sm text-gray-600">{r.reply}</p>
                    </div>
                  ) : (
                    <ActionForm
                      action={replyToReviewAction}
                      className="mt-3 flex flex-col gap-2"
                    >
                      <input type="hidden" name="reviewId" value={r.id} />
                      <textarea
                        name="reply"
                        rows={2}
                        maxLength={2000}
                        required
                        placeholder="Rispondi pubblicamente..."
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                      <div>
                        <Button type="submit" size="sm" className="rounded-full">
                          Rispondi
                        </Button>
                      </div>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DashboardSection({
  id,
  title,
  titleClassName,
  subtitle,
  headerAction,
  items,
  emptyTitle,
  emptySubtitle,
  renderCard,
  cardsLayout = 'grid',
  hideWhenEmpty = false,
}: {
  id?: string;
  title: string;
  /** Overrides the title's default color, e.g. "text-green-600". */
  titleClassName?: string;
  subtitle: string;
  headerAction?: ReactNode;
  items: CoachBooking[];
  emptyTitle: string;
  emptySubtitle: string;
  renderCard: (booking: CoachBooking) => ReactNode;
  /** "list" for wide landscape cards that need the full row width (e.g. upcoming appointments); "grid" (default) pairs compact cards two-up. */
  cardsLayout?: 'grid' | 'list';
  /**
   * Nasconde del tutto la sezione quando non c'è niente da mostrare.
   *
   * Uno stato vuoto è utile finché insegna qualcosa a chi è appena arrivato;
   * su una dashboard in uso quotidiano diventa rumore, e un titolo che dice
   * "(0)" occupa spazio per comunicare un'assenza. Si attiva dove il vuoto è
   * la normalità, non dove segnala che manca un passo di configurazione.
   */
  hideWhenEmpty?: boolean;
}) {
  if (hideWhenEmpty && items.length === 0) return null;

  return (
    <div id={id} className="scroll-mt-24">
      <div className="flex items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className={cn('text-lg font-medium', titleClassName ?? 'text-gray-900')}>
            {title} ({items.length})
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">{subtitle}</p>
        </div>
        {headerAction}
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 p-8 text-center">
          <p className="font-medium text-gray-700">{emptyTitle}</p>
          <p className="mt-1 text-sm text-gray-500">{emptySubtitle}</p>
        </div>
      ) : (
        <div
          className={cn(
            'mt-5 gap-4',
            cardsLayout === 'grid'
              ? 'grid items-start xl:grid-cols-2'
              : 'flex flex-col'
          )}
        >
          {items.map((booking) => renderCard(booking))}
        </div>
      )}
    </div>
  );
}

function CoachRequestDetails({
  booking,
  config,
}: {
  booking: CoachBooking;
  config: ReturnType<typeof getVerticalConfig>;
}) {
  const sportLabel = booking.athleteSport
    ? findTaxonomyItem(config.taxonomies.categories, booking.athleteSport)?.label ??
      booking.athleteSport
    : null;
  const levelLabel = booking.athleteLevel
    ? findTaxonomyItem(config.taxonomies.levels ?? [], booking.athleteLevel)?.label ??
      booking.athleteLevel
    : null;
  const detailRows = [
    booking.serviceTitle
      ? { label: 'Percorso richiesto', value: booking.serviceTitle }
      : null,
    { label: 'Stato attuale', value: bookingStatusLabel(booking.status) },
    { label: 'Richiesta ricevuta', value: formatDateTime(booking.requestedAt) },
    booking.scheduledFor
      ? {
          label: scheduledForLabel(booking.status).replace(':', ''),
          value: formatDateTime(booking.scheduledFor),
        }
      : null,
    sportLabel ? { label: 'Sport indicato', value: sportLabel } : null,
    levelLabel ? { label: 'Livello atleta', value: levelLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {detailRows.map((row) => (
          <div key={row.label}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              {row.label}
            </p>
            <p className="mt-1 text-sm text-gray-700">{row.value}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/dashboard/appointments/${booking.id}`}
        className="text-sm font-semibold text-blue-700 hover:underline"
      >
        Apri il dettaglio appuntamento
      </Link>
    </div>
  );
}

function buildCoachRequestCardData(
  booking: CoachBooking,
  config: ReturnType<typeof getVerticalConfig>
): CoachRequestCardData {
  const sportLabel = booking.athleteSport
    ? findTaxonomyItem(config.taxonomies.categories, booking.athleteSport)?.label ??
      booking.athleteSport
    : null;
  const levelLabel = booking.athleteLevel
    ? findTaxonomyItem(config.taxonomies.levels ?? [], booking.athleteLevel)?.label ??
      booking.athleteLevel
    : null;
  const primaryNeed = derivePrimaryNeed(booking);
  const note = booking.note?.trim() || null;
  const explicitGoal = booking.athleteGoals?.trim() || null;
  const goal = explicitGoal || note;

  return {
    id: booking.id,
    status: booking.status,
    statusLabel: bookingStatusLabel(booking.status),
    statusTone: bookingStatusTone(booking.status),
    statusEyebrow: bookingEyebrow(booking.status),
    athleteName: resolveDisplayName(booking.clientName, booking.clientEmail),
    athleteEmail: booking.clientEmail,
    athleteAvatarUrl: booking.clientAvatarUrl,
    athleteMeta: [sportLabel, levelLabel].filter(Boolean).join(' | ') || null,
    isMinor: booking.athleteIsMinor,
    primaryNeed,
    goal,
    message: explicitGoal && note ? note : null,
    requestedFor: booking.scheduledFor
      ? `Sessione richiesta per ${formatDateTime(booking.scheduledFor)}`
      : 'Primo incontro da concordare insieme',
    requestedAtLabel: `Il ${formatDate(booking.requestedAt)}`,
    serviceLabel: booking.serviceTitle,
    sessionStart: booking.sessionStartedAt,
    sessionEnd: booking.sessionEndedAt,
    fallbackMinutes: booking.serviceDurationMin,
  };
}

function buildUpcomingAppointmentData(
  booking: CoachBooking
): UpcomingAppointmentData {
  return {
    id: booking.id,
    athleteName: resolveDisplayName(booking.clientName, booking.clientEmail),
    athleteAvatarUrl: booking.clientAvatarUrl,
    eyebrow: bookingEyebrow(booking.status),
    statusLabel: bookingStatusLabel(booking.status),
    date: booking.scheduledFor ? formatBigDateParts(booking.scheduledFor) : null,
    primaryNeed: derivePrimaryNeed(booking) ?? 'Da chiarire insieme nel primo confronto.',
    requestedAtLabel: formatDate(booking.requestedAt),
  };
}

function archiveTone(status: string): CompletedSessionData['tone'] {
  if (status === 'completed') return 'green';
  if (status === 'accepted') return 'amber';
  if (status === 'cancelled') return 'gray';
  return 'red'; // expired, declined
}

function archiveHeaderLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Sessione completata';
    case 'accepted':
      return 'Sessione trascorsa';
    case 'expired':
      return 'Richiesta scaduta';
    case 'declined':
      return 'Richiesta rifiutata';
    case 'cancelled':
      return 'Percorso annullato';
    default:
      return bookingStatusLabel(status);
  }
}

function buildArchiveCardData(
  booking: CoachBooking,
  config: ReturnType<typeof getVerticalConfig>
): CompletedSessionData {
  const sportLabel = booking.athleteSport
    ? findTaxonomyItem(config.taxonomies.categories, booking.athleteSport)?.label ??
      booking.athleteSport
    : null;
  const levelLabel = booking.athleteLevel
    ? findTaxonomyItem(config.taxonomies.levels ?? [], booking.athleteLevel)?.label ??
      booking.athleteLevel
    : null;
  const note = booking.note?.trim() || null;
  const goal = booking.athleteGoals?.trim() || note;
  const isCompleted = booking.status === 'completed';

  // Completed: real call span (or derived) → date range + duration + timeline.
  const start = booking.sessionStartedAt ?? booking.scheduledFor;
  const end = booking.sessionEndedAt;
  const durationMin =
    getSessionDurationMinutes(booking.sessionStartedAt, booking.sessionEndedAt) ??
    booking.serviceDurationMin ??
    null;
  // Both completed and non-completed render the big date hero (session date, or
  // the scheduled date for closed-without-session states) so every archive card
  // has the same structure and height.
  const dayFrom = booking.scheduledFor ?? booking.sessionStartedAt;
  const big = dayFrom ? formatBigDateParts(dayFrom) : null;

  return {
    id: booking.id,
    status: booking.status,
    eyebrow: bookingEyebrow(booking.status),
    headerLabel: archiveHeaderLabel(booking.status),
    statusLabel: bookingStatusLabel(booking.status),
    tone: archiveTone(booking.status),
    personName: resolveDisplayName(booking.clientName, booking.clientEmail),
    personAvatarUrl: booking.clientAvatarUrl,
    personMeta: [sportLabel, levelLabel].filter(Boolean).join(' · ') || null,
    date: big
      ? {
          day: big.day,
          monthYear: big.monthYear,
          startTime: isCompleted && start ? formatTime(start) : big.time,
          endTime: isCompleted && end ? formatTime(end) : null,
          durationLabel:
            isCompleted && durationMin != null ? formatMinutes(durationMin) : null,
          lead: isCompleted ? null : 'Era prevista',
        }
      : null,
    primaryNeed: derivePrimaryNeed(booking) ?? 'Da chiarire insieme nel primo confronto.',
    goal,
    timeline: isCompleted
      ? {
          requestedValue: formatDate(booking.requestedAt),
          sessionValue: start
            ? `${formatDate(start)}${end ? `, ${formatTime(start)}–${formatTime(end)}` : ''}`
            : 'orario non registrato',
        }
      : null,
    note: isCompleted ? null : archiveReason(booking.status),
    requestedAtLabel: formatDate(booking.requestedAt),
  };
}

function archiveReason(status: string): string {
  switch (status) {
    case 'expired':
      return 'Nessuna risposta entro i termini.';
    case 'declined':
      return 'Richiesta rifiutata.';
    case 'cancelled':
      return 'Sessione annullata.';
    case 'accepted':
      return 'La sessione è trascorsa e deve ancora essere completata.';
    default:
      return '';
  }
}

function bookingEyebrow(status: string): string {
  switch (status) {
    case 'accepted':
      return 'Atleta gia in percorso';
    case 'completed':
      return 'Percorso completato';
    case 'declined':
      return 'Richiesta chiusa';
    case 'expired':
      return 'Richiesta scaduta senza risposta';
    case 'cancelled':
      return 'Percorso interrotto';
    default:
      return 'Nuova richiesta da valutare';
  }
}

function derivePrimaryNeed(booking: CoachBooking): string | null {
  const raw = [booking.athleteGoals, booking.note, booking.serviceTitle]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!raw) return booking.serviceTitle ?? null;
  if (
    raw.includes('infort') ||
    raw.includes('rientro') ||
    raw.includes('stop')
  ) {
    return 'Rientro dopo un infortunio';
  }
  if (
    raw.includes('ansia') ||
    raw.includes('pressione') ||
    raw.includes('paura') ||
    raw.includes('pregara') ||
    raw.includes('pre-gara')
  ) {
    return "Gestire l'ansia pre-gara";
  }
  if (
    raw.includes('concent') ||
    raw.includes('focus') ||
    raw.includes('lucid')
  ) {
    return 'Piu concentrazione e lucidita';
  }
  if (
    raw.includes('motiv') ||
    raw.includes('energia') ||
    raw.includes('costanza')
  ) {
    return 'Recuperare motivazione e continuita';
  }
  if (
    raw.includes('routine') ||
    raw.includes('rituale') ||
    raw.includes('preparazione mentale')
  ) {
    return 'Costruire una routine pre-gara';
  }
  if (
    raw.includes('fiducia') ||
    raw.includes('insicur') ||
    raw.includes('autostima') ||
    raw.includes('giudizio')
  ) {
    return 'Rafforzare fiducia e sicurezza';
  }
  if (booking.serviceTitle) return booking.serviceTitle;
  if (booking.athleteGoals) return 'Supporto mentale legato ai suoi obiettivi';
  if (booking.note) return 'Primo confronto sul momento sportivo attuale';
  return null;
}
