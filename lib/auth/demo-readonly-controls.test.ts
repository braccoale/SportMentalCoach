import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeDemoWriteLabel } from './demo-readonly-controls';

test('riconosce i principali comandi di scrittura della dashboard', () => {
  for (const label of [
    'Modifica',
    'Aggiungi ospite',
    'Invia link atleta',
    'Valida riepilogo sessione',
    'Salva nota',
    'Apri videochiamata',
  ]) {
    assert.equal(looksLikeDemoWriteLabel(label), true, label);
  }
});

test('lascia disponibili navigazione e consultazione', () => {
  for (const label of ['Apri chat', 'Vedi dettagli', 'Riepilogo sessione', 'Chiudi']) {
    assert.equal(looksLikeDemoWriteLabel(label), false, label);
  }
});
