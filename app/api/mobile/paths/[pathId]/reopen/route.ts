import { getApiUser } from '@/lib/auth/api-user';
import { reopenPath } from '@/lib/core/paths/path-store';
import type { PathRefusal } from '@/lib/core/paths/path-policy';

/**
 * Riapre un percorso chiuso.
 *
 * **Solo chi ha chiuso può riaprire.** Una prenotazione nuova non riapre da
 * sola: propone, e questa rotta è il gesto esplicito che la propria proposta
 * richiede. Riaprire per conto dell'altra parte rimetterebbe in circolo
 * contributi che qualcuno aveva deliberatamente fermato, senza dirglielo.
 */

/** Vedi la stessa funzione in `close/route.ts`: stesso motivo, stessa forma. */
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

  const result = await reopenPath({ pathId: id, actorUserId: user.id, now: new Date() });
  if (!result.ok) {
    return Response.json(
      { error: result.reason, message: result.message },
      { status: statusFor(result.reason as PathRefusal | 'NOT_FOUND') }
    );
  }
  return Response.json({ pathId: result.path.id, status: result.path.status });
}
