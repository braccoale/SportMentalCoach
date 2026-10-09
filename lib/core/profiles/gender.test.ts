import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ATHLETE_GENDERS, ATHLETE_GENDER_LABEL, normalizeGender } from './gender';

describe('normalizeGender', () => {
  it('accetta i tre valori, anche con maiuscole e spazi', () => {
    assert.equal(normalizeGender('male'), 'male');
    assert.equal(normalizeGender(' Female '), 'female');
    assert.equal(normalizeGender('UNDISCLOSED'), 'undisclosed');
  });
  it('un valore sconosciuto o assente diventa null, mai salvato', () => {
    assert.equal(normalizeGender('pippo'), null);
    assert.equal(normalizeGender(''), null);
    assert.equal(normalizeGender(null), null);
    assert.equal(normalizeGender(undefined), null);
    assert.equal(normalizeGender(42), null);
  });
  it('ogni valore ha la sua etichetta', () => {
    for (const g of ATHLETE_GENDERS) assert.ok(ATHLETE_GENDER_LABEL[g].length > 0);
  });
});
