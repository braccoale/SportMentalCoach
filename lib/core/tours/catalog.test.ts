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

test('solo i due step delle videochiamate dichiarano slowTarget', () => {
  // slowTarget sblocca un'attesa fino a 90s prima di rinunciare al
  // bersaglio: va concesso solo ai due step il cui bersaglio compare dopo
  // che l'utente ha superato la pre-join screen di camera/microfono. Ogni
  // altro step deve restare sul bound breve, anche quando è il primo del suo
  // tour (es. coach_ai_report_review, il cui primo bersaglio non compare
  // affatto se non c'è un riepilogo da approvare).
  for (const [key, tour] of Object.entries(TOUR_CATALOG)) {
    for (const [index, step] of tour.steps.entries()) {
      const expected =
        (key === 'coach_video_call' || key === 'athlete_video_call') && index === 0;
      assert.equal(
        Boolean(step.slowTarget),
        expected,
        `${key}[${index}]: slowTarget atteso ${expected}, trovato ${Boolean(step.slowTarget)}`
      );
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
