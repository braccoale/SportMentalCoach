import Link from 'next/link';
import {
  Hourglass,
  CalendarCheck,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  getAthleteBookings,
  bookingStatusLabel,
  bookingStatusTone,
  type AthleteBooking,
} from '@/lib/core/bookings';
import { getAvatarUrl } from '@/lib/core/profiles';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { SummaryCard } from '@/components/summary-card';
import { AccountInfoCard } from '@/components/account-info-card';
import { getReviewedBookingIds } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  scheduledForLabel,
} from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { PhotoForm } from '../photo-form';
import { ReviewForm } from './review-form';
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
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium text-gray-900">
          {b.coachSlug ? (
            <Link href={`/coaches/${b.coachSlug}`} className="hover:underline">
              {b.coachName ?? 'Coach'}
            </Link>
          ) : (
            (b.coachName ?? 'Coach')
          )}
        </p>
        <p className="text-sm text-gray-500">
          {b.serviceTitle ?? 'Richiesta generica'} · richiesta inviata il{' '}
          {formatDate(b.requestedAt)}
        </p>
        {b.scheduledFor && (
          <p
            className={
              b.status === 'accepted'
                ? 'text-sm font-semibold text-gray-900'
                : 'text-sm font-medium text-gray-700'
            }
          >
            {scheduledForLabel(b.status)} {formatDateTime(b.scheduledFor)}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${bookingStatusTone(b.status)}`}
        >
          {bookingStatusLabel(b.status)}
        </span>
        {/* chat/video only for accepted; never for cancelled */}
        {b.status === 'accepted' && (
          <div className="flex flex-col items-end gap-1">
            <Link
              href={`/dashboard/chat/${b.id}`}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Apri chat →
            </Link>
            <Link
              href={`/dashboard/video/${b.id}`}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Apri videochiamata →
            </Link>
          </div>
        )}
        {canCancel && (
          <ActionForm action={cancelBookingAction}>
            <input type="hidden" name="bookingId" value={b.id} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="rounded-full text-red-600 hover:text-red-700"
            >
              Annulla
            </Button>
          </ActionForm>
        )}
      </div>
      </div>
      {canReview && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-700">
            Com&apos;è andata? Lascia una recensione
          </p>
          <ReviewForm bookingId={b.id} coachName={b.coachName ?? 'Coach'} />
        </div>
      )}
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
  const [requests, avatarUrl, reviewedIds, unreadMessages] = await Promise.all([
    getAthleteBookings(user.id),
    getAvatarUrl(user.id),
    getReviewedBookingIds(user.id),
    getUnreadCountForType(user.id, 'new_message'),
  ]);

  const waiting = requests.filter((b) => b.status === 'requested');
  const accepted = requests.filter((b) => b.status === 'accepted');
  const completed = requests.filter((b) => b.status === 'completed');
  const archive = requests.filter((b) =>
    ['declined', 'cancelled', 'completed'].includes(b.status)
  );

  // Trend footnotes for the KPI cards.
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
      {/* Summary widgets */}
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

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Le tue sessioni</h2>
        <Link
          href="/coaches"
          className="text-sm font-medium text-red-600 hover:text-red-700"
        >
          Trova un coach →
        </Link>
      </div>

      {/* Photo + account info side by side (name feeds what the coach sees). */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PhotoForm
          name={[user.name, user.lastName].filter(Boolean).join(' ') || null}
          avatarUrl={avatarUrl}
        />
        <AccountInfoCard />
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-600">
            Non hai ancora richieste di sessione.
          </p>
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
