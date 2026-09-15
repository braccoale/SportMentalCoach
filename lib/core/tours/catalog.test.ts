import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_CATALOG } from './catalog';

test('ogni tour ha almeno uno step', () => {
  for (const [key, tour] of Object.entries(TOUR_CATALOG)) {
    assert.ok(tour.steps.length > 0, `${key} non ha step`);
  }
});

test('ogni step ha un target, un titolo e un testo non vuoti', () => {
  for (const [key, tour] of Object.entries(TOUR_CATALOG)) {
    for (const step of tour.steps) {
      assert.ok(step.target.trim().length > 0, `${key}: target vuoto`);
      assert.ok(step.title.trim().length > 0, `${key}: title vuoto`);
      assert.ok(step.body.trim().length > 0, `${key}: body vuoto`);
    }
  }
});

test('nessun tour coach è assegnato al ruolo athlete e viceversa (per chiave)', () => {
  assert.equal(TOUR_CATALOG.coach_dashboard_intro.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_create_appointment.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_video_call.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_ai_report_review.role, 'coach');
  assert.equal(TOUR_CATALOG.athlete_dashboard_intro.role, 'athlete');
  assert.equal(TOUR_CATALOG.athlete_booking.role, 'athlete');
  assert.equal(TOUR_CATALOG.athlete_video_call.role, 'athlete');
});
