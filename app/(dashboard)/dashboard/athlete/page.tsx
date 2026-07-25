import Link from 'next/link';
import {
  Hourglass,
  CalendarCheck,
  CheckCircle2,
  MessageSquare,
  Video,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  getAthleteBookings,
  getAthleteRelationshipCoaches,
  bookingStatusLabel,
  bookingStatusTone,
  type AthleteBooking,
} from '@/lib/core/bookings';
import { isSessionJoinable, canJoinVideoNow } from '@/lib/core/sessions';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { SummaryCard } from '@/components/summary-card';
import { getReviewedBookingIds } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatBigDateParts,
  formatMinutes,
  getSessionDurationMinutes,
  scheduledForLabel,
} from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { CoachAvatar } from '@/components/coach-visuals';
import { SessionSummary } from '@/components/session-summary';
import {
  UpcomingAppointmentCard,
  type UpcomingAppointmentData,
} from '@/components/upcoming-appointment-card';
import {
  CompletedSessionCard,
  type CompletedSessionData,
} from '@/components/completed-session-card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { ReviewForm } from './review-form';
import { NewAppointmentButton } from './new-appointment-button';
import { InviteFriendButton } from '@/components/invite/invite-friend-button';
import { InviteFriendLink } from '@/components/invite/invite-friend-link';
import { cancelBookingAction, inviteGuardianAction } from './actions';
import { getGuardianStatus } from '@/lib/core/guardians';
import { GuardianBanner } from '@/components/guardian-banner';
import { AddToGoogleCalendarButton } from '@/components/add-to-google-calendar-button';
import { buildBookingGoogleCalendarUrl } from '@/lib/core/booking-calendar';
import { getAppBaseUrl } from '@/lib/core/app-url';

/** Sort key for the archive: when the session actually happened, newest first. */
function archiveRecency(b: AthleteBooking): number {
  return (
    b.sessionEndedAt?.getTime() ??
    b.scheduledFor?.getTime() ??
    b.decidedAt?.getTime() ??
    b.requestedAt.getTime()
  );
}

/** Card data for one of the athlete's accepted (upcoming) sessions — mirrors the coach's "Prossimi Appuntamenti" card, but showing the coach as the counterpart. */
function buildAthleteUpcomingData(b: AthleteBooking): UpcomingAppointmentData {
  const goal = b.note?.trim() || null;
  return {
    id: b.id,
    athleteName: b.coachName ?? 'Coach',
    athleteAvatarUrl: b.coachAvatarUrl,
    eyebrow: 'Il tuo coach',
    statusLabel: bookingStatusLabel(b.status),
    date: b.scheduledFor ? formatBigDateParts(b.scheduledFor) : null,
    primaryNeed:
      goal ??
      b.serviceTitle ??
      'Obiettivo da mettere a fuoco insieme al coach.',
    completionHint:
      'Puoi entrare in videochiamata da qualche minuto prima dell’inizio.',
    requestedAtLabel: formatDate(b.requestedAt),
  };
}

function archiveTone(status: string): CompletedSessionData['tone'] {
  if (status === 'completed') return 'green';
  if (status === 'cancelled') return 'gray';
  return 'red'; // expired, declined
}

function archiveHeaderLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Sessione completata';
    case 'expired':
      return 'Richiesta scaduta';
    case 'declined':
      return 'Richiesta rifiutata';
    case 'cancelled':
      return 'Sessione annullata';
    default:
      return bookingStatusLabel(status);
  }
}

/** Archive card data for one of the athlete's closed sessions, showing the coach as counterpart. */
function buildAthleteArchiveData(b: AthleteBooking): CompletedSessionData {
  const isCompleted = b.status === 'completed';
  const start = b.sessionStartedAt ?? b.scheduledFor;
  const end = b.sessionEndedAt;
  const durationMin =
    getSessionDurationMinutes(b.sessionStartedAt, b.sessionEndedAt) ??
    b.serviceDurationMin ??
    null;
  const dayFrom = b.scheduledFor ?? b.sessionStartedAt;
  const big = dayFrom ? formatBigDateParts(dayFrom) : null;

  return {
    id: b.id,
    status: b.status,
    eyebrow: isCompleted ? 'Percorso completato' : 'Il tuo coach',
    headerLabel: archiveHeaderLabel(b.status),
    statusLabel: bookingStatusLabel(b.status),
    tone: archiveTone(b.status),
    personName: b.coachName ?? 'Coach',
    personAvatarUrl: b.coachAvatarUrl,
    personMeta: b.serviceTitle,
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
    primaryNeed:
      b.note?.trim() || b.serviceTitle || 'Percorso di mental coaching',
    goal: null,
    timeline: isCompleted
      ? {
          requestedValue: formatDate(b.requestedAt),
          sessionValue: start
            ? `${formatDate(start)}${end ? `, ${formatTime(start)}–${formatTime(end)}` : ''}`
            : 'orario non registrato',
        }
      : null,
    note: isCompleted ? null : archiveReason(b.status),
    requestedAtLabel: formatDate(b.requestedAt),
  };
}

