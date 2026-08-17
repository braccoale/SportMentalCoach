import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_GAP_SECONDS,
  assessLiveCoverage,
  type LiveRecordingRow,
} from './live-coverage';

const now = new Date('2026-08-11T15:20:00Z');
const started = new Date('2026-08-11T14:58:00Z');
const at = (secondsBefore: number) =>
  new Date(now.getTime() - secondsBefore * 1000).toISOString();

const recording = (role: 'coach' | 'athlete'): LiveRecordingRow => ({
  role,
  status: 'recording',
  endedAt: null,
});

test('con entrambe le voci in registrazione non si dice niente', () => {
  const result = assessLiveCoverage({
    sessionStatus: 'active',
    sessionStartedAt: started,
    recordings: [recording('coach'), recording('athlete')],
    now,
  });

  assert.deepEqual(result.gaps, []);
  assert.equal(result.message, '');
});

test('la seduta 181: il coach fermo da quindici minuti', () => {
  /*
   * Il caso reale. Un segmento chiuso al minuto sette, due tentativi falliti,
   * e poi nulla: il sistema lo sapeva e non lo diceva a nessuno.
   */
  const result = assessLiveCoverage({
    sessionStatus: 'active',
    sessionStartedAt: started,
    recordings: [
      { role: 'coach', status: 'recorded', endedAt: at(900) },
      { role: 'coach', status: 'failed', endedAt: at(897) },
      recording('athlete'),
    ],
    now,
  });

  assert.deepEqual(result.gaps, [{ role: 'coach', sinceSeconds: 897 }]);
  assert.match(result.message, /La tua voce non viene registrata da 15 minuti/);
});

test('una ripubblicazione di pochi secondi non fa scattare l`avviso', () => {
  // Fra un segmento e il successivo passano secondi anche quando tutto
  // funziona: un avviso a ogni inciampo si impara a ignorare.
  const result = assessLiveCoverage({
    sessionStatus: 'active',
    sessionStartedAt: started,
    recordings: [
      { role: 'coach', status: 'recorded', endedAt: at(LIVE_GAP_SECONDS - 10) },
      recording('athlete'),
    ],
    now,
  });

  assert.deepEqual(result.gaps, []);
});

test('una voce mai partita è in ritardo dall`inizio della seduta', () => {
  // È il caso peggiore, non il più innocuo: senza un riferimento risulterebbe
  // in ritardo di nulla.
  const result = assessLiveCoverage({
    sessionStatus: 'active',
    sessionStartedAt: started,
    recordings: [recording('athlete')],
    now,
  });

  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].role, 'coach');
  assert.equal(result.gaps[0].sinceSeconds, 22 * 60);
});

test('ferme entrambe, si parla al plurale', () => {
  const result = assessLiveCoverage({
    sessionStatus: 'active',
    sessionStartedAt: started,
    recordings: [],
    now,
  });

  assert.equal(result.gaps.length, 2);
  assert.match(result.message, /Nessuna delle due voci/);
});

test('a seduta non più attiva non si avvisa nessuno', () => {
  // Il discorso a cose fatte lo fa la copertura finale, che ha i numeri veri.
  const result = assessLiveCoverage({
    sessionStatus: 'processing',
    sessionStartedAt: started,
    recordings: [],
    now,
  });

  assert.deepEqual(result.gaps, []);
  assert.equal(result.message, '');
});
