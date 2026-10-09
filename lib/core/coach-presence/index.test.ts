import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coachPresenceKey, onlineProviderIds, sameIds } from './index';

describe('onlineProviderIds', () => {
  it('legge gli id dai meta, anche con più schede aperte dello stesso coach', () => {
    const ids = onlineProviderIds({
      'coach-21': [{ providerId: 21 }, { providerId: 21 }],
      'coach-27': [{ providerId: 27, at: 1 }],
    });
    assert.deepEqual([...ids].sort(), [21, 27]);
  });
  it('scarta ciò che non è un id valido e non si rompe con uno stato strano', () => {
    assert.equal(onlineProviderIds({ a: [{ providerId: 'x' }, { providerId: -1 }, { providerId: 1.5 }, {}, null] }).size, 0);
    assert.equal(onlineProviderIds({ a: 'no' } as never).size, 0);
    assert.equal(onlineProviderIds(null as never).size, 0);
  });
  it('lo stato vuoto è nessuno online', () => {
    assert.equal(onlineProviderIds({}).size, 0);
  });
});

describe('sameIds e coachPresenceKey', () => {
  it('insiemi uguali a prescindere dall’ordine', () => {
    assert.equal(sameIds(new Set([1, 2]), new Set([2, 1])), true);
    assert.equal(sameIds(new Set([1]), new Set([1, 2])), false);
    assert.equal(sameIds(new Set([1, 3]), new Set([1, 2])), false);
  });
  it('la chiave del coach', () => {
    assert.equal(coachPresenceKey(21), 'coach-21');
  });
});
