import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COACH_AGREEMENT,
  CURRENT_COACH_AGREEMENT_VERSION,
  hashAgreement,
  renderAgreementText,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';

test('la versione corrente coincide con quella del documento', () => {
  assert.equal(CURRENT_COACH_AGREEMENT_VERSION, COACH_AGREEMENT.version);
  assert.match(COACH_AGREEMENT.version, /^\d{4}-\d{2}-\d+$/);
});

test('i valori economici sono quelli approvati nello spec', () => {
  assert.equal(COACH_AGREEMENT.commissionPercent, 20);
  assert.equal(COACH_AGREEMENT.nonCircumventionMonths, 18);
  assert.equal(COACH_AGREEMENT.penaltyAmountEur, 500);
  assert.equal(COACH_AGREEMENT.buyoutMonths, 3);
  assert.equal(COACH_AGREEMENT.noticeDays, 30);
});

test('gli id delle sezioni sono unici', () => {
  const ids = COACH_AGREEMENT.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('vexatiousSections restituisce solo le clausole da approvare specificamente', () => {
  const vex = vexatiousSections();
  assert.ok(vex.length >= 4, 'attese almeno 4 clausole vessatorie');
  assert.ok(vex.every((s) => s.vexatious));
  // La non-circumvention e la penale sono il cuore dell'art. 1341.
  const ids = vex.map((s) => s.id);
  assert.ok(ids.includes('non-circumvention'));
});

test('il testo renderizzato contiene i numeri economici interpolati', () => {
  const text = renderAgreementText();
  assert.ok(text.includes('20%'), 'la commissione deve comparire nel testo');
  assert.ok(text.includes('18 mesi'));
  assert.ok(text.includes('500'));
});

test('hashAgreement è stabile e cambia se il documento cambia', () => {
  const a = hashAgreement();
  assert.equal(a, hashAgreement());
  assert.match(a, /^[0-9a-f]{64}$/);

  const modified = {
    ...COACH_AGREEMENT,
    commissionPercent: 25,
  };
  assert.notEqual(hashAgreement(modified), a);
});

test('hashAgreement cambia se cambia solo il flag vexatious di una sezione, a parità di testo', () => {
  const a = hashAgreement();

  const flippedIndex = COACH_AGREEMENT.sections.findIndex(
    (s) => s.id === 'natura-del-rapporto'
  );
  assert.ok(flippedIndex >= 0, 'sezione di riferimento non trovata');
  assert.equal(
    COACH_AGREEMENT.sections[flippedIndex].vexatious,
    false,
    'la sezione di riferimento deve partire da vexatious: false'
  );

  const modified = {
    ...COACH_AGREEMENT,
    sections: COACH_AGREEMENT.sections.map((s, i) =>
      i === flippedIndex ? { ...s, vexatious: true } : s
    ),
  };

  // Same version, same economic parameters, same title/body text everywhere
  // — only the vexatious-clause list (art. 1341) differs.
  assert.notEqual(hashAgreement(modified), a);
});
