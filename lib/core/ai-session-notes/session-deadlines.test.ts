import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_WORK_MINUTES,
  NO_ACTIVE_WORK_MINUTES,
  expiryErrorCode,
  processingDeadlineVerdict,
  terminalStatusForExpiredSession,
} from './session-deadlines';

const now = new Date('2026-08-09T18:00:00Z');
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000);

/*
 * Questi test provano lo stallo, non il successo.
 *
 * «Il mondo si ferma qui»: nessun webhook arriva più, nessun worker passa,
 * nessuno tocca la pagina. La domanda non è se la sessione avanza — è se
 * esce comunque. Sono i test che non si scrivono mai, e che avrebbero preso
 * quattro dei cinque guasti visti in produzione.
 */

test('senza lavoro attivo la sessione scade presto: nessuno la fara mai avanzare', () => {
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: minutesAgo(NO_ACTIVE_WORK_MINUTES + 1),
      activeJobCount: 0,
      now,
    }),
    { expired: true, reason: 'no_active_work' }
  );
});

test('una corsa del worker appena partita non viene scambiata per uno stallo', () => {
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: minutesAgo(1),
      activeJobCount: 0,
      now,
    }),
    { expired: false }
  );
});

test('con lavoro in corso si aspetta molto di piu', () => {
  // Una callback che tarda è normale: chiudere una sessione che stava per
  // completarsi sarebbe peggio del problema.
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: minutesAgo(NO_ACTIVE_WORK_MINUTES + 10),
      activeJobCount: 2,
      now,
    }),
    { expired: false }
  );
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: minutesAgo(ACTIVE_WORK_MINUTES + 1),
      activeJobCount: 2,
      now,
    }),
    { expired: true, reason: 'work_too_slow' }
  );
});

test('lo stato terminale dice da che parte guardare', () => {
  // Con la trascrizione in mano il guasto è a valle, non a monte.
  assert.equal(
    terminalStatusForExpiredSession({ hasTranscript: true }),
    'report_failed'
  );
  assert.equal(
    terminalStatusForExpiredSession({ hasTranscript: false }),
    'transcription_failed'
  );
});

test('il silenzio non viene raccontato come un guasto', () => {
  assert.equal(
    expiryErrorCode({
      reason: 'no_active_work',
      hasTranscript: false,
      hasRecordedAudio: true,
    }),
    'NO_SPEECH_DETECTED'
  );
  // Audio mai arrivato: qui un problema c'è davvero.
  assert.equal(
    expiryErrorCode({
      reason: 'no_active_work',
      hasTranscript: false,
      hasRecordedAudio: false,
    }),
    'TRANSCRIPTION_INCOMPLETE'
  );
  assert.equal(
    expiryErrorCode({
      reason: 'work_too_slow',
      hasTranscript: true,
      hasRecordedAudio: true,
    }),
    'REPORT_NOT_GENERATED'
  );
});

test('un job che si è appena mosso conta come progresso, anche se la riga sessione è ferma', () => {
  // Il guasto reale: la sessione entra in `processing` alle 18:14 e la sua
  // riga non viene più toccata, mentre la coda lavora davvero. Alle 18:21 la
  // normalizzazione finisce; 23 secondi dopo, nella finestra in cui il job
  // successivo non è ancora entrato in coda, il conteggio dei job vivi è
  // zero. Guardando solo la riga sessione, sono passati 7 minuti: scadenza
  // corta superata, sessione dichiarata fallita mentre stava funzionando.
  const sessionUpdatedAt = new Date('2026-08-10T16:14:45Z');
  const jobFinishedAt = new Date('2026-08-10T16:21:36Z');
  const now = new Date('2026-08-10T16:21:59Z');

  // Come si comportava prima: solo la riga sessione.
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: sessionUpdatedAt,
      activeJobCount: 0,
      now,
    }),
    { expired: true, reason: 'no_active_work' }
  );

  // Come si comporta ora: l'ultimo movimento di un job è progresso.
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: jobFinishedAt,
      activeJobCount: 0,
      now,
    }),
    { expired: false }
  );
});

test('una sessione davvero abbandonata scade lo stesso', () => {
  // Il progresso più recente resta comunque vecchio: qui la rete di
  // sicurezza deve fare il suo lavoro, altrimenti si torna alla rotellina
  // che gira per sempre.
  const now = new Date('2026-08-10T16:30:00Z');
  assert.deepEqual(
    processingDeadlineVerdict({
      lastProgressAt: new Date('2026-08-10T16:20:00Z'),
      activeJobCount: 0,
      now,
    }),
    { expired: true, reason: 'no_active_work' }
  );
});
