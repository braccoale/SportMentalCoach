import { getApiUser } from '@/lib/auth/api-user';
import { setCommitmentPause } from '@/lib/core/ai-session-notes/commitment-attempts-store';

/**
 * Mette in pausa un'azione, o la riprende.
 *
 * Due gesti espliciti, `{ "paused": true }` e `{ "paused": false }`, con un
 * motivo facoltativo. La pausa **non** è una conclusione: non tocca lo stato
 * dell'azione, non tocca l'obiettivo del percorso, e non cancella nessuna delle
 * prove già registrate. In v1 chiudere un'azione resta del coach.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ commitmentId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { commitmentId } = await params;
  const id = Number(commitmentId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'invalid_commitment' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    paused?: unknown;
    reason?: unknown;
  } | null;
  if (!body || typeof body.paused !== 'boolean') {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await setCommitmentPause({
    commitmentId: id,
    athleteUserId: user.id,
    paused: body.paused,
    reason: body.reason,
    now: new Date(),
  });

  if (!result.ok) {
    return Response.json(
      { error: result.reason, message: result.message },
      { status: result.status }
    );
  }
  return Response.json(result.value);
}
