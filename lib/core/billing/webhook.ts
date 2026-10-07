import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db/drizzle';
import { planSubscriptions, sessionCredits, stripeWebhookEvents } from '@/lib/db/schema';
import { getSystemConfigNumber } from '@/lib/core/system-config';
import { notifyPaymentFailed } from './payment-failed-notify';
import { shouldNotifyPaymentFailed } from './payment-failed-content';
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
  confirmedAt?: Date
) {
  const [row] = await db
    .select({
      id: planSubscriptions.id,
      status: planSubscriptions.status,
      stripeAccountId: planSubscriptions.stripeAccountId,
      subscribedAt: planSubscriptions.subscribedAt,
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
    await notifyPaymentFailed(rowId);
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
  return 'processed';
}

async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
  accountId: string
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
  }, new Date(session.created * 1000));
  return 'processed';
}

async function onSubscriptionChanged(
  subscription: Stripe.Subscription,
  accountId: string,
  deleted: boolean
): Promise<'processed' | 'ignored'> {
  const rowId = ownRowId(subscription.metadata);
  if (rowId === null) return 'ignored';

  const update = subscriptionUpdateFromStripe(
    subscription as unknown as StripeSubscriptionLike
  );
  const incoming = deleted
    ? 'canceled'
    : planSubscriptionStatusFromStripe(subscription.status);

  await applyStatus(rowId, accountId, incoming, {
    stripeSubscriptionId: subscription.id,
    ...(typeof subscription.customer === 'string'
      ? { stripeCustomerId: subscription.customer }
      : {}),
    currentPeriodStart: update.currentPeriodStart,
    currentPeriodEnd: update.currentPeriodEnd,
    cancelAtPeriodEnd: update.cancelAtPeriodEnd,
    canceledAt: deleted ? new Date() : update.canceledAt,
  }, subscription.start_date ? new Date(subscription.start_date * 1000) : undefined);
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
          accountId
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        outcome = await onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
          accountId,
          false
        );
        break;
      case 'customer.subscription.deleted':
        outcome = await onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
          accountId,
          true
        );
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
