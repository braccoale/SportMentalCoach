import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOT_YET_ERROR_CODES,
  failureOutcome,
  isTranscriptionRequestStale,
  jobRequiresParticipantRecording,
  retryDelayMs,
  retryStatus,
  sessionCanProcess,
  transcriptionRoundIsSettled,
  STALE_TRANSCRIPTION_REQUEST_MINUTES,
} from './processing-policy';

/*
 * La seduta 72, ricostruita: il coach registrato e trascritto, l'atleta con
 * l'egress fallito. Prima di questa regola nessuno accodava la
 * normalizzazione, e un'ora di conversazione trascritta finiva in
 * `report_failed` senza che nulla fosse davvero rotto a valle.
 */
test('una registrazione fallita non blocca il riepilogo degli altri', () => {
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [
        { id: 84, recordingStatus: 'recorded' },
        { id: 85, recordingStatus: 'failed' },
      ],
      completedTranscriptionParticipantIds: [84],
    }),
    true
  );
});

test('si aspetta chi sta ancora registrando, non chi ha già fallito', () => {
  // `recording` è un'attesa legittima: chiudere qui produrrebbe un riepilogo a
  // metà mentre la seduta è ancora viva.
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [
        { id: 84, recordingStatus: 'recorded' },
        { id: 85, recordingStatus: 'recording' },
      ],
      completedTranscriptionParticipantIds: [84],
    }),
    false
  );
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [
        { id: 84, recordingStatus: 'recorded' },
        { id: 85, recordingStatus: 'pending' },
      ],
      completedTranscriptionParticipantIds: [84],
    }),
    false
  );
});

test('senza nemmeno una voce trascritta non c’è niente da riassumere', () => {
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [
        { id: 84, recordingStatus: 'failed' },
        { id: 85, recordingStatus: 'failed' },
      ],
      completedTranscriptionParticipantIds: [],
    }),
    false
  );
});

test('con entrambe le trascrizioni pronte la regola resta quella di prima', () => {
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [
        { id: 84, recordingStatus: 'recorded' },
        { id: 85, recordingStatus: 'recorded' },
      ],
      completedTranscriptionParticipantIds: [84, 85],
    }),
    true
  );
  // Una sessione con un solo partecipante non è una seduta.
  assert.equal(
    transcriptionRoundIsSettled({
      participants: [{ id: 84, recordingStatus: 'recorded' }],
      completedTranscriptionParticipantIds: [84],
    }),
    false
  );
});

test('job types require the correct logical recording scope', () => {
  assert.equal(jobRequiresParticipantRecording('transcription'), true);
  assert.equal(jobRequiresParticipantRecording('transcript_normalization'), false);
  assert.equal(jobRequiresParticipantRecording('report_generation'), false);
});

test('retries stop exactly at maximum attempts', () => {
  assert.equal(retryStatus({ attemptCount: 1, maxAttempts: 3 }), 'queued');
  assert.equal(retryStatus({ attemptCount: 2, maxAttempts: 3 }), 'queued');
  assert.equal(retryStatus({ attemptCount: 3, maxAttempts: 3 }), 'failed');
  // Il primo ritentativo e' quasi immediato: il primo fallimento e' quasi
  // sempre transitorio, e c'e' un coach che aspetta senza sapere di aspettare
  // un ritentativo. Dal secondo in poi si allunga e non martella il provider.
  assert.equal(retryDelayMs(1), 5_000);
  assert.equal(retryDelayMs(2), 60_000);
  assert.equal(retryDelayMs(100), 15 * 60_000);
});

test('cancelled, rejected or revoked consent makes processing fail closed', () => {
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'active',
      consentStatuses: ['accepted', 'accepted'],
    }),
    true
  );
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'cancelled',
      consentStatuses: ['accepted', 'accepted'],
    }),
    false
  );
  assert.equal(
    sessionCanProcess({
      sessionStatus: 'active',
      consentStatuses: ['accepted', 'revoked'],
    }),
    false
  );
});

test('la soglia di reimmissione è di venti minuti', () => {
  assert.equal(STALE_TRANSCRIPTION_REQUEST_MINUTES, 20);
});

test('una richiesta inviata da poco non è considerata persa', () => {
  assert.equal(
    isTranscriptionRequestStale({
      submittedAt: new Date('2026-08-08T11:55:00.000Z'),
      now: new Date('2026-08-08T12:00:00.000Z'),
      staleAfterMinutes: STALE_TRANSCRIPTION_REQUEST_MINUTES,
    }),
    false,
    'il provider potrebbe stare ancora trascrivendo un file lungo'
  );
});

test('una richiesta senza risposta oltre soglia è persa', () => {
  assert.equal(
    isTranscriptionRequestStale({
      submittedAt: new Date('2026-08-08T11:30:00.000Z'),
      now: new Date('2026-08-08T12:00:00.000Z'),
      staleAfterMinutes: STALE_TRANSCRIPTION_REQUEST_MINUTES,
    }),
    true
  );
});

test('la soglia supera la finestra di ritentativi del provider', () => {
  // Deepgram ritenta dieci volte a trenta secondi: circa cinque minuti.
  // Reimmettere dentro quella finestra pagherebbe due volte lo stesso audio.
  assert.equal(
    isTranscriptionRequestStale({
      submittedAt: new Date('2026-08-08T11:54:00.000Z'),
      now: new Date('2026-08-08T12:00:00.000Z'),
      staleAfterMinutes: STALE_TRANSCRIPTION_REQUEST_MINUTES,
    }),
    false
  );
});

test('un rifiuto per stato non consuma un tentativo', () => {
  for (const errorCode of NOT_YET_ERROR_CODES) {
    assert.deepEqual(
      failureOutcome({ attemptCount: 1, maxAttempts: 3, errorCode }),
      { status: 'queued', attemptCount: 0 },
      `${errorCode} deve restituire il tentativo, non spenderlo`
    );
  }
});

test('un rifiuto per stato non porta mai il job a fallito, nemmeno all’ultimo giro', () => {
  assert.deepEqual(
    failureOutcome({
      attemptCount: 3,
      maxAttempts: 3,
      errorCode: 'SESSION_NOT_ELIGIBLE',
    }),
    { status: 'queued', attemptCount: 2 },
    'la sessione non era pronta: rimandare non è riprovare'
  );
});

test('un errore vero consuma il tentativo e alla fine chiude il job', () => {
  assert.deepEqual(
    failureOutcome({ attemptCount: 1, maxAttempts: 3, errorCode: 'COMPASS_TIMEOUT' }),
    { status: 'queued', attemptCount: 1 }
  );
  assert.deepEqual(
    failureOutcome({ attemptCount: 3, maxAttempts: 3, errorCode: 'COMPASS_TIMEOUT' }),
    { status: 'failed', attemptCount: 3 }
  );
});

test('il conteggio non scende sotto zero', () => {
  assert.deepEqual(
    failureOutcome({
      attemptCount: 0,
      maxAttempts: 3,
      errorCode: 'SESSION_NOT_ELIGIBLE',
    }),
    { status: 'queued', attemptCount: 0 }
  );
});
