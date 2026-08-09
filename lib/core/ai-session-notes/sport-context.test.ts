import test from 'node:test';
import assert from 'node:assert/strict';
import { sportContextBlock, sportContextLines } from './sport-context';

test('uno sport di squadra porta con se i temi del gruppo', () => {
  const lines = sportContextLines('Calcio').join(' ');
  assert.match(lines, /squadra/i);
  assert.match(lines, /spogliatoio/i);
});

test('uno sport individuale non parla di compagni', () => {
  // In atletica il rapporto con la squadra non e' un tema centrale, e
  // suggerirlo porterebbe il modello a cercarlo dove non c'e'.
  const lines = sportContextLines('Atletica leggera').join(' ');
  assert.match(lines, /individuale/i);
  assert.doesNotMatch(lines, /spogliatoio/i);
});

test('il riconoscimento non si fa fermare da maiuscole e accenti', () => {
  assert.deepEqual(
    sportContextLines('PALLAVOLO'),
    sportContextLines('pallavolo')
  );
  assert.ok(sportContextLines('Velocità').length > 0);
});

test('uno sport non coperto non riceve righe generiche', () => {
  // Righe che valgono per tutti non aggiungono nulla a un modello che sa
  // gia' cos'e' lo sport: allungherebbero il prompt senza cambiarne l'esito.
  assert.deepEqual(sportContextLines('curling'), []);
  assert.equal(sportContextBlock('curling'), '');
  assert.equal(sportContextBlock(null), '');
  assert.equal(sportContextBlock('   '), '');
});

test('il blocco dice al modello di non forzarlo', () => {
  // Un contesto che il modello applica per forza produce temi inventati:
  // e' peggio di nessun contesto.
  assert.match(sportContextBlock('Tennis'), /non forzarlo/i);
  assert.match(sportContextBlock('Tennis'), /tie-break/i);
});

test('gli sport di contatto nominano la paura senza linguaggio clinico', () => {
  const lines = sportContextLines('judo').join(' ');
  assert.match(lines, /paura/i);
  assert.match(lines, /clinico/i);
});
