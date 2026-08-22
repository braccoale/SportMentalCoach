import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_COACH_SERVICE,
  defaultCoachServiceValues,
} from './defaults';

test('ogni nuovo coach parte con la sessione online gratuita da 40 minuti', () => {
  assert.deepEqual(DEFAULT_COACH_SERVICE, {
    title: 'Sessione online',
    description: 'Sport Mental Coach',
    durationMin: 40,
    price: 0,
    currency: 'EUR',
    isActive: true,
  });

  assert.deepEqual(defaultCoachServiceValues(12, 34), {
    providerId: 12,
    title: 'Sessione online',
    description: 'Sport Mental Coach',
    durationMin: 40,
    price: 0,
    currency: 'EUR',
    isActive: true,
    createdBy: 34,
  });
});
