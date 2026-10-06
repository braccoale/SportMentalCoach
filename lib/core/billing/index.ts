import 'server-only';
import { and, asc, desc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  clientProfiles,
  coachBillingProfiles,
  coachSessionPlans,
  planSubscriptions,
  profiles,
  providerProfiles,
  userRoles,
  users,
  type CoachBillingProfile,
  type CoachSessionPlan,
  type PlanSubscription,
} from '@/lib/db/schema';
import { getSystemConfigNumber } from '@/lib/core/system-config';
import { CANONICAL_APP_URL } from '@/lib/core/site';
import { getAppBaseUrl } from '@/lib/core/app-url';
import {
  createAccountSession,
  createCoachConnectedAccount,
  createPlanCheckoutSession,
  getSubscriptionPaymentMethod,
  retrieveConnectedAccount,
  setSubscriptionCancelAtPeriodEnd,
} from '@/lib/payments/connect';
import type { Result } from '@/lib/core/result';
import {
  athleteCanSeePlans,
  coachPaymentsState,
  type CoachPaymentsState,
} from './coach-payments';
import { deriveBillingProfileFromStripeAccount } from './stripe-account-status';
import { sessionUsageForPeriod, type SessionUsage, type UsageBooking } from './session-usage';
import { paymentMethodLabel } from './payment-method';
import {
  creditPeriods,
  decideBookingAccess,
  type BookingAccess,
  type BookingViewer,
} from './booking-credits';
import { checkoutEligibility, type CheckoutRefusal } from './checkout-eligibility';
import {
  DEFAULT_PLAN_LIMITS,
  PLAN_LIMIT_CONFIG_KEYS,
  canActivateAnotherPlan,
  validateSessionPlan,
  type PlanLimits,
  type SessionPlanErrors,
  type SessionPlanInput,
} from './session-plan';

export * from './coach-payments';
export * from './session-plan';
export * from './stripe-account-status';
export * from './checkout-eligibility';
export * from './subscription-status';
export * from './purchase-notice';
export * from './session-usage';
export * from './booking-credits';
export * from './payment-method';

export async function getCoachBillingProfile(
  coachUserId: number
): Promise<CoachBillingProfile | null> {
  const [row] = await db
    .select()
    .from(coachBillingProfiles)
    .where(eq(coachBillingProfiles.coachUserId, coachUserId))
    .limit(1);
  return row ?? null;
}

/**
 * Lo stato dei pagamenti di un coach. Se il database non risponde si cade su
 * `off`: meglio non mostrare prezzi che mostrarne a un coach che non sappiamo
 * se può incassare.
 */
