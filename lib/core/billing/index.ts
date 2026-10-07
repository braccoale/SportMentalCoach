import 'server-only';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  bookings,
  clientProfiles,
  coachBillingProfiles,
  coachSessionPlans,
  planSubscriptions,
  profiles,
  providerProfiles,
  sessionCredits,
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
  createBillingPortalSession,
  createPlanCheckoutSession,
  createSingleSessionCheckoutSession,
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
import type { CoachAthleteBilling } from './coach-athlete-status';
import {
  DEFAULT_SINGLE_SESSION_LIMITS,
  DEFAULT_SINGLE_SESSION_VALIDITY_DAYS,
  FREEING_BOOKING_STATUSES,
  SINGLE_SESSION_VALIDITY_CONFIG_KEY,
  normalizeValidityDays,
  creditDisplayState,
  type CreditDisplayState,
  SINGLE_SESSION_LIMIT_CONFIG_KEYS,
  validateSingleSessionPrice,
  type SingleSessionLimits,
} from './single-session';
import {
  creditPeriods,
  decideBookingAccess,
  type BookingAccess,
  type BookingViewer,
} from './booking-credits';
import { checkoutEligibility, type CheckoutRefusal } from './checkout-eligibility';
import { formatLongDateRome, subscribedOn } from './subscription-status';
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
export * from './single-session';
export * from './coach-athlete-status';

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
    // Una seduta pagata a parte non pesa sulle sedute del piano.
    .leftJoin(sessionCredits, eq(sessionCredits.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.clientId, athleteUserId),
        inArray(providerProfiles.userId, coachUserIds),
        gte(bookings.scheduledFor, from),
        lt(bookings.scheduledFor, to),
        isNull(sessionCredits.id)
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

  // Una prenotazione che si sposta e che già tiene una seduta acquistata resta
  // su quella: vale finché la seduta non scade, e non passa al piano.
  if (params.excludeBookingId !== undefined) {
    const [held] = await executor
      .select({ expiresAt: sessionCredits.expiresAt })
      .from(sessionCredits)
      .where(eq(sessionCredits.bookingId, params.excludeBookingId))
      .limit(1);
    if (held?.expiresAt) {
      if (held.expiresAt.getTime() > params.scheduledFor.getTime()) {
        return { ok: true, usesCredit: true };
      }
      const athlete = (params.viewer ?? 'athlete') === 'athlete';
      return {
        ok: false,
        reason: 'TOO_FAR',
        message: `${athlete ? 'La seduta che hai acquistato' : 'La seduta acquistata dall’atleta'} scade il ${formatLongDateRome(held.expiresAt)}: scegli una data prima.`,
      };
    }
  }

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
        .leftJoin(sessionCredits, eq(sessionCredits.bookingId, bookings.id))
        .where(
          and(
            eq(bookings.clientId, params.clientUserId),
            eq(bookings.providerId, params.providerId),
            gte(bookings.scheduledFor, periods.current.start),
            lt(bookings.scheduledFor, periods.next.end),
            isNull(sessionCredits.id),
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
    credits: await getAvailableSessionCredits(executor, {
      athleteUserId: params.clientUserId,
      coachUserId: params.coachUserId,
    }),
  });
}

/** Condizione SQL: la seduta pagata non è tenuta da una prenotazione viva. */
const creditIsFreeSql = sql`(${sessionCredits.bookingId} is null or exists (
  select 1 from bookings held
  where held.id = ${sessionCredits.bookingId}
    and held.status in (${sql.raw(FREEING_BOOKING_STATUSES.map((s) => `'${s}'`).join(', '))})
))`;

export type AvailableSessionCredit = { id: number; expiresAt: Date };

/**
 * Le sedute acquistate a parte che un atleta può ancora prenotare con un coach:
 * pagate, non scadute e non tenute da una prenotazione viva (regola pura:
 * `isCreditFree`). Dalla più vicina alla scadenza.
 */
