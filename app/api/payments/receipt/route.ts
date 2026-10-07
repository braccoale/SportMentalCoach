import 'server-only';
import { and, eq, or } from 'drizzle-orm';
import { getUser } from '@/lib/core/auth';
import { db } from '@/lib/db/drizzle';
import { planSubscriptions, sessionCredits } from '@/lib/db/schema';
import {
  latestSubscriptionReceiptUrl,
  paymentReceiptUrl,
} from '@/lib/payments/connect';

export const dynamic = 'force-dynamic';

/**
 * Apre la ricevuta di un pagamento, ospitata da Stripe sul conto del coach.
 *
 *   /api/payments/receipt?tipo=abbonamento&id=3
 *   /api/payments/receipt?tipo=seduta&id=7
 *
 * Non emettiamo né conserviamo ricevute: al clic si chiede a Stripe il
 * collegamento e si rimanda lì. Lo vede solo chi è parte del pagamento
 * (l'atleta che ha pagato o il coach che ha incassato): per tutti gli altri, e
 * per un id che non esiste, la risposta è la stessa 404.
 */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new Response('Non trovato', { status: 404 });

  const params = new URL(request.url).searchParams;
  const id = Number(params.get('id'));
  const tipo = params.get('tipo');
  if (!Number.isInteger(id) || id <= 0) {
    return new Response('Non trovato', { status: 404 });
  }

  try {
    let url: string | null = null;
    if (tipo === 'abbonamento') {
      const [row] = await db
        .select({
          accountId: planSubscriptions.stripeAccountId,
          subscriptionId: planSubscriptions.stripeSubscriptionId,
        })
        .from(planSubscriptions)
        .where(
          and(
            eq(planSubscriptions.id, id),
            or(
              eq(planSubscriptions.athleteUserId, user.id),
              eq(planSubscriptions.coachUserId, user.id)
            )
          )
        )
        .limit(1);
      if (row?.subscriptionId) {
        url = await latestSubscriptionReceiptUrl(row.accountId, row.subscriptionId);
      }
    } else if (tipo === 'seduta') {
      const [row] = await db
        .select({
          accountId: sessionCredits.stripeAccountId,
          paymentIntentId: sessionCredits.stripePaymentIntentId,
        })
        .from(sessionCredits)
        .where(
          and(
            eq(sessionCredits.id, id),
            or(
              eq(sessionCredits.athleteUserId, user.id),
              eq(sessionCredits.coachUserId, user.id)
            )
          )
        )
        .limit(1);
      if (row?.paymentIntentId) {
        url = await paymentReceiptUrl(row.accountId, row.paymentIntentId);
      }
    }

    if (!url) return new Response('Ricevuta non disponibile', { status: 404 });
    return Response.redirect(url, 302);
  } catch (error) {
    console.error('[payments] ricevuta non recuperata', {
      tipo,
      id,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    return new Response('Ricevuta non disponibile', { status: 502 });
  }
}
