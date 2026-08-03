import 'server-only';
import { getUser } from '@/lib/db/queries';
import { ensureSessionCompassDraft } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
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
    return Response.json({
      report: result.view,
      regenerated: result.regenerated,
      reason: result.reason,
    });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
