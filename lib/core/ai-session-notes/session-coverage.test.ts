import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSessionCoverage,
  type CoverageSegmentInput,
} from './session-coverage';

const INIZIO = new Date('2026-08-07T14:00:00.000Z');
const FINE = new Date('2026-08-07T16:00:00.000Z');

function minuto(n: number): Date {
  return new Date(INIZIO.getTime() + n * 60_000);
}

function segmento(
  minutoInizio: number,
  minutoFine: number,
  extra: Partial<CoverageSegmentInput> = {}
): CoverageSegmentInput {
  return {
    participantRole: 'coach',
    startedAt: minuto(minutoInizio),
    endedAt: minuto(minutoFine),
    status: 'recorded',
    stopReason: null,
    errorCode: null,
    transcriptionState: 'done',
    ...extra,
  };
}

test('una sessione registrata per intero è completa', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'completa');
  assert.equal(coverage.coveragePercent, 100);
  assert.deepEqual(coverage.gaps, []);
});

test('una disconnessione di entrambi produce un buco con la sua causa', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 60, { stopReason: 'participant_left' }),
      segmento(0, 60, {
        participantRole: 'athlete',
        stopReason: 'participant_left',
      }),
      segmento(67, 120),
      segmento(67, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'con_interruzioni');
  assert.equal(coverage.gaps.length, 1);
  assert.equal(coverage.gaps[0].durationMs, 7 * 60_000);
  assert.equal(coverage.gaps[0].startMs, 60 * 60_000);
  assert.equal(coverage.gaps[0].cause, 'participant_left');
  assert.equal(coverage.coveragePercent, 94);
});

test('se uno solo cade non c è buco: la sessione è stata comunque sentita', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 50, {
        participantRole: 'athlete',
        stopReason: 'participant_left',
      }),
      segmento(55, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.deepEqual(
    coverage.gaps,
    [],
    'il coach copriva quei cinque minuti'
  );
  assert.equal(coverage.state, 'completa');
  assert.equal(coverage.coveragePercent, 100);
});

test('le interruzioni tecniche sotto i cinque secondi non sono buchi', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: new Date(INIZIO.getTime() + 120_000),
    closeReason: 'coach_closed',
    segments: [
      {
        ...segmento(0, 0),
        endedAt: new Date(INIZIO.getTime() + 58_000),
      },
      {
        ...segmento(0, 0),
        startedAt: new Date(INIZIO.getTime() + 61_000),
        endedAt: new Date(INIZIO.getTime() + 120_000),
      },
    ],
    now: FINE,
  });

  assert.deepEqual(coverage.gaps, []);
});

test('una trascrizione ancora in corso rende lo stato in_corso', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, {
        participantRole: 'athlete',
        transcriptionState: 'pending',
      }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'in_corso');
  assert.equal(coverage.transcription.pending, 1);
  assert.equal(coverage.transcription.done, 1);
  assert.equal(coverage.transcription.total, 2);
});

test('una trascrizione fallita rende lo stato parziale', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 120),
      segmento(0, 120, {
        participantRole: 'athlete',
        transcriptionState: 'failed',
      }),
    ],
    now: FINE,
  });

  assert.equal(coverage.state, 'parziale');
  assert.equal(coverage.transcription.failed, 1);
});

test('un fallimento di registrazione è dichiarato come tale', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'coach_closed',
    segments: [
      segmento(0, 60, { status: 'failed', errorCode: 'EGRESS_FAILED' }),
      segmento(0, 60, {
        participantRole: 'athlete',
        status: 'failed',
        errorCode: 'EGRESS_FAILED',
      }),
    ],
    now: FINE,
  });

  assert.equal(coverage.gaps.length, 1);
  assert.equal(coverage.gaps[0].cause, 'recording_failed');
});

test('senza alcuna registrazione la copertura è fallita', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'closed_by_timeout',
    segments: [],
    now: FINE,
  });

  assert.equal(coverage.state, 'fallita');
  assert.equal(coverage.coveragePercent, 0);
  assert.equal(coverage.transcription.total, 0);
});

test('la chiusura per timeout viene riportata al coach', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: FINE,
    closeReason: 'closed_by_timeout',
    segments: [
      segmento(0, 120),
      segmento(0, 120, { participantRole: 'athlete' }),
    ],
    now: FINE,
  });

  assert.equal(coverage.closeReason, 'closed_by_timeout');
});

test('una sessione ancora aperta si misura fino ad adesso', () => {
  const adesso = minuto(30);
  const coverage = buildSessionCoverage({
    sessionStartedAt: INIZIO,
    sessionEndedAt: null,
    closeReason: 'unknown',
    segments: [
      { ...segmento(0, 0), endedAt: null },
      {
        ...segmento(0, 0, { participantRole: 'athlete' }),
        endedAt: null,
      },
    ],
    now: adesso,
  });

  assert.equal(coverage.sessionDurationMs, 30 * 60_000);
  assert.equal(coverage.coveragePercent, 100);
});

test('senza inizio di sessione si parte dal primo segmento registrato', () => {
  const coverage = buildSessionCoverage({
    sessionStartedAt: null,
    sessionEndedAt: minuto(60),
    closeReason: 'coach_closed',
    segments: [segmento(10, 60)],
    now: FINE,
  });

  assert.equal(coverage.sessionDurationMs, 50 * 60_000);
  assert.equal(coverage.coveragePercent, 100);
});
