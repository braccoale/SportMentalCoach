import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCancellationMessage,
  CANCELLATION_MESSAGE_TITLE,
  CANCELLATION_NOTE_MAX_LENGTH,
} from './cancellation-message';

test('crea il messaggio standard anche senza nota opzionale', () => {
  assert.deepEqual(buildCancellationMessage('   '), {
    ok: true,
    body: CANCELLATION_MESSAGE_TITLE,
  });
});

test('aggiunge la nota sotto al titolo e rimuove gli spazi esterni', () => {
  assert.deepEqual(buildCancellationMessage('  Ho avuto un imprevisto.  '), {
    ok: true,
    body: `${CANCELLATION_MESSAGE_TITLE}\n\nHo avuto un imprevisto.`,
  });
});

test('rifiuta note oltre il limite', () => {
  const result = buildCancellationMessage('x'.repeat(CANCELLATION_NOTE_MAX_LENGTH + 1));
  assert.equal(result.ok, false);
});
