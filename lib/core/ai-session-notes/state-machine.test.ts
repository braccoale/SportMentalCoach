import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiNotesDomainError,
  assertAiNotesTransition,
  canTransitionAiNotesSession,
  isClosableSessionStatus,
  transitionAuditPatch,
} from './state-machine';

test('una sessione attiva è chiudibile', () => {
  assert.equal(isClosableSessionStatus('active'), true);
});

test('una sessione in attesa di consenso è chiudibile', () => {
  assert.equal(isClosableSessionStatus('waiting_for_consent'), true);
});

test('una sessione già in trattamento non si richiude', () => {
  assert.equal(isClosableSessionStatus('processing'), false);
});

test('una sessione annullata non si chiude', () => {
  assert.equal(isClosableSessionStatus('cancelled'), false);
});

test('uno stato sconosciuto non è chiudibile', () => {
  assert.equal(isClosableSessionStatus('qualcosa_di_nuovo'), false);
});

test('initial and future valid transitions are accepted', () => {
  assert.equal(
    canTransitionAiNotesSession('waiting_for_consent', 'active'),
    true
  );
  assert.equal(
    canTransitionAiNotesSession('waiting_for_consent', 'consent_rejected'),
    true
  );
  assert.equal(canTransitionAiNotesSession('active', 'processing'), true);
  assert.equal(
    canTransitionAiNotesSession('processing', 'ready_for_review'),
    true
  );
  assert.equal(
    canTransitionAiNotesSession('ready_for_review', 'approved'),
    true
  );
  assert.equal(canTransitionAiNotesSession('approved', 'shared'), true);
});

test('invalid and terminal transitions are rejected with typed errors', () => {
  assert.equal(canTransitionAiNotesSession('cancelled', 'active'), false);
  assert.throws(
    () => assertAiNotesTransition('active', 'approved'),
    (error: unknown) =>
      error instanceof AiNotesDomainError &&
      error.code === 'INVALID_TRANSITION'
  );
});

test('transition patch records updated timestamp and actor', () => {
  const now = new Date('2026-07-30T12:00:00.000Z');
  const active = transitionAuditPatch('active', 42, now);
  assert.equal(active.updatedDate, now);
  assert.equal(active.updatedBy, 42);
  assert.equal(active.startedAt, now);
  assert.equal(active.endedAt, undefined);

  const processing = transitionAuditPatch('processing', 42, now);
  assert.equal(processing.endedAt, now);
  assert.equal(processing.processingStartedAt, now);

  const ready = transitionAuditPatch('ready_for_review', 42, now);
  assert.equal(ready.processingCompletedAt, now);

  const cancelled = transitionAuditPatch('cancelled', 7, now);
  assert.equal(cancelled.updatedBy, 7);
  assert.equal(cancelled.endedAt, now);
});

/*
 * La seduta del 16 agosto: registrazione dell'atleta persa, trascrizione del
 * coach completa, e la sessione chiusa in `report_failed` con 592 segmenti
 * intatti a fianco. Senza una riapertura quel materiale resta illeggibile per
 * sempre — non perché manchi, ma perché lo stato dice di no.
 */
test('da report_failed si può tornare in lavorazione, da transcription_failed no', () => {
  assert.equal(canTransitionAiNotesSession('report_failed', 'processing'), true);

  // Senza trascrizione non c'è niente da riprendere: riaprire regalerebbe solo
  // un secondo giro di attesa prima dello stesso esito.
  assert.equal(
    canTransitionAiNotesSession('transcription_failed', 'processing'),
    false
  );

  // La riapertura porta in lavorazione, non direttamente a un esito.
  assert.equal(
    canTransitionAiNotesSession('report_failed', 'ready_for_review'),
    false
  );
  assert.equal(canTransitionAiNotesSession('report_failed', 'approved'), false);

  // Gli altri stati terminali restano chiusi.
  for (const terminale of ['cancelled', 'consent_rejected', 'shared'] as const) {
    assert.equal(canTransitionAiNotesSession(terminale, 'processing'), false);
  }
});

test('un esito sano non si porta addosso il motivo di un fallimento precedente', () => {
  const now = new Date('2026-08-17T09:40:00.000Z');
  for (const sano of ['processing', 'ready_for_review', 'approved', 'shared'] as const) {
    assert.equal(transitionAuditPatch(sano, 1, now).errorCode, null);
  }
  // Un fallimento invece il motivo lo scrive, e non è questo il posto in cui
  // viene deciso: la patch non lo tocca.
  assert.equal(transitionAuditPatch('report_failed', 1, now).errorCode, undefined);
});
