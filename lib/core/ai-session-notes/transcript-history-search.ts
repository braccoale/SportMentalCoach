import type { MentalJourney } from './mental-journey';
import type { CompassSpeaker } from './session-compass-contract';

export const TRANSCRIPT_HISTORY_PAGE_SIZE = 20;
export const MIN_TRANSCRIPT_SEARCH_LENGTH = 2;
export const MAX_TRANSCRIPT_SEARCH_LENGTH = 100;

export type TranscriptHistoryStoreHit = {
  sessionId: number;
  transcriptSegmentId: number;
  startMs: number;
  speaker: CompassSpeaker;
  text: string;
};

export type TranscriptHistorySearchHit = TranscriptHistoryStoreHit & {
  minute: number;
  sessionDate: string | null;
  focus: string | null;
};

export type TranscriptHistorySearchResult = {
  items: TranscriptHistorySearchHit[];
  nextCursor: string | null;
};

export interface TranscriptHistorySearchStore {
  search(params: {
    sessionIds: number[];
    query: string;
    offset: number;
    limit: number;
  }): Promise<TranscriptHistoryStoreHit[]>;
}

export type TranscriptHistorySearchDependencies = {
  loadJourney: (params: {
    athleteUserId: number;
    actorUserId: number;
  }) => Promise<MentalJourney>;
  store: TranscriptHistorySearchStore;
};

export class TranscriptHistorySearchError extends Error {
  constructor(
    public readonly code: 'INVALID_QUERY' | 'INVALID_CURSOR',
    message: string
  ) {
    super(message);
    this.name = 'TranscriptHistorySearchError';
  }
}

export async function searchTranscriptHistory(
  params: {
    athleteUserId: number;
    actorUserId: number;
    query: string;
    cursor?: string | null;
  },
  dependencies: TranscriptHistorySearchDependencies
): Promise<TranscriptHistorySearchResult> {
  const query = params.query.trim();
  if (query.length < MIN_TRANSCRIPT_SEARCH_LENGTH || query.length > MAX_TRANSCRIPT_SEARCH_LENGTH) {
    throw new TranscriptHistorySearchError(
      'INVALID_QUERY',
      `Inserisci da ${MIN_TRANSCRIPT_SEARCH_LENGTH} a ${MAX_TRANSCRIPT_SEARCH_LENGTH} caratteri.`
    );
  }
  const offset = parseCursor(params.cursor);
  // L'autorizzazione è deliberatamente delegata alla stessa proiezione server
  // usata dal Percorso atleta. Gli id sessione non arrivano mai dal client.
  const journey = await dependencies.loadJourney({
    athleteUserId: params.athleteUserId,
    actorUserId: params.actorUserId,
  });
  const entryBySession = new Map(journey.timeline.map((entry) => [entry.sessionId, entry]));
  const sessionIds = [...entryBySession.keys()];
  if (!sessionIds.length) return { items: [], nextCursor: null };

  const rows = await dependencies.store.search({
    sessionIds,
    query,
    offset,
    limit: TRANSCRIPT_HISTORY_PAGE_SIZE + 1,
  });
  const hasMore = rows.length > TRANSCRIPT_HISTORY_PAGE_SIZE;
  const items = rows.slice(0, TRANSCRIPT_HISTORY_PAGE_SIZE).flatMap((row) => {
    const entry = entryBySession.get(row.sessionId);
    if (!entry) return [];
    return [{
      ...row,
      minute: Math.max(0, Math.floor(row.startMs / 60_000)),
      sessionDate: entry.sessionDate,
      focus: entry.focus,
    }];
  });
  return {
    items,
    nextCursor: hasMore ? String(offset + TRANSCRIPT_HISTORY_PAGE_SIZE) : null,
  };
}

function parseCursor(value: string | null | undefined): number {
  if (!value) return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    throw new TranscriptHistorySearchError('INVALID_CURSOR', 'Paginazione non valida.');
  }
  return offset;
}
