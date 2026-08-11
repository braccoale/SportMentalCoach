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
    // Un errore che non abbiamo previsto e' un guasto nostro, non del
    // servizio a monte: 500 lo dice, 502 darebbe la colpa a qualcun altro.
    return Response.json(
      { code: 'COMPASS_FAILED', error: 'Non è stato possibile completare la richiesta. Riprova.' },
      { status: 500 }
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
    /*
     * Il report e' stato generato ma non ha superato i nostri controlli: il
     * contenuto e' inelaborabile, non c'e' nessun servizio a monte che abbia
     * risposto male. 502 raccontava una bugia — e in mezzo a un'indagine
     * mandava a cercare un guasto di rete che non c'era.
     */
    case 'COMPASS_INVALID':
      return 422;
    // Il tempo e' scaduto aspettando il modello: qui a monte c'e' davvero, e
    // ha impiegato troppo.
    case 'COMPASS_TIMEOUT':
      return 504;
    // `COMPASS_FAILED` e tutto cio' che resta: il provider ha risposto male.
    default:
      return 502;
  }
}
