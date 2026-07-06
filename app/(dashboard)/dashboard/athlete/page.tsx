import Link from 'next/link';
import {
  Hourglass,
  CalendarCheck,
  CheckCircle2,
  MessageSquare,
  UserRound,
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
import { isSessionJoinable } from '@/lib/core/sessions';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { SummaryCard } from '@/components/summary-card';
import { getReviewedBookingIds } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  scheduledForLabel,
} from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { CoachAvatar } from '@/components/coach-visuals';
import { ReviewForm } from './review-form';
import { NewAppointmentButton } from './new-appointment-button';
import { cancelBookingAction } from './actions';

function BookingRow({
  b,
  reviewedIds,
}: {
  b: AthleteBooking;
  reviewedIds: Set<number>;
}) {
  const canCancel = b.status === 'requested' || b.status === 'accepted';
  const canReview = b.status === 'completed' && !reviewedIds.has(b.id);
  // A past session (scheduled time elapsed) is over: no live chat/video.
  const isPastSession = b.status === 'accepted' && !isSessionJoinable(b.scheduledFor);
  const canOpenLiveTools = b.status === 'accepted' && !isPastSession;
  const canOpenCoach = !!b.coachSlug;

  return (
    <li className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
                size="sm"
                className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
              >
                <Link href={`/dashboard/chat/${b.id}`}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Apri chat
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="w-full rounded-full bg-green-600 text-white hover:bg-green-700"
              >
                <Link href={`/dashboard/video/${b.id}`}>
                  <Video className="mr-2 h-4 w-4" />
                  Apri videochiamata
                </Link>
              </Button>
            </>
          ) : null}

          {isPastSession ? (
            <p className="text-xs text-gray-400 sm:text-right">
              Sessione trascorsa
            </p>
          ) : null}

          {!canOpenLiveTools && canOpenCoach ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full rounded-full"
            >
              <Link href={`/coaches/${b.coachSlug}`}>
                <UserRound className="mr-2 h-4 w-4" />
                Vedi coach
              </Link>
            </Button>
          ) : null}

          {canCancel ? (
            <ActionForm action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={b.id} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="w-full rounded-full text-red-600 hover:text-red-700"
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
  title,
  items,
  reviewedIds,
}: {
  title: string;
  items: AthleteBooking[];
  reviewedIds: Set<number>;
}) {
  if (items.length === 0) return null;

  return (
    <div>
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

export default async function AthleteDashboardPage() {
  const user = await requireRole('athlete');
  const [requests, reviewedIds, unreadMessages, relationshipCoaches] =
    await Promise.all([
      getAthleteBookings(user.id),
      getReviewedBookingIds(user.id),
      getUnreadCountForType(user.id, 'new_message'),
      getAthleteRelationshipCoaches(user.id),
    ]);

  const waiting = requests.filter((b) => b.status === 'requested');
  const accepted = requests.filter((b) => b.status === 'accepted');
  const completed = requests.filter((b) => b.status === 'completed');
  const archive = requests.filter((b) =>
    ['declined', 'expired', 'cancelled', 'completed'].includes(b.status)
  );

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
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-gray-950">
          Il tuo percorso mentale, una sessione alla volta.
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Tieni sotto controllo richieste, sessioni confermate e messaggi con i
          tuoi coach. I tuoi dati personali sono nella scheda “Atleta”.
        </p>
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

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-gray-900">Le tue sessioni</h2>
        <NewAppointmentButton coaches={relationshipCoaches} />
      </div>

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
          <Section title="In attesa" items={waiting} reviewedIds={reviewedIds} />
          <Section title="Accettate" items={accepted} reviewedIds={reviewedIds} />
          <Section title="Storico" items={archive} reviewedIds={reviewedIds} />
        </div>
      )}
    </section>
  );
}
