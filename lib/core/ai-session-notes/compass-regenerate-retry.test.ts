import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableCompassRegenerateStatus } from './compass-regenerate-retry';

test('ritenta i fallimenti del tentativo: timeout, rate limit, contenuto respinto, guasto generico', () => {
  for (const status of [422, 429, 500, 502, 504]) {
    assert.equal(isRetryableCompassRegenerateStatus(status), true, `status ${status}`);
  }
});

test('non ritenta gli errori di accesso o di stato della sessione', () => {
  for (const status of [400, 401, 403, 404, 409]) {
    assert.equal(isRetryableCompassRegenerateStatus(status), false, `status ${status}`);
  }
});

/*
 * 503/COMPASS_UNAVAILABLE è una configurazione mancante (chiave API, modello):
 * un altro tentativo non la ripara, chiede solo un'altra chiamata inutile.
 */
test('non ritenta un servizio non configurato', () => {
  assert.equal(isRetryableCompassRegenerateStatus(503), false);
});
