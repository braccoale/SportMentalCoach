import assert from 'node:assert/strict';
import test from 'node:test';
import { describeConversationInsight } from './conversation-insight-text';
import type { ConversationInsight } from './conversation-map';

function insight(over: Partial<ConversationInsight> = {}): ConversationInsight {
  return {
    coachTurns: 100,
    coachQuestionTurns: 40,
    coachAverageTurnSec: 10,
    athleteAverageTurnSec: 10,
    athleteOpenedUp: null,
    athleteFirstHalfSec: 10,
    athleteSecondHalfSec: 10,
    ...over,
  };
}

test('molte domande vengono lette come conduzione che fa emergere', () => {
  const [domande] = describeConversationInsight(
    insight({ coachTurns: 100, coachQuestionTurns: 60 })
  );
  assert.equal(domande.tone, 'buono');
  assert.match(domande.meaning, /chiesto più di quanto hai spiegato/);
});

test('poche domande vengono dette senza girarci intorno', () => {
  const [domande] = describeConversationInsight(
    insight({ coachTurns: 100, coachQuestionTurns: 10 })
  );
  assert.equal(domande.tone, 'attenzione');
  assert.match(domande.meaning, /spiegato più di quanto hai chiesto/);
});

test('turni molto piu lunghi del coach sono un segnale, non un vanto', () => {
  const stats = describeConversationInsight(
    insight({ coachAverageTurnSec: 16, athleteAverageTurnSec: 7 })
  );
  const durata = stats.find((s) => s.key === 'durata')!;
  assert.equal(durata.tone, 'attenzione');
  assert.match(durata.meaning, /Parli più a lungo/);
});

test('turni simili non vengono giudicati', () => {
  const stats = describeConversationInsight(
    insight({ coachAverageTurnSec: 10, athleteAverageTurnSec: 9 })
  );
  const durata = stats.find((s) => s.key === 'durata')!;
  assert.equal(durata.tone, 'neutro');
});

test('un atleta che parla piu a lungo del coach e un buon segno', () => {
  const stats = describeConversationInsight(
    insight({ coachAverageTurnSec: 6, athleteAverageTurnSec: 20 })
  );
  const durata = stats.find((s) => s.key === 'durata')!;
  assert.equal(durata.tone, 'buono');
});

test('senza abbastanza turni l apertura non viene raccontata', () => {
  const stats = describeConversationInsight(insight({ athleteOpenedUp: null }));
  assert.equal(stats.some((s) => s.key === 'apertura'), false);
});

test('ogni voce ha sempre valore, etichetta e significato', () => {
  const stats = describeConversationInsight(
    insight({ athleteOpenedUp: true, athleteFirstHalfSec: 5, athleteSecondHalfSec: 12 })
  );
  assert.equal(stats.length, 3);
  for (const stat of stats) {
    assert.ok(stat.value.length > 0, `valore vuoto per ${stat.key}`);
    assert.ok(stat.label.length > 0, `etichetta vuota per ${stat.key}`);
    assert.ok(stat.meaning.length > 0, `significato vuoto per ${stat.key}`);
  }
});
