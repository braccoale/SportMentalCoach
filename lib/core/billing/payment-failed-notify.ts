import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { planSubscriptions, profiles, users } from '@/lib/db/schema';
import { sendPaymentFailedEmail } from '@/lib/core/email';
import {
  claimDelivery,
  markDeliveryFailed,
  markDeliverySent,
  markDeliverySkipped,
} from '@/lib/core/email/deliveries';
import { resolveDisplayName } from '@/lib/core/format';
import { formatEuroCents } from './session-plan';
import {
  buildPaymentFailedContent,
  paymentFailedIdempotencyKey,
  type PaymentFailedRole,
} from './payment-failed-content';
import { formatLongDateRome } from './subscription-status';

/**
 * Avvisa atleta e coach che il rinnovo di un abbonamento non è andato a buon
 * fine. Si chiama dal webhook **nel momento in cui** l'abbonamento diventa «in
 * ritardo» (`shouldNotifyPaymentFailed`).
 *
 * Non solleva mai: un'email che non parte non deve far fallire il webhook (che
 * Stripe ripeterebbe) né impedire di registrare lo stato del pagamento. Ogni
 * invio passa dal registro: la chiave lo rende ripetibile senza doppioni, e un
 * esito `failed` o `skipped` resta visibile in `notification_email_deliveries`
 * («perché non l'ho ricevuta?» ha una risposta). Nel log: id, ruolo, esito —
 * mai l'indirizzo.
 */
export async function notifyPaymentFailed(subscriptionId: number): Promise<void> {
  try {
    const [sub] = await db
      .select({
        athleteUserId: planSubscriptions.athleteUserId,
        coachUserId: planSubscriptions.coachUserId,
        planName: planSubscriptions.planName,
        monthlyPriceCents: planSubscriptions.monthlyPriceCents,
        currentPeriodEnd: planSubscriptions.currentPeriodEnd,
      })
      .from(planSubscriptions)
      .where(eq(planSubscriptions.id, subscriptionId))
      .limit(1);
    if (!sub) return;

    const people = await Promise.all(
      [sub.athleteUserId, sub.coachUserId].map(async (userId) => {
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
        return row ?? null;
      })
    );
    const [athlete, coach] = people;
    if (!athlete || !coach) return;

    const nameOf = (person: NonNullable<typeof athlete>) =>
      person.displayName ??
      resolveDisplayName(
        [person.name, person.lastName].filter(Boolean).join(' ') || null,
        person.email
      );

    const recipients: {
      role: PaymentFailedRole;
      person: NonNullable<typeof athlete>;
      counterpart: NonNullable<typeof athlete>;
    }[] = [
      { role: 'athlete', person: athlete, counterpart: coach },
      { role: 'coach', person: coach, counterpart: athlete },
    ];

    for (const { role, person, counterpart } of recipients) {
      const idempotencyKey = paymentFailedIdempotencyKey({
        role,
        recipientUserId: person.id,
        subscriptionId,
        periodEnd: sub.currentPeriodEnd,
      });
      try {
        const claim = await claimDelivery({
          idempotencyKey,
          recipientEmail: person.email,
          recipientUserId: person.id,
          templateKey: `payment_failed_${role}`,
        });
        // Già gestita (inviata, in corso o saltata): niente doppioni.
        if (!claim) continue;

        // Un account di prova non riceve posta vera.
        if (person.isDemo) {
          await markDeliverySkipped(claim.id, 'demo_user');
          continue;
        }

        const content = buildPaymentFailedContent({
          role,
          recipientName: nameOf(person),
          counterpartName: nameOf(counterpart),
          athleteUserId: athlete.id,
          planName: sub.planName,
          amountLabel: formatEuroCents(sub.monthlyPriceCents),
          periodEndLabel: sub.currentPeriodEnd
            ? formatLongDateRome(sub.currentPeriodEnd)
            : null,
        });
        const sent = await sendPaymentFailedEmail({ to: person.email, content });
        if (sent.ok) {
          await markDeliverySent(claim.id, sent.messageId);
        } else if (sent.skipped) {
          await markDeliverySkipped(claim.id, sent.reason);
        } else {
          await markDeliveryFailed(claim.id, sent.error);
        }
      } catch (error) {
        console.error('[payments] email di pagamento fallito non inviata', {
          subscriptionId,
          role,
          reason: error instanceof Error ? error.message : 'sconosciuto',
        });
      }
    }
  } catch (error) {
    console.error('[payments] email di pagamento fallito: lettura non riuscita', {
      subscriptionId,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
  }
}
