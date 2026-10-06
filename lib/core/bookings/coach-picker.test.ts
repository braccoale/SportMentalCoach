import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { coachPickerAthleteIds } from './coach-picker';

describe('coachPickerAthleteIds', () => {
  it('unisce i portati dal coach e gli altri già in percorso', () => {
    assert.deepEqual(
      coachPickerAthleteIds({ referredIds: [3, 5], inProgressIds: [9, 11] }),
      [3, 5, 9, 11]
    );
  });

  it('un atleta in entrambi i gruppi compare una volta sola, nella posizione dei portati', () => {
    assert.deepEqual(
      coachPickerAthleteIds({ referredIds: [3, 5], inProgressIds: [5, 9] }),
      [3, 5, 9]
    );
  });

  it('senza nessuno dei due gruppi il menu è vuoto, non «tutti»', () => {
    assert.deepEqual(coachPickerAthleteIds({ referredIds: [], inProgressIds: [] }), []);
  });

  it('un solo gruppo basta', () => {
    assert.deepEqual(coachPickerAthleteIds({ referredIds: [], inProgressIds: [7] }), [7]);
    assert.deepEqual(coachPickerAthleteIds({ referredIds: [7], inProgressIds: [] }), [7]);
  });
});
