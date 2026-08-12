import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countdownLabel,
  dayKey,
  dayTitle,
  timeLabel,
} from './day-grouping';

// Mezzogiorno del 12 agosto 2026, ora italiana (estate: UTC+2).
const now = new Date('2026-08-12T10:00:00Z');

test('le sessioni dello stesso giorno finiscono nello stesso gruppo', () => {
  const mattina = dayKey('2026-08-12T07:00:00Z');
  const sera = dayKey('2026-08-12T19:00:00Z');
  assert.equal(mattina, sera);
  assert.equal(mattina, '2026-08-12');
});

test('tarda sera resta nel giorno italiano, non scivola in quello UTC', () => {
  // Le 23:30 a Roma sono le 21:30 UTC: usando il fuso sbagliato la sessione
  // resterebbe nello stesso giorno per caso. Il caso che rompe e` l'opposto —
  // 00:30 a Roma, che in UTC e` ancora il giorno prima.
  assert.equal(dayKey('2026-08-12T22:30:00Z'), '2026-08-13');
});

test('oggi e domani hanno un nome, gli altri giorni una data', () => {
  assert.equal(dayTitle('2026-08-12T16:00:00Z', now), 'Oggi');
  assert.equal(dayTitle('2026-08-13T08:00:00Z', now), 'Domani');
  assert.match(dayTitle('2026-08-14T08:00:00Z', now), /venerd/i);
  assert.match(dayTitle('2026-08-14T08:00:00Z', now), /14 agosto/);
});

test('senza orario non si inventa un giorno', () => {
  assert.equal(dayKey(null), 'senza-data');
  assert.equal(dayTitle(null), 'Senza orario');
  assert.equal(timeLabel(null), '—');
});

test('l`ora e` quella italiana', () => {
  // 16:00 UTC in agosto = 18:00 a Roma.
  assert.equal(timeLabel('2026-08-12T16:00:00Z'), '18:00');
});

test('il conto alla rovescia parla solo quando manca poco', () => {
  const base = now.getTime();
  assert.equal(countdownLabel(new Date(base + 12 * 60_000).toISOString(), base), 'fra 12 minuti');
  assert.equal(countdownLabel(new Date(base + 30_000).toISOString(), base), 'sta per iniziare');
  assert.equal(countdownLabel(new Date(base - 10 * 60_000).toISOString(), base), 'in corso');
  // Oltre le due ore la sottrazione non aiuta: si torna all'orario.
  assert.equal(countdownLabel(new Date(base + 5 * 3600_000).toISOString(), base), null);
  // E una sessione finita da un pezzo non e` «in corso».
  assert.equal(countdownLabel(new Date(base - 5 * 3600_000).toISOString(), base), null);
});
