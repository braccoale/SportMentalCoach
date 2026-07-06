import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Hourglass,
  CalendarCheck,
  BarChart3,
  MessageSquare,
  Star,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  bookingStatusLabel,
  bookingStatusTone,
  getCoachBookings,
  type CoachBooking,
} from '@/lib/core/bookings';
import { getProviderProfileByUser } from '@/lib/core/profiles';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { getCoachReviews } from '@/lib/core/reviews';
import {
  formatDate,
  formatDateTime,
  scheduledForLabel,
} from '@/lib/core/format';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { RatingStars } from '@/components/rating-stars';
import { SummaryCard } from '@/components/summary-card';
import { CoachRequestCard, type CoachRequestCardData } from '@/components/coach-request-card';
import { replyToReviewAction } from './review-reply-actions';
import {
  acceptBookingAction,
  declineBookingAction,
  completeBookingAction,
  cancelBookingAction,
} from './actions';

const DEFAULT_ATHLETE_AVATAR = '/atleta.png';

export default async function CoachDashboardPage() {
  const user = await requireRole('coach');
  const config = getVerticalConfig();

  const [provider, allBookings, unreadMessages] = await Promise.all([
    getProviderProfileByUser(user.id),
    getCoachBookings(user.id),
    getUnreadCountForType(user.id, 'new_message'),
  ]);

  const reviews = provider ? await getCoachReviews(provider.id) : [];

  const pending = allBookings.filter((b) => b.status === 'requested');
  const accepted = allBookings.filter((b) => b.status === 'accepted');
  const archive = allBookings.filter((b) =>
    ['declined', 'expired', 'cancelled', 'completed'].includes(b.status)
  );

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
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-600">
          Dashboard coach
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
          Ogni richiesta racconta un atleta, non solo una prenotazione.
        </h1>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Leggi il momento sportivo della persona che ti sta cercando, capisci
          il suo bisogno e rispondi con il contesto giusto.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard
          icon={Hourglass}
          label="Richieste in attesa"
          value={pending.length}
          tone="red"
          note={newToday > 0 ? `${newToday} nuove oggi` : 'Nessuna nuova oggi'}
          trend={newToday > 0 ? 'up' : 'flat'}
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

      <DashboardSection
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
        title="Atleti gia in percorso"
        subtitle="Sessioni accettate e gia avviate. Qui puoi passare dalla lettura del bisogno alla relazione vera: chat, videochiamata e follow-up."
        items={accepted}
        emptyTitle="Nessuna sessione accettata."
        emptySubtitle="Le sessioni confermate compariranno qui appena dai il via a un nuovo percorso."
        renderCard={(booking) => (
          <CoachRequestCard
            key={booking.id}
            data={buildCoachRequestCardData(booking, config)}
            actions={
              <>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/dashboard/chat/${booking.id}`}>Apri chat</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/dashboard/video/${booking.id}`}>
                    Apri videochiamata
                  </Link>
                </Button>
                <ActionForm action={completeBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Button type="submit" className="rounded-full">
                    Completa
                  </Button>
                </ActionForm>
                <ActionForm action={cancelBookingAction}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="rounded-full text-red-600 hover:text-red-700"
                  >
                    Annulla
                  </Button>
                </ActionForm>
              </>
            }
            detailContent={<CoachRequestDetails booking={booking} config={config} />}
          />
        )}
      />

      <DashboardSection
        title="Percorsi conclusi o archiviati"
        subtitle="Uno storico piu leggibile delle richieste gia chiuse, completate o annullate."
        items={archive}
        emptyTitle="Nessuna richiesta passata."
        emptySubtitle="Lo storico delle richieste concluse o archiviate comparira qui."
        renderCard={(booking) => (
          <CoachRequestCard
            key={booking.id}
            data={buildCoachRequestCardData(booking, config)}
            detailContent={<CoachRequestDetails booking={booking} config={config} />}
          />
        )}
      />

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
  title,
  subtitle,
  items,
  emptyTitle,
  emptySubtitle,
  renderCard,
}: {
  title: string;
  subtitle: string;
  items: CoachBooking[];
  emptyTitle: string;
  emptySubtitle: string;
  renderCard: (booking: CoachBooking) => ReactNode;
}) {
  return (
    <div>
      <div className="max-w-3xl">
        <h2 className="text-lg font-medium text-gray-900">
          {title} ({items.length})
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 p-8 text-center">
          <p className="font-medium text-gray-700">{emptyTitle}</p>
          <p className="mt-1 text-sm text-gray-500">{emptySubtitle}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
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
    booking.clientEmail
      ? { label: 'Email di riferimento', value: booking.clientEmail }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="space-y-3">
      {detailRows.map((row) => (
        <div key={row.label}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            {row.label}
          </p>
          <p className="mt-1 text-sm text-gray-700">{row.value}</p>
        </div>
      ))}
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
    athleteName: booking.clientName || booking.clientEmail,
    athleteEmail: booking.clientEmail,
    athleteAvatarUrl: booking.clientAvatarUrl || DEFAULT_ATHLETE_AVATAR,
    athleteMeta: [sportLabel, levelLabel].filter(Boolean).join(' | ') || null,
    primaryNeed,
    goal,
    message: explicitGoal && note ? note : null,
    requestedFor: booking.scheduledFor
      ? `Sessione richiesta per ${formatDateTime(booking.scheduledFor)}`
      : 'Primo incontro da concordare insieme',
    requestedAtLabel: `Il ${formatDate(booking.requestedAt)}`,
    serviceLabel: booking.serviceTitle,
  };
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
