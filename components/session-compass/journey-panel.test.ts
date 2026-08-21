import assert from 'node:assert/strict';
import test from 'node:test';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';
import {
  compareJourneyThemes,
  selectPreviousJourneyEntry,
} from './journey-panel';

function entry(
  sessionId: number,
  sessionDate: string
): MentalJourneyEntry {
  return {
    sessionId,
    bookingId: sessionId + 100,
    reportId: sessionId + 200,
    reportVersion: 1,
    sessionDate,
    approvedAt: sessionDate,
    coachName: 'Coach Test',
    summary: `Sintesi ${sessionId}`,
    focus: `Focus ${sessionId}`,
    themes: [],
    emergingResource: null,
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    throughLine: null,
    isApproved: true,
    compassHref: `/dashboard/appointments/${sessionId + 100}`,
  };
}

test('seleziona la sessione immediatamente precedente a quella corrente', () => {
  const timeline = [
    entry(30, '2026-08-06T12:00:00.000Z'),
    entry(20, '2026-07-24T12:00:00.000Z'),
    entry(10, '2026-07-10T12:00:00.000Z'),
  ];

  assert.equal(
    selectPreviousJourneyEntry(timeline, 30, timeline[0].sessionDate)?.sessionId,
    20
  );
});

test('usa la data quando la sessione corrente non è ancora nello storico approvato', () => {
  const timeline = [
    entry(20, '2026-07-24T12:00:00.000Z'),
    entry(10, '2026-07-10T12:00:00.000Z'),
  ];

  assert.equal(
    selectPreviousJourneyEntry(
      timeline,
      99,
      '2026-08-06T12:00:00.000Z'
    )?.sessionId,
    20
  );
});

test('confronta solo temi reali normalizzando accenti e punteggiatura', () => {
  assert.deepEqual(
    compareJourneyThemes(
      ['Ansia pre-gara', 'Fiducia'],
      ['Ansia pre gara', 'Gestione emotiva']
    ),
    {
      common: ['Ansia pre-gara'],
      newInCurrent: ['Fiducia'],
      noLongerPresent: ['Gestione emotiva'],
    }
  );
});
