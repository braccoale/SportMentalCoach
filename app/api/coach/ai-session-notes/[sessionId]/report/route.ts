import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import {
  bookings,
  providerProfiles,
  sessionAiNotes,
  sessionTranscriptSegments,
} from '@/lib/db/schema';
import {
  CoachSessionReportError,
  generateCoachSessionReport,
  getCoachSessionTranscript,
  type CoachReportSessionSource,
} from '@/lib/core/ai-session-notes/coach-session-report';
import { openAiSessionReportProviderFromEnvironment } from '@/lib/core/ai-session-notes/openai-session-report-provider';
import {
  FEATURE_CODES,
  hasFeatureEntitlement,
} from '@/lib/core/features';

export const dynamic = 'force-dynamic';

async function loadSession(
  sessionId: number
): Promise<CoachReportSessionSource | null> {
  const [session] = await db
    .select({
      id: sessionAiNotes.id,
      coachUserId: providerProfiles.userId,
      status: sessionAiNotes.status,
    })
    .from(sessionAiNotes)
    .innerJoin(bookings, eq(bookings.id, sessionAiNotes.bookingId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, bookings.providerId))
    .where(eq(sessionAiNotes.id, sessionId))
    .limit(1);

  if (!session) return null;

  const transcript = await db
    .select({
      participantId: sessionTranscriptSegments.participantUserId,
      speakerRole: sessionTranscriptSegments.speakerRole,
      sequenceNumber: sessionTranscriptSegments.sequenceNumber,
      startMs: sessionTranscriptSegments.startedAtMs,
      endMs: sessionTranscriptSegments.endedAtMs,
      text: sessionTranscriptSegments.text,
      confidence: sessionTranscriptSegments.confidence,
      provider: sessionTranscriptSegments.provider,
      model: sessionTranscriptSegments.providerModel,
    })
    .from(sessionTranscriptSegments)
    .where(eq(sessionTranscriptSegments.sessionAiNotesId, sessionId))
    .orderBy(
      asc(sessionTranscriptSegments.sequenceNumber),
      asc(sessionTranscriptSegments.id)
    );

  return {
    ...session,
    language: 'it',
    transcript,
  };
}

function dependencies() {
  return {
    loadSession,
    hasFeatureAccess: (actorUserId: number) =>
      hasFeatureEntitlement(actorUserId, FEATURE_CODES.AI_SESSION_NOTES),
    createProvider: openAiSessionReportProviderFromEnvironment,
    promptVersion: process.env.AI_NOTES_REPORT_PROMPT_VERSION?.trim() ?? '',
    now: () => new Date(),
  };
}

async function authenticatedRequest(
  params: Promise<{ sessionId: string }>
): Promise<{ sessionId: number; actorUserId: number } | Response> {
  const user = await getUser();
  if (!user) {
    return Response.json({ code: 'UNAUTHENTICATED', error: 'Non autenticato.' }, { status: 401 });
  }
  const sessionId = Number((await params).sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return Response.json({ code: 'INVALID_SESSION', error: 'Sessione non valida.' }, { status: 400 });
  }
  return { sessionId, actorUserId: user.id };
}

function errorResponse(error: unknown): Response {
  if (!(error instanceof CoachSessionReportError)) {
    return Response.json(
      { code: 'REPORT_GENERATION_FAILED', error: 'Non è stato possibile completare la richiesta. Riprova.' },
      { status: 502 }
    );
  }
  const status =
    error.code === 'SESSION_NOT_FOUND'
      ? 404
      : error.code === 'UNAUTHORIZED'
        || error.code === 'FEATURE_NOT_ENABLED'
        ? 403
        : error.code === 'REPORT_RATE_LIMITED'
          ? 429
          : error.code === 'REPORT_GENERATION_UNAVAILABLE'
            ? 503
            : error.code === 'SESSION_NOT_ELIGIBLE' ||
                error.code === 'TRANSCRIPT_UNAVAILABLE'
              ? 409
              : 502;
  return Response.json({ code: error.code, error: error.message }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedRequest(params);
  if (request instanceof Response) return request;
  try {
    const transcript = await getCoachSessionTranscript(request, dependencies());
    return Response.json({ transcript });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const request = await authenticatedRequest(params);
  if (request instanceof Response) return request;
  try {
    const report = await generateCoachSessionReport(request, dependencies());
    return Response.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