export async function getCoachPaymentsState(
  coachUserId: number
): Promise<CoachPaymentsState> {
  try {
    return coachPaymentsState(await getCoachBillingProfile(coachUserId));
  } catch (error) {
    console.error('[billing] stato pagamenti non letto', {
      coachUserId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    return 'off';
  }
}

/**
 * Attiva o disattiva i pagamenti di un coach (decisione dell'admin).
 *
 * Disattivare non cancella niente: il profilo, l'account Stripe collegato e i
 * piani restano, e riattivando si riparte da lì.
 */
export async function setCoachPaymentsEnabled(params: {
  providerId: number;
  enabled: boolean;
  actorUserId: number;
}): Promise<Result<{ coachUserId: number }>> {
  const [provider] = await db
    .select({ userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(eq(providerProfiles.id, params.providerId))
    .limit(1);
  if (!provider) return { ok: false, error: 'Profilo non trovato.' };

  const now = new Date();
  await db
    .insert(coachBillingProfiles)
    .values({
      coachUserId: provider.userId,
      paymentsEnabled: params.enabled,
      paymentsEnabledAt: params.enabled ? now : null,
      createdBy: params.actorUserId,
      updatedBy: params.actorUserId,
    })
    .onConflictDoUpdate({
      target: coachBillingProfiles.coachUserId,
      set: {
        paymentsEnabled: params.enabled,
        // La data dice da quando i pagamenti sono accesi, non la prima volta.
        paymentsEnabledAt: params.enabled ? now : null,
        updatedAt: now,
        updatedBy: params.actorUserId,
      },
    });

  return { ok: true, coachUserId: provider.userId };
}

export async function getPlanLimits(): Promise<PlanLimits> {
  const keys = PLAN_LIMIT_CONFIG_KEYS;
  const [minSessions, maxSessions, minPriceCents, maxPriceCents, maxActivePlans] =
    await Promise.all([
      getSystemConfigNumber(keys.minSessions, DEFAULT_PLAN_LIMITS.minSessions),
      getSystemConfigNumber(keys.maxSessions, DEFAULT_PLAN_LIMITS.maxSessions),
      getSystemConfigNumber(keys.minPriceCents, DEFAULT_PLAN_LIMITS.minPriceCents),
      getSystemConfigNumber(keys.maxPriceCents, DEFAULT_PLAN_LIMITS.maxPriceCents),
      getSystemConfigNumber(keys.maxActivePlans, DEFAULT_PLAN_LIMITS.maxActivePlans),
    ]);
  return { minSessions, maxSessions, minPriceCents, maxPriceCents, maxActivePlans };
}

export async function listCoachSessionPlans(
  coachUserId: number
): Promise<CoachSessionPlan[]> {
  return db
    .select()
    .from(coachSessionPlans)
    .where(eq(coachSessionPlans.coachUserId, coachUserId))
    .orderBy(asc(coachSessionPlans.sessionsPerMonth), asc(coachSessionPlans.id));
}

export type CreatePlanResult =
  | { ok: true; planId: number }
  | { ok: false; error: string; fieldErrors?: SessionPlanErrors };

/** Crea un piano in bozza: l'atleta non lo vede finché il coach non lo attiva. */
export async function createCoachSessionPlan(params: {
  coachUserId: number;
  input: SessionPlanInput;
}): Promise<CreatePlanResult> {
  const limits = await getPlanLimits();
  const validation = validateSessionPlan(params.input, limits);
  if (!validation.ok) {
    const first = Object.values(validation.errors)[0] ?? 'Dati non validi.';
    return { ok: false, error: first, fieldErrors: validation.errors };
  }

  // Il «consigliato» è uno solo per coach (lo impone anche un indice): si toglie
  // agli altri nella stessa transazione in cui lo si assegna al nuovo.
  const row = await db.transaction(async (tx) => {
    if (validation.value.recommended) {
      await tx
        .update(coachSessionPlans)
        .set({ isRecommended: false, updatedAt: new Date(), updatedBy: params.coachUserId })
        .where(
          and(
            eq(coachSessionPlans.coachUserId, params.coachUserId),
            eq(coachSessionPlans.isRecommended, true)
          )
        );
    }
    const [inserted] = await tx
      .insert(coachSessionPlans)
      .values({
        coachUserId: params.coachUserId,
        name: validation.value.name,
        description: validation.value.description,
        isRecommended: validation.value.recommended,
        sessionsPerMonth: validation.value.sessionsPerMonth,
        monthlyPriceCents: validation.value.monthlyPriceCents,
        status: 'draft',
        createdBy: params.coachUserId,
        updatedBy: params.coachUserId,
      })
      .returning({ id: coachSessionPlans.id });
    return inserted;
  });
  return { ok: true, planId: row.id };
}

/**
 * Cambia lo stato di un piano del coach. Il tetto di piani attivi è una
 * cortesia verso l'atleta, non un invariante di denaro: il controllo non è
 * serializzato e due clic simultanei potrebbero superarlo di uno.
 */
export async function setCoachSessionPlanStatus(params: {
  coachUserId: number;
  planId: number;
  status: 'active' | 'archived' | 'draft';
}): Promise<Result> {
  const [plan] = await db
    .select({ id: coachSessionPlans.id, status: coachSessionPlans.status })
    .from(coachSessionPlans)
    .where(
      and(
        eq(coachSessionPlans.id, params.planId),
        eq(coachSessionPlans.coachUserId, params.coachUserId)
      )
    )
    .limit(1);
  if (!plan) return { ok: false, error: 'Piano non trovato.' };
  if (plan.status === params.status) return { ok: true };

  if (params.status === 'active') {
    const limits = await getPlanLimits();
    const [{ active }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(coachSessionPlans)
      .where(
        and(
          eq(coachSessionPlans.coachUserId, params.coachUserId),
          eq(coachSessionPlans.status, 'active')
        )
      );
    if (!canActivateAnotherPlan(active, limits)) {
      return {
        ok: false,
        error: `Puoi avere al massimo ${limits.maxActivePlans} piani attivi insieme. Archivia un piano prima di attivarne un altro.`,
      };
    }
  }

  await db
    .update(coachSessionPlans)
    .set({
      status: params.status,
      // Un piano archiviato non può restare «consigliato».
      ...(params.status === 'archived' ? { isRecommended: false } : {}),
      updatedAt: new Date(),
      updatedBy: params.coachUserId,
    })
    .where(
      and(
        eq(coachSessionPlans.id, params.planId),
        eq(coachSessionPlans.coachUserId, params.coachUserId)
      )
    );
  return { ok: true };
}

/**
 * L'account Stripe del coach: lo crea la prima volta, poi lo riusa.
 *
 * Solo se l'admin ha attivato i pagamenti: nessun account esiste "per sbaglio"
 * per un coach spento. La chiave di idempotenza lato Stripe e la condizione
 * `stripe_account_id is null` lato database rendono innocuo un doppio clic.
 */
export async function ensureCoachStripeAccount(
  coachUserId: number
): Promise<Result<{ accountId: string }>> {
  const profile = await getCoachBillingProfile(coachUserId);
  if (!profile || !profile.paymentsEnabled) {
    return { ok: false, error: 'I pagamenti non sono attivi per il tuo profilo.' };
  }
  if (profile.stripeAccountId) {
    return { ok: true, accountId: profile.stripeAccountId };
  }

  const [coach] = await db
    .select({
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      displayName: profiles.displayName,
      slug: providerProfiles.slug,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(providerProfiles, eq(providerProfiles.userId, users.id))
    .where(eq(users.id, coachUserId))
    .limit(1);
  if (!coach) return { ok: false, error: 'Coach non trovato.' };

  const displayName =
    coach.displayName?.trim() ||
    [coach.name, coach.lastName].filter(Boolean).join(' ').trim() ||
    coach.email;

  const account = await createCoachConnectedAccount({
    coachUserId,
    email: coach.email,
    displayName,
    businessUrl: coach.slug ? `${CANONICAL_APP_URL}/coaches/${coach.slug}` : null,
  });

  await db
    .update(coachBillingProfiles)
    .set({
      stripeAccountId: account.id,
      stripeAccountNamespace: 'v2',
      onboardingStatus: 'pending',
      updatedAt: new Date(),
      updatedBy: coachUserId,
    })
    .where(
      and(
        eq(coachBillingProfiles.coachUserId, coachUserId),
        sql`${coachBillingProfiles.stripeAccountId} is null`
      )
    );

  // Se un'altra richiesta ha scritto prima, vale quella: è lo stesso account,
  // perché la chiave di idempotenza è per coach.
  const stored = await getCoachBillingProfile(coachUserId);
  return { ok: true, accountId: stored?.stripeAccountId ?? account.id };
}

/**
 * Rilegge da Stripe lo stato dell'account del coach e lo salva. Chi chiama sa
 * già che esiste un account; senza, non c'è niente da sincronizzare.
 */
export async function syncCoachStripeStatus(
  coachUserId: number
): Promise<CoachBillingProfile | null> {
  const profile = await getCoachBillingProfile(coachUserId);
  if (!profile?.stripeAccountId) return profile;

  const account = await retrieveConnectedAccount(profile.stripeAccountId);
  const derived = deriveBillingProfileFromStripeAccount(
    account,
    profile.onboardingStatus
  );

  const [updated] = await db
    .update(coachBillingProfiles)
    .set({
      onboardingStatus: derived.onboardingStatus,
      chargesEnabled: derived.chargesEnabled,
      payoutsEnabled: derived.payoutsEnabled,
      requirementsDue: derived.requirementsDue,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(coachBillingProfiles.coachUserId, coachUserId))
    .returning();
  return updated ?? profile;
}

/** Segreto per aprire la verifica d'identità incorporata nella pagina. */
export async function createCoachOnboardingSession(
  coachUserId: number
): Promise<Result<{ clientSecret: string }>> {
  const account = await ensureCoachStripeAccount(coachUserId);
  if (!account.ok) return account;
  const clientSecret = await createAccountSession(account.accountId);
  return { ok: true, clientSecret };
}

/**
 * Segreto per la sezione Incassi incorporata. Solo per un coach che può
 * incassare: prima della verifica non c'è niente da mostrare, e il dettaglio
 * dei pagamenti non si apre a chi non è attivo.
 */
export async function createCoachDashboardSession(
  coachUserId: number
): Promise<Result<{ clientSecret: string }>> {
  const profile = await getCoachBillingProfile(coachUserId);
  if (coachPaymentsState(profile) !== 'active' || !profile?.stripeAccountId) {
    return { ok: false, error: 'Gli incassi sono visibili solo a verifica completata.' };
  }
  const clientSecret = await createAccountSession(
    profile.stripeAccountId,
    'dashboard'
  );
  return { ok: true, clientSecret };
}

/**
 * I piani attivi che un atleta può vedere sul profilo di un coach. Vuoto se il
 * visitatore non è un atleta o se il coach non può incassare: la regola è
 * `athleteCanSeePlans`, applicata qui e non nella pagina, così non si può
 * dimenticare in un'altra schermata.
 */
export async function getPlansVisibleToAthlete(params: {
  providerId: number;
  viewerIsAthlete: boolean;
}): Promise<CoachSessionPlan[]> {
  if (!params.viewerIsAthlete) return [];

  const [provider] = await db
    .select({ userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(eq(providerProfiles.id, params.providerId))
    .limit(1);
  if (!provider) return [];

  const state = await getCoachPaymentsState(provider.userId);
  if (!athleteCanSeePlans(state, { isAthlete: true })) return [];

  return db
    .select()
    .from(coachSessionPlans)
    .where(
      and(
        eq(coachSessionPlans.coachUserId, provider.userId),
        eq(coachSessionPlans.status, 'active')
      )
    )
    .orderBy(asc(coachSessionPlans.sessionsPerMonth), asc(coachSessionPlans.id));
}

export type StartCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; reason?: CheckoutRefusal };

/**
 * Avvia l'acquisto di un piano da parte di un atleta.
 *
 * Dal browser arriva **solo l'id del piano**: nome, prezzo, sedute, coach e
 * indirizzo di ritorno si ricavano qui dal database. Prima si applica la
 * regola di idoneità (età, ruolo, coach attivo, piano valido, nessun
 * abbonamento già vivo), poi si registra la riga `incomplete` e solo dopo si
 * apre il Checkout: se Stripe non risponde, nessuno ha pagato niente e la
 * riga resta marcata come annullata.
 */
export async function startPlanCheckout(params: {
  athleteUserId: number;
  planId: number;
}): Promise<StartCheckoutResult> {
  const [plan] = await db
    .select()
    .from(coachSessionPlans)
    .where(eq(coachSessionPlans.id, params.planId))
    .limit(1);
  if (!plan) {
    return { ok: false, error: 'Questo percorso non è più disponibile.', reason: 'PLAN_UNAVAILABLE' };
  }

  const [athlete] = await db
    .select({
      id: users.id,
      email: users.email,
      isDemo: users.isDemo,
      birthDate: clientProfiles.birthDate,
    })
    .from(users)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
    .where(eq(users.id, params.athleteUserId))
    .limit(1);
  if (!athlete) return { ok: false, error: 'Account non trovato.' };

  const [athleteRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, athlete.id), eq(userRoles.roleKey, 'athlete'))
    )
    .limit(1);

  const coachProfile = await getCoachBillingProfile(plan.coachUserId);
  const coachState = coachPaymentsState(coachProfile);

  const [live] = await db
    .select({ id: planSubscriptions.id })
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.athleteUserId, athlete.id),
        eq(planSubscriptions.coachUserId, plan.coachUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    )
    .limit(1);

  const eligibility = checkoutEligibility({
    viewer: {
      userId: athlete.id,
      isAthlete: Boolean(athleteRole),
      isDemo: athlete.isDemo,
      birthDate: athlete.birthDate,
    },
    coachUserId: plan.coachUserId,
    coachState,
    plan: { status: plan.status, coachUserId: plan.coachUserId },
    hasLiveSubscriptionWithCoach: Boolean(live),
  });
  if (!eligibility.ok) {
    return { ok: false, error: eligibility.message, reason: eligibility.reason };
  }
  if (!coachProfile?.stripeAccountId) {
    return { ok: false, error: 'Questo coach non può ancora ricevere pagamenti.', reason: 'COACH_NOT_ACTIVE' };
  }

  // L'indirizzo di ritorno si ricava dal coach, non da ciò che manda il browser.
  const [coachPage] = await db
    .select({ slug: providerProfiles.slug })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, plan.coachUserId))
    .limit(1);
  const base = getAppBaseUrl() ?? CANONICAL_APP_URL;
  const profileUrl = coachPage?.slug
    ? `${base}/coaches/${encodeURIComponent(coachPage.slug)}`
    : `${base}/coaches`;

  const [row] = await db
    .insert(planSubscriptions)
    .values({
      athleteUserId: athlete.id,
      coachUserId: plan.coachUserId,
      planId: plan.id,
      planName: plan.name,
      sessionsPerMonth: plan.sessionsPerMonth,
      monthlyPriceCents: plan.monthlyPriceCents,
      currency: plan.currency,
      status: 'incomplete',
      stripeAccountId: coachProfile.stripeAccountId,
      createdBy: athlete.id,
      updatedBy: athlete.id,
    })
    .returning({ id: planSubscriptions.id });

  try {
    const session = await createPlanCheckoutSession({
      connectedAccountId: coachProfile.stripeAccountId,
      subscriptionRowId: row.id,
      planName: plan.name,
      sessionsPerMonth: plan.sessionsPerMonth,
      monthlyPriceCents: plan.monthlyPriceCents,
      athleteEmail: athlete.email,
      // Dopo il pagamento si atterra nella pagina dell'atleta, non sulla
      // vetrina del coach: è lì che si vede cosa si è comprato.
      successUrl: `${base}/dashboard/athlete/abbonamenti?abbonamento=ok`,
      cancelUrl: `${profileUrl}?abbonamento=annullato#percorsi`,
    });
    await db
      .update(planSubscriptions)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(planSubscriptions.id, row.id));
    return { ok: true, url: session.url };
  } catch (error) {
    await db
      .update(planSubscriptions)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(planSubscriptions.id, row.id));
    throw error;
  }
}

/**
 * L'abbonamento di un atleta con un coach, per mostrarlo sul profilo: prima
 * quello vivo; altrimenti un acquisto aperto da poco e non ancora confermato
 * dal webhook (tornare da Checkout non prova il pagamento).
 */
export async function getAthleteSubscriptionForCoach(params: {
  athleteUserId: number;
  providerId: number;
}): Promise<PlanSubscription | null> {
  const [provider] = await db
    .select({ userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(eq(providerProfiles.id, params.providerId))
    .limit(1);
  if (!provider) return null;

  const rows = await db
    .select()
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.athleteUserId, params.athleteUserId),
        eq(planSubscriptions.coachUserId, provider.userId),
        inArray(planSubscriptions.status, ['active', 'past_due', 'incomplete'])
      )
    )
    .orderBy(desc(planSubscriptions.createdAt))
    .limit(10);

  const live = rows.find((row) => row.status !== 'incomplete');
  if (live) return live;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return (
    rows.find(
      (row) =>
        row.stripeCheckoutSessionId && row.createdAt.getTime() > dayAgo
    ) ?? null
  );
}

/** Imposta o toglie il «consigliato» su un piano del coach (uno solo alla volta). */
export async function setCoachPlanRecommended(params: {
  coachUserId: number;
  planId: number;
  recommended: boolean;
}): Promise<Result> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select({ id: coachSessionPlans.id, status: coachSessionPlans.status })
      .from(coachSessionPlans)
      .where(
        and(
          eq(coachSessionPlans.id, params.planId),
          eq(coachSessionPlans.coachUserId, params.coachUserId)
        )
      )
      .limit(1);
    if (!plan) return { ok: false as const, error: 'Piano non trovato.' };
    if (plan.status === 'archived') {
      return { ok: false as const, error: 'Un piano archiviato non può essere consigliato.' };
    }
    const now = new Date();
    if (params.recommended) {
      await tx
        .update(coachSessionPlans)
        .set({ isRecommended: false, updatedAt: now, updatedBy: params.coachUserId })
        .where(
          and(
            eq(coachSessionPlans.coachUserId, params.coachUserId),
            eq(coachSessionPlans.isRecommended, true)
          )
        );
    }
    await tx
      .update(coachSessionPlans)
      .set({ isRecommended: params.recommended, updatedAt: now, updatedBy: params.coachUserId })
      .where(eq(coachSessionPlans.id, params.planId));
    return { ok: true as const };
  });
}