export async function getAvailableSessionCredits(
  executor: DbOrTx,
  params: { athleteUserId: number; coachUserId: number; now?: Date }
): Promise<AvailableSessionCredit[]> {
  const map = await getAvailableCreditsByCoach(executor, {
    athleteUserId: params.athleteUserId,
    coachUserIds: [params.coachUserId],
    now: params.now,
  });
  return map.get(params.coachUserId) ?? [];
}

export async function getAvailableCreditsByCoach(
  executor: DbOrTx,
  params: { athleteUserId: number; coachUserIds: number[]; now?: Date }
): Promise<Map<number, AvailableSessionCredit[]>> {
  const result = new Map<number, AvailableSessionCredit[]>();
  if (params.coachUserIds.length === 0) return result;
  const rows = await executor
    .select({
      id: sessionCredits.id,
      coachUserId: sessionCredits.coachUserId,
      expiresAt: sessionCredits.expiresAt,
    })
    .from(sessionCredits)
    .where(
      and(
        eq(sessionCredits.athleteUserId, params.athleteUserId),
        inArray(sessionCredits.coachUserId, params.coachUserIds),
        eq(sessionCredits.status, 'granted'),
        gt(sessionCredits.expiresAt, params.now ?? new Date()),
        creditIsFreeSql
      )
    )
    .orderBy(asc(sessionCredits.expiresAt), asc(sessionCredits.id));
  for (const row of rows) {
    if (!row.expiresAt) continue;
    const list = result.get(row.coachUserId) ?? [];
    list.push({ id: row.id, expiresAt: row.expiresAt });
    result.set(row.coachUserId, list);
  }
  return result;
}

/**
 * Lega una seduta acquistata alla prenotazione appena creata, dentro la stessa
 * transazione. Prende la più vicina alla scadenza che sia ancora valida alla
 * data scelta. Se la prenotazione ne tiene già una (spostamento) non fa nulla.
 * Restituisce `false` se non ce n'è nessuna: il chiamante annulla la transazione.
 */
export async function reserveSessionCredit(
  tx: DbOrTx,
  params: {
    athleteUserId: number;
    coachUserId: number;
    bookingId: number;
    scheduledFor: Date;
  }
): Promise<boolean> {
  const [already] = await tx
    .select({ id: sessionCredits.id })
    .from(sessionCredits)
    .where(eq(sessionCredits.bookingId, params.bookingId))
    .limit(1);
  if (already) return true;

  const [candidate] = await tx
    .select({ id: sessionCredits.id })
    .from(sessionCredits)
    .where(
      and(
        eq(sessionCredits.athleteUserId, params.athleteUserId),
        eq(sessionCredits.coachUserId, params.coachUserId),
        eq(sessionCredits.status, 'granted'),
        gt(sessionCredits.expiresAt, new Date()),
        gt(sessionCredits.expiresAt, params.scheduledFor),
        creditIsFreeSql
      )
    )
    .orderBy(asc(sessionCredits.expiresAt), asc(sessionCredits.id))
    .limit(1)
    .for('update', { skipLocked: true });
  if (!candidate) return false;

  await tx
    .update(sessionCredits)
    .set({ bookingId: params.bookingId, updatedAt: new Date() })
    .where(eq(sessionCredits.id, candidate.id));
  return true;
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
  const withCredits = await db
    .select({ providerId: providerProfiles.id, coachUserId: sessionCredits.coachUserId })
    .from(sessionCredits)
    .innerJoin(providerProfiles, eq(providerProfiles.userId, sessionCredits.coachUserId))
    .where(
      and(
        eq(sessionCredits.athleteUserId, athleteUserId),
        eq(sessionCredits.status, 'granted'),
        gt(sessionCredits.expiresAt, new Date()),
        creditIsFreeSql
      )
    );
  return [
    ...new Set([...rows, ...withCredits].map((row) => row.providerId)),
  ];
}

