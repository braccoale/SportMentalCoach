import Link from 'next/link';
import {
  Clock,
  CalendarCheck,
  ListChecks,
  MessageSquare,
  Star,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings, bookingStatusLabel } from '@/lib/core/bookings';
import { getProviderProfileByUser } from '@/lib/core/profiles';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { getCoachReviews } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  scheduledForLabel,
} from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { RatingStars } from '@/components/rating-stars';
import { SummaryCard } from '@/components/summary-card';
import { replyToReviewAction } from './review-reply-actions';
import {
  acceptBookingAction,
  declineBookingAction,
  completeBookingAction,
  cancelBookingAction,
} from './actions';

export default async function CoachDashboardPage() {
  const user = await requireRole('coach');

  const [provider, allBookings, unreadMessages] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachBookings(user.id),
    getUnreadCountForType(user.id, 'new_message'),
  ]);

  const reviews = provider ? await getCoachReviews(provider.id) : [];

  const pending = allBookings.filter((b) => b.status === 'requested');
  const accepted = allBookings.filter((b) => b.status === 'accepted');
  const archive = allBookings.filter((b) =>
    ['declined', 'cancelled', 'completed'].includes(b.status)
  );

  return (
    <section className="flex flex-col gap-8 p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {/* Orange when there is something waiting for the coach's action. */}
        <SummaryCard
          icon={Clock}
          label="Richieste in attesa"
          value={pending.length}
          accent={
            pending.length > 0
              ? 'bg-orange-100 text-orange-600'
              : 'bg-gray-100 text-gray-600'
          }
        />
        <SummaryCard
          icon={CalendarCheck}
          label="Sessioni accettate"
          value={accepted.length}
          accent="bg-red-50 text-red-600"
        />
        <SummaryCard
          icon={ListChecks}
          label="Sessioni totali"
          value={allBookings.length}
          accent="bg-gray-900 text-white"
        />
        <SummaryCard
          icon={Star}
          label="Recensioni"
          value={reviews.length}
          accent="bg-red-50 text-red-600"
        />
        {/* Unread chat messages (new_message notifications not yet read). */}
        <SummaryCard
          icon={MessageSquare}
          label="Messaggi non letti"
          value={unreadMessages}
          accent={
            unreadMessages > 0
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-600'
          }
          href="/dashboard/coach/messages"
        />
      </div>

      {/* Booking requests */}
      <div>
        <h2 className="text-lg font-medium text-gray-900">
          Richieste in attesa ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessuna richiesta in attesa.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pending.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {b.clientName || b.clientEmail}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.serviceTitle ?? 'Richiesta generica'} · richiesta
                    inviata il {formatDate(b.requestedAt)}
                  </p>
                  {b.scheduledFor && (
                    <p className="text-sm font-medium text-gray-700">
                      {scheduledForLabel(b.status)}{' '}
                      {formatDateTime(b.scheduledFor)}
                    </p>
                  )}
                  {b.note && (
                    <p className="mt-1 text-sm text-gray-600">“{b.note}”</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <ActionForm action={acceptBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button type="submit" className="rounded-full">
                      Accetta
                    </Button>
                  </ActionForm>
                  <ActionForm action={declineBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      className="rounded-full"
                    >
                      Rifiuta
                    </Button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-lg font-medium text-gray-900">
          Sessioni accettate ({accepted.length})
        </h2>
        {accepted.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessuna sessione accettata.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {accepted.map((b) => (
              <li
                key={b.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {b.clientName || b.clientEmail}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.serviceTitle ?? 'Richiesta generica'}
                  </p>
                  {b.scheduledFor && (
                    <p className="text-sm font-semibold text-gray-900">
                      Sessione confermata: {formatDateTime(b.scheduledFor)}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                  <ActionForm action={completeBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button type="submit" size="sm" className="rounded-full">
                      Completa
                    </Button>
                  </ActionForm>
                  <ActionForm action={cancelBookingAction}>
                    <input type="hidden" name="bookingId" value={b.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      className="rounded-full text-red-600 hover:text-red-700"
                    >
                      Annulla
                    </Button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-lg font-medium text-gray-900">Storico</h2>
        {archive.length === 0 ? (
          <p className="mt-2 text-gray-500">Nessuna richiesta passata.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {archive.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm"
              >
                <span className="text-gray-700">
                  {b.clientName || b.clientEmail} —{' '}
                  {b.serviceTitle ?? 'Richiesta generica'}
                </span>
                <span className="font-medium text-gray-500">
                  {bookingStatusLabel(b.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reviews — coach can reply (accountability / responsiveness) */}
      {provider && (
        <div>
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
                        placeholder="Rispondi pubblicamente…"
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
