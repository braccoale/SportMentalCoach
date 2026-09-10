import { getApiUser } from '@/lib/auth/api-user';
import { closePath } from '@/lib/core/paths/path-store';
import type { PathRefusal } from '@/lib/core/paths/path-policy';

/**
 * Chiude un percorso.
 *
 * Lo può chiedere sia il coach sia l'atleta: `closePath` verifica che chi
 * chiama sia una delle due persone del percorso, e con una sessione futura
 * ancora accettata rifiuta invece di disdirla al posto di chi la doveva
 * annullare esplicitamente. Chiudere non cancella niente: lo storico dei
 * contributi resta leggibile a entrambi.
 */

/**
 * Il rifiuto del dominio, tradotto in uno stato HTTP — esplicitamente, motivo
 * per motivo. Una mappa generica con un ramo "tutto il resto è 409" ha già
 * dato un 409 a un rifiuto che era invece un 403 (`NOT_THE_CLOSER`, sulla
 * rotta di riapertura): un elenco chiuso, non un ternario a cascata, è il modo
 * di non ripetere quell'errore qui.
 */
function statusFor(reason: PathRefusal | 'NOT_FOUND'): number {
  switch (reason) {
    case 'NOT_FOUND':
      return 404;
    case 'NOT_A_PARTICIPANT':
    case 'NOT_THE_CLOSER':
      return 403;
    case 'PATH_CLOSED':
    case 'PATH_ALREADY_ACTIVE':
    case 'CONTRIBUTIONS_REVOKED':
    case 'FUTURE_BOOKING_EXISTS':
      return 409;
    case 'SAME_PERSON':
      return 400;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pathId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { pathId } = await params;
  const id = Number(pathId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'invalid_path' }, { status: 400 });
  }

  const result = await closePath({ pathId: id, actorUserId: user.id, now: new Date() });
  if (!result.ok) {
    return Response.json(
      { error: result.reason, message: result.message },
      { status: statusFor(result.reason as PathRefusal | 'NOT_FOUND') }
    );
  }
  return Response.json({ pathId: result.path.id, status: result.path.status });
}
