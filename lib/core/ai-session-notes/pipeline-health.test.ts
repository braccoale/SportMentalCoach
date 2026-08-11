import assert from 'node:assert/strict';
import test from 'node:test';
import { STUCK_JOB_MINUTES, assessPipeline } from './pipeline-health-policy';

const base = {
  readyJobs: 0,
  oldestReadyMinutes: null as number | null,
  untouchedJobs: 0,
  stuckSessions: 0,
  lastJobActivityAt: null as Date | null,
};

test('un job pronto e mai tentato da troppo tempo è il segnale di guasto', () => {
  // È la firma esatta del guasto reale: due trascrizioni ferme un'ora con
  // `attempt_count = 0`. Non è lentezza — nessuno le ha nemmeno guardate.
  const health = assessPipeline({
    ...base,
    readyJobs: 2,
    untouchedJobs: 2,
    oldestReadyMinutes: 71,
  });
  assert.equal(health.verdict, 'stuck');
  assert.match(health.message, /71 minuti/);
  assert.match(health.message, /worker non sta girando/);
});

test('un job appena entrato in coda non è un guasto', () => {
  // Sotto la soglia il worker può semplicemente non essere ancora passato:
  // gridare al guasto qui renderebbe l'allarme rumore da ignorare.
  const health = assessPipeline({
    ...base,
    readyJobs: 1,
    untouchedJobs: 1,
    oldestReadyMinutes: STUCK_JOB_MINUTES - 1,
  });
  assert.equal(health.verdict, 'ok');
});

test('un job già tentato sta lavorando, per quanto vecchio', () => {
  // Con tentativi alle spalle il worker lo ha in mano: può essere lento o in
  // attesa del provider, ma non è abbandonato.
  const health = assessPipeline({
    ...base,
    readyJobs: 1,
    untouchedJobs: 0,
    oldestReadyMinutes: 120,
  });
  assert.equal(health.verdict, 'ok');
});

test('una sessione ferma oltre la scadenza è comunque un guasto', () => {
  const health = assessPipeline({ ...base, stuckSessions: 1 });
  assert.equal(health.verdict, 'stuck');
  assert.match(health.message, /oltre la scadenza/);
});

test('coda vuota significa smaltito, non guasto', () => {
  assert.equal(assessPipeline(base).verdict, 'idle');
});