/**
 * I piani da offrire sulle schede dell'elenco coach, per tutti i coach in una
 * volta (tre letture, non tre per scheda). Stessa regola del profilo: solo a un
 * atleta, solo per coach che possono incassare, solo piani attivi. In più,
 * niente offerta per un coach con cui l'atleta ha già un abbonamento vivo.
 */
export async function getPlanOffersForCoaches(params: {
  providerIds: number[];
  viewerUserId: number | null;
  viewerIsAthlete: boolean;
}): Promise<Map<number, CoachSessionPlan[]>> {
  const offers = new Map<number, CoachSessionPlan[]>();
  if (!params.viewerUserId || !params.viewerIsAthlete || params.providerIds.length === 0) {
    return offers;
  }

  const providers = await db
    .select({ id: providerProfiles.id, userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(inArray(providerProfiles.id, params.providerIds));
  if (providers.length === 0) return offers;
  const coachUserIds = providers.map((p) => p.userId);

  const [billing, plans, subscribed] = await Promise.all([
    db
      .select()
      .from(coachBillingProfiles)
      .where(inArray(coachBillingProfiles.coachUserId, coachUserIds)),
    db
      .select()
      .from(coachSessionPlans)
      .where(
        and(
          inArray(coachSessionPlans.coachUserId, coachUserIds),
          eq(coachSessionPlans.status, 'active')
        )
      )
      .orderBy(asc(coachSessionPlans.sessionsPerMonth), asc(coachSessionPlans.id)),
    db
      .select({ coachUserId: planSubscriptions.coachUserId })
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.athleteUserId, params.viewerUserId),
          inArray(planSubscriptions.coachUserId, coachUserIds),
          inArray(planSubscriptions.status, ['active', 'past_due'])
        )
      ),
  ]);

  const activeCoaches = new Set(
    billing
      .filter((profile) => athleteCanSeePlans(coachPaymentsState(profile), { isAthlete: true }))
      .map((profile) => profile.coachUserId)
  );
  const alreadySubscribed = new Set(subscribed.map((row) => row.coachUserId));

  for (const provider of providers) {
    if (!activeCoaches.has(provider.userId) || alreadySubscribed.has(provider.userId)) continue;
    const own = plans.filter((plan) => plan.coachUserId === provider.userId);
    if (own.length > 0) offers.set(provider.id, own);
  }
  return offers;
}

