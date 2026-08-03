import 'server-only';
import { SessionCompassError } from '@/lib/core/ai-session-notes/session-compass';

/**
 * Autenticazione e parsing condivisi dalle route Session Compass. Il codice di
 * stato è derivato dal codice di dominio, così le risposte restano coerenti.
 */
export async function authenticatedCompassRequest(
  loadUser: () => Promise<{ id: number } | null>,
  params: Promise<{ sessionId: string }>
): Promise<{ sessionId: number; actorUserId: number } | Response> {
  const user = await loadUser();
  if (!user) {
    return Response.json({ code: 'UNAUTHENTICATED', error: 'Non autenticato.' }, { status: 401 });
  }
  const sessionId = Number((await params).sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ code: 'INVALID_SESSION', error: 'Sessione non valida.' }, { status: 400 });
  }
  return { sessionId, actorUserId: user.id };
}

export function compassErrorResponse(error: unknown): Response {
  if (!(error instanceof SessionCompassError)) {
    return Response.json(
      { code: 'COMPASS_FAILED', error: 'Non è stato possibile completare la richiesta. Riprova.' },
      { status: 502 }
    );
  }
  return Response.json({ code: error.code, error: error.message }, { status: statusFor(error.code) });
}

function statusFor(code: SessionCompassError['code']): number {
  switch (code) {
    case 'SESSION_NOT_FOUND':
    case 'REPORT_NOT_FOUND':
    case 'COMMITMENT_NOT_FOUND':
      return 404;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
    case 'FEATURE_NOT_ENABLED':
      return 403;
    case 'SESSION_NOT_ELIGIBLE':
    case 'TRANSCRIPT_UNAVAILABLE':
    case 'REPORT_APPROVED_IMMUTABLE':
      return 409;
    case 'COMPASS_RATE_LIMITED':
      return 429;
    case 'COMPASS_UNAVAILABLE':
      return 503;
    default:
      return 502;
  }
}
