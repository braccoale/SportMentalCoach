import assert from 'node:assert/strict';
import test from 'node:test';
import type { MentalJourneyEntry } from './mental-journey';
import {
  MAX_GOAL_TRACK_DOTS,
  buildJourneyGoalRows,
  parseJourneyGoalStatus,
  summarizeGoalTrack,
  visibleJourneySessions,
  type GoalSessionLinks,
  type JourneyGoalRow,
  type StoredJourneyGoal,
} from './journey-goals';

function entry(sessionId: number, day: number): MentalJourneyEntry {
  return {
    sessionId,
    bookingId: 500 + sessionId,
    reportId: sessionId,
    reportVersion: 1,
    sessionDate: `2026-05-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    sharedAt: null,
    approvedAt: '2026-08-01T10:00:00.000Z',
    coachName: 'Coach',
    summary: 's',
    focus: null,
    themes: [],
    emergingResource: null,
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    throughLine: null,
    isApproved: true,
    compassHref: `/dashboard/appointments/${500 + sessionId}`,
  };
}

/** Gli agganci scritti: quali sedute hanno toccato quale obiettivo. */
function links(...pairs: Array<[number, number[]]>): GoalSessionLinks {
  return new Map(pairs.map(([goalId, sessionIds]) => [goalId, new Set(sessionIds)]));
}

function goal(over: Partial<StoredJourneyGoal> & { id: number }): StoredJourneyGoal {
  return {
    title: `Obiettivo ${over.id}`,
    isPrimary: false,
    status: 'in_corso',
    themeKey: null,
    position: 0,
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    ...over,
  };
}

/** La timeline arriva dalla più recente alla più vecchia. */
const TIMELINE = [entry(3, 9), entry(2, 5), entry(1, 1)];

test("l'obiettivo principale sta sempre in cima", () => {
  const rows = buildJourneyGoalRows({
    goals: [
      goal({ id: 1, position: 0 }),
      goal({ id: 2, isPrimary: true, position: 5 }),
      goal({ id: 3, position: 1 }),
    ],
    timeline: TIMELINE,
    links: links(),
  });

  assert.deepEqual(
    rows.map((row) => row.id),
    [2, 1, 3]
  );
});

test('i pallini vanno dal passato al presente', () => {
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1 })],
    timeline: TIMELINE,
    links: links(),
  });

  assert.deepEqual(
    row.track.map((dot) => dot.sessionId),
    [1, 2, 3]
  );
});

test('un pallino e pieno solo dove il tema e emerso davvero', () => {
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1, themeKey: 'errore' })],
    timeline: TIMELINE,
    links: links([1, [1, 3]]),
  });

  assert.deepEqual(
    row.track.map((dot) => dot.touched),
    [true, false, true]
  );
  assert.equal(row.lastTouchedAt, '2026-05-09T10:00:00.000Z');
  assert.equal(row.isTracked, true);
});

test('un obiettivo senza tema non finge una traccia', () => {
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1, themeKey: null })],
    timeline: TIMELINE,
    links: links(),
  });

  assert.ok(row.track.every((dot) => !dot.touched));
  assert.equal(row.lastTouchedAt, null);
  assert.equal(row.isTracked, false);
});

test('la traccia mostra le sedute recenti, non tutte quelle di sempre', () => {
  const many = Array.from({ length: 20 }, (_, index) =>
    entry(index + 1, ((index * 1) % 28) + 1)
  );
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1 })],
    timeline: many,
    links: links(),
  });

  assert.equal(row.track.length, MAX_GOAL_TRACK_DOTS);
});

test('il pallino porta al riepilogo di quella seduta', () => {
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1 })],
    timeline: TIMELINE,
    links: links(),
  });
  assert.equal(row.track[0].href, '/dashboard/appointments/501#session-compass');
});

test('uno stato sconosciuto non rompe la riga', () => {
  assert.equal(parseJourneyGoalStatus('in_miglioramento'), 'in_miglioramento');
  assert.equal(parseJourneyGoalStatus('qualcosa'), 'in_corso');
});

test('senza obiettivi non ci sono righe', () => {
  assert.deepEqual(
    buildJourneyGoalRows({ goals: [], timeline: TIMELINE, links: links() }),
    []
  );
});


test('tutte le righe condividono lo stesso asse di sedute', () => {
  // E' cio' che rende leggibile una colonna in verticale: se due obiettivi
  // avessero tracce di lunghezza diversa, «il 26 maggio» non starebbe sopra
  // la stessa posizione in tutte le righe.
  const rows = buildJourneyGoalRows({
    goals: [goal({ id: 1 }), goal({ id: 2, position: 1 })],
    timeline: TIMELINE,
    links: links([1, [1, 3]]),
  });

  assert.deepEqual(
    rows[0].track.map((d) => d.sessionId),
    rows[1].track.map((d) => d.sessionId)
  );
  assert.equal(rows[1].track.length, 3);
});

test('un aggancio a una seduta fuori dalla finestra non inventa un pallino', () => {
  const rows = buildJourneyGoalRows({
    goals: [goal({ id: 1 })],
    timeline: TIMELINE,
    links: links([1, [99]]),
  });

  assert.ok(rows[0].track.every((dot) => !dot.touched));
  assert.equal(rows[0].isTracked, false, 'agganciato a nulla di visibile');
});

test('le sedute selezionabili sono in ordine cronologico e numerate da 1', () => {
  const sessions = visibleJourneySessions(TIMELINE);

  assert.deepEqual(
    sessions.map((session) => [session.sessionId, session.ordinal]),
    [
      [1, 1],
      [2, 2],
      [3, 3],
    ]
  );
});

test('le sedute selezionabili si fermano alla finestra mostrata', () => {
  const long = Array.from({ length: 15 }, (_, index) =>
    entry(index + 1, index + 1)
  ).reverse();

  const sessions = visibleJourneySessions(long);

  assert.equal(sessions.length, MAX_GOAL_TRACK_DOTS);
  // Le ultime, non le prime: un obiettivo si aggancia alle sedute recenti.
  assert.equal(sessions.at(-1)?.sessionId, 15);
  assert.equal(sessions[0]?.ordinal, 1);
});

/**
 * Il motivo per cui la funzione esiste. L'asse disegnato e l'elenco su cui il
 * coach spunta devono essere la stessa cosa: se divergono, si spunta una seduta
 * che nella riga non compare, e il pallino acceso non si vede da nessuna parte.
 */
test("l'asse selezionabile coincide con la traccia disegnata", () => {
  const long = Array.from({ length: 12 }, (_, index) =>
    entry(index + 1, index + 1)
  ).reverse();

  const sessions = visibleJourneySessions(long);
  const [row] = buildJourneyGoalRows({
    goals: [goal({ id: 1 })],
    timeline: long,
    links: links(),
  });

  assert.deepEqual(
    sessions.map((session) => session.sessionId),
    row.track.map((dot) => dot.sessionId)
  );
});

test('una seduta senza data finisce in fondo, non in testa', () => {
  const undated = { ...entry(9, 1), sessionDate: null };

  const sessions = visibleJourneySessions([undated, ...TIMELINE]);

  assert.equal(sessions.at(-1)?.sessionId, 9);
});

function rowWith(touched: readonly boolean[]): JourneyGoalRow {
  const track = touched.map((isTouched, index) => ({
    sessionId: index + 1,
    sessionDate: `2026-05-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    touched: isTouched,
    href: '#',
  }));
  return {
    id: 1,
    title: 'Obiettivo',
    isPrimary: true,
    status: 'in_corso',
    track,
    lastTouchedAt: [...track].reverse().find((dot) => dot.touched)?.sessionDate ?? null,
    updatedAt: '2026-05-10T10:00:00.000Z',
    isTracked: track.some((dot) => dot.touched),
  };
}

