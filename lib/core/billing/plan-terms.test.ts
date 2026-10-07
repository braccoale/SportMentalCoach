import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PLAN_TERMS,
  singleSessionTerms,
  UNDEFINED_TERM_LABEL,
  definedTermCount,
} from './plan-terms';

describe('PLAN_TERMS', () => {
  it('ogni voce ha una chiave unica e un titolo', () => {
    const keys = PLAN_TERMS.map((term) => term.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const term of PLAN_TERMS) assert.ok(term.title.trim().length > 0, term.key);
  });

  it('un testo, quando c’è, non è vuoto: «da definire» è solo null', () => {
    for (const term of PLAN_TERMS) {
      assert.ok(term.text === null || term.text.trim().length > 0, term.key);
    }
    assert.equal(UNDEFINED_TERM_LABEL, 'Da definire');
  });

  it('le voci che il prodotto non sa ancora mantenere restano «da definire»', () => {
    // Se una di queste cambia, qualcuno ha scritto una promessa: deve essere
    // una decisione, con la funzione costruita, non un ritocco di testo.
    const mustStayUndefined = [
      'utilizzo_sedute',
      'sedute_residue',
      'disdetta_seduta',
      'cambio_piano',
      'cambio_coach',
      'rimborsi_recesso',
    ];
    for (const key of mustStayUndefined) {
      assert.equal(PLAN_TERMS.find((t) => t.key === key)?.text, null, key);
    }
    assert.equal(definedTermCount(), 3);
  });
});

describe('singleSessionTerms', () => {
  it('dice la validità vera e lascia da definire ciò che non è deciso', () => {
    const terms = singleSessionTerms(60);
    const validity = terms.find((t) => t.key === 'utilizzo_sedute');
    assert.match(validity?.text ?? '', /60 giorni/);
    for (const key of ['disdetta_seduta', 'rimborsi_recesso']) {
      assert.equal(terms.find((t) => t.key === key)?.text, null, key);
    }
  });
  it('il numero di giorni segue il parametro', () => {
    const text = (days: number) =>
      singleSessionTerms(days).find((t) => t.key === 'utilizzo_sedute')?.text ?? '';
    assert.match(text(30), /entro 30 giorni/);
    assert.match(text(1), /entro 1 giorno /);
  });
  it('ogni voce ha chiave unica e titolo', () => {
    const keys = singleSessionTerms(60).map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});
