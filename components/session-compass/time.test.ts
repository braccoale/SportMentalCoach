import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTranscriptTimestamp } from './time';

test('formatta i timestamp reali in mm:ss senza approssimare al minuto', () => {
  assert.equal(formatTranscriptTimestamp(0), '00:00');
  assert.equal(formatTranscriptTimestamp(5_000), '00:05');
  assert.equal(formatTranscriptTimestamp(61_999), '01:01');
  assert.equal(formatTranscriptTimestamp(3_660_000), '61:00');
});
