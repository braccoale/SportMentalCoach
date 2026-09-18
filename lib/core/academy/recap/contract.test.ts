import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAcademyRecapContent, ACADEMY_RECAP_SCHEMA_VERSION } from './contract';

function validRecap() {
  return {
    schemaVersion: ACADEMY_RECAP_SCHEMA_VERSION,
    keyConcepts: ['Gestione della pressione', 'Routine pre-gara'],
    toolsAndProtocols: ['Respirazione 4-7-8'],
    practicalCases: ['Un giocatore che perde lucidità ai rigori'],
    openQuestions: ['Come adattare la routine a un under-16?'],
    nextAction: 'Provare la routine con un atleta entro la prossima settimana.',
    topicsCovered: ['Il Pitch di Carriera'],
    generation: { provider: 'openai', model: 'gpt-5-mini', generatedAt: '2026-09-18T10:00:00.000Z' },
  };
}

test('un recap valido non produce problemi', () => {
  assert.deepEqual(validateAcademyRecapContent(validRecap()), []);
});

test('non un oggetto viene rifiutato', () => {
  assert.equal(validateAcademyRecapContent('non un oggetto').length > 0, true);
  assert.equal(validateAcademyRecapContent(null).length > 0, true);
});

test('più di 5 concetti chiave viene rifiutato', () => {
  const recap = validRecap();
  recap.keyConcepts = ['a', 'b', 'c', 'd', 'e', 'f'];
  const issues = validateAcademyRecapContent(recap);
  assert.equal(issues.some((i) => i.field === 'keyConcepts'), true);
});

test('nextAction vuoto viene rifiutato', () => {
  const recap = validRecap();
  recap.nextAction = '';
  const issues = validateAcademyRecapContent(recap);
  assert.equal(issues.some((i) => i.field === 'nextAction'), true);
});

test('generation mancante viene rifiutato', () => {
  const recap: Record<string, unknown> = validRecap();
  delete recap.generation;
  const issues = validateAcademyRecapContent(recap);
  assert.equal(issues.some((i) => i.field === 'generation'), true);
});

test('schemaVersion sbagliata viene rifiutata', () => {
  const recap = { ...validRecap(), schemaVersion: '0.9' };
  const issues = validateAcademyRecapContent(recap);
  assert.equal(issues.some((i) => i.field === 'schemaVersion'), true);
});

test('campi lista non stringa vengono rifiutati', () => {
  const recap: Record<string, unknown> = { ...validRecap(), openQuestions: [1, 2, 3] };
  const issues = validateAcademyRecapContent(recap);
  assert.equal(issues.some((i) => i.field === 'openQuestions'), true);
});
