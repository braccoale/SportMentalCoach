import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { planSubscriptions, profiles, sessionCredits, users } from '@/lib/db/schema';
import { sendBillingEventEmail } from '@/lib/core/email';
import {
  claimDelivery,
  markDeliveryFailed,
  markDeliverySent,
  markDeliverySkipped,
} from '@/lib/core/email/deliveries';
import { resolveDisplayName } from '@/lib/core/format';
import { formatEuroCents } from './session-plan';
import { formatLongDateRome } from './subscription-status';
import {
  billingEventIdempotencyKey,
  billingEventTemplateKey,
  buildBillingEventContent,
  type BillingEvent,
  type BillingRole,
} from './billing-events-content';

/**
 * Manda le email del ciclo di vita di un acquisto a atleta e coach.
 *
 * Non solleva mai: un'email che non parte non deve far fallire il webhook (che
 * Stripe ripeterebbe) né impedire di registrare il pagamento. Ogni invio passa
 * dal registro delle consegne: la chiave lo rende ripetibile senza doppioni, e
 * un esito `failed` o `skipped` resta leggibile in
 * `notification_email_deliveries`. Nel log: id, ruolo, esito — mai l'indirizzo.
 */

type Person = {
  id: number;
  email: string;
  isDemo: boolean;
  displayName: string;
};

async function loadPerson(userId: number): Promise<Person | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      isDemo: users.isDemo,
      displayName: profiles.displayName,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    isDemo: row.isDemo,
    displayName:
      row.displayName ??
      resolveDisplayName(
        [row.name, row.lastName].filter(Boolean).join(' ') || null,
        row.email
      ),
  };
}

type Facts = {
  athleteUserId: number;
  coachUserId: number;
  planName: string | null;
  amountCents: number;
  sessionsPerMonth: number | null;
  dateLabel: string | null;
  validUntilLabel: string | null;
};

async function sendToRoles(params: {
  event: BillingEvent;
  roles: BillingRole[];
  scope: string;
  facts: Facts;
}): Promise<void> {
  const { event, roles, scope, facts } = params;
  const [athlete, coach] = await Promise.all([
    loadPerson(facts.athleteUserId),
    loadPerson(facts.coachUserId),
  ]);
  if (!athlete || !coach) return;

  for (const role of roles) {
    const person = role === 'athlete' ? athlete : coach;
    const counterpart = role === 'athlete' ? coach : athlete;
    try {
      const claim = await claimDelivery({
        idempotencyKey: billingEventIdempotencyKey({
          event,
          role,
          recipientUserId: person.id,
          scope,
        }),
        recipientEmail: person.email,
        recipientUserId: person.id,
        templateKey: billingEventTemplateKey(event, role),
      });
      // Già gestita (inviata, in corso o saltata): niente doppioni.
      if (!claim) continue;

      // Un account di prova non riceve posta vera.
      if (person.isDemo) {
        await markDeliverySkipped(claim.id, 'demo_user');
        continue;
      }

      const content = buildBillingEventContent({
        event,
        role,
        recipientName: person.displayName,
        counterpartName: counterpart.displayName,
        athleteUserId: athlete.id,
        planName: facts.planName,
        amountLabel: formatEuroCents(facts.amountCents),
        dateLabel: facts.dateLabel,
        validUntilLabel: facts.validUntilLabel,
        sessionsPerMonth: facts.sessionsPerMonth,
      });
      const sent = await sendBillingEventEmail({ to: person.email, content });
      if (sent.ok) await markDeliverySent(claim.id, sent.messageId);
      else if (sent.skipped) await markDeliverySkipped(claim.id, sent.reason);
      else await markDeliveryFailed(claim.id, sent.error);
    } catch (error) {
      console.error('[payments] email di ciclo non inviata', {
        event,
        role,
        scope,
        reason: error instanceof Error ? error.message : 'sconosciuto',
      });
    }
  }
}

/**
 * Evento di un abbonamento. `scope` identifica il fatto (vedi
 * `billingEventIdempotencyKey`); per il promemoria si passa `roles: ['athlete']`.
 */
export async function notifySubscriptionEvent(params: {
  event: BillingEvent;
  subscriptionId: number;
  scope: string;
  roles?: BillingRole[];
}): Promise<void> {
  try {
    const [sub] = await db
      .select({
        athleteUserId: planSubscriptions.athleteUserId,
        coachUserId: planSubscriptions.coachUserId,
        planName: planSubscriptions.planName,
        sessionsPerMonth: planSubscriptions.sessionsPerMonth,
        monthlyPriceCents: planSubscriptions.monthlyPriceCents,
        currentPeriodEnd: planSubscriptions.currentPeriodEnd,
      })
      .from(planSubscriptions)
      .where(eq(planSubscriptions.id, params.subscriptionId))
      .limit(1);
    if (!sub) return;
    await sendToRoles({
      event: params.event,
      roles: params.roles ?? ['athlete', 'coach'],
      scope: params.scope,
      facts: {
        athleteUserId: sub.athleteUserId,
        coachUserId: sub.coachUserId,
        planName: sub.planName,
        amountCents: sub.monthlyPriceCents,
        sessionsPerMonth: sub.sessionsPerMonth,
        dateLabel: sub.currentPeriodEnd
          ? formatLongDateRome(sub.currentPeriodEnd)
          : null,
        validUntilLabel: null,
      },
    });
  } catch (error) {
    console.error('[payments] email di ciclo: lettura non riuscita', {
      event: params.event,
      subscriptionId: params.subscriptionId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  }
}

/** Seduta singola acquistata: conferma all'atleta e avviso al coach. */
export async function notifySinglePurchased(creditId: number): Promise<void> {
  try {
    const [credit] = await db
      .select({
        athleteUserId: sessionCredits.athleteUserId,
        coachUserId: sessionCredits.coachUserId,
        priceCents: sessionCredits.priceCents,
        expiresAt: sessionCredits.expiresAt,
      })
      .from(sessionCredits)
      .where(eq(sessionCredits.id, creditId))
      .limit(1);
    if (!credit) return;
    await sendToRoles({
      event: 'single_purchased',
      roles: ['athlete', 'coach'],
      scope: `credit${creditId}`,
      facts: {
        athleteUserId: credit.athleteUserId,
        coachUserId: credit.coachUserId,
        planName: null,
        amountCents: credit.priceCents,
        sessionsPerMonth: null,
        dateLabel: null,
        validUntilLabel: credit.expiresAt
          ? formatLongDateRome(credit.expiresAt)
          : null,
      },
    });
  } catch (error) {
    console.error('[payments] email di acquisto: lettura non riuscita', {
      creditId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  }
}
