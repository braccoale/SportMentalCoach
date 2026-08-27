import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areNotificationsSilenced } from './flags';

/**
 * La proprietà che conta davvero non è che l'interruttore funzioni: è che
 * **non** funzioni in produzione.
 *
 * Una variabile capace di zittire gli avvisi di un prodotto vivo è un guasto
 * che nessun errore segnala — le notifiche smettono di arrivare e tutto
 * continua a sembrare a posto. Se qualcuno un giorno togliesse il controllo su
 * `NODE_ENV`, questo test lo ferma.
 */

function withEnv(
  values: Record<string, string | undefined>,
  body: () => void
): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    body();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('in produzione non si zittisce niente, nemmeno chiedendolo', () => {
  withEnv(
    { NODE_ENV: 'production', NOTIFICATIONS_SILENCED: 'true' },
    () => assert.equal(areNotificationsSilenced(), false)
  );
});

test('fuori dalla produzione la richiesta viene accolta', () => {
  withEnv(
    { NODE_ENV: 'development', NOTIFICATIONS_SILENCED: 'true' },
    () => assert.equal(areNotificationsSilenced(), true)
  );
});

test('senza chiederlo esplicitamente le notifiche partono', () => {
  withEnv(
    { NODE_ENV: 'development', NOTIFICATIONS_SILENCED: undefined },
    () => assert.equal(areNotificationsSilenced(), false)
  );
});

test('solo la stringa «true» conta: nessun valore approssimato', () => {
  for (const value of ['1', 'yes', 'TRUE', 'si', '']) {
    withEnv({ NODE_ENV: 'development', NOTIFICATIONS_SILENCED: value }, () =>
      assert.equal(
        areNotificationsSilenced(),
        false,
        `"${value}" non deve zittire niente`
      )
    );
  }
});
