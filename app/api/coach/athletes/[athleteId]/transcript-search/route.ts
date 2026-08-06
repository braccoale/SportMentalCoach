import 'server-only';
import { getUser } from '@/lib/db/queries';
import { MentalJourneyError } from '@/lib/core/ai-session-notes/mental-journey';
import {
  TranscriptHistorySearchError,
  searchTranscriptHistory,
} from '@/lib/core/ai-session-notes/transcript-history-search';
import { transcriptHistorySearchDependencies } from '@/lib/core/ai-session-notes/transcript-history-search-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ athleteId: string }> }
) {
  const user = await getUser();
  if (!user) {
    return Response.json({ code: 'UNAUTHENTICATED', error: 'Non autenticato.' }, { status: 401 });
  }
  const athleteUserId = Number((await params).athleteId);
  if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) {
    return Response.json({ code: 'INVALID_ATHLETE', error: 'Atleta non valido.' }, { status: 400 });
  }
  const url = new URL(request.url);
  try {
    const result = await searchTranscriptHistory(
      {
        athleteUserId,
        actorUserId: user.id,
        query: url.searchParams.get('q') ?? '',
        cursor: url.searchParams.get('cursor'),
      },
      transcriptHistorySearchDependencies()
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof TranscriptHistorySearchError) {
      return Response.json({ code: error.code, error: error.message }, { status: 400 });
    }
    if (error instanceof MentalJourneyError) {
      const status = error.code === 'UNAUTHORIZED' ? 401 : error.code === 'INVALID_ATHLETE' ? 400 : 403;
      return Response.json({ code: error.code, error: error.message }, { status });
    }
    return Response.json(
      { code: 'TRANSCRIPT_SEARCH_FAILED', error: 'Non è stato possibile cercare nello storico.' },
      { status: 500 }
    );
  }
}
