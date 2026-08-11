import assert from 'node:assert/strict';
import test from 'node:test';
import { assessRecordingCoverage } from './recording-coverage';

test('la seduta in cui il coach si e` interrotto viene dichiarata', () => {
  // Il caso reale: 56 minuti di seduta, il coach registrato per 7.
  const coverage = assessRecordingCoverage({
    sessionSeconds: 3360,
    recorded: [
      { role: 'athlete', seconds: 3343 },
      { role: 'coach', seconds: 427 },
    ],
  });

  assert.equal(coverage.hasGap, true);
  assert.match(coverage.notice, /voce del coach/);
  assert.match(coverage.notice, /7 minuti su 56/);
  // L'atleta era coperto: non deve comparire nell'avviso.
  assert.doesNotMatch(coverage.notice, /atleta/);
});

test('qualche secondo di scarto non e` una lacuna', () => {
  // La registrazione parte un istante dopo e finisce un istante prima: senza
  // tolleranza ogni singola seduta risulterebbe incompleta, e un avviso
  // sempre acceso non lo legge piu` nessuno.
  const coverage = assessRecordingCoverage({
    sessionSeconds: 1800,
    recorded: [
      { role: 'coach', seconds: 1789 },
      { role: 'athlete', seconds: 1789 },
    ],
  });

  assert.equal(coverage.hasGap, false);
  assert.equal(coverage.notice, '');
});

test('una voce mai registrata e` la lacuna piu` grave', () => {
  const coverage = assessRecordingCoverage({
    sessionSeconds: 1800,
    recorded: [{ role: 'athlete', seconds: 1790 }],
  });

  assert.equal(coverage.hasGap, true);
  const coach = coverage.participants.find((p) => p.role === 'coach');
  assert.equal(coach?.recordedSeconds, 0);
  assert.equal(coach?.ratio, 0);
});

test('senza durata della sessione non si inventano lacune', () => {
  // Non sapere quanto e` durata non autorizza a dire che manca qualcosa.
  const coverage = assessRecordingCoverage({
    sessionSeconds: 0,
    recorded: [],
  });

  assert.equal(coverage.hasGap, false);
});

test('i segmenti della stessa voce si sommano', () => {
  // Una registrazione ripresa dopo un'interruzione e` piu` segmenti, non piu`
  // registrazioni: sommandoli la copertura torna completa.
  const coverage = assessRecordingCoverage({
    sessionSeconds: 3700,
    recorded: [
      { role: 'coach', seconds: 1043 },
      { role: 'coach', seconds: 2665 },
      { role: 'athlete', seconds: 974 },
      { role: 'athlete', seconds: 2680 },
    ],
  });

  assert.equal(coverage.hasGap, false);
});