/**
 * L'atleta annulla (o riattiva) il proprio abbonamento alla fine del periodo
 * pagato. Solo il proprietario, solo se l'abbonamento è vivo: l'id arriva dal
 * browser e non basta a toccare l'abbonamento di un altro.
 */
export async function setAthleteSubscriptionCancellation(params: {
  athleteUserId: number;
  subscriptionRowId: number;
  cancelAtPeriodEnd: boolean;
}): Promise<Result> {
  const [row] = await db
    .select()
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.id, params.subscriptionRowId),
        eq(planSubscriptions.athleteUserId, params.athleteUserId)
      )
    )
    .limit(1);
  if (!row) return { ok: false, error: 'Abbonamento non trovato.' };
  if (row.status !== 'active' && row.status !== 'past_due') {
    return { ok: false, error: 'Questo abbonamento non è più attivo.' };
  }
  if (!row.stripeSubscriptionId) {
    return { ok: false, error: 'Abbonamento non ancora confermato: riprova tra poco.' };
  }
  if (row.cancelAtPeriodEnd === params.cancelAtPeriodEnd) return { ok: true };

  const result = await setSubscriptionCancelAtPeriodEnd({
    connectedAccountId: row.stripeAccountId,
    subscriptionId: row.stripeSubscriptionId,
    cancelAtPeriodEnd: params.cancelAtPeriodEnd,
  });

  // Si salva ciò che Stripe ha confermato, non ciò che abbiamo chiesto.
  await db
    .update(planSubscriptions)
    .set({
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      updatedAt: new Date(),
      updatedBy: params.athleteUserId,
    })
    .where(eq(planSubscriptions.id, row.id));
  return { ok: true };
}

