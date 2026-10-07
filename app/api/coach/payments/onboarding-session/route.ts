import 'server-only';
import { getUser } from '@/lib/db/queries';
import { hasRole } from '@/lib/core/auth';
import {
  coachCanEditPlans,
  createCoachOnboardingSession,
  getCoachPaymentsState,
} from '@/lib/core/billing';
import { StripeConnectError } from '@/lib/payments/connect';

export const dynamic = 'force-dynamic';

/**
 * Apre la verifica d'identità incorporata del coach: crea (una volta) il suo
 * account Stripe e restituisce il segreto di sessione per il componente.
 *
 * Solo per un coach con i pagamenti attivati dall'admin: nascondere il
 * pulsante non è un cancello, questo sì.
 */
export async function POST() {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { code: 'UNAUTHENTICATED', error: 'Non autenticato.' },
      { status: 401 }
    );
  }
  if (!(await hasRole(user.id, 'coach'))) {
    return Response.json(
      { code: 'FORBIDDEN', error: 'Solo i coach possono farlo.' },
      { status: 403 }
    );
  }
  if (!coachCanEditPlans(await getCoachPaymentsState(user.id))) {
    return Response.json(
      { code: 'PAYMENTS_OFF', error: 'I pagamenti non sono attivi per il tuo profilo.' },
      { status: 403 }
    );
  }

  try {
    const result = await createCoachOnboardingSession(user.id);
    if (!result.ok) {
      return Response.json({ code: 'PAYMENTS_OFF', error: result.error }, { status: 403 });
    }
    return Response.json({ clientSecret: result.clientSecret });
  } catch (error) {
    // Il motivo resta nei log del server; al coach si dice solo che si può riprovare.
    console.error('[payments] sessione di verifica non creata', {
      coachUserId: user.id,
      code: error instanceof StripeConnectError ? error.code : 'UNKNOWN',
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    return Response.json(
      {
        code: 'STRIPE_UNAVAILABLE',
        error: 'Non riusciamo a collegarci a Stripe in questo momento. Riprova tra poco.',
      },
      { status: 502 }
    );
  }
}
