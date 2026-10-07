import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db/drizzle';
import {
  coachBillingProfiles,
  coachSessionPlans,
  planSubscriptions,
  sessionCredits,
  stripeWebhookEvents,
} from '@/lib/db/schema';
import { getSystemConfigNumber } from '@/lib/core/system-config';
import { notifyPaymentFailed } from './payment-failed-notify';
import { cancelUnpaidPeriodSessions } from './unpaid-period';
import { syncCoachStripeStatus } from './index';
import { shouldNotifyPaymentFailed } from './payment-failed-content';
import {
  notifySinglePurchased,
  notifySubscriptionEvent,
} from './billing-events-notify';
import { billingEventsForTransition } from './billing-events-content';
import { planToApplyFromMetadata } from './plan-change';
import {
  DEFAULT_SINGLE_SESSION_VALIDITY_DAYS,
  SINGLE_SESSION_VALIDITY_CONFIG_KEY,
  normalizeValidityDays,
  singleSessionExpiresAt,
} from './single-session';
import {
  nextPlanSubscriptionStatus,
  ownRowId,
  planSubscriptionStatusFromStripe,
  subscriptionUpdateFromStripe,
  type PlanSubscriptionStatus,
  type StripeSubscriptionLike,
} from './subscription-status';

/**
 * Gli eventi Stripe dei coach collegati.
 *
 * Qui, e solo qui, un abbonamento diventa attivo: tornare da Checkout non
 * prova il pagamento. Il gestore è fatto per essere ripetibile: Stripe può
 * inviare lo stesso evento più volte e fuori ordine.
 *
 * Un evento che non è nostro (un coach collegato incassa anche altro sul
 * proprio conto, e quegli eventi arrivano qui lo stesso) si ignora: ci si
 * riconosce dal segno che mettiamo sulle nostre sessioni e sui nostri
 * abbonamenti. Un evento che è nostro ma non trova la sua riga è invece un
 * guasto da ripetere, non da scartare.
 */

export type WebhookOutcome = 'processed' | 'ignored' | 'duplicate' | 'failed';

class RetryableError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function recordEvent(
  event: Stripe.Event
): Promise<{ proceed: boolean; rowId: number }> {
  const [inserted] = await db
    .insert(stripeWebhookEvents)
    .values({
      stripeEventId: event.id,
      eventType: event.type,
      stripeAccountId: event.account ?? null,
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.stripeEventId })
    .returning({ id: stripeWebhookEvents.id });
  if (inserted) return { proceed: true, rowId: inserted.id };

  const [existing] = await db
    .select({ id: stripeWebhookEvents.id, status: stripeWebhookEvents.status })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.stripeEventId, event.id))
    .limit(1);
  if (!existing) return { proceed: true, rowId: -1 };
  // Già gestito: si risponde bene senza rifare niente.
  if (existing.status === 'processed' || existing.status === 'ignored') {
    return { proceed: false, rowId: existing.id };
  }
  return { proceed: true, rowId: existing.id };
}

async function closeEvent(
  rowId: number,
  status: 'processed' | 'ignored' | 'failed',
  errorCode?: string
) {
  if (rowId < 0) return;
  await db
    .update(stripeWebhookEvents)
    .set({
      status,
      attempts: sql`${stripeWebhookEvents.attempts} + 1`,
      lastErrorCode: errorCode ?? null,
      processedAt: status === 'failed' ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stripeWebhookEvents.id, rowId));
}

