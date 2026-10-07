import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isConsumedByLateCancellation, usageStatusOf } from './late-cancellation';

const base = { status: 'cancelled', lateCancellation: true, updatedBy: 68, clientId: 68 };

describe('disdetta tardiva', () => {
  it('l’atleta che disdice sotto il preavviso consuma la seduta', () => {
    assert.equal(isConsumedByLateCancellation(base), true);
    assert.equal(usageStatusOf(base), 'completed');
  });
  it('nei tempi la seduta torna', () => {
    assert.equal(isConsumedByLateCancellation({ ...base, lateCancellation: false }), false);
    assert.equal(usageStatusOf({ ...base, lateCancellation: false }), 'cancelled');
  });
  it('se annulla il coach non si consuma mai, anche se tardivo', () => {
    assert.equal(isConsumedByLateCancellation({ ...base, updatedBy: 83 }), false);
  });
  it('un annullo di sistema (nessun autore) non consuma', () => {
    assert.equal(isConsumedByLateCancellation({ ...base, updatedBy: null }), false);
  });
  it('uno stato diverso da annullata non cambia', () => {
    assert.equal(usageStatusOf({ ...base, status: 'accepted' }), 'accepted');
  });
});