export type AthleteSubscriptionItem = {
  subscription: PlanSubscription;
  coach: {
    name: string;
    firstName: string;
    slug: string | null;
    avatarUrl: string | null;
  };
};

export type AthleteSubscriptions = {
  /** Attivi o con un pagamento in ritardo. */
  live: AthleteSubscriptionItem[];
  /** Annullati e conclusi, dal più recente. */
  ended: AthleteSubscriptionItem[];
  /**
   * Un Checkout aperto da poco e non ancora confermato dal webhook: chi torna
   * da Stripe può arrivare qualche secondo prima della conferma. Un carrello
   * abbandonato da ore non conta.
   */
  confirming: boolean;
};

const CONFIRMING_WINDOW_MS = 2 * 60 * 60 * 1000;

export async function listAthleteSubscriptions(
  athleteUserId: number,
  now: Date = new Date()
): Promise<AthleteSubscriptions> {
  const rows = await db
    .select({
      subscription: planSubscriptions,
      coachName: users.name,
      coachLastName: users.lastName,
      coachEmail: users.email,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      slug: providerProfiles.slug,
    })
    .from(planSubscriptions)
    .innerJoin(users, eq(users.id, planSubscriptions.coachUserId))
    .leftJoin(profiles, eq(profiles.userId, planSubscriptions.coachUserId))
    .leftJoin(
      providerProfiles,
      eq(providerProfiles.userId, planSubscriptions.coachUserId)
    )
    .where(eq(planSubscriptions.athleteUserId, athleteUserId))
    .orderBy(desc(planSubscriptions.createdAt))
    .limit(50);

  const items = rows.map((row): AthleteSubscriptionItem => {
    const fullName =
      row.displayName?.trim() ||
      [row.coachName, row.coachLastName].filter(Boolean).join(' ').trim() ||
      row.coachEmail;
    return {
      subscription: row.subscription,
      coach: {
        name: fullName,
        firstName: fullName.split(/\s+/)[0] ?? fullName,
        slug: row.slug,
        avatarUrl: row.avatarUrl,
      },
    };
  });

  const confirming = items.some(
    (item) =>
      item.subscription.status === 'incomplete' &&
      Boolean(item.subscription.stripeCheckoutSessionId) &&
      now.getTime() - item.subscription.createdAt.getTime() < CONFIRMING_WINDOW_MS
  );

  return {
    live: items.filter(
      (item) =>
        item.subscription.status === 'active' ||
        item.subscription.status === 'past_due'
    ),
    ended: items.filter((item) => item.subscription.status === 'canceled'),
    confirming,
  };
}

