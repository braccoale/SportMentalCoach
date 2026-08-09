import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretProbeResponse } from './callback-probe-policy';

const origin = 'https://www.kaipaicoaching.com';

test('il 404 del nostro endpoint e la prova che siamo raggiungibili', () => {
  // Un token inesistente riceve 404 dalla nostra applicazione: e' proprio
  // quella risposta a dimostrare che la richiesta e' arrivata fin qui.
  const result = interpretProbeResponse(origin, 404);
  assert.equal(result.reachable, true);
});

test('una protezione davanti al dominio respinge anche il provider', () => {
  for (const status of [401, 403]) {
    const result = interpretProbeResponse(origin, status);
    assert.equal(result.reachable, false);
    assert.match(result.detail, /protetto/);
  }
});

test('un redirect e un fallimento, non un successo', () => {
  // Il provider non segue i redirect: chiamarlo raggiungibile darebbe un
  // esito ottimista e falso, che e' peggio di un esito negativo.
  const result = interpretProbeResponse(origin, 308);
  assert.equal(result.reachable, false);
  assert.match(result.detail, /redirect/);
});

test('un 200 non e la risposta attesa: qualcosa risponde al posto nostro', () => {
  const result = interpretProbeResponse(origin, 200);
  assert.equal(result.reachable, false);
});
