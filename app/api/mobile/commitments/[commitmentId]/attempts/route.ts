import { getApiUser } from '@/lib/auth/api-user';
import { recordAttempt } from '@/lib/core/ai-session-notes/commitment-attempts-store';

/**
 * Registra una prova su un'azione concordata.
 *
 * **Non chiude niente.** Non lo stato dell'azione, non l'obiettivo del
 * percorso: una routine si prova più volte, e la seconda volta deve trovarla
 * ancora lì. È il difetto che questa rotta esiste per non ripetere.
 *
 * `clientRequestId` lo genera il telefono **prima** di inviare: un ritentativo
 * dopo un timeout, o un doppio tocco, ricade sulla stessa riga e riceve
 * `duplicate: true` invece di creare una seconda prova.
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const result = await recordAttempt({
    commitmentId: id,
    athleteUserId: user.id,
    input: body as Parameters<typeof recordAttempt>[0]['input'],
    now: new Date(),
  });

  if (!result.ok) {
    return Response.json(
      { error: result.reason, message: result.message },
      { status: result.status }
    );
  }

  // 200 e non 201 anche sull'inserimento: il client non deve distinguere il
  // primo invio dal ritentativo, e `duplicate` glielo dice comunque.
  return Response.json(result.value);
}
