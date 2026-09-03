import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessService,
  countWithUnit,
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
    unit: 'sedute',
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
  assert.match(verdict.message, /12 su 12 sedute senza problemi/);
});

test('un fallimento su dieci è degradato, non rotto', () => {
  const verdict = assessService(signal({ ok: 9, failed: 1 }));
  assert.equal(verdict.status, 'degradato');
  // «1 sedute su 10» era la prima forma, ed era sbagliata: «N su M unita'»
  // regge singolare e plurale senza dover declinare niente.
  assert.match(verdict.message, /1 su 10 sedute con problemi/);
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

test('«1 sedute» non deve esistere: l’unità si declina', () => {
  assert.equal(countWithUnit(1, 'sedute', 'seduta'), '1 seduta');
  assert.equal(countWithUnit(8, 'sedute', 'seduta'), '8 sedute');
  assert.equal(countWithUnit(0, 'sedute', 'seduta'), '0 sedute');
  // Senza forma singolare dichiarata resta il plurale: mai un errore muto.
  assert.equal(countWithUnit(1, 'job', 'job'), '1 job');
});

test('la voce porta con sé dove guardare e cosa fare, quando c’è', () => {
  const verdict = assessService(
    signal({
      ok: 40,
      failed: 8,
      causes: [
        { code: 'media_device_error', label: 'Errore dispositivo', count: 8, hint: '…' },
      ],
      href: '/dashboard/admin/video-sessions',
      hrefLabel: 'Apri il registro tecnico',
      action: 'Tutto concentrato su un coach solo.',
    })
  );

  assert.equal(verdict.expandable, true);
  assert.equal(verdict.href, '/dashboard/admin/video-sessions');
  assert.equal(verdict.causes.length, 1);
  // La causa più frequente entra nel messaggio: si legge senza aprire.
  assert.match(verdict.message, /errore dispositivo \(8\)/);
});

test('una causa a zero non compare, e una voce sana non è apribile', () => {
  const verdict = assessService(
    signal({
      ok: 12,
      failed: 0,
      causes: [{ code: 'X', label: 'X', count: 0, hint: '…' }],
    })
  );
  assert.deepEqual(verdict.causes, []);
  assert.equal(verdict.expandable, false);
});