export type BookingCreditContext = {
  requiresSubscription: boolean;
  subscription: PlanSubscription | null;
  bookings: UsageBooking[];
  /** Sedute acquistate a parte, ancora libere, con questo coach. */
  credits: AvailableSessionCredit[];
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

  const [required, creditsByCoach, subs] = await Promise.all([
    coachesRequiringSubscription(db, coachUserIds),
    getAvailableCreditsByCoach(db, { athleteUserId, coachUserIds }),
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
          .leftJoin(sessionCredits, eq(sessionCredits.bookingId, bookings.id))
          .where(
            and(
              isNull(sessionCredits.id),
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
      credits: creditsByCoach.get(provider.userId) ?? [],
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
  // Chi ha comprato una seduta e non l'ha ancora usata è «pagato» quanto un abbonato.
  const withCredits = await db
    .selectDistinct({ athleteUserId: sessionCredits.athleteUserId })
    .from(sessionCredits)
    .where(
      and(
        eq(sessionCredits.coachUserId, coachUserId),
        eq(sessionCredits.status, 'granted'),
        gt(sessionCredits.expiresAt, new Date()),
        creditIsFreeSql
      )
    );
  return new Set(
    [...rows, ...withCredits].map((row) => row.athleteUserId)
  );
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

export async function getSingleSessionLimits(): Promise<SingleSessionLimits> {
  const keys = SINGLE_SESSION_LIMIT_CONFIG_KEYS;
  const [minPriceCents, maxPriceCents] = await Promise.all([
    getSystemConfigNumber(keys.minPriceCents, DEFAULT_SINGLE_SESSION_LIMITS.minPriceCents),
    getSystemConfigNumber(keys.maxPriceCents, DEFAULT_SINGLE_SESSION_LIMITS.maxPriceCents),
  ]);
  return { minPriceCents, maxPriceCents };
}

/**
 * Il coach imposta (o toglie) il prezzo della seduta singola. Vale per il
 * profilo pagamenti che già esiste: senza pagamenti attivati non c'è niente da
 * configurare. Il prezzo non cambia le sedute già acquistate: ognuna ha il suo.
 */
export async function setCoachSingleSessionPrice(params: {
  coachUserId: number;
  input: string;
}): Promise<Result<{ priceCents: number | null }>> {
  const profile = await getCoachBillingProfile(params.coachUserId);
  if (!profile || !profile.paymentsEnabled) {
    return { ok: false, error: 'I pagamenti non sono attivi per il tuo profilo.' };
  }
  const validation = validateSingleSessionPrice(
    params.input,
    await getSingleSessionLimits()
  );
  if (!validation.ok) return { ok: false, error: validation.error };

  await db
    .update(coachBillingProfiles)
    .set({
      singleSessionPriceCents: validation.priceCents,
      updatedAt: new Date(),
      updatedBy: params.coachUserId,
    })
    .where(eq(coachBillingProfiles.coachUserId, params.coachUserId));
  return { ok: true, priceCents: validation.priceCents };
}

/**
 * Le sedute extra libere di un atleta, per coach: quante sono e quando scade la
 * prima. Alimentano la scheda dell'abbonamento e l'elenco «sedute acquistate».
 */
export async function getAthleteExtraSessions(
  athleteUserId: number
): Promise<Map<number, { count: number; nextExpiry: Date }>> {
  const rows = await db
    .select({ coachUserId: sessionCredits.coachUserId })
    .from(sessionCredits)
    .where(
      and(
        eq(sessionCredits.athleteUserId, athleteUserId),
        eq(sessionCredits.status, 'granted')
      )
    );
  const coachUserIds = [...new Set(rows.map((row) => row.coachUserId))];
  const free = await getAvailableCreditsByCoach(db, { athleteUserId, coachUserIds });
  const result = new Map<number, { count: number; nextExpiry: Date }>();
  for (const [coachUserId, list] of free) {
    if (list.length > 0) {
      result.set(coachUserId, { count: list.length, nextExpiry: list[0].expiresAt });
    }
  }
  return result;
}

/**
 * Avvia l'acquisto di UNA seduta (singola, o extra se c'è già un abbonamento).
 * Il prezzo si legge qui dal profilo pagamenti del coach e si fotografa sulla
 * riga, così un cambio di prezzo dopo non tocca ciò che l'atleta ha già
 * pagato. La riga nasce `pending`; diventa prenotabile solo col webhook.
 */
export async function startSingleSessionCheckout(params: {
  athleteUserId: number;
  coachUserId: number;
}): Promise<StartCheckoutResult> {
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
    .where(and(eq(userRoles.userId, athlete.id), eq(userRoles.roleKey, 'athlete')))
    .limit(1);

  const coachProfile = await getCoachBillingProfile(params.coachUserId);
  const priceCents = coachProfile?.singleSessionPriceCents ?? null;

  const eligibility = checkoutEligibility({
    viewer: {
      userId: athlete.id,
      isAthlete: Boolean(athleteRole),
      isDemo: athlete.isDemo,
      birthDate: athlete.birthDate,
    },
    coachUserId: params.coachUserId,
    coachState: coachPaymentsState(coachProfile),
    // Qui non c'è un piano: la regola chiede solo che «esista ed è attivo».
    plan: { status: 'active', coachUserId: params.coachUserId },
    // Chi ha già un abbonamento può aggiungere una seduta: è proprio il caso.
    hasLiveSubscriptionWithCoach: false,
  });
  if (!eligibility.ok) {
    return { ok: false, error: eligibility.message, reason: eligibility.reason };
  }
  if (!coachProfile?.stripeAccountId || !priceCents) {
    return {
      ok: false,
      error: 'Questo coach non vende la seduta singola.',
      reason: 'SINGLE_SESSION_UNAVAILABLE',
    };
  }

  const [coach] = await db
    .select({ slug: providerProfiles.slug, displayName: profiles.displayName })
    .from(providerProfiles)
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(eq(providerProfiles.userId, params.coachUserId))
    .limit(1);
  const base = getAppBaseUrl() ?? CANONICAL_APP_URL;
  const profileUrl = coach?.slug
    ? `${base}/coaches/${encodeURIComponent(coach.slug)}`
    : `${base}/coaches`;

  const [live] = await db
    .select({ id: planSubscriptions.id })
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.athleteUserId, athlete.id),
        eq(planSubscriptions.coachUserId, params.coachUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    )
    .limit(1);

  const [row] = await db
    .insert(sessionCredits)
    .values({
      athleteUserId: athlete.id,
      coachUserId: params.coachUserId,
      kind: live ? 'extra' : 'single',
      status: 'pending',
      priceCents,
      stripeAccountId: coachProfile.stripeAccountId,
      createdBy: athlete.id,
      updatedBy: athlete.id,
    })
    .returning({ id: sessionCredits.id });

  try {
    const session = await createSingleSessionCheckoutSession({
      connectedAccountId: coachProfile.stripeAccountId,
      creditRowId: row.id,
      priceCents,
      coachName: coach?.displayName ?? 'il coach',
      validityDays: await getSingleSessionValidityDays(),
      athleteEmail: athlete.email,
      successUrl: `${base}/dashboard/athlete/abbonamenti?abbonamento=seduta-ok`,
      cancelUrl: `${profileUrl}?abbonamento=annullato`,
    });
    await db
      .update(sessionCredits)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(sessionCredits.id, row.id));
    return { ok: true, url: session.url };
  } catch (error) {
    // Nessuno ha pagato: la riga aperta non serve a niente (un `pending` non è
    // mai prenotabile), quindi non la si lascia in giro.
    await db.delete(sessionCredits).where(eq(sessionCredits.id, row.id));
    throw error;
  }
}

/**
 * Il prezzo di una seduta in più che l'atleta può comprare da ciascun coach:
 * solo se il coach incassa davvero (stato `active`) e ha impostato il prezzo.
 * Un coach senza prezzo non compare nella mappa.
 */
export async function getSingleSessionOffers(
  coachUserIds: number[]
): Promise<Map<number, number>> {
  const offers = new Map<number, number>();
  if (coachUserIds.length === 0) return offers;
  const rows = await db
    .select()
    .from(coachBillingProfiles)
    .where(inArray(coachBillingProfiles.coachUserId, coachUserIds));
  for (const profile of rows) {
    if (
      profile.singleSessionPriceCents &&
      coachPaymentsState(profile) === 'active'
    ) {
      offers.set(profile.coachUserId, profile.singleSessionPriceCents);
    }
  }
  return offers;
}

export type StandaloneCreditHolder = {
  coachUserId: number;
  name: string;
  slug: string | null;
  avatarUrl: string | null;
  count: number;
  nextExpiry: Date;
};

/**
 * I coach con cui l'atleta ha sedute acquistate libere ma **nessun abbonamento
 * vivo**: sono quelli che la pagina «Abbonamenti» altrimenti non mostrerebbe.
 */
export async function getStandaloneCreditHolders(
  athleteUserId: number,
  coachUserIdsWithSubscription: number[]
): Promise<StandaloneCreditHolder[]> {
  const extras = await getAthleteExtraSessions(athleteUserId);
  const ids = [...extras.keys()].filter(
    (id) => !coachUserIdsWithSubscription.includes(id)
  );
  if (ids.length === 0) return [];
  const coaches = await db
    .select({
      userId: providerProfiles.userId,
      slug: providerProfiles.slug,
      name: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(providerProfiles)
    .leftJoin(profiles, eq(profiles.userId, providerProfiles.userId))
    .where(inArray(providerProfiles.userId, ids));
  return coaches.map((coach) => {
    const extra = extras.get(coach.userId)!;
    return {
      coachUserId: coach.userId,
      name: coach.name ?? 'Coach',
      slug: coach.slug,
      avatarUrl: coach.avatarUrl,
      count: extra.count,
      nextExpiry: extra.nextExpiry,
    };
  });
}

/** Come `getSingleSessionOffers`, ma per profilo coach (`provider_profiles.id`). */
export async function getSingleSessionOffersByProvider(
  providerIds: number[]
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (providerIds.length === 0) return result;
  const providers = await db
    .select({ id: providerProfiles.id, userId: providerProfiles.userId })
    .from(providerProfiles)
    .where(inArray(providerProfiles.id, providerIds));
  const offers = await getSingleSessionOffers(providers.map((p) => p.userId));
  for (const provider of providers) {
    const cents = offers.get(provider.userId);
    if (cents) result.set(provider.id, cents);
  }
  return result;
}

export type AthleteSingleSession = {
  id: number;
  coachUserId: number;
  coachName: string;
  coachSlug: string | null;
  coachAvatarUrl: string | null;
  kind: 'single' | 'extra';
  priceCents: number;
  grantedAt: Date;
  expiresAt: Date;
  state: CreditDisplayState;
  /** Quando è fissata, se `state === 'planned'` (o la data della seduta fatta). */
  scheduledFor: Date | null;
};

/**
 * Le sedute acquistate a parte da un atleta, con il loro stato: da pianificare
 * (con la scadenza), pianificate (con la data), fatte, scadute. Prima quelle
 * ancora utili, per scadenza; poi lo storico, dalla più recente.
 */
export async function listAthleteSingleSessions(
  athleteUserId: number
): Promise<AthleteSingleSession[]> {
  const rows = await db
    .select({
      id: sessionCredits.id,
      coachUserId: sessionCredits.coachUserId,
      kind: sessionCredits.kind,
      status: sessionCredits.status,
      priceCents: sessionCredits.priceCents,
      grantedAt: sessionCredits.grantedAt,
      expiresAt: sessionCredits.expiresAt,
      bookingStatus: bookings.status,
      scheduledFor: bookings.scheduledFor,
      coachName: profiles.displayName,
      coachSlug: providerProfiles.slug,
      coachAvatarUrl: profiles.avatarUrl,
    })
    .from(sessionCredits)
    .leftJoin(bookings, eq(bookings.id, sessionCredits.bookingId))
    .leftJoin(providerProfiles, eq(providerProfiles.userId, sessionCredits.coachUserId))
    .leftJoin(profiles, eq(profiles.userId, sessionCredits.coachUserId))
    .where(
      and(
        eq(sessionCredits.athleteUserId, athleteUserId),
        eq(sessionCredits.status, 'granted')
      )
    );

  const now = new Date();
  const items: AthleteSingleSession[] = [];
  for (const row of rows) {
    if (!row.grantedAt || !row.expiresAt) continue;
    const state = creditDisplayState(
      { status: row.status, expiresAt: row.expiresAt },
      row.bookingStatus,
      now
    );
    items.push({
      id: row.id,
      coachUserId: row.coachUserId,
      coachName: row.coachName ?? 'Coach',
      coachSlug: row.coachSlug,
      coachAvatarUrl: row.coachAvatarUrl,
      kind: row.kind === 'extra' ? 'extra' : 'single',
      priceCents: row.priceCents,
      grantedAt: row.grantedAt,
      expiresAt: row.expiresAt,
      state,
      scheduledFor:
        state === 'planned' || state === 'used' ? row.scheduledFor : null,
    });
  }

  const live = (item: AthleteSingleSession) =>
    item.state === 'available' || item.state === 'planned';
  return items.sort((a, b) =>
    live(a) !== live(b)
      ? live(a)
        ? -1
        : 1
      : live(a)
        ? a.expiresAt.getTime() - b.expiresAt.getTime()
        : b.grantedAt.getTime() - a.grantedAt.getTime()
  );
}

/**
 * Per quanti giorni vale una seduta acquistata a parte: parametro di sistema,
 * modificabile dal pannello admin. Una riga mancante o un valore non valido
 * danno il ripiego (60), mai un errore.
 */
export async function getSingleSessionValidityDays(): Promise<number> {
  return normalizeValidityDays(
    await getSystemConfigNumber(
      SINGLE_SESSION_VALIDITY_CONFIG_KEY,
      DEFAULT_SINGLE_SESSION_VALIDITY_DAYS
    )
  );
}

/**
 * Per la lista «I miei atleti» del coach: per ciascun atleta con un abbonamento
 * vivo o con sedute acquistate a parte, lo stato delle sedute. Poche letture
 * per tutta la lista (abbonamenti, prenotazioni, registro), poi i conteggi si
 * fanno in memoria con le stesse regole dell'atleta. Gli atleti senza niente
 * non compaiono nella mappa: per loro la lista resta com'era.
 */
export async function getCoachAthletesBilling(
  coachUserId: number,
  athleteUserIds: number[]
): Promise<Map<number, CoachAthleteBilling>> {
  const result = new Map<number, CoachAthleteBilling>();
  if (athleteUserIds.length === 0) return result;

  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, coachUserId))
    .limit(1);
  if (!provider) return result;

  const [subs, credits] = await Promise.all([
    db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.coachUserId, coachUserId),
          inArray(planSubscriptions.athleteUserId, athleteUserIds),
          inArray(planSubscriptions.status, ['active', 'past_due'])
        )
      )
      .orderBy(desc(planSubscriptions.createdAt)),
    db
      .select({
        athleteUserId: sessionCredits.athleteUserId,
        status: sessionCredits.status,
        expiresAt: sessionCredits.expiresAt,
        bookingStatus: bookings.status,
      })
      .from(sessionCredits)
      .leftJoin(bookings, eq(bookings.id, sessionCredits.bookingId))
      .where(
        and(
          eq(sessionCredits.coachUserId, coachUserId),
          inArray(sessionCredits.athleteUserId, athleteUserIds),
          eq(sessionCredits.status, 'granted')
        )
      ),
  ]);

  const subByAthlete = new Map<number, PlanSubscription>();
  for (const sub of subs) {
    if (!subByAthlete.has(sub.athleteUserId)) subByAthlete.set(sub.athleteUserId, sub);
  }

  // Le prenotazioni dei soli atleti con un abbonamento, nel periodo di ciascuno.
  // Una seduta pagata a parte non pesa sul piano (stessa regola dell'atleta).
  const withPeriod = [...subByAthlete.values()].filter(
    (sub) => sub.currentPeriodStart && sub.currentPeriodEnd
  );
  const bookingRows =
    withPeriod.length === 0
      ? []
      : await db
          .select({
            clientId: bookings.clientId,
            status: bookings.status,
            scheduledFor: bookings.scheduledFor,
          })
          .from(bookings)
          .leftJoin(sessionCredits, eq(sessionCredits.bookingId, bookings.id))
          .where(
            and(
              eq(bookings.providerId, provider.id),
              inArray(
                bookings.clientId,
                withPeriod.map((sub) => sub.athleteUserId)
              ),
              gte(
                bookings.scheduledFor,
                new Date(Math.min(...withPeriod.map((s) => s.currentPeriodStart!.getTime())))
              ),
              lt(
                bookings.scheduledFor,
                new Date(Math.max(...withPeriod.map((s) => s.currentPeriodEnd!.getTime())))
              ),
              isNull(sessionCredits.id)
            )
          );

  const now = new Date();
  const singlesByAthlete = new Map<
    number,
    { toPlan: number; planned: number; nextExpiry: Date | null }
  >();
  for (const credit of credits) {
    const state = creditDisplayState(
      { status: credit.status, expiresAt: credit.expiresAt },
      credit.bookingStatus,
      now
    );
    if (state !== 'available' && state !== 'planned') continue;
    const entry = singlesByAthlete.get(credit.athleteUserId) ?? {
      toPlan: 0,
      planned: 0,
      nextExpiry: null,
    };
    if (state === 'available') {
      entry.toPlan++;
      if (
        credit.expiresAt &&
        (!entry.nextExpiry || credit.expiresAt < entry.nextExpiry)
      ) {
        entry.nextExpiry = credit.expiresAt;
      }
    } else {
      entry.planned++;
    }
    singlesByAthlete.set(credit.athleteUserId, entry);
  }

  for (const athleteId of athleteUserIds) {
    const sub = subByAthlete.get(athleteId);
    const singles = singlesByAthlete.get(athleteId) ?? {
      toPlan: 0,
      planned: 0,
      nextExpiry: null,
    };
    if (!sub && singles.toPlan === 0 && singles.planned === 0) continue;
    result.set(athleteId, {
      plan: sub
        ? {
            name: sub.planName,
            sessionsPerMonth: sub.sessionsPerMonth,
            status: sub.status === 'past_due' ? 'past_due' : 'active',
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            periodEnd: sub.currentPeriodEnd,
            usage: sessionUsageForPeriod({
              sessionsPerMonth: sub.sessionsPerMonth,
              periodStart: sub.currentPeriodStart,
              periodEnd: sub.currentPeriodEnd,
              bookings: bookingRows.filter((row) => row.clientId === athleteId),
            }),
          }
        : null,
      singles,
    });
  }
  return result;
}

