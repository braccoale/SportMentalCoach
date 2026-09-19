import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeCourseOutcomes,
  summarizeModuleOutcomes,
  STUCK_THRESHOLD_DAYS,
} from './outcomes';

const now = new Date('2026-09-19T10:00:00.000Z');

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

test('conta completati, in corso e non iniziati', () => {
  const summary = summarizeCourseOutcomes(
    [
      { assignmentId: 1, userId: 1, displayName: 'A', status: 'completed', completedModules: 4, totalModules: 4, lastActivityAt: daysAgo(1) },
      { assignmentId: 2, userId: 2, displayName: 'B', status: 'in_progress', completedModules: 2, totalModules: 4, lastActivityAt: daysAgo(1) },
      { assignmentId: 3, userId: 3, displayName: 'C', status: 'assigned', completedModules: 0, totalModules: 4, lastActivityAt: daysAgo(1) },
    ],
    now
  );
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.inProgress, 1);
  assert.equal(summary.notStarted, 1);
});

test('un completato non entra mai tra i fermi, qualunque sia la sua ultima attività', () => {
  const summary = summarizeCourseOutcomes(
    [
      { assignmentId: 1, userId: 1, displayName: 'A', status: 'completed', completedModules: 4, totalModules: 4, lastActivityAt: daysAgo(365) },
    ],
    now
  );
  assert.deepEqual(summary.stuck, []);
});

test('sotto soglia non è fermo, sopra soglia sì', () => {
  const summary = summarizeCourseOutcomes(
    [
      { assignmentId: 1, userId: 1, displayName: 'Sotto soglia', status: 'in_progress', completedModules: 1, totalModules: 4, lastActivityAt: daysAgo(STUCK_THRESHOLD_DAYS - 1) },
      { assignmentId: 2, userId: 2, displayName: 'Sopra soglia', status: 'in_progress', completedModules: 1, totalModules: 4, lastActivityAt: daysAgo(STUCK_THRESHOLD_DAYS) },
    ],
    now
  );
  assert.deepEqual(
    summary.stuck.map((s) => s.displayName),
    ['Sopra soglia']
  );
});

test('i fermi sono ordinati dal più fermo', () => {
  const summary = summarizeCourseOutcomes(
    [
      { assignmentId: 1, userId: 1, displayName: 'Fermo 20gg', status: 'assigned', completedModules: 0, totalModules: 4, lastActivityAt: daysAgo(20) },
      { assignmentId: 2, userId: 2, displayName: 'Fermo 90gg', status: 'assigned', completedModules: 0, totalModules: 4, lastActivityAt: daysAgo(90) },
    ],
    now
  );
  assert.deepEqual(
    summary.stuck.map((s) => s.displayName),
    ['Fermo 90gg', 'Fermo 20gg']
  );
});

test('summarizeModuleOutcomes conta i completamenti per modulo, non per assegnazione', () => {
  const outcomes = summarizeModuleOutcomes([
    {
      modules: [
        { moduleId: 1, title: 'Fondamenti', sortOrder: 0, completed: true },
        { moduleId: 2, title: 'Colloquio', sortOrder: 1, completed: false },
      ],
    },
    {
      modules: [
        { moduleId: 1, title: 'Fondamenti', sortOrder: 0, completed: true },
        { moduleId: 2, title: 'Colloquio', sortOrder: 1, completed: true },
      ],
    },
  ]);
  assert.deepEqual(outcomes, [
    { moduleId: 1, title: 'Fondamenti', sortOrder: 0, completedCount: 2, totalParticipants: 2 },
    { moduleId: 2, title: 'Colloquio', sortOrder: 1, completedCount: 1, totalParticipants: 2 },
  ]);
});

test('summarizeModuleOutcomes rispetta sortOrder, non l\'ordine di arrivo', () => {
  const outcomes = summarizeModuleOutcomes([
    {
      modules: [
        { moduleId: 2, title: 'Secondo', sortOrder: 1, completed: false },
        { moduleId: 1, title: 'Primo', sortOrder: 0, completed: false },
      ],
    },
  ]);
  assert.deepEqual(
    outcomes.map((o) => o.moduleId),
    [1, 2]
  );
});
