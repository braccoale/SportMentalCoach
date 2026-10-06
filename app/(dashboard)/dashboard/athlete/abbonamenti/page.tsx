import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  formatEuroCents,
  formatLongDateRome,
  getPaymentMethodLabels,
  getSessionUsageForSubscriptions,
  listAthleteSubscriptions,
  perSessionCents,
  purchaseNoticeFor,
  subscribedOn,
} from '@/lib/core/billing';
import { formatDate } from '@/lib/core/format';
import { ConfirmingPayment } from '@/components/confirming-payment';
import {
  SubscriptionCard,
  type SubscriptionCardData,
} from '@/components/subscription-card';

export const dynamic = 'force-dynamic';

const NOTICE_TONE = {
  ok: 'bg-emerald-50 text-emerald-800',
  info: 'bg-blue-50 text-gray-700',
  error: 'bg-red-50 text-red-800',
} as const;

/**
 * Gli abbonamenti dell'atleta: dove si atterra dopo il pagamento e dove si
 * torna ogni mese. Il blocco dei crediti non c'è ancora e **non si finge**:
 * comparirà quando le sedute saranno davvero legate alle prenotazioni.
 */
export default async function AthleteSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ abbonamento?: string }>;
}) {
  const user = await requireRole('athlete');
  const { abbonamento } = await searchParams;
  const { live, ended, confirming } = await listAthleteSubscriptions(user.id);
  const liveSubscriptions = live.map((item) => item.subscription);
  const [usageBySubscription, paymentMethods] = await Promise.all([
    getSessionUsageForSubscriptions(user.id, liveSubscriptions),
    getPaymentMethodLabels(liveSubscriptions),
  ]);

  // Appena tornati da Stripe l'abbonamento può non essere ancora attivo: la
  // pagina lo dice e si aggiorna da sola.
  const waitingForWebhook = abbonamento === 'ok' && live.length === 0 && confirming;
  const notice = waitingForWebhook
    ? null
    : purchaseNoticeFor(abbonamento, { subscriptionActive: live.length > 0 });

  return (
    <section className="m-4 flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:m-6 sm:p-5">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-gray-900">
          I tuoi abbonamenti
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">
          Qui trovi cosa hai attivo, con chi, quante sedute hai già fatto, quante
          ti restano, quando si rinnova e come annullarlo.
        </p>
      </header>

      {waitingForWebhook && <ConfirmingPayment />}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}

      {live.length === 0 && !waitingForWebhook ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center">
          <p className="font-medium text-gray-800">Non hai abbonamenti attivi.</p>
          <p className="mt-1 text-sm text-gray-500">
            Scegli un coach e un percorso mensile dalla sua scheda.
          </p>
          <Link
            href="/coaches"
            className="mt-4 inline-flex rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Trova un coach
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {live.map(({ subscription, coach }) => {
            const data: SubscriptionCardData = {
              id: subscription.id,
              planName: subscription.planName,
              sessionsPerMonth: subscription.sessionsPerMonth,
              priceLabel: formatEuroCents(subscription.monthlyPriceCents),
              perSessionLabel: formatEuroCents(
                perSessionCents(
                  subscription.monthlyPriceCents,
                  subscription.sessionsPerMonth
                )
              ),
              sinceLabel: formatLongDateRome(subscribedOn(subscription)),
              usage: usageBySubscription.get(subscription.id) ?? { known: false },
              paymentMethodLabel: paymentMethods.get(subscription.id) ?? null,
              status: subscription.status === 'past_due' ? 'past_due' : 'active',
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              periodEndLabel: subscription.currentPeriodEnd
                ? formatDate(subscription.currentPeriodEnd)
                : null,
            };
            return (
              <li key={subscription.id}>
                <SubscriptionCard
                  slug={coach.slug ?? ''}
                  coachName={coach.name}
                  coachAvatarUrl={coach.avatarUrl}
                  profileHref={coach.slug ? `/coaches/${coach.slug}` : null}
                  returnTo="abbonamenti"
                  subscription={data}
                />
              </li>
            );
          })}
        </ul>
      )}

      {ended.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Conclusi</h3>
          <ul className="mt-2 flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
            {ended.map(({ subscription, coach }) => (
              <li
                key={subscription.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
              >
                <span className="text-gray-900">
                  {subscription.planName} con {coach.name}
                </span>
                <span className="text-gray-500">
                  {subscription.canceledAt
                    ? `Concluso il ${formatDate(subscription.canceledAt)}`
                    : 'Concluso'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
