import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTranscriptTimestamp } from './time';

test('sotto l’ora restano minuti e secondi', () => {
  assert.equal(formatTranscriptTimestamp(0), '00:00');
  assert.equal(formatTranscriptTimestamp(24_985), '00:24');
  assert.equal(formatTranscriptTimestamp(59 * 60_000 + 59_000), '59:59');
});

/*
 * La seduta 72 è durata 3.717 secondi e si leggeva «61:57»: esatto, e da
 * decifrare dividendo per sessanta a mente. Le sedute vere durano un'ora,
 * quindi questo è il caso normale.
 */
test('oltre l’ora compare il campo delle ore', () => {
  assert.equal(formatTranscriptTimestamp(3_717_395), '1:01:57');
  assert.equal(formatTranscriptTimestamp(2 * 3_600_000 + 5_000), '2:00:05');
});