export type CoachAthleteBillingDetail = {
  billing: CoachAthleteBilling | null;
  subscription: {
    planName: string;
    monthlyPriceCents: number;
    status: 'active' | 'past_due';
    subscribedAt: Date | null;
  } | null;
  /** Tutte le sedute acquistate a parte da questo atleta con questo coach, dalla più recente. */
  singles: {
    id: number;
    kind: 'single' | 'extra';
    priceCents: number;
    grantedAt: Date;
    expiresAt: Date;
    state: CreditDisplayState;
    scheduledFor: Date | null;
  }[];
};

/**
 * Per la scheda di un atleta del coach: lo stesso stato della lista, più da
 * quando è abbonato e lo storico delle sedute acquistate a parte. Non si
 * inventa uno storico dei rinnovi: oggi non è registrato, e non lo si scrive
 * finché non lo è.
 */
export async function getCoachAthleteBillingDetail(
  coachUserId: number,
  athleteUserId: number
): Promise<CoachAthleteBillingDetail> {
  const [billing, [subscription], credits] = await Promise.all([
    getCoachAthletesBilling(coachUserId, [athleteUserId]),
    db
      .select()
      .from(planSubscriptions)
      .where(
        and(
          eq(planSubscriptions.coachUserId, coachUserId),
          eq(planSubscriptions.athleteUserId, athleteUserId),
          inArray(planSubscriptions.status, ['active', 'past_due'])
        )
      )
      .orderBy(desc(planSubscriptions.createdAt))
      .limit(1),
    db
      .select({
        id: sessionCredits.id,
        kind: sessionCredits.kind,
        status: sessionCredits.status,
        priceCents: sessionCredits.priceCents,
        grantedAt: sessionCredits.grantedAt,
        expiresAt: sessionCredits.expiresAt,
        bookingStatus: bookings.status,
        scheduledFor: bookings.scheduledFor,
      })
      .from(sessionCredits)
      .leftJoin(bookings, eq(bookings.id, sessionCredits.bookingId))
      .where(
        and(
          eq(sessionCredits.coachUserId, coachUserId),
          eq(sessionCredits.athleteUserId, athleteUserId),
          eq(sessionCredits.status, 'granted')
        )
      )
      .orderBy(desc(sessionCredits.grantedAt)),
  ]);

  const now = new Date();
  return {
    billing: billing.get(athleteUserId) ?? null,
    subscription: subscription
      ? {
          planName: subscription.planName,
          monthlyPriceCents: subscription.monthlyPriceCents,
          status: subscription.status === 'past_due' ? 'past_due' : 'active',
          subscribedAt: subscribedOn(subscription),
        }
      : null,
    singles: credits.flatMap((credit) => {
      if (!credit.grantedAt || !credit.expiresAt) return [];
      const state = creditDisplayState(
        { status: credit.status, expiresAt: credit.expiresAt },
        credit.bookingStatus,
        now
      );
      return [
        {
          id: credit.id,
          kind: credit.kind === 'extra' ? ('extra' as const) : ('single' as const),
          priceCents: credit.priceCents,
          grantedAt: credit.grantedAt,
          expiresAt: credit.expiresAt,
          state,
          scheduledFor:
            state === 'planned' || state === 'used' ? credit.scheduledFor : null,
        },
      ];
    }),
  };
}