function archiveReason(status: string): string {
  switch (status) {
    case 'expired':
      return 'Scaduta senza risposta del coach.';
    case 'declined':
      return 'Richiesta rifiutata dal coach.';
    case 'cancelled':
      return 'Sessione annullata.';
    default:
      return '';
  }
}

function BookingRow({
  b,
  reviewedIds,
}: {
  b: AthleteBooking;
  reviewedIds: Set<number>;
}) {
  const canReview = b.status === 'completed' && !reviewedIds.has(b.id);
  // A past session (scheduled time elapsed) is over: no live tools, no cancel.
  const isPast = !isSessionJoinable(b.scheduledFor);
  const canCancel =
    (b.status === 'requested' || b.status === 'accepted') && !isPast;
  const isPastSession = b.status === 'accepted' && isPast;
  const canOpenLiveTools = b.status === 'accepted' && !isPastSession;
  const canMessage = ['requested', 'accepted', 'completed'].includes(b.status);

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <CoachAvatar
            name={b.coachName ?? 'Coach'}
            src={b.coachAvatarUrl}
            className="size-14 shrink-0"
          />

          <div className="min-w-0">
            <p className="font-medium text-gray-900">
              {b.coachSlug ? (
                <Link
                  href={`/coaches/${b.coachSlug}`}
                  className="hover:underline"
                >
                  {b.coachName ?? 'Coach'}
                </Link>
              ) : (
                b.coachName ?? 'Coach'
              )}
            </p>
            <p className="text-sm text-gray-500">
              {b.serviceTitle ?? 'Richiesta generica'} · richiesta inviata il{' '}
              {formatDate(b.requestedAt)}
            </p>
            {b.scheduledFor ? (
              <p
                className={
                  b.status === 'accepted'
                    ? 'text-sm font-semibold text-gray-900'
                    : 'text-sm font-medium text-gray-700'
                }
              >
                {scheduledForLabel(b.status)} {formatDateTime(b.scheduledFor)}
              </p>
            ) : null}
          </div>
        </div>

        {b.status === 'completed' ? (
          <SessionSummary
            start={b.sessionStartedAt}
            end={b.sessionEndedAt}
            fallbackMinutes={b.serviceDurationMin}
            className="shrink-0"
          />
        ) : null}

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[190px]">
          <span
            className={`self-start rounded-full px-3 py-1 text-xs font-medium sm:self-end ${bookingStatusTone(b.status)}`}
          >
            {bookingStatusLabel(b.status)}
          </span>

          {canOpenLiveTools ? (
            <>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full rounded-full"
              >
                <Link href={`/dashboard/chat/${b.id}`}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Apri chat
                </Link>
              </Button>
              {canJoinVideoNow(b.scheduledFor) ? (
                <Button
                  asChild
                  size="sm"
                  className="w-full rounded-full"
                >
                  <Link href={`/dashboard/video/${b.id}`}>
                    <Video className="mr-2 h-4 w-4" />
                    Apri videochiamata
                  </Link>
                </Button>
              ) : (
                <span
                  title="Videochiamata disponibile 5 min prima"
                  className="block"
                >
                  <Button disabled size="sm" className="w-full rounded-full">
                    <Video className="mr-2 h-4 w-4" />
                    Apri videochiamata
                  </Button>
                </span>
              )}
            </>
          ) : null}

          {isPastSession ? (
            <p className="text-xs text-gray-400 sm:text-right">
              Sessione trascorsa
            </p>
          ) : null}

          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full rounded-full"
          >
            <Link href={`/dashboard/appointments/${b.id}`}>
              <CalendarCheck className="mr-2 h-4 w-4" />
              Vedi appuntamento
            </Link>
          </Button>

          {!canOpenLiveTools && canMessage ? (
            <Button
              asChild
              size="sm"
              className="w-full rounded-full"
            >
              <Link href={`/dashboard/chat/${b.id}`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Manda un messaggio
              </Link>
            </Button>
          ) : null}

          {canCancel ? (
            <ActionForm action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={b.id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                className="w-full rounded-full"
              >
                Annulla
              </Button>
            </ActionForm>
          ) : null}
        </div>
      </div>

      {canReview ? (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-700">
            Com&apos;è andata? Lascia una recensione
          </p>
          <ReviewForm bookingId={b.id} coachName={b.coachName ?? 'Coach'} />
        </div>
      ) : null}
    </li>
  );
}

function Section({
  id,
  title,
  items,
  reviewedIds,
}: {
  id?: string;
  title: string;
  items: AthleteBooking[];
  reviewedIds: Set<number>;
}) {
  if (items.length === 0) return null;

  return (
    <div id={id} className="scroll-mt-24">
      <h2 className="text-lg font-medium text-gray-900">
        {title} ({items.length})
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((b) => (
          <BookingRow key={b.id} b={b} reviewedIds={reviewedIds} />
        ))}
      </ul>
    </div>
  );
}

