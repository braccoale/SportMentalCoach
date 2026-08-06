import 'server-only';
import { and, asc, desc, ilike, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sessionTranscriptTimelineSegments } from '@/lib/db/schema';
import type {
  TranscriptHistorySearchDependencies,
  TranscriptHistorySearchStore,
} from './transcript-history-search';
import { getMentalJourney } from './mental-journey';
import { mentalJourneyDependencies } from './mental-journey-store';

export function createTranscriptHistorySearchStore(): TranscriptHistorySearchStore {
  return {
    async search({ sessionIds, query, offset, limit }) {
      const literalQuery = query.replace(/[\\%_]/g, (character) => `\\${character}`);
      const rows = await db
        .select({
          sessionId: sessionTranscriptTimelineSegments.sessionAiNotesId,
          transcriptSegmentId: sessionTranscriptTimelineSegments.sourceTranscriptSegmentId,
          startMs: sessionTranscriptTimelineSegments.startMs,
          speaker: sessionTranscriptTimelineSegments.participantRole,
          text: sessionTranscriptTimelineSegments.normalizedText,
          sequence: sessionTranscriptTimelineSegments.globalSequence,
        })
        .from(sessionTranscriptTimelineSegments)
        .where(and(
          inArray(sessionTranscriptTimelineSegments.sessionAiNotesId, sessionIds),
          ilike(sessionTranscriptTimelineSegments.normalizedText, `%${literalQuery}%`)
        ))
        .orderBy(
          desc(sessionTranscriptTimelineSegments.sessionAiNotesId),
          asc(sessionTranscriptTimelineSegments.globalSequence)
        )
        .offset(offset)
        .limit(limit);

      return rows.flatMap((row) =>
        row.speaker === 'coach' || row.speaker === 'athlete'
          ? [{
              sessionId: row.sessionId,
              transcriptSegmentId: row.transcriptSegmentId,
              startMs: row.startMs,
              speaker: row.speaker,
              text: row.text,
            }]
          : []
      );
    },
  };
}

export function transcriptHistorySearchDependencies(): TranscriptHistorySearchDependencies {
  return {
    loadJourney: (params) => getMentalJourney(params, mentalJourneyDependencies()),
    store: createTranscriptHistorySearchStore(),
  };
}
