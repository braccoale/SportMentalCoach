import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessService,
  worstServiceStatus,
  type ServiceSignal,
} from './service-health';

function signal(over: Partial<ServiceSignal> = {}): ServiceSignal {
  return {
    key: 'trascrizione',
    label: 'Trascrizione',
    configured: true,
    ok: 10,
    failed: 0,
    measures: 'job di trascrizione conclusi nel periodo',
    ...over,
  };
}

test('senza configurazione il servizio non è rotto: non è osservato', () => {
  const verdict = assessService(
    signal({ configured: false, unconfiguredReason: 'DEEPGRAM_API_KEY assente.' })
  );
  assert.equal(verdict.status, 'non_monitorato');
  assert.equal(verdict.message, 'DEEPGRAM_API_KEY assente.');
});

test('zero operazioni non vale «Operativo»', () => {
  const verdict = assessService(signal({ ok: 0, failed: 0 }));
  assert.equal(verdict.status, 'non_monitorato');
  assert.match(verdict.message, /Nessuna operazione nel periodo/);
});

test('nessuna misura raccolta non vale «Operativo»', () => {
  const verdict = assessService(signal({ ok: null, failed: null }));
  assert.equal(verdict.status, 'non_monitorato');
});

test('tutte riuscite: operativo, e lo dice con i numeri', () => {
  const verdict = assessService(signal({ ok: 12, failed: 0 }));
  assert.equal(verdict.status, 'operativo');
  assert.match(verdict.message, /12 operazioni riuscite/);
});

test('un fallimento su dieci è degradato, non rotto', () => {
  const verdict = assessService(signal({ ok: 9, failed: 1 }));
  assert.equal(verdict.status, 'degradato');
  assert.match(verdict.message, /1 fallimento su 10/);
});

test('metà delle operazioni fallite è un guasto', () => {
  const verdict = assessService(signal({ ok: 5, failed: 5 }));
  assert.equal(verdict.status, 'errore');
});

test('un guasto dichiarato salta il conteggio', () => {
  const verdict = assessService(
    signal({ ok: 100, failed: 0, hardFailure: { reason: 'Coda ferma da 40 minuti.' } })
  );
  assert.equal(verdict.status, 'errore');
  assert.equal(verdict.message, 'Coda ferma da 40 minuti.');
});

test('il verdetto complessivo è il peggiore, e non-monitorato non tinge di rosso', () => {
  const verdetti = [
    assessService(signal({ key: 'a', ok: 5, failed: 0 })),
    assessService(signal({ key: 'b', configured: false })),
  ];
  assert.equal(worstServiceStatus(verdetti), 'operativo');

  assert.equal(
    worstServiceStatus([
      ...verdetti,
      assessService(signal({ key: 'c', ok: 8, failed: 1 })),
    ]),
    'degradato'
  );

  assert.equal(
    worstServiceStatus([
      ...verdetti,
      assessService(signal({ key: 'd', ok: 1, failed: 9 })),
    ]),
    'errore'
  );

  assert.equal(
    worstServiceStatus([assessService(signal({ key: 'e', configured: false }))]),
    'non_monitorato'
  );
});
