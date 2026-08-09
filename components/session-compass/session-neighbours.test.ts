import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionNeighbours } from './session-neighbours';

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
