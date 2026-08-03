import 'server-only';
import { getUser } from '@/lib/db/queries';
import { approveSessionCompass } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;
  try {
    const report = await approveSessionCompass(request, sessionCompassDependencies());
    return Response.json({ report });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