async function applyStatus(
  rowId: number,
  accountId: string,
  incoming: PlanSubscriptionStatus,
  extra: Partial<typeof planSubscriptions.$inferInsert> = {},
  confirmedAt?: Date,
  eventId?: string
) {
  const [row] = await db
    .select({
      id: planSubscriptions.id,
      status: planSubscriptions.status,
      stripeAccountId: planSubscriptions.stripeAccountId,
      subscribedAt: planSubscriptions.subscribedAt,
      cancelAtPeriodEnd: planSubscriptions.cancelAtPeriodEnd,
    })
    .from(planSubscriptions)
    .where(eq(planSubscriptions.id, rowId))
    .limit(1);
  // La riga deve appartenere all'account che ha mandato l'evento: un evento di
  // un altro coach non può toccare l'abbonamento di questo.
  if (!row || row.stripeAccountId !== accountId) {
    throw new RetryableError('ROW_NOT_FOUND');
  }

  const next = nextPlanSubscriptionStatus(
    row.status as PlanSubscriptionStatus,
    incoming
  );
  // La data di sottoscrizione si scrive la prima volta che l'abbonamento
  // diventa vivo, e poi non si tocca più: un evento ripetuto non la sposta.
  const stampSubscribedAt =
    !row.subscribedAt && confirmedAt && (next === 'active' || next === 'past_due')
      ? { subscribedAt: confirmedAt }
      : {};
  try {
    await db
      .update(planSubscriptions)
      .set({ ...extra, ...stampSubscribedAt, status: next, updatedAt: new Date() })
      .where(and(eq(planSubscriptions.id, rowId)));
  } catch (error) {
    // L'indice parziale rifiuta un secondo abbonamento vivo per la stessa
    // coppia: è un doppio acquisto, da rimborsare a mano. Si segnala forte.
    if ((error as { code?: string })?.code === '23505') {
      console.error('[payments] DOPPIO ABBONAMENTO ATTIVO: da rimborsare a mano', {
        subscriptionRowId: rowId,
        accountId,
      });
      throw new RetryableError('DUPLICATE_ACTIVE');
    }
    throw error;
  }

  // L'avviso parte quando l'abbonamento DIVENTA «in ritardo», non a ogni
  // evento che lo trova già così (vedi `shouldNotifyPaymentFailed`). Non
  // solleva: una mail che non parte non deve far ripetere l'evento a Stripe.
  if (shouldNotifyPaymentFailed(row.status, next)) {
    // Un periodo non pagato non ha sedute: quelle già fissate si annullano e
    // l'avviso dice quante. Il guasto qui non deve far perdere l'avviso.
    let cancelled = 0;
    try {
      cancelled = await cancelUnpaidPeriodSessions(rowId);
    } catch (error) {
      console.error('[payments] sedute del periodo non pagato non annullate', {
        subscriptionId: rowId,
        reason: error instanceof Error ? error.message : 'sconosciuto',
      });
    }
    await notifyPaymentFailed(rowId, cancelled);
  }

  // Le conferme di ciclo di vita: solo ciò che è cambiato davvero rispetto a
  // quanto già sapevamo, quindi un evento ripetuto o fuori ordine non avvisa
  // due volte (e la chiave del registro è l'ultima difesa).
  const events = billingEventsForTransition({
    previousStatus: row.status,
    nextStatus: next,
    previousCancelAtPeriodEnd: row.cancelAtPeriodEnd,
    nextCancelAtPeriodEnd: extra.cancelAtPeriodEnd ?? row.cancelAtPeriodEnd,
    firstConfirmation: Object.keys(stampSubscribedAt).length > 0,
  });
  for (const event of events) {
    const once = event === 'subscription_started' || event === 'subscription_ended';
    await notifySubscriptionEvent({
      event,
      subscriptionId: rowId,
      // Cominciato e terminato accadono una volta nella vita; annullare e
      // riattivare il rinnovo possono ripetersi, e ogni passaggio è un evento.
      scope: once || !eventId ? `sub${rowId}` : `sub${rowId}-${eventId}`,
    });
  }
}

/**
 * Una seduta acquistata a parte diventa prenotabile solo qui, a pagamento
 * incassato. Ripetibile: una riga già concessa non si tocca, quindi la
 * scadenza non si sposta se Stripe rimanda l'evento. La durata è il parametro
 * di sistema `BILLING_SINGLE_SESSION_VALIDITY_DAYS` letto adesso: cambiarlo
 * non tocca le sedute già concesse, ognuna ha la sua scadenza scritta.
 */
async function onSessionPurchased(
  session: Stripe.Checkout.Session,
  accountId: string
): Promise<'processed' | 'ignored'> {
  const raw = session.metadata?.kaipai_session_credit_id;
  if (!raw || !/^\d{1,9}$/.test(raw)) return 'ignored';
  const creditId = Number(raw);
  if (session.payment_status !== 'paid') return 'processed';

  const [row] = await db
    .select({
      id: sessionCredits.id,
      status: sessionCredits.status,
      stripeAccountId: sessionCredits.stripeAccountId,
    })
    .from(sessionCredits)
    .where(eq(sessionCredits.id, creditId))
    .limit(1);
  if (!row || row.stripeAccountId !== accountId) {
    throw new RetryableError('ROW_NOT_FOUND');
  }
  if (row.status !== 'pending') return 'processed';

  const grantedAt = new Date();
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  await db
    .update(sessionCredits)
    .set({
      status: 'granted',
      grantedAt,
      expiresAt: singleSessionExpiresAt(
        grantedAt,
        normalizeValidityDays(
          await getSystemConfigNumber(
            SINGLE_SESSION_VALIDITY_CONFIG_KEY,
            DEFAULT_SINGLE_SESSION_VALIDITY_DAYS
          )
        )
      ),
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      updatedAt: grantedAt,
    })
    .where(and(eq(sessionCredits.id, creditId), eq(sessionCredits.status, 'pending')));
  // Solo a concessione appena avvenuta (il ramo sopra esce se già concessa).
  await notifySinglePurchased(creditId);
  return 'processed';
}

async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
  accountId: string,
  eventId: string
): Promise<'processed' | 'ignored'> {
  if (session.mode === 'payment') return onSessionPurchased(session, accountId);
  if (session.mode !== 'subscription') return 'ignored';
  const rowId = ownRowId(session.metadata, session.client_reference_id);
  if (rowId === null) return 'ignored';

  // Pagamento non ancora incassato (metodi asincroni): si aspetta l'evento
  // dell'abbonamento, che dirà `active` solo a pagamento riuscito.
  if (session.payment_status !== 'paid') return 'processed';

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id ?? null;

  await applyStatus(rowId, accountId, 'active', {
    stripeCheckoutSessionId: session.id,
    ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  }, new Date(session.created * 1000), eventId);
  return 'processed';
}

