import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelineErrorCode, pipelineLogLine } from './pipeline-log';
import { AiNotesProcessingError } from './processing-policy';

test('ogni riga ha la stessa forma, cosi si puo interrogare', () => {
  assert.deepEqual(
    pipelineLogLine({
      phase: 'transcription_submit',
      outcome: 'ok',
      sessionId: 60,
      jobId: 1243,
      durationMs: 1987.4,
      counts: { segmenti: 0 },
    }),
    {
      tag: 'ai-notes',
      phase: 'transcription_submit',
      outcome: 'ok',
      sessionId: 60,
      jobId: 1243,
      durationMs: 1987,
      counts: { segmenti: 0 },
    }
  );
});

test('i campi assenti non diventano null: una riga sporca non si filtra', () => {
  assert.deepEqual(pipelineLogLine({ phase: 'queue_run', outcome: 'started' }), {
    tag: 'ai-notes',
    phase: 'queue_run',
    outcome: 'started',
  });
});

test('del fallimento si registra il codice, mai il messaggio', () => {
  // Il messaggio di un provider puo' contenere l'url firmata che gli abbiamo
  // passato: nel registro non ci deve entrare.
  const error = new AiNotesProcessingError(
    'TRANSCRIPTION_FAILED',
    'https://storage.example/audio.ogg?token=segretissimo'
  );
  const line = pipelineLogLine({
    phase: 'transcription_submit',
    outcome: 'failed',
    errorCode: pipelineErrorCode(error),
  });
  assert.equal(line.errorCode, 'TRANSCRIPTION_FAILED');
  assert.ok(!JSON.stringify(line).includes('segretissimo'));
});

test('un errore senza codice non passa inosservato', () => {
  assert.equal(pipelineErrorCode(new Error('crash')), 'UNEXPECTED_ERROR');
  assert.equal(pipelineErrorCode(null), 'UNEXPECTED_ERROR');
});
