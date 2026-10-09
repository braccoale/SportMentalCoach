import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { experienceLabel, monthsSince } from './coach-experience';

const now = new Date('2026-10-09T10:00:00');

describe('mesi dall’inizio', () => {
  it('conta i mesi interi, non quelli iniziati', () => {
    assert.equal(monthsSince('2026-01-01', now), 9);
    assert.equal(monthsSince('2026-01-10', now), 8);
    assert.equal(monthsSince('2026-10-01', now), 0);
  });
  it('data assente, illeggibile o futura: nessun valore', () => {
    assert.equal(monthsSince(null, now), null);
    assert.equal(monthsSince('boh', now), null);
    assert.equal(monthsSince('2027-01-01', now), null);
  });
});

describe('etichetta dell’esperienza', () => {
  it('sotto l’anno dice i mesi', () => {
    assert.equal(experienceLabel({ yearsExperience: 0, coachSince: '2026-05-02' }, now), '5 mesi di esperienza');
    assert.equal(experienceLabel({ yearsExperience: 0, coachSince: '2026-09-01' }, now), '1 mese di esperienza');
    assert.equal(experienceLabel({ yearsExperience: 0, coachSince: '2026-10-05' }, now), 'Coach da meno di un mese');
  });
  it('dall’anno in su dice gli anni, al singolare per uno', () => {
    assert.equal(experienceLabel({ yearsExperience: 1, coachSince: '2025-10-01' }, now), '1 anno di esperienza');
    assert.equal(experienceLabel({ yearsExperience: 11, coachSince: '2015-01-01' }, now), '11 anni di esperienza');
  });
  it('senza «Coach dal» ripiega sugli anni dichiarati, e con zero non scrive «0 anni»', () => {
    assert.equal(experienceLabel({ yearsExperience: 3 }, now), '3 anni di esperienza');
    assert.equal(experienceLabel({ yearsExperience: 1 }, now), '1 anno di esperienza');
    assert.equal(experienceLabel({ yearsExperience: 0 }, now), 'Meno di un anno di esperienza');
    assert.equal(experienceLabel({ yearsExperience: null }, now), null);
  });
});
