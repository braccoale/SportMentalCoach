import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DOT_GAP_PERCENT,
  placeSessionsOnTimeline,
  sessionNeighbours,
} from './session-neighbours';

const sessions = [
  { sessionId: 10, sessionDate: '2026-06-01T10:00:00Z', compassHref: '/a' },
  { sessionId: 11, sessionDate: '2026-07-01T10:00:00Z', compassHref: '/b' },
  { sessionId: 12, sessionDate: '2026-08-01T10:00:00Z', compassHref: '/c' },
];

test('in mezzo al percorso si va in entrambe le direzioni', () => {
  const result = sessionNeighbours({ sessions, currentSessionId: 11 });
  assert.equal(result.previous?.sessionId, 10);
  assert.equal(result.next?.sessionId, 12);
  assert.equal(result.position, 2);
  assert.equal(result.total, 3);
});

test('la prima seduta non ha un prima, l’ultima non ha un dopo', () => {
  assert.equal(sessionNeighbours({ sessions, currentSessionId: 10 }).previous, null);
  assert.equal(sessionNeighbours({ sessions, currentSessionId: 12 }).next, null);
});

test('una bozza non ancora approvata sta in fondo al percorso', () => {
  // È il caso normale mentre si legge una bozza, non un caso limite: la
  // seduta entra nel percorso solo quando il coach la approva.
  const result = sessionNeighbours({ sessions, currentSessionId: 99 });
  assert.equal(result.previous?.sessionId, 12);
  assert.equal(result.next, null);
  assert.equal(result.position, 4);
  assert.equal(result.total, 4);
});

test('l’ordine è quello del tempo, non quello di arrivo dei dati', () => {
  const shuffled = [sessions[2], sessions[0], sessions[1]];
  const result = sessionNeighbours({ sessions: shuffled, currentSessionId: 11 });
  assert.equal(result.previous?.sessionId, 10);
  assert.equal(result.next?.sessionId, 12);
});

test('una seduta senza data finisce in fondo, non scartata', () => {
  const withUndated = [
    ...sessions,
    { sessionId: 13, sessionDate: null, compassHref: '/d' },
  ];
  const result = sessionNeighbours({ sessions: withUndated, currentSessionId: 12 });
  assert.equal(result.next?.sessionId, 13);
});

test('un percorso vuoto non propone nessuna direzione', () => {
  const result = sessionNeighbours({ sessions: [], currentSessionId: 7 });
  assert.equal(result.previous, null);
  assert.equal(result.next, null);
});

test('le sedute sono distanziate come nel tempo, non a intervalli uguali', () => {
  // Due incontri ravvicinati e poi un mese di pausa raccontano qualcosa:
  // distribuirli a distanze uguali cancellerebbe proprio quel qualcosa.
  const placed = placeSessionsOnTimeline([
    { sessionId: 1, sessionDate: '2026-06-01T10:00:00Z', compassHref: '/a' },
    { sessionId: 2, sessionDate: '2026-06-03T10:00:00Z', compassHref: '/b' },
    { sessionId: 3, sessionDate: '2026-07-03T10:00:00Z', compassHref: '/c' },
  ]);
  assert.equal(placed[0].offsetPercent, 0);
  assert.equal(placed[2].offsetPercent, 100);
  assert.ok(placed[1].offsetPercent < 20, 'la seconda resta vicina alla prima');
});

test('due sedute lo stesso giorno restano due punti cliccabili', () => {
  const placed = placeSessionsOnTimeline([
    { sessionId: 1, sessionDate: '2026-06-01T09:00:00Z', compassHref: '/a' },
    { sessionId: 2, sessionDate: '2026-06-01T10:00:00Z', compassHref: '/b' },
    { sessionId: 3, sessionDate: '2026-08-01T10:00:00Z', compassHref: '/c' },
  ]);
  assert.ok(
    placed[1].offsetPercent - placed[0].offsetPercent >= MIN_DOT_GAP_PERCENT,
    'un punto sotto un altro non si puo cliccare'
  );
  assert.ok(placed[2].offsetPercent <= 100);
});

test('una seduta sola sta al centro, non appiccicata a un bordo', () => {
  const placed = placeSessionsOnTimeline([
    { sessionId: 1, sessionDate: '2026-06-01T10:00:00Z', compassHref: '/a' },
  ]);
  assert.equal(placed[0].offsetPercent, 50);
});