/**
 * History section: completed sessions render with the rich `CompletedSessionCard`
 * (plus a review CTA when not yet reviewed); other closed states (declined,
 * expired, cancelled) keep the compact `BookingRow`.
 */
function ArchiveSection({
  items,
  reviewedIds,
}: {
  items: AthleteBooking[];
  reviewedIds: Set<number>;
}) {
  if (items.length === 0) return null;

  return (
    <div id="storico" className="scroll-mt-24">
      <h2 className="text-lg font-medium text-gray-900">Storico ({items.length})</h2>
      <div className="mt-3 grid items-start gap-3 xl:grid-cols-2">
        {items.map((b) => {
          const canReview = b.status === 'completed' && !reviewedIds.has(b.id);
          return (
            <div key={b.id} className="flex flex-col gap-2">
              <CompletedSessionCard
                data={buildAthleteArchiveData(b)}
                overflowActions={
                  b.coachSlug ? (
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href={`/coaches/${b.coachSlug}`}>Vedi coach</Link>
                    </DropdownMenuItem>
                  ) : undefined
                }
              />
              {canReview && (
                <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                  <p className="text-sm font-medium text-gray-700">
                    Com&apos;è andata? Lascia una recensione
                  </p>
                  <ReviewForm bookingId={b.id} coachName={b.coachName ?? 'Coach'} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Accepted (upcoming) sessions, rendered with the same rich card the coach sees. */
function AcceptedAppointments({
  items,
  athleteName,
  appBaseUrl,
}: {
  items: AthleteBooking[];
  athleteName: string | null;
  appBaseUrl: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <div id="sessioni-confermate" className="scroll-mt-24">
      <h2 className="text-lg font-medium text-green-600">
        Prossimi Appuntamenti ({items.length})
      </h2>
      <div className="mt-3 grid items-start gap-4 xl:grid-cols-2">
        {items.map((b) => {
          const past = !isSessionJoinable(b.scheduledFor);
          const calendarUrl = buildBookingGoogleCalendarUrl({
            id: b.id,
            status: b.status,
            scheduledFor: b.scheduledFor,
            durationMin: b.serviceDurationMin,
            coachName: b.coachName,
            athleteName,
            viewerRole: 'athlete',
            appBaseUrl,
            canView: true,
            isOnline: true,
          });
          return (
            <UpcomingAppointmentCard
              key={b.id}
              data={buildAthleteUpcomingData(b)}
              primaryActions={
                past ? (
                  <p className="text-sm text-gray-400">Sessione trascorsa</p>
                ) : (
                  <>
                    <Link
                      href={`/dashboard/chat/${b.id}`}
                      className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <MessageSquare className="h-4 w-4" /> Apri chat
                    </Link>
                    {canJoinVideoNow(b.scheduledFor) ? (
                      <Link
                        href={`/dashboard/video/${b.id}`}
                        className="inline-flex items-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                      >
                        <Video className="h-4 w-4" /> Apri videochiamata
                      </Link>
                    ) : (
                      <span
                        title="Videochiamata disponibile 5 min prima"
                        className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-400"
                      >
                        <Video className="h-4 w-4" /> Apri videochiamata
                      </span>
                    )}
                    <AddToGoogleCalendarButton
                      url={calendarUrl}
                      uiSource="appointment_card"
                      userRole="athlete"
                      compact
                    />
                    <ActionForm
                      action={cancelBookingAction}
                      confirmMessage="Vuoi davvero annullare questa sessione?"
                    >
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Button
                        type="submit"
                        variant="destructive"
                        className="rounded-full"
                      >
                        Annulla
                      </Button>
                    </ActionForm>
                  </>
                )
              }
              overflowActions={
                <>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link href={`/dashboard/appointments/${b.id}`}>
                      Vedi dettagli
                    </Link>
                  </DropdownMenuItem>
                  {b.coachSlug && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href={`/coaches/${b.coachSlug}`}>Vedi coach</Link>
                    </DropdownMenuItem>
                  )}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export default async function AthleteDashboardPage() {
  const user = await requireRole('athlete');
  const appBaseUrl = getAppBaseUrl();
  const athleteName =
    [user.name, user.lastName].filter(Boolean).join(' ').trim() || null;
  const [
    requests,
    reviewedIds,
    unreadMessages,
    relationshipCoaches,
    guardianStatus,
  ] = await Promise.all([
    getAthleteBookings(user.id),
    getReviewedBookingIds(user.id),
    getUnreadCountForType(user.id, 'new_message'),
    getAthleteRelationshipCoaches(user.id),
    getGuardianStatus(user.id),
  ]);

  const waiting = requests.filter((b) => b.status === 'requested');
  const accepted = requests.filter((b) => b.status === 'accepted');
  const completed = requests.filter((b) => b.status === 'completed');
  // Archive newest-first by when the session actually happened (real end or
  // scheduled time), not by when it was first requested.
  const archive = requests
    .filter((b) =>
      ['declined', 'expired', 'cancelled', 'completed'].includes(b.status)
    )
    .sort((a, b) => archiveRecency(b) - archiveRecency(a));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfToday.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const newToday = waiting.filter((b) => b.requestedAt >= startOfToday).length;
  const confirmedThisWeek = accepted.filter(
    (b) => b.decidedAt && b.decidedAt >= startOfWeek
  ).length;
  const completedThisMonth = completed.filter(
    (b) => b.decidedAt && b.decidedAt >= startOfMonth
  ).length;

  return (
    <section className="flex flex-col gap-6 p-6">
      {/* Parental authorisation, for 15-17 year olds only. Renders nothing for
          adults, so it can sit here unconditionally. */}
      <GuardianBanner status={guardianStatus} action={inviteGuardianAction} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">
            Il tuo percorso mentale, una sessione alla volta.
          </h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            Tieni sotto controllo richieste, sessioni confermate e messaggi con
            i tuoi coach. I tuoi dati personali sono nella scheda “Atleta”.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <NewAppointmentButton coaches={relationshipCoaches} />
          <InviteFriendButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={Hourglass}
          label="Richieste in attesa"
          value={waiting.length}
          tone="red"
          note={
            newToday > 0 ? `${newToday} inviate oggi` : 'Nessuna nuova oggi'
          }
          trend={newToday > 0 ? 'up' : 'flat'}
          href="/dashboard/athlete#richieste-in-attesa"
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Sessioni confermate"
          value={accepted.length}
          tone="green"
          note={
            confirmedThisWeek > 0
              ? `${confirmedThisWeek} questa settimana`
              : 'Nessuna questa settimana'
          }
          trend={confirmedThisWeek > 0 ? 'up' : 'flat'}
          href="/dashboard/athlete#sessioni-confermate"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Sessioni completate"
          value={completed.length}
          tone="purple"
          note={
            completedThisMonth > 0
              ? `${completedThisMonth} questo mese`
              : 'Storico completo'
          }
          trend={completedThisMonth > 0 ? 'up' : 'flat'}
          href="/dashboard/athlete#storico"
        />
        <SummaryCard
          icon={MessageSquare}
          label="Messaggi non letti"
          value={unreadMessages}
          tone="blue"
          note={unreadMessages > 0 ? 'Da leggere ora' : 'Nessun nuovo messaggio'}
          trend="flat"
          href="/dashboard/athlete/messages"
        />
      </div>

      <h2 className="text-lg font-medium text-gray-900">Le tue sessioni</h2>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-600">Non hai ancora richieste di sessione.</p>
          <p className="mt-1 text-sm text-gray-400">
            Sfoglia i coach approvati e invia la tua prima richiesta.
          </p>
          <Button asChild className="mt-4 rounded-full">
            <Link href="/coaches">Trova un coach</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section
            id="richieste-in-attesa"
            title="In attesa"
            items={waiting}
            reviewedIds={reviewedIds}
          />
          <AcceptedAppointments
            items={accepted}
            athleteName={athleteName}
            appBaseUrl={appBaseUrl}
          />
          <ArchiveSection items={archive} reviewedIds={reviewedIds} />
          {/* Discreet nudge after a concluded session — never a hard sell. */}
          {completed.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <InviteFriendLink />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
