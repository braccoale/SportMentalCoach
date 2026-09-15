import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiSummaryStatus,
  buildOutcomeEmail,
  buildOutcomeReport,
  classifySessionOutcome,
  transcriptionStatus,
  type SessionOutcomeSnapshot,
} from './session-outcome-report';

function snapshot(
  overrides: Partial<SessionOutcomeSnapshot> = {}
): SessionOutcomeSnapshot {
  return {
    sessionId: 72,
    bookingId: 202,
    athleteUserId: 93,
    coachName: 'Francesco Borrelli',
    athleteName: 'Giulia Martini',
    status: 'ready_for_review',
    errorCode: null,
    scheduledFor: new Date('2026-08-16T15:00:00Z'),
    startedAt: new Date('2026-08-16T15:02:15Z'),
    endedAt: new Date('2026-08-16T16:04:13Z'),
    processingCompletedAt: new Date('2026-08-16T16:09:31Z'),
    sessionSeconds: 3718,
    coverage: [
      { role: 'coach', recordedSeconds: 3719, ratio: 1, complete: true },
      { role: 'athlete', recordedSeconds: 3700, ratio: 0.99, complete: true },
    ],
    transcriptSegments: 592,
    reportId: 44,
    reportThemesCount: 2,
    ...overrides,
  };
}

test('la mail dice subito chi ha svolto la sessione con chi', () => {
  const email = buildOutcomeEmail(snapshot());

  assert.equal(
    email.subject,
    '[KaiPai] Francesco Borrelli con Giulia Martini: trascrizione completata'
  );
  assert.match(email.intro, /Francesco Borrelli ha svolto una sessione con Giulia Martini/);
  assert.deepEqual(email.details.slice(0, 2), [
    { label: 'Coach', value: 'Francesco Borrelli' },
    { label: 'Atleta', value: 'Giulia Martini' },
  ]);
});

test('la mail conferma chiaramente trascrizione e riepilogo AI', () => {
  const email = buildOutcomeEmail(snapshot());

  assert.equal(transcriptionStatus(snapshot()), 'Completata');
  assert.equal(aiSummaryStatus(snapshot()), 'Pronto per la revisione del coach');
  assert.ok(email.details.some((row) => row.label === 'Trascrizione AI' && row.value === 'Completata'));
  assert.ok(email.details.some((row) => row.label === 'Riepilogo AI' && row.value === 'Pronto per la revisione del coach'));
  assert.match(email.nextStep, /coach può controllarlo e approvarlo/);
});

test('il testo alternativo non contiene più log o identificativi tecnici', () => {
  const report = buildOutcomeReport(snapshot());

  assert.match(report, /Coach: Francesco Borrelli/);
  assert.match(report, /Atleta: Giulia Martini/);
  assert.match(report, /Trascrizione AI: Completata/);
  assert.doesNotMatch(report, /TRACCIA COMPLETA|LAVORAZIONE|REGISTRAZIONI|COPERTURA AUDIO/);
  assert.doesNotMatch(report, /sessione\s+\.+|prenotazione\s+\.+|segmenti trascritti|#44|athleteUserId/);
});

test('una registrazione incompleta viene descritta con parole semplici', () => {
  const parziale = snapshot({
    coverage: [
      { role: 'coach', recordedSeconds: 427, ratio: 0.12, complete: false },
      { role: 'athlete', recordedSeconds: 3343, ratio: 1, complete: true },
    ],
  });

  assert.equal(classifySessionOutcome(parziale), 'parziale');
  assert.match(buildOutcomeEmail(parziale).subject, /registrazione da controllare/);
  assert.match(buildOutcomeReport(parziale), /Registrazione: Parziale/);
  assert.match(buildOutcomeEmail(parziale).nextStep, /potrebbe essere incompleta/);
});

test('un riepilogo senza temi richiede un controllo', () => {
  const parziale = snapshot({ reportThemesCount: 0 });

  assert.equal(classifySessionOutcome(parziale), 'parziale');
  assert.match(buildOutcomeEmail(parziale).subject, /registrazione da controllare/);
});

test('i problemi distinguono la trascrizione dal riepilogo', () => {
  const trascrizioneFallita = snapshot({
    status: 'transcription_failed',
    transcriptSegments: 0,
    reportId: null,
    reportThemesCount: null,
  });
  assert.equal(transcriptionStatus(trascrizioneFallita), 'Non riuscita');
  assert.equal(aiSummaryStatus(trascrizioneFallita), 'Non creato: manca la trascrizione');
  assert.match(buildOutcomeEmail(trascrizioneFallita).nextStep, /riprovare/);

  const riepilogoFallito = snapshot({
    status: 'report_failed',
    reportId: null,
    reportThemesCount: null,
  });
  assert.equal(transcriptionStatus(riepilogoFallito), 'Completata');
  assert.equal(aiSummaryStatus(riepilogoFallito), 'Non riuscito');
});

test('se il consenso manca, la mail spiega che Appunti AI non è partito', () => {
  const rifiutata = snapshot({
    status: 'consent_rejected',
    transcriptSegments: 0,
    reportId: null,
    reportThemesCount: null,
    coverage: [],
  });

  const email = buildOutcomeEmail(rifiutata);
  assert.equal(classifySessionOutcome(rifiutata), 'rifiutata');
  assert.match(email.subject, /consenso non fornito/);
  assert.equal(transcriptionStatus(rifiutata), 'Non eseguita: consenso non fornito');
  assert.match(email.nextStep, /non è stato avviato/);
});