/**
 * Apre il portale di Stripe in cui l'atleta cambia il metodo di pagamento del
 * suo abbonamento. Dal browser arriva solo l'id della riga: l'abbonamento deve
 * essere **dell'atleta che lo chiede** (un id altrui non apre il portale di un
 * altro), vivo, e collegato a un cliente Stripe.
 */
export async function startPaymentMethodPortal(params: {
  athleteUserId: number;
  subscriptionRowId: number;
}): Promise<Result<{ url: string }>> {
  const [sub] = await db
    .select({
      stripeCustomerId: planSubscriptions.stripeCustomerId,
      stripeAccountId: planSubscriptions.stripeAccountId,
    })
    .from(planSubscriptions)
    .where(
      and(
        eq(planSubscriptions.id, params.subscriptionRowId),
        eq(planSubscriptions.athleteUserId, params.athleteUserId),
        inArray(planSubscriptions.status, ['active', 'past_due'])
      )
    )
    .limit(1);
  if (!sub || !sub.stripeCustomerId) {
    return { ok: false, error: 'Abbonamento non trovato.' };
  }
  const base = getAppBaseUrl() ?? CANONICAL_APP_URL;
  const { url } = await createBillingPortalSession({
    connectedAccountId: sub.stripeAccountId,
    customerId: sub.stripeCustomerId,
    returnUrl: `${base}/dashboard/athlete/abbonamenti`,
  });
  return { ok: true, url };
}
