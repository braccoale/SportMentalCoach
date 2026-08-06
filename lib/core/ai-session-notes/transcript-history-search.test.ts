import assert from 'node:assert/strict';
import test from 'node:test';
import { searchTranscriptHistory, TranscriptHistorySearchError } from './transcript-history-search';
import type { MentalJourney } from './mental-journey';

const journey: MentalJourney = {
  athleteUserId: 22,
  summary: {
    firstSessionDate: '2026-07-01T09:00:00.000Z',
    lastSessionDate: '2026-08-01T09:00:00.000Z',
    approvedSessionCount: 2,
    commitments: { total: 0, completed: 0, inProgress: 0, pending: 0, skipped: 0 },
    completionRate: null,
  },
  timeline: [
    entry(9, '2026-08-01T09:00:00.000Z', 'Fiducia'),
    entry(4, '2026-07-01T09:00:00.000Z', 'Concentrazione'),
  ],
  recurringThemes: [],
  followThrough: [],
  pointsToRevisit: [],
};

test('cerca soltanto negli id sessione autorizzati dal percorso atleta', async () => {
  let receivedSessionIds: number[] = [];
  const result = await searchTranscriptHistory(
    { athleteUserId: 22, actorUserId: 7, query: 'fiducia' },
    {
      loadJourney: async () => journey,
      store: {
        async search(params) {
          receivedSessionIds = params.sessionIds;
          return [{ sessionId: 9, transcriptSegmentId: 91, startMs: 125_000, speaker: 'athlete', text: 'Sento più fiducia.' }];
        },
      },
    }
  );
  assert.deepEqual(receivedSessionIds, [9, 4]);
  assert.equal(result.items[0].minute, 2);
  assert.equal(result.items[0].focus, 'Fiducia');
});

test('rifiuta query e cursori non validi prima di interrogare lo store', async () => {
  let called = false;
  const dependencies = {
    loadJourney: async () => journey,
    store: { async search() { called = true; return []; } },
  };
  await assert.rejects(
    () => searchTranscriptHistory({ athleteUserId: 22, actorUserId: 7, query: 'x' }, dependencies),
    (error: unknown) => error instanceof TranscriptHistorySearchError && error.code === 'INVALID_QUERY'
  );
  await assert.rejects(
    () => searchTranscriptHistory({ athleteUserId: 22, actorUserId: 7, query: 'ok', cursor: '-1' }, dependencies),
    (error: unknown) => error instanceof TranscriptHistorySearchError && error.code === 'INVALID_CURSOR'
  );
  assert.equal(called, false);
});

function entry(sessionId: number, sessionDate: string, focus: string): MentalJourney['timeline'][number] {
  return {
    sessionId,
    bookingId: sessionId + 100,
    reportId: sessionId + 200,
    reportVersion: 1,
    sessionDate,
    approvedAt: sessionDate,
    coachName: 'Coach',
    summary: 'Sintesi',
    focus,
    themes: [focus],
    emergingResource: null,
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    compassHref: `/dashboard/appointments/${sessionId + 100}`,
  };
}
