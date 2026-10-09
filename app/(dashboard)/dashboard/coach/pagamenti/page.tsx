import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { requireRole } from '@/lib/core/auth';
import {
  coachCanEditPlans,
  coachPaymentsState,
  describeRequirements,
  formatEuroCents,
  getCoachBillingProfile,
  getPlanLimits,
  getSingleSessionLimits,
  getSingleSessionValidityDays,
  formatValidityDays,
  listCoachSessionPlans,
  perSessionCents,
  syncCoachStripeStatus,
} from '@/lib/core/billing';
import { Button } from '@/components/ui/button';
import {
  activateSessionPlanAction,
  archiveSessionPlanAction,
  restoreSessionPlanAction,
  toggleRecommendedPlanAction,
} from './actions';
import { EarningsPanel } from './earnings-panel';
import { OnboardingPanel } from './onboarding-panel';
import { PlanForm } from './plan-form';
import { SingleSessionForm } from './single-session-form';
import { getRateSuggestionForCoach } from '@/lib/core/rate-suggestion/server';
import { CoachRateSuggestion } from '@/components/coach-rate-suggestion';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'In bozza',
  active: 'Attivo',
  archived: 'Archiviato',
};

export default async function CoachPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;
  const user = await requireRole('coach');
  let profile = await getCoachBillingProfile(user.id);
  // Se c'è un account Stripe e non è ancora attivo, lo stato si rilegge da
  // Stripe a ogni apertura: la verifica può essersi chiusa in un'altra scheda.
  if (profile?.stripeAccountId && profile.paymentsEnabled) {
    try {
      profile = (await syncCoachStripeStatus(user.id)) ?? profile;
    } catch (error) {
      console.error('[payments] stato non sincronizzato', {
        coachUserId: user.id,
        reason: error instanceof Error ? error.message : 'sconosciuto',
      });
    }
  }
  const state = coachPaymentsState(profile);
  // Pagamenti non ancora attivati dall'admin: la voce c'è, e dice come stanno
  // le cose, invece di una pagina «non trovata».
  if (!coachCanEditPlans(state) || state === 'off') {
    return (
      <section className="flex flex-col gap-6 p-6">
        <header>
          <h2 className="text-lg font-semibold text-gray-900">Pagamenti</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Qui decidi quanto costa il tuo percorso e ricevi i pagamenti dei tuoi
            atleti.
          </p>
        </header>
        <div className="max-w-2xl rounded-2xl border border-dashed border-gray-300 bg-white p-8">
          <p className="font-medium text-gray-900">
            I pagamenti non sono ancora attivi sul tuo profilo.
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Per ora gli atleti prenotano con te senza pagare sulla piattaforma.
            L&apos;attivazione la gestisce KaiPai: quando sarà pronta troverai
            qui i piani, il prezzo della seduta singola e i tuoi incassi.
          </p>
          <Link
            href="/dashboard/supporto"
            className="mt-4 inline-flex rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Scrivi al supporto
          </Link>
        </div>
      </section>
    );
  }

  const [plans, limits, singleLimits, rateSuggestion] = await Promise.all([
    listCoachSessionPlans(user.id),
    getPlanLimits(),
    getSingleSessionLimits(),
    // Solo per il coach, e un guasto qui toglie il riquadro, non la pagina.
    getRateSuggestionForCoach(user.id).catch((error) => {
      console.error('[coach] tariffa suggerita non calcolata', error);
      return null;
    }),
  ]);
  const visiblePlans = plans.filter((plan) => plan.status !== 'archived');
  const archivedPlans = plans.filter((plan) => plan.status === 'archived');

  return (
    <section className="flex flex-col gap-6 p-6">
      <header>
        <h2 className="text-lg font-semibold text-gray-900">Pagamenti</h2>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Qui decidi quanto costa il tuo percorso. Gli atleti pagano con carta,
          e l’importo va direttamente a te, al netto delle commissioni di Stripe.
        </p>
      </header>

      {rateSuggestion && <CoachRateSuggestion suggestion={rateSuggestion} />}

      <SingleSessionForm
        currentPrice={
          profile?.singleSessionPriceCents
            ? formatEuroCents(profile.singleSessionPriceCents).replace(' €', '')
            : ''
        }
        minLabel={formatEuroCents(singleLimits.minPriceCents)}
        maxLabel={formatEuroCents(singleLimits.maxPriceCents)}
        validityLabel={formatValidityDays(await getSingleSessionValidityDays())}
        rateLevel={rateSuggestion?.level ?? null}
      />

      {state === 'active' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && (
        <EarningsPanel
          publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}
        />
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-semibold tracking-tight text-gray-900">
          I tuoi piani mensili
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Ogni piano è un abbonamento mensile con un certo numero di sedute. Un
          piano in bozza non lo vede nessuno.
        </p>

        {errore === 'stato-piano' && (
          <p
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            Non è stato possibile cambiare lo stato del piano. Puoi avere al
            massimo {limits.maxActivePlans} piani attivi insieme: archivia un
            piano prima di attivarne un altro.
          </p>
        )}

        {visiblePlans.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            Non hai ancora nessun piano. Creane uno qui sotto: per esempio 4
            sedute al mese a un prezzo che decidi tu.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-3">
            {visiblePlans.map((plan) => {
              const isActive = plan.status === 'active';
              return (
                <li
                  key={plan.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4',
                    isActive
                      ? 'border-emerald-100 bg-emerald-50/60'
                      : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
                      {plan.name}
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-sm font-medium',
                          isActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {STATUS_LABEL[plan.status] ?? plan.status}
                      </span>
                      {plan.isRecommended && (
                        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-sm font-medium text-white">
                          Consigliato
                        </span>
                      )}
                    </p>
                    {plan.description && (
                      <p className="mt-0.5 text-sm italic text-gray-500">
                        {plan.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-gray-600">
                      {plan.sessionsPerMonth}{' '}
                      {plan.sessionsPerMonth === 1 ? 'seduta' : 'sedute'} al mese ·{' '}
                      {formatEuroCents(plan.monthlyPriceCents)} al mese · circa{' '}
                      {formatEuroCents(
                        perSessionCents(plan.monthlyPriceCents, plan.sessionsPerMonth)
                      )}{' '}
                      a seduta
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <form
                      action={
                        isActive
                          ? restoreSessionPlanAction
                          : activateSessionPlanAction
                      }
                      className="flex items-center gap-3"
                    >
                      <input type="hidden" name="planId" value={plan.id} />
                      <button
                        type="submit"
                        role="switch"
                        aria-checked={isActive}
                        aria-label={`${plan.name}: ${isActive ? 'attivo, premi per metterlo in bozza' : 'in bozza, premi per attivarlo'}`}
                        className={cn(
                          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
                          isActive ? 'bg-emerald-600' : 'bg-gray-300'
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                            isActive ? 'translate-x-6' : 'translate-x-1'
                          )}
                        />
                      </button>
                      <span className="w-14 text-sm text-gray-700">
                        {isActive ? 'Attivo' : 'Bozza'}
                      </span>
                    </form>

                    <form action={toggleRecommendedPlanAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input
                        type="hidden"
                        name="value"
                        value={plan.isRecommended ? '0' : '1'}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 rounded-xl px-4"
                      >
                        {plan.isRecommended ? 'Non consigliare' : 'Consiglia'}
                      </Button>
                    </form>

                    <form action={archiveSessionPlanAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        className="h-11 gap-2 rounded-xl px-4"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Archivia
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {archivedPlans.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {archivedPlans.length}{' '}
            {archivedPlans.length === 1 ? 'piano archiviato' : 'piani archiviati'}.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Nuovo piano</h3>
        <PlanForm
          minSessions={limits.minSessions}
          maxSessions={limits.maxSessions}
        />
        <p className="mt-3 text-xs text-gray-500">
          Il prezzo va da {formatEuroCents(limits.minPriceCents)} a{' '}
          {formatEuroCents(limits.maxPriceCents)} al mese.
        </p>
      </div>

      <OnboardingPanel
        state={state}
        hasAccount={Boolean(profile?.stripeAccountId)}
        missing={describeRequirements(profile?.requirementsDue ?? [])}
        publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null}
      />
    </section>
  );
}