/**
 * L'atleta ha mai avuto un abbonamento? Decide se il tab «Abbonamenti» compare
 * nel menu: chi non ha mai comprato niente non vede nulla di nuovo.
 */
export async function athleteHasSubscriptions(
  athleteUserId: number
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: planSubscriptions.id })
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.athleteUserId, athleteUserId),
          inArray(planSubscriptions.status, ['active', 'past_due', 'canceled'])
        )
      )
      .limit(1);
    return Boolean(row);
  } catch (error) {
    console.error('[billing] abbonamenti non letti', {
      athleteUserId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    return false;
  }
}

/**
 * Quante sedute hanno fatto, prenotato e ancora da usare, per ciascun
 * abbonamento vivo di un atleta. Una sola lettura delle prenotazioni per tutti
 * gli abbonamenti, poi il conteggio per periodo (regola pura in
 * `session-usage.ts`). Conta, non impedisce niente.
 */
export async function getSessionUsageForSubscriptions(
  athleteUserId: number,
  subscriptions: PlanSubscription[]
): Promise<Map<number, SessionUsage>> {
  const result = new Map<number, SessionUsage>();
  const withPeriod = subscriptions.filter(
    (sub) => sub.currentPeriodStart && sub.currentPeriodEnd
  );
  for (const sub of subscriptions) result.set(sub.id, { known: false });
  if (withPeriod.length === 0) return result;

  const coachUserIds = [...new Set(withPeriod.map((sub) => sub.coachUserId))];
  const from = new Date(
    Math.min(...withPeriod.map((sub) => sub.currentPeriodStart!.getTime()))
  );
  const to = new Date(
    Math.max(...withPeriod.map((sub) => sub.currentPeriodEnd!.getTime()))
  );

  const rows = await db
    .select({
      coachUserId: providerProfiles.userId,
      status: bookings.status,
      scheduledFor: bookings.scheduledFor,
    })
    .from(bookings)
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(
      and(
        eq(bookings.clientId, athleteUserId),
        inArray(providerProfiles.userId, coachUserIds),
        gte(bookings.scheduledFor, from),
        lt(bookings.scheduledFor, to)
      )
    );

  for (const sub of withPeriod) {
    result.set(
      sub.id,
      sessionUsageForPeriod({
        sessionsPerMonth: sub.sessionsPerMonth,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        bookings: rows.filter((row) => row.coachUserId === sub.coachUserId),
      })
    );
  }
  return result;
}

/**
 * Il coach richiede un abbonamento per prenotare? Solo se può incassare **e**
 * ha almeno un piano acquistabile: un coach a pagamento senza piani
 * lascerebbe gli atleti senza modo né di prenotare né di abbonarsi.
 */
async function coachesRequiringSubscription(
  executor: DbOrTx,
  coachUserIds: number[]
): Promise<Set<number>> {
  if (coachUserIds.length === 0) return new Set();
  const [profilesRows, planRows] = await Promise.all([
    executor
      .select()
      .from(coachBillingProfiles)
      .where(inArray(coachBillingProfiles.coachUserId, coachUserIds)),
    executor
      .select({ coachUserId: coachSessionPlans.coachUserId })
      .from(coachSessionPlans)
      .where(
        and(
          inArray(coachSessionPlans.coachUserId, coachUserIds),
          eq(coachSessionPlans.status, 'active')
        )
      ),
  ]);
  const withPlans = new Set(planRows.map((row) => row.coachUserId));
  return new Set(
    profilesRows
      .filter(
        (profile) =>
          coachPaymentsState(profile) === 'active' &&
          withPlans.has(profile.coachUserId)
      )
      .map((profile) => profile.coachUserId)
  );
}

/**
 * Il controllo vero, eseguito **dentro** la transazione di prenotazione: lì c'è
 * già il blocco per coach, quindi due prenotazioni simultanee non possono
 * superare le sedute del periodo. La regola è `decideBookingAccess`.
 */
export async function checkBookingCredits(
  executor: DbOrTx,
  params: {
    coachUserId: number;
    providerId: number;
    clientUserId: number;
    scheduledFor: Date;
    isIntro: boolean;
    /** Chi prenota: il messaggio parla a lui. Se manca, l'atleta. */
    viewer?: BookingViewer;
    /**
     * Una sessione che si sta spostando non pesa sul conteggio: se la si
     * conta, spostarla in un altro periodo sembrerebbe «usare» due sedute.
     */
    excludeBookingId?: number;
  }
): Promise<BookingAccess> {
  if (params.isIntro) return { ok: true };
  const required = await coachesRequiringSubscription(executor, [params.coachUserId]);
  if (!required.has(params.coachUserId)) return { ok: true };

  const [subscription] = await executor
    .select()
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.athleteUserId, params.clientUserId),
        eq(planSubscriptions.coachUserId, params.coachUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    )
    .orderBy(desc(planSubscriptions.createdAt))
    .limit(1);

  const periods = subscription ? creditPeriods(subscription) : null;
  const rows: UsageBooking[] = periods
    ? await executor
        .select({ status: bookings.status, scheduledFor: bookings.scheduledFor })
        .from(bookings)
        .where(
          and(
            eq(bookings.clientId, params.clientUserId),
            eq(bookings.providerId, params.providerId),
            gte(bookings.scheduledFor, periods.current.start),
            lt(bookings.scheduledFor, periods.next.end),
            params.excludeBookingId !== undefined
              ? ne(bookings.id, params.excludeBookingId)
              : undefined
          )
        )
    : [];

  return decideBookingAccess({
    requiresSubscription: true,
    isIntro: false,
    subscription: subscription ?? null,
    scheduledFor: params.scheduledFor,
    bookings: rows,
    viewer: params.viewer,
  });
}

