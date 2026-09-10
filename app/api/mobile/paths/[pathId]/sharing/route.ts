import { getApiUser } from '@/lib/auth/api-user';
import { setContributionSharing } from '@/lib/core/paths/path-store';
import type { PathRefusal } from '@/lib/core/paths/path-policy';

/**
 * Revoca o ripristina la condivisione dei propri contributi con il coach.
 *
 * **Solo dell'atleta.** È il livello C dei quattro del documento di
 * progetto: diverso dalla chiusura, non tocca lo stato del percorso e non
 * cancella niente. Il coach smette (o torna) a vedere ciò che l'atleta ha
 * scritto, passato e futuro.
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

  const body = (await request.json().catch(() => null)) as { shared?: unknown } | null;
  if (!body || typeof body.shared !== 'boolean') {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await setContributionSharing({
    pathId: id,
    actorUserId: user.id,
    shared: body.shared,
    now: new Date(),
  });
  if (!result.ok) {
    return Response.json(
      { error: result.reason, message: result.message },
      { status: statusFor(result.reason as PathRefusal | 'NOT_FOUND') }
    );
  }
  return Response.json({
    pathId: result.path.id,
    contributionsRevokedAt: result.path.contributionsRevokedAt?.toISOString() ?? null,
  });
}
