import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConversationMap } from './conversation-map';

const M = 60_000;

test('le corsie sono sempre due, coach e atleta, in ordine', () => {
  const map = buildConversationMap({ segments: [] });
  assert.deepEqual(
    map.lanes.map((lane) => lane.role),
    ['coach', 'athlete']
  );
});

test('la quota si calcola sul tempo parlato, non sulla durata', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 30 * M, role: 'coach' },
      { startMs: 40 * M, endMs: 50 * M, role: 'athlete' },
    ],
    durationMs: 100 * M,
  });

  // 30 su 40 minuti parlati: i sessanta minuti di pausa non appartengono a
  // nessuno dei due e non devono falsare il confronto.
  assert.equal(map.lanes[0].sharePercent, 75);
  assert.equal(map.lanes[1].sharePercent, 25);
});

test('i blocchi diventano percentuali della durata', () => {
  const map = buildConversationMap({
    segments: [{ startMs: 25 * M, endMs: 50 * M, role: 'coach' }],
    durationMs: 100 * M,
  });

  assert.equal(map.lanes[0].blocks[0].startPercent, 25);
  assert.equal(map.lanes[0].blocks[0].widthPercent, 25);
});

test('i blocchi vicini si fondono per non produrre rumore', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 5_000, role: 'coach' },
      { startMs: 6_000, endMs: 10_000, role: 'coach' },
      { startMs: 30_000, endMs: 35_000, role: 'coach' },
    ],
    durationMs: 60_000,
  });

  assert.equal(map.lanes[0].blocks.length, 2);
  assert.equal(map.lanes[0].blocks[0].endMs, 10_000);
});

test('senza durata esplicita si usa l ultimo istante parlato', () => {
  const map = buildConversationMap({
    segments: [{ startMs: 0, endMs: 42 * M, role: 'athlete' }],
  });
  assert.equal(map.durationMs, 42 * M);
});

test('una durata piu corta del parlato non taglia la conversazione', () => {
  const map = buildConversationMap({
    segments: [{ startMs: 0, endMs: 50 * M, role: 'coach' }],
    durationMs: 10 * M,
  });
  assert.equal(map.durationMs, 50 * M);
});

test('chi parla molto di piu viene dichiarato', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 70 * M, role: 'coach' },
      { startMs: 70 * M, endMs: 100 * M, role: 'athlete' },
    ],
  });
  assert.equal(map.dominantRole, 'coach');
});

test('una conversazione equilibrata non dichiara un dominante', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 50 * M, role: 'coach' },
      { startMs: 50 * M, endMs: 100 * M, role: 'athlete' },
    ],
  });
  assert.equal(map.dominantRole, null);
});

test('i momenti chiave diventano posizioni sulla linea, in ordine', () => {
  const map = buildConversationMap({
    segments: [{ startMs: 0, endMs: 100 * M, role: 'coach' }],
    moments: [
      { atMs: 75 * M, label: 'Terzo' },
      { atMs: 25 * M, label: 'Primo' },
    ],
  });

  assert.deepEqual(
    map.moments.map((moment) => moment.label),
    ['Primo', 'Terzo']
  );
  assert.equal(map.moments[0].atPercent, 25);
});

test('un momento fuori dalla sessione viene scartato', () => {
  const map = buildConversationMap({
    segments: [{ startMs: 0, endMs: 10 * M, role: 'coach' }],
    moments: [{ atMs: 99 * M, label: 'Impossibile' }],
  });
  assert.deepEqual(map.moments, []);
});

test('una sessione senza parlato non divide per zero', () => {
  const map = buildConversationMap({ segments: [], durationMs: 0 });
  assert.equal(map.durationMs, 0);
  assert.equal(map.lanes[0].sharePercent, 0);
  assert.equal(map.dominantRole, null);
});
