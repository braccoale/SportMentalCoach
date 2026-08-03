import 'server-only';
import { getUser } from '@/lib/db/queries';
import { getSessionCompassTranscript } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import { minuteFromMs } from '@/lib/core/ai-session-notes/session-compass-contract';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedCompassRequest(getUser, params);
  if (request instanceof Response) return request;
  try {
    const segments = await getSessionCompassTranscript(request, sessionCompassDependencies());
    return Response.json({
      transcript: segments.map((segment) => ({
        transcriptSegmentId: segment.transcriptSegmentId,
        startMs: segment.startMs,
        minute: minuteFromMs(segment.startMs),
        speaker: segment.speaker,
        text: segment.text,
      })),
    });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
