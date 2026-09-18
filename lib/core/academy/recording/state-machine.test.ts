import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionAcademyRecording,
  assertAcademyRecordingTransition,
  AcademyRecordingDomainError,
  isClosableRecordingStatus,
  academyRecordingTransitionPatch,
} from './state-machine';

test('waiting_for_consent può andare a recording, consent_rejected o cancelled', () => {
  assert.equal(canTransitionAcademyRecording('waiting_for_consent', 'recording'), true);
  assert.equal(canTransitionAcademyRecording('waiting_for_consent', 'consent_rejected'), true);
  assert.equal(canTransitionAcademyRecording('waiting_for_consent', 'cancelled'), true);
  assert.equal(canTransitionAcademyRecording('waiting_for_consent', 'ready'), false);
});

test('recording può andare a processing, failed o cancelled', () => {
  assert.equal(canTransitionAcademyRecording('recording', 'processing'), true);
  assert.equal(canTransitionAcademyRecording('recording', 'failed'), true);
  assert.equal(canTransitionAcademyRecording('recording', 'cancelled'), true);
  assert.equal(canTransitionAcademyRecording('recording', 'ready'), false);
});

test('processing può andare solo a ready o failed', () => {
  assert.equal(canTransitionAcademyRecording('processing', 'ready'), true);
  assert.equal(canTransitionAcademyRecording('processing', 'failed'), true);
  assert.equal(canTransitionAcademyRecording('processing', 'recording'), false);
});

test('failed è l\'unico stato terminale che riapre, verso processing', () => {
  assert.equal(canTransitionAcademyRecording('failed', 'processing'), true);
  assert.equal(canTransitionAcademyRecording('failed', 'ready'), false);
});

test('ready, consent_rejected, cancelled sono terminali', () => {
  assert.deepEqual(
    ['ready', 'consent_rejected', 'cancelled'].map((s) =>
      canTransitionAcademyRecording(s as never, 'processing')
    ),
    [false, false, false]
  );
});

test('assertAcademyRecordingTransition lancia su una transizione non valida', () => {
  assert.throws(
    () => assertAcademyRecordingTransition('ready', 'recording'),
    (error: unknown) => {
      assert.ok(error instanceof AcademyRecordingDomainError);
      assert.equal(error.code, 'INVALID_TRANSITION');
      return true;
    }
  );
});

test('isClosableRecordingStatus', () => {
  assert.equal(isClosableRecordingStatus('waiting_for_consent'), true);
  assert.equal(isClosableRecordingStatus('recording'), true);
  assert.equal(isClosableRecordingStatus('processing'), false);
  assert.equal(isClosableRecordingStatus('ready'), false);
});

test('academyRecordingTransitionPatch verso recording imposta startedAt', () => {
  const now = new Date('2026-09-18T10:00:00.000Z');
  const patch = academyRecordingTransitionPatch('recording', 1, now);
  assert.equal(patch.startedAt, now);
  assert.equal(patch.endedAt, undefined);
});

test('academyRecordingTransitionPatch verso processing da recording imposta endedAt', () => {
  const now = new Date('2026-09-18T11:00:00.000Z');
  const patch = academyRecordingTransitionPatch('processing', 1, now, 'recording');
  assert.equal(patch.endedAt, now);
});

test('academyRecordingTransitionPatch: riapertura da failed non riscrive endedAt', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const patch = academyRecordingTransitionPatch('processing', 1, now, 'failed');
  assert.equal(patch.endedAt, undefined);
});

test('academyRecordingTransitionPatch: fallimento diretto dell\'egress imposta comunque endedAt', () => {
  const now = new Date('2026-09-18T12:30:00.000Z');
  const patch = academyRecordingTransitionPatch('failed', 1, now, 'recording');
  assert.equal(patch.endedAt, now);
});

test('academyRecordingTransitionPatch azzera errorCode/Message entrando in processing o ready', () => {
  const now = new Date();
  assert.equal(academyRecordingTransitionPatch('processing', 1, now).errorCode, null);
  assert.equal(academyRecordingTransitionPatch('ready', 1, now).errorMessage, null);
  assert.equal(academyRecordingTransitionPatch('recording', 1, now).errorCode, undefined);
});
