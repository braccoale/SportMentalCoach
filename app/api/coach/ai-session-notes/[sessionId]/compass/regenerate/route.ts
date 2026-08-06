import 'server-only';
import { getUser } from '@/lib/db/queries';
import { ensureSessionCompassDraft } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import { advanceAiNotesSessionStatus } from '@/lib/core/ai-session-notes/session-status';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';

/**
 * Genera la bozza se manca, la rigenera quando cambia il fingerprint o la
 * versione prompt, e apre una nuova versione se il report è già approvato.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;
  try {
    const result = await ensureSessionCompassDraft(request, sessionCompassDependencies());

    // Esiste una bozza: la sessione è da rivedere, e va detto anche al suo
    // stato. La transizione sta qui e non dentro `session-compass`, che parla
    // solo con lo store iniettato ed è testato senza database.
    await advanceAiNotesSessionStatus({
      sessionId: request.sessionId,
      nextStatus: 'ready_for_review',
      actorUserId: request.actorUserId,
    });

    return Response.json({
      report: result.view,
      regenerated: result.regenerated,
      reason: result.reason,
    });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
