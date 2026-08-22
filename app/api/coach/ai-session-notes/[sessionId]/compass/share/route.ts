import 'server-only';
import { getUser } from '@/lib/db/queries';
import { shareSessionCompass } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';

/**
 * Il coach consegna all'atleta la sua parte del riepilogo.
 *
 * Rotta separata da `approve` perché sono due decisioni distinte: approvare
 * dice «questo testo è corretto», condividere dice «questa persona può
 * leggerlo di sé». Ci sono sedute in cui la prima è sì e la seconda è no.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;
  try {
    const report = await shareSessionCompass(
      request,
      sessionCompassDependencies()
    );
    return Response.json({ report });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
