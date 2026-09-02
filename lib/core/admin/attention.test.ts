import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionItems, type AttentionInput } from './attention';

function input(over: Partial<AttentionInput> = {}): AttentionInput {
  return {
    coachDaApprovare: 0,
    trascrizioniFallite: 0,
    reportFalliti: 0,
    jobMaiPresi: 0,
    attesaMassimaMinuti: null,
    sessioniFerme: 0,
    registrazioniFallite: 0,
    minoriSenzaAutorizzazione: 0,
    emailFallite: 0,
    costoOltreSoglia: null,
    ...over,
  };
}

test('tutto a zero: nessuna voce, non dieci righe che dicono «nessuno»', () => {
  assert.deepEqual(buildAttentionItems(input()), []);
});

test('una misura non disponibile non diventa una rassicurazione né una voce', () => {
  const items = buildAttentionItems(input({ minoriSenzaAutorizzazione: null }));
  assert.equal(items.length, 0);
});

test('il critico viene prima, anche quando è uno solo contro venti', () => {
  const items = buildAttentionItems(
    input({ minoriSenzaAutorizzazione: 1, coachDaApprovare: 20 })
  );
  assert.equal(items[0].key, 'minori-senza-autorizzazione');
  assert.equal(items[0].severity, 'critico');
  assert.equal(items[1].key, 'coach-da-approvare');
});

test('a parità di gravità decide la quantità', () => {
  const items = buildAttentionItems(
    input({ coachDaApprovare: 2, trascrizioniFallite: 7 })
  );
  assert.deepEqual(
    items.map((item) => item.key),
    ['trascrizioni-fallite', 'coach-da-approvare']
  );
});

test('ogni voce porta a una vista già filtrata, mai a un elenco generico', () => {
  const items = buildAttentionItems(
    input({
      coachDaApprovare: 1,
      reportFalliti: 1,
      trascrizioniFallite: 1,
      sessioniFerme: 1,
      jobMaiPresi: 1,
      registrazioniFallite: 1,
      emailFallite: 1,
    })
  );
  assert.equal(items.length, 7);
  for (const item of items) {
    assert.match(item.href, /^\/dashboard\/admin\//);
    assert.ok(item.actionLabel.length > 0, `${item.key} senza etichetta`);
    assert.ok(item.detail.length > 0, `${item.key} senza spiegazione`);
  }
});

test('la coda ferma dice da quanto, quando lo sa', () => {
  const conAttesa = buildAttentionItems(
    input({ jobMaiPresi: 3, attesaMassimaMinuti: 42 })
  );
  assert.match(conAttesa[0].detail, /42 minuti/);

  const senzaAttesa = buildAttentionItems(input({ jobMaiPresi: 3 }));
  assert.doesNotMatch(senzaAttesa[0].detail, /minuti/);
});

test('senza soglia configurata non esiste sforamento', () => {
  assert.equal(buildAttentionItems(input()).length, 0);

  const items = buildAttentionItems(
    input({ costoOltreSoglia: { stimato: 12.5, soglia: 10 } })
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].severity, 'informativo');
  assert.match(items[0].detail, /12\.50 €/);
});
