import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeSessionCoverage,
  formatCoverageDuration,
} from './session-coverage-text';
import type { SessionCoverage } from './session-coverage';

function coverage(overrides: Partial<SessionCoverage> = {}): SessionCoverage {
  return {
    state: 'completa',
    closeReason: 'coach_closed',
    sessionDurationMs: 3_600_000,
    recordedDurationMs: 3_600_000,
    coveragePercent: 100,
    gaps: [],
    transcription: { done: 2, pending: 0, failed: 0, total: 2 },
    ...overrides,
  };
}

test('le durate si leggono in ore e minuti', () => {
  assert.equal(formatCoverageDuration(2 * 3_600_000 + 4 * 60_000), '2h 04m');
  assert.equal(formatCoverageDuration(7 * 60_000), '7m');
  assert.equal(formatCoverageDuration(0), '0m');
  assert.equal(formatCoverageDuration(3_600_000), '1h 00m');
});

test('una sessione integra ha un tono sereno e dichiara la propria base', () => {
  const message = describeSessionCoverage(coverage());

  assert.equal(message.tone, 'sereno');
  assert.match(message.titolo, /registrata per intero/i);
  assert.ok(
    message.dettagli.some((riga) => /tiene conto di tutta la sessione/i.test(riga))
  );
});

test('un interruzione viene raccontata con durata e causa', () => {
  const message = describeSessionCoverage(
    coverage({
      state: 'con_interruzioni',
      sessionDurationMs: 7_440_000,
      recordedDurationMs: 7_020_000,
      coveragePercent: 94,
      gaps: [
        { startMs: 5_520_000, durationMs: 420_000, cause: 'participant_left' },
      ],
      transcription: { done: 4, pending: 0, failed: 0, total: 4 },
    })
  );

  assert.equal(message.tone, 'attenzione');
  assert.match(message.titolo, /94%/);
  assert.ok(message.dettagli.some((riga) => /7m/.test(riga)));
  assert.ok(message.dettagli.some((riga) => /disconnessione/i.test(riga)));
  assert.ok(
    message.dettagli.some((riga) => /si basa sulle parti registrate/i.test(riga)),
    'il riepilogo deve dichiarare che copre solo una parte'
  );
});

test('una trascrizione in corso dice quante parti mancano', () => {
  const message = describeSessionCoverage(
    coverage({
      state: 'in_corso',
      transcription: { done: 3, pending: 1, failed: 0, total: 4 },
    })
  );

  assert.equal(message.tone, 'attenzione');
  assert.match(message.titolo, /Trascrizione in corso/i);
  assert.ok(message.dettagli.some((riga) => /3 parti su 4/.test(riga)));
});

test('un fallimento dice che si riprova, senza codici tecnici', () => {
  const message = describeSessionCoverage(
    coverage({
      state: 'parziale',
      closeReason: 'closed_by_timeout',
      recordedDurationMs: 1_800_000,
      coveragePercent: 50,
      gaps: [
        { startMs: 1_800_000, durationMs: 1_800_000, cause: 'recording_failed' },
      ],
      transcription: { done: 1, pending: 0, failed: 1, total: 2 },
    })
  );

  const testo = [message.titolo, ...message.dettagli].join(' ');
  assert.equal(message.tone, 'problema');
  assert.ok(/Riproviamo automaticamente/i.test(testo));
  assert.ok(
    /chiusa automaticamente/i.test(testo),
    'una chiusura d’ufficio non deve sembrare normale'
  );
  assert.doesNotMatch(
    testo,
    /EGRESS|participant_left|closed_by_timeout|recording_failed|_/,
    'il coach non deve mai leggere un codice tecnico'
  );
});

test('una sessione non registrata lo dice chiaramente', () => {
  const message = describeSessionCoverage(
    coverage({
      state: 'fallita',
      recordedDurationMs: 0,
      coveragePercent: 0,
      transcription: { done: 0, pending: 0, failed: 0, total: 0 },
    })
  );

  assert.equal(message.tone, 'problema');
  assert.match(message.titolo, /non registrata/i);
});

test('nessuno stato produce un messaggio vuoto', () => {
  for (const state of [
    'completa',
    'con_interruzioni',
    'in_corso',
    'parziale',
    'fallita',
  ] as const) {
    const message = describeSessionCoverage(coverage({ state }));
    assert.ok(message.titolo.length > 0, `titolo vuoto per ${state}`);
    assert.ok(message.dettagli.length > 0, `dettagli vuoti per ${state}`);
  }
});
