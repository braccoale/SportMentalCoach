import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compassTimeoutFromEnvironment,
  isSessionCompassPromptVersionAtLeastCurrent,
} from './openai-session-compass-provider';

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

/**
 * Un report recuperato manualmente con `AI_NOTES_COMPASS_REASONING_EFFORT`
 * più alto del default non deve diventare inapprovabile in produzione: e`
 * il bug reale che ha bloccato Francesco su due sedute (Stefano Specker e
 * Edoardo Martini, 2026-09-16) — recuperate a `medium` la sera prima, poi
 * respinte con 422 perché la produzione confronta sempre contro `low`.
 */
test('un report scritto con uno sforzo più alto resta approvabile', () => {
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-medium-16000',
      'compass-v1:sport-context-v7-low-16000'
    ),
    true
  );
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-high-16000:g3',
      'compass-v1:sport-context-v7-low-16000:g3'
    ),
    true
  );
});

test('un report scritto con uno sforzo più basso resta da rigenerare', () => {
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-low-16000',
      'compass-v1:sport-context-v7-medium-16000'
    ),
    false
  );
});

test('identiche restano approvabili, ovviamente', () => {
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-low-16000',
      'compass-v1:sport-context-v7-low-16000'
    ),
    true
  );
});

test('una differenza fuori dallo sforzo resta un motivo di rigenerazione', () => {
  // Budget di token diverso: un cambio di configurazione vero, non un
  // recupero manuale — non va scambiato per equivalente.
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-medium-8000',
      'compass-v1:sport-context-v7-low-16000'
    ),
    false
  );
  // Versione delle linee guida diversa: il metodo e` davvero cambiato.
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent(
      'compass-v1:sport-context-v7-medium-16000:g2',
      'compass-v1:sport-context-v7-low-16000:g3'
    ),
    false
  );
});

test('un formato che non segue lo schema atteso non è mai equivalente', () => {
  // Revisione precedente allo schema con lo sforzo (es. `compass-v2`, come
  // quando l'academy aggiorna il metodo): deve restare un motivo di
  // rigenerazione, non aprire una scappatoia.
  assert.equal(
    isSessionCompassPromptVersionAtLeastCurrent('compass-v2', 'compass-v1:sport-context-v7-low-16000'),
    false
  );
});
