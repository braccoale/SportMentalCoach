import 'server-only';
import { getUser } from '@/lib/db/queries';
import { hasRole } from '@/lib/core/auth';
import { createCoachDashboardSession } from '@/lib/core/billing';
import { StripeConnectError } from '@/lib/payments/connect';

export const dynamic = 'force-dynamic';

/**
 * Segreto di sessione per la sezione Incassi (pagamenti ricevuti, bonifici,
 * saldo). Il controllo vero è qui: `createCoachDashboardSession` risponde solo
 * a un coach con la verifica completata, qualunque cosa mostri la pagina.
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

  try {
    const result = await createCoachDashboardSession(user.id);
    if (!result.ok) {
      return Response.json({ code: 'NOT_ACTIVE', error: result.error }, { status: 403 });
    }
    return Response.json({ clientSecret: result.clientSecret });
  } catch (error) {
    console.error('[payments] sessione incassi non creata', {
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
