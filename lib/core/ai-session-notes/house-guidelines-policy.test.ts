import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GUIDELINES_LENGTH,
  houseGuidelinesBlock,
  isValidGuidelinesBody,
  promptVersionWithGuidelines,
} from './house-guidelines-policy';

test('la versione delle linee guida entra in quella del prompt', () => {
  /*
   * Se cambiassero fuori da questo confronto, l'academy aggiornerebbe il
   * metodo e i report continuerebbero a uscire con quello vecchio senza che
   * nessuno se ne accorga. E' gia' successo con il contratto del racconto.
   */
  assert.equal(
    promptVersionWithGuidelines('compass-v1:sport-context-v7', 3),
    'compass-v1:sport-context-v7:g3'
  );
});

test('senza linee guida la versione resta identica a prima', () => {
  // Chi non le usa non deve vedere i propri report rigenerarsi senza motivo.
  assert.equal(
    promptVersionWithGuidelines('compass-v1:sport-context-v7', null),
    'compass-v1:sport-context-v7'
  );
});

test('una versione del prompt vuota resta vuota', () => {
  assert.equal(promptVersionWithGuidelines('   ', 2), '');
});

test('il blocco dichiara che il metodo non scavalca le regole', () => {
  // Senza questa riga, una linea guida scritta con troppa convinzione
  // diventerebbe una scorciatoia per far dire al modello cio' che si vuole
  // sentire.
  const block = houseGuidelinesBlock('Parti sempre da cosa ha funzionato.');
  assert.match(block, /vince la regola/i);
  assert.match(block, /Parti sempre da cosa ha funzionato\./);
});

test('linee guida vuote non producono nessun blocco', () => {
  assert.equal(houseGuidelinesBlock(null), '');
  assert.equal(houseGuidelinesBlock('   \n  '), '');
});

test('un manuale non e una linea guida', () => {
  assert.equal(isValidGuidelinesBody('x'.repeat(MAX_GUIDELINES_LENGTH)), true);
  assert.equal(isValidGuidelinesBody('x'.repeat(MAX_GUIDELINES_LENGTH + 1)), false);
  assert.equal(isValidGuidelinesBody('   '), false);
});