test('conta le sedute segnate e quante ne sono passate dall’ultima', () => {
  const summary = summarizeGoalTrack(rowWith([true, false, true, false, false]));
  assert.equal(summary.touchedCount, 2);
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.sessionsSinceLastTouch, 2);
});

test('l’ultima seduta segnata non lascia nessuna distanza', () => {
  const summary = summarizeGoalTrack(rowWith([false, false, true]));
  assert.equal(summary.sessionsSinceLastTouch, 0);
  assert.equal(summary.stale, false);
});

test('saltare una sola seduta non basta a dirlo fermo', () => {
  assert.equal(summarizeGoalTrack(rowWith([true, true, false])).stale, false);
  assert.equal(summarizeGoalTrack(rowWith([true, false, false])).stale, true);
});

test('un obiettivo mai segnato è fermo, e non ha un’ultima volta', () => {
  const summary = summarizeGoalTrack(rowWith([false, false, false]));
  assert.equal(summary.sessionsSinceLastTouch, null);
  assert.equal(summary.lastTouchedAt, null);
  assert.equal(summary.stale, true);
});

/*
 * Un percorso appena cominciato non ha obiettivi trascurati: senza sedute in
 * vista non c'e' niente da cui dedurre un abbandono, e l'avviso direbbe una
 * cosa falsa proprio nel momento in cui il coach scrive il primo obiettivo.
 */
test('senza sedute in vista nessun obiettivo risulta fermo', () => {
  assert.equal(summarizeGoalTrack(rowWith([])).stale, false);
});
