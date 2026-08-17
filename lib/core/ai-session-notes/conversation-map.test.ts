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

test('conta gli interventi del coach e quanti contenevano una domanda', () => {
  const { insight } = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 10_000, role: 'coach', text: 'Come stai?' },
      { startMs: 10_000, endMs: 20_000, role: 'coach', text: 'Capisco.' },
      { startMs: 20_000, endMs: 30_000, role: 'coach', text: 'E poi? Dimmi.' },
      { startMs: 30_000, endMs: 35_000, role: 'athlete', text: 'Bene.' },
    ],
  });
  assert.equal(insight.coachTurns, 3);
  assert.equal(insight.coachQuestionTurns, 2);
});

test('la durata media di un turno distingue chi guida da chi risponde', () => {
  const { insight } = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 20_000, role: 'coach' },
      { startMs: 20_000, endMs: 25_000, role: 'athlete' },
      { startMs: 25_000, endMs: 45_000, role: 'coach' },
      { startMs: 45_000, endMs: 50_000, role: 'athlete' },
    ],
  });
  assert.equal(insight.coachAverageTurnSec, 20);
  assert.equal(insight.athleteAverageTurnSec, 5);
});

test('risposte che si allungano nella seconda meta significano apertura', () => {
  const seg = [];
  for (let i = 0; i < 4; i++) seg.push({ startMs: i * 10_000, endMs: i * 10_000 + 3_000, role: 'athlete' as const });
  for (let i = 0; i < 4; i++) seg.push({ startMs: 60_000 + i * 10_000, endMs: 60_000 + i * 10_000 + 25_000, role: 'athlete' as const });
  const { insight } = buildConversationMap({ segments: seg, durationMs: 120_000 });
  assert.equal(insight.athleteOpenedUp, true);
  assert.ok(insight.athleteSecondHalfSec > insight.athleteFirstHalfSec);
});

test('risposte che restano corte non vengono raccontate come apertura', () => {
  const seg = [];
  for (let i = 0; i < 8; i++) seg.push({ startMs: i * 12_000, endMs: i * 12_000 + 3_000, role: 'athlete' as const });
  const { insight } = buildConversationMap({ segments: seg, durationMs: 120_000 });
  assert.equal(insight.athleteOpenedUp, false);
});

test('con troppo pochi turni non si dichiara nulla sull apertura', () => {
  const { insight } = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 3_000, role: 'athlete' },
      { startMs: 60_000, endMs: 30_0000, role: 'athlete' },
    ],
    durationMs: 120_000,
  });
  assert.equal(
    insight.athleteOpenedUp,
    null,
    'due turni possono ribaltarsi per caso: meglio tacere che sbagliare'
  );
});

/*
 * La seduta 72: registrazione dell'atleta persa, un'ora di coach trascritta.
 * La mappa diceva «Hai parlato tu per il 100% del tempo» — esatto come
 * aritmetica, falso come frase, e letto dal coach come un appunto sul proprio
 * modo di condurre.
 */
test('una voce non registrata non produce un dominante', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 20_000, role: 'coach', text: 'ciao?' },
      { startMs: 30_000, endMs: 60_000, role: 'coach', text: 'allora' },
    ],
    durationMs: 3_600_000,
    rolesWithoutRecording: ['athlete'],
  });
  assert.equal(map.dominantRole, null);
  assert.deepEqual(map.rolesWithoutRecording, ['athlete']);
});

test('senza voci mancanti il dominante si calcola come prima', () => {
  const map = buildConversationMap({
    segments: [
      { startMs: 0, endMs: 60_000, role: 'coach' },
      { startMs: 70_000, endMs: 80_000, role: 'athlete' },
    ],
    durationMs: 120_000,
  });
  assert.equal(map.dominantRole, 'coach');
  assert.deepEqual(map.rolesWithoutRecording, []);
});
