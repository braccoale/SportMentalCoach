import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  canOfferPlanChange,
  formatEuroCents,
  formatLongDateRome,
  getPaymentMethodLabels,
  getSessionUsageForSubscriptions,
  getSingleSessionOffers,
  getSingleSessionValidityDays,
  listAthleteSingleSessions,
  listChangeablePlans,
  listAthleteSubscriptions,
  perSessionCents,
  purchaseNoticeFor,
  subscribedOn,
} from '@/lib/core/billing';
import { formatDate } from '@/lib/core/format';
import { getAthleteRelationshipCoaches } from '@/lib/core/bookings';
import { ConfirmingPayment } from '@/components/confirming-payment';
import {
  SingleSessionsSection,
  type SingleSessionOffer,
} from '@/components/single-sessions-section';
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
 * Abbonamenti e sessioni singole dell'atleta, in due sezioni separate: le
 * sedute del piano (si contano nel mese e non si riportano) e quelle comprate a
 * parte (hanno una scadenza propria di 60 giorni). Mescolarle in un solo
 * numero nascondeva quali scadono e quali no.
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
  const [usageBySubscription, paymentMethods, singles, validityDays] =
    await Promise.all([
      getSessionUsageForSubscriptions(user.id, liveSubscriptions),
      getPaymentMethodLabels(liveSubscriptions),
      listAthleteSingleSessions(user.id),
      getSingleSessionValidityDays(),
    ]);
  // I piani tra cui scegliere per cambiare, per ogni coach con un abbonamento
  // che si può cambiare. Un guasto qui toglie il pulsante, non la pagina.
  const plansByCoach = new Map<number, Awaited<ReturnType<typeof listChangeablePlans>>>();
  await Promise.all(
    [...new Set(liveSubscriptions.filter(canOfferPlanChange).map((s) => s.coachUserId))].map(
      async (coachUserId) => {
        try {
          plansByCoach.set(coachUserId, await listChangeablePlans(coachUserId));
        } catch (error) {
          console.error('[payments] piani per il cambio non letti', { coachUserId, error });
        }
      }
    )
  );
  // Per «Prenota» su una seduta già pagata: si apre la finestra di prenotazione
  // con il coach giusto, non il suo profilo. Se il calcolo fallisce resta il
  // collegamento al profilo (la pagina non si rompe).
  const relationshipCoaches = singles.some((s) => s.state === 'available')
    ? await getAthleteRelationshipCoaches(user.id).catch((error) => {
        console.error('[payments] coach per la prenotazione non letti', {
          athleteUserId: user.id,
          reason: error instanceof Error ? error.message : 'sconosciuto',
        });
        return [];
      })
    : [];
  const coachesBySlug = Object.fromEntries(
    relationshipCoaches.map((coach) => [coach.slug, coach])
  );

  // Dove si può comprare una sessione: i coach con cui c'è un abbonamento o
  // una seduta già acquistata, se il coach ha impostato il prezzo.
  const coachInfo = new Map<number, { name: string; slug: string | null }>();
  for (const { subscription, coach } of live) {
    coachInfo.set(subscription.coachUserId, { name: coach.name, slug: coach.slug });
  }
  for (const session of singles) {
    if (!coachInfo.has(session.coachUserId)) {
      coachInfo.set(session.coachUserId, {
        name: session.coachName,
        slug: session.coachSlug,
      });
    }
  }
  const prices = await getSingleSessionOffers([...coachInfo.keys()]);
  const offers: SingleSessionOffer[] = [];
  for (const [coachUserId, info] of coachInfo) {
    const cents = prices.get(coachUserId);
    if (cents && info.slug) {
      offers.push({
        coachUserId,
        coachName: info.name,
        coachSlug: info.slug,
        priceLabel: formatEuroCents(cents),
      });
    }
  }

  // Appena tornati da Stripe l'abbonamento può non essere ancora attivo: la
  // pagina lo dice e si aggiorna da sola.
  const waitingForWebhook = abbonamento === 'ok' && live.length === 0 && confirming;
  const notice = waitingForWebhook
    ? null
    : purchaseNoticeFor(abbonamento, {
        subscriptionActive: live.length > 0 || singles.length > 0,
      });

  return (
    <section className="m-4 flex flex-col gap-6 rounded-2xl bg-white p-4 shadow-sm sm:m-6 sm:p-5">
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
          <p className="font-medium text-gray-800">
            Non hai abbonamenti né sessioni acquistate.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Quando ne comprerai uno, lo troverai qui con le sedute rimaste, la
            scadenza e come prenotarle. Per cominciare, scegli un coach e un
            percorso dalla sua scheda.
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
              canChangePaymentMethod: Boolean(subscription.stripeCustomerId),
              status: subscription.status === 'past_due' ? 'past_due' : 'active',
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              periodEndLabel: subscription.currentPeriodEnd
                ? formatDate(subscription.currentPeriodEnd)
                : null,
              planChange: canOfferPlanChange(subscription)
                ? {
                    options: (plansByCoach.get(subscription.coachUserId) ?? []).map(
                      (plan) => ({
                        id: plan.id,
                        name: plan.name,
                        sessionsPerMonth: plan.sessionsPerMonth,
                        priceLabel: formatEuroCents(plan.monthlyPriceCents),
                        current: plan.id === subscription.planId,
                        pending: plan.id === subscription.pendingPlanId,
                      })
                    ),
                    pendingName:
                      (plansByCoach.get(subscription.coachUserId) ?? []).find(
                        (plan) => plan.id === subscription.pendingPlanId
                      )?.name ?? null,
                  }
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
                  showSingleOffer={false}
                  subscription={data}
                />
              </li>
            );
          })}
        </ul>
      )}

      <SingleSessionsSection
        sessions={singles}
        offers={offers}
        validityDays={validityDays}
        coachesBySlug={coachesBySlug}
      />

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
