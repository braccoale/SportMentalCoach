import { getApiUser } from '@/lib/auth/api-user';
import { editAttempt } from '@/lib/core/ai-session-notes/commitment-attempts-store';

/**
 * Corregge una prova già scritta.
 *
 * **Sostituisce il testo e non ne conserva la storia**: il coach vede il
 * contenuto corrente con l'indicazione «Modificato». Non c'è limite di tempo —
 * chi si accorge dopo tre giorni di aver scritto male una cosa che lo riguarda
 * deve poterla correggere — ma c'è un limite di concorrenza: il corpo porta la
 * `version` letta, e se nel frattempo qualcun altro ha scritto la risposta è
 * `409`, mai una sovrascrittura silenziosa.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { attemptId } = await params;
  const id = Number(attemptId);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'invalid_attempt' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    version?: unknown;
    outcome?: unknown;
    note?: unknown;
    occurredOn?: unknown;
  } | null;
  if (!body) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await editAttempt({
    attemptId: id,
    actorUserId: user.id,
    expectedVersion: body.version,
    input: {
      outcome: body.outcome,
      note: body.note,
      occurredOn: body.occurredOn,
    },
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