/** I coach (profili) con cui l'atleta ha un abbonamento vivo. */
export async function getSubscribedProviderIds(
  athleteUserId: number
): Promise<number[]> {
  const rows = await db
    .select({ providerId: providerProfiles.id })
    .from(planSubscriptions)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, planSubscriptions.coachUserId)
    )
    .where(
      and(
        eq(planSubscriptions.athleteUserId, athleteUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    );
  return [...new Set(rows.map((row) => row.providerId))];
}

export type BookingCreditContext = {
  requiresSubscription: boolean;
  subscription: PlanSubscription | null;
  bookings: UsageBooking[];
};

/**
 * Per ciascun coach della lista: serve un abbonamento? l'atleta ce l'ha? quali
 * prenotazioni ha già nei due periodi? Poche letture per tutta la lista, poi la
 * decisione si prende in memoria con la stessa regola del server.
 */
export async function getBookingCreditContexts(
  athleteUserId: number,
  providerIds: number[]
): Promise<Map<number, BookingCreditContext>> {
  const contexts = new Map<number, BookingCreditContext>();
  if (providerIds.length === 0) return contexts;

  const providers = await db
    .select({ id: providerProfiles.id, userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(inArray(providerProfiles.id, providerIds));
  const coachUserIds = providers.map((p) => p.userId);

  const [required, subs] = await Promise.all([
    coachesRequiringSubscription(db, coachUserIds),
    db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.athleteUserId, athleteUserId),
          inArray(planSubscriptions.coachUserId, coachUserIds),
          inArray(planSubscriptions.status, ['active', 'past_due'])
        )
      )
      .orderBy(desc(planSubscriptions.createdAt)),
  ]);

  const subByCoach = new Map<number, PlanSubscription>();
  for (const sub of subs) {
    if (!subByCoach.has(sub.coachUserId)) subByCoach.set(sub.coachUserId, sub);
  }

  const windows = [...subByCoach.values()]
    .map((sub) => creditPeriods(sub))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const rows =
    windows.length === 0
      ? []
      : await db
          .select({
            providerId: bookings.providerId,
            status: bookings.status,
            scheduledFor: bookings.scheduledFor,
          })
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, athleteUserId),
              inArray(bookings.providerId, providerIds),
              gte(
                bookings.scheduledFor,
                new Date(Math.min(...windows.map((w) => w.current.start.getTime())))
              ),
              lt(
                bookings.scheduledFor,
                new Date(Math.max(...windows.map((w) => w.next.end.getTime())))
              )
            )
          );

  for (const provider of providers) {
    contexts.set(provider.id, {
      requiresSubscription: required.has(provider.userId),
      subscription: subByCoach.get(provider.userId) ?? null,
      bookings: rows.filter((row) => row.providerId === provider.id),
    });
  }
  return contexts;
}