/**
 * Il cambio piano programmato è arrivato: Stripe ha fatto partire la fase del
 * piano nuovo e l'abbonamento porta il segno `kaipai_plan_id`. Si riscrive la
 * fotografia della riga (nome, sedute, prezzo) e si azzera il cambio in
 * attesa. Il piano deve essere dello stesso coach: un segno che punta altrove
 * si ignora.
 */
async function planChangeFromSubscription(
  rowId: number,
  metadata: Record<string, string> | null | undefined
): Promise<Partial<typeof planSubscriptions.$inferInsert>> {
  const [row] = await db
    .select({ planId: planSubscriptions.planId, coachUserId: planSubscriptions.coachUserId })
    .from(planSubscriptions)
    .where(eq(planSubscriptions.id, rowId))
    .limit(1);
  if (!row) return {};
  const newPlanId = planToApplyFromMetadata(metadata, row.planId);
  if (newPlanId === null) return {};
  const [plan] = await db
    .select()
    .from(coachSessionPlans)
    .where(eq(coachSessionPlans.id, newPlanId))
    .limit(1);
  if (!plan || plan.coachUserId !== row.coachUserId) return {};
  return {
    planId: plan.id,
    planName: plan.name,
    sessionsPerMonth: plan.sessionsPerMonth,
    monthlyPriceCents: plan.monthlyPriceCents,
    pendingPlanId: null,
    pendingScheduleId: null,
  };
}

async function onSubscriptionChanged(
  subscription: Stripe.Subscription,
  accountId: string,
  deleted: boolean,
  eventId: string
): Promise<'processed' | 'ignored'> {
  const rowId = ownRowId(subscription.metadata);
  if (rowId === null) return 'ignored';

  const update = subscriptionUpdateFromStripe(
    subscription as unknown as StripeSubscriptionLike
  );
  const incoming = deleted
    ? 'canceled'
    : planSubscriptionStatusFromStripe(subscription.status);

  const planChange = deleted
    ? {}
    : await planChangeFromSubscription(rowId, subscription.metadata);

  await applyStatus(rowId, accountId, incoming, {
    ...planChange,
    stripeSubscriptionId: subscription.id,
    ...(typeof subscription.customer === 'string'
      ? { stripeCustomerId: subscription.customer }
      : {}),
    currentPeriodStart: update.currentPeriodStart,
    currentPeriodEnd: update.currentPeriodEnd,
    cancelAtPeriodEnd: update.cancelAtPeriodEnd,
    canceledAt: deleted ? new Date() : update.canceledAt,
  }, subscription.start_date ? new Date(subscription.start_date * 1000) : undefined, eventId);
  return 'processed';
}

/**
 * L'account del coach è cambiato su Stripe (verifica completata, documento
 * richiesto, incassi sospesi…): si rilegge lo stato da Stripe e lo si salva, in
 * modo che la pagina Pagamenti e la regola «può incassare» non aspettino che il
 * coach riapra la pagina. Si rilegge invece di fidarsi del contenuto
 * dell'evento: la forma dell'account cambia con la versione dell'API, e lo
 * stato che conta è quello che legge `syncCoachStripeStatus`.
 */
async function onAccountUpdated(accountId: string): Promise<'processed' | 'ignored'> {
  const [profile] = await db
    .select({ coachUserId: coachBillingProfiles.coachUserId })
    .from(coachBillingProfiles)
    .where(eq(coachBillingProfiles.stripeAccountId, accountId))
    .limit(1);
  // Un account che non è di un nostro coach non è affar nostro.
  if (!profile) return 'ignored';
  try {
    await syncCoachStripeStatus(profile.coachUserId);
  } catch {
    throw new RetryableError('ACCOUNT_SYNC_FAILED');
  }
  return 'processed';
}

/** Elabora un evento già verificato nella firma. Non solleva: riporta l'esito. */
export async function processStripeEvent(
  event: Stripe.Event
): Promise<WebhookOutcome> {
  const { proceed, rowId } = await recordEvent(event);
  if (!proceed) return 'duplicate';

  // Gli eventi dei coach collegati portano `account`; senza, non sono nostri.
  const accountId = event.account;
  if (!accountId) {
    await closeEvent(rowId, 'ignored');
    return 'ignored';
  }

  try {
    let outcome: 'processed' | 'ignored' = 'ignored';
    switch (event.type) {
      case 'checkout.session.completed':
        outcome = await onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          accountId,
          event.id
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        outcome = await onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
          accountId,
          false,
          event.id
        );
        break;
      case 'customer.subscription.deleted':
        outcome = await onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
          accountId,
          true,
          event.id
        );
        break;
      case 'account.updated':
        outcome = await onAccountUpdated(accountId);
        break;
      default:
        outcome = 'ignored';
    }
    await closeEvent(rowId, outcome);
    return outcome;
  } catch (error) {
    const code =
      error instanceof RetryableError ? error.code : 'PROCESSING_ERROR';
    console.error('[payments] evento Stripe non elaborato', {
      eventId: event.id,
      type: event.type,
      code,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    await closeEvent(rowId, 'failed', code);
    return 'failed';
  }
}
