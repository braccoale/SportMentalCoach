import assert from 'node:assert/strict';
import test from 'node:test';
import { compassTimeoutFromEnvironment } from './openai-session-compass-provider';

/**
 * Il timeout del generatore di riepiloghi.
 *
 * Non e` un dettaglio di configurazione: e` il valore che ha deciso l'esito
 * della sessione 75, morta due volte di `COMPASS_TIMEOUT` a 45 secondi netti.
 * Il predefinito deve restare quello che entra sotto il tetto della funzione
 * Vercel, e un valore assurdo non deve poterlo sostituire.
 */

test('senza variabile resta il predefinito che entra sotto il tetto della funzione', () => {
  assert.equal(compassTimeoutFromEnvironment({}), 45_000);
  assert.equal(compassTimeoutFromEnvironment({ AI_NOTES_COMPASS_TIMEOUT_MS: '' }), 45_000);
});

test('fuori da Vercel il timeout si puo` alzare', () => {
  assert.equal(
    compassTimeoutFromEnvironment({ AI_NOTES_COMPASS_TIMEOUT_MS: '240000' }),
    240_000
  );
  assert.equal(
    compassTimeoutFromEnvironment({ AI_NOTES_COMPASS_TIMEOUT_MS: ' 90000 ' }),
    90_000
  );
});

test('un valore assurdo torna al predefinito invece di diventare un timeout', () => {
  for (const assurdo of ['0', '-1', 'presto', '999999999', '1.5', '  ']) {
    assert.equal(
      compassTimeoutFromEnvironment({ AI_NOTES_COMPASS_TIMEOUT_MS: assurdo }),
      45_000,
      `"${assurdo}" non deve diventare un timeout`
    );
  }
});