/**
 * Gli atleti con un abbonamento vivo con questo coach, **solo se il coach
 * richiede un abbonamento**; `null` se non lo richiede (nessun filtro). Serve
 * al menu «Nuovo appuntamento» del coach: lì si offrono soltanto gli atleti con
 * cui il server lo lascerebbe fissare una sessione.
 */
export async function getSubscriberUserIdsIfRequired(
  coachUserId: number
): Promise<Set<number> | null> {
  const required = await coachesRequiringSubscription(db, [coachUserId]);
  if (!required.has(coachUserId)) return null;
  const rows = await db
    .select({ athleteUserId: planSubscriptions.athleteUserId })
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.coachUserId, coachUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    );
  return new Set(rows.map((row) => row.athleteUserId));
}

/**
 * Il nome del metodo di pagamento di ciascun abbonamento, per le schede
 * dell'atleta. Le letture partono insieme e ognuna ha un tempo limite: se
 * Stripe non risponde il riquadro semplicemente non compare.
 */
export async function getPaymentMethodLabels(
  subscriptions: PlanSubscription[]
): Promise<Map<number, string | null>> {
  const labels = new Map<number, string | null>();
  await Promise.all(
    subscriptions.map(async (sub) => {
      if (!sub.stripeSubscriptionId) {
        labels.set(sub.id, null);
        return;
      }
      const method = await getSubscriptionPaymentMethod({
        connectedAccountId: sub.stripeAccountId,
        subscriptionId: sub.stripeSubscriptionId,
      });
      labels.set(sub.id, paymentMethodLabel(method));
    })
  );
  return labels;
}
