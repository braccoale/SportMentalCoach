import test from 'node:test';
import assert from 'node:assert/strict';
import { countCoursesWithUpcomingSessions } from './upcoming-sessions';

const now = new Date('2026-09-18T10:00:00Z');
const future = new Date('2026-09-20T10:00:00Z');
const past = new Date('2026-09-01T10:00:00Z');

test('nessuna sessione, nessun corso', () => {
  assert.equal(countCoursesWithUpcomingSessions([], now), 0);
});

test('un corso con una sessione futura pianificata conta 1', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [{ courseId: 1, status: 'scheduled', scheduledFor: future }],
      now
    ),
    1
  );
});

test('più sessioni future dello stesso corso contano una volta sola', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [
        { courseId: 1, status: 'scheduled', scheduledFor: future },
        { courseId: 1, status: 'scheduled', scheduledFor: new Date('2026-09-21T10:00:00Z') },
      ],
      now
    ),
    1
  );
});

test('corsi diversi con sessioni future contano ciascuno', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [
        { courseId: 1, status: 'scheduled', scheduledFor: future },
        { courseId: 2, status: 'scheduled', scheduledFor: future },
      ],
      now
    ),
    2
  );
});

test('una sessione annullata non conta', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [{ courseId: 1, status: 'cancelled', scheduledFor: future }],
      now
    ),
    0
  );
});

test('una sessione completata non conta', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [{ courseId: 1, status: 'completed', scheduledFor: future }],
      now
    ),
    0
  );
});

test('una sessione già passata non conta', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [{ courseId: 1, status: 'scheduled', scheduledFor: past }],
      now
    ),
    0
  );
});

test('un solo corso pianificato tra più sessioni miste dà comunque 1', () => {
  assert.equal(
    countCoursesWithUpcomingSessions(
      [
        { courseId: 1, status: 'scheduled', scheduledFor: past },
        { courseId: 1, status: 'cancelled', scheduledFor: future },
        { courseId: 1, status: 'scheduled', scheduledFor: future },
        { courseId: 2, status: 'completed', scheduledFor: future },
      ],
      now
    ),
    1
  );
});
