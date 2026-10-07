import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { bookings, planSubscriptions, providerProfiles } from '@/lib/db/schema';

/**
 * Un rinnovo non pagato non ha sedute.
 *
 * Quando l'abbonamento diventa «in ritardo» il periodo nuovo è già cominciato
 * (Stripe lo avanza quando emette la fattura) ma non è stato pagato: le sedute
 * del piano fissate da quell'istante in poi si annullano in automatico, e
 * l'avviso a atleta e coach dice quante. Restano le sedute del periodo già
 * pagato, quelle pagate a parte (hanno il loro registro) e quelle fatte.
 *
 * L'annullo è **di sistema**: nessun autore (`updated_by` nullo) e mai
 * tardivo, quindi non consuma niente (`late-cancellation.ts`). Idempotente: una
 * seconda corsa non trova più niente da annullare.
 *
 * Restituisce quante sedute ha annullato.
 */
export async function cancelUnpaidPeriodSessions(
  subscriptionId: number
): Promise<number> {
  const [sub] = await db
    .select({
      athleteUserId: planSubscriptions.athleteUserId,
      coachUserId: planSubscriptions.coachUserId,
      status: planSubscriptions.status,
      currentPeriodStart: planSubscriptions.currentPeriodStart,
    })
    .from(planSubscriptions)
    .where(eq(planSubscriptions.id, subscriptionId))
    .limit(1);
  // Senza un periodo certo non si annulla niente: meglio una seduta di troppo
  // che una cancellata per un'ipotesi.
  if (!sub || sub.status !== 'past_due' || !sub.currentPeriodStart) return 0;

  const [provider] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, sub.coachUserId))
    .limit(1);
  if (!provider) return 0;

  const now = new Date();
  const cancelled = await db
    .update(bookings)
    .set({
      status: 'cancelled',
      lateCancellation: false,
      updatedAt: now,
      updatedBy: null,
    })
    .where(
      and(
        eq(bookings.clientId, sub.athleteUserId),
        eq(bookings.providerId, provider.id),
        inArray(bookings.status, ['requested', 'accepted']),
        gte(bookings.scheduledFor, sub.currentPeriodStart),
        // Una seduta pagata a parte non dipende dall'abbonamento.
        sql`not exists (select 1 from session_credits c where c.booking_id = ${bookings.id})`
      )
    )
    .returning({ id: bookings.id });
  return cancelled.length;
}
