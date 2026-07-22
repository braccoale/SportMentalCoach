import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signatureMatchesName } from '@/lib/core/legal/signature';

test('accetta la firma che corrisponde a nome e cognome', () => {
  assert.equal(signatureMatchesName('Mario Rossi', 'Mario', 'Rossi'), true);
});

test('ignora maiuscole, accenti e spazi ripetuti', () => {
  assert.equal(signatureMatchesName('  mario   rossi ', 'Mario', 'Rossi'), true);
  assert.equal(signatureMatchesName('NICOLÒ Bò', 'Nicolo', 'Bo'), true);
});

test('accetta anche cognome-nome invertiti', () => {
  assert.equal(signatureMatchesName('Rossi Mario', 'Mario', 'Rossi'), true);
});

test('rifiuta una firma diversa', () => {
  assert.equal(signatureMatchesName('Luigi Verdi', 'Mario', 'Rossi'), false);
  assert.equal(signatureMatchesName('Mario', 'Mario', 'Rossi'), false);
  assert.equal(signatureMatchesName('', 'Mario', 'Rossi'), false);
});

test('rifiuta quando l’account non ha un nome completo', () => {
  assert.equal(signatureMatchesName('Mario Rossi', 'Mario', null), false);
  assert.equal(signatureMatchesName('Mario Rossi', null, null), false);
});

test('un cognome composto resta distinguibile dal nome', () => {
  assert.equal(
    signatureMatchesName('Anna De Luca', 'Anna', 'De Luca'),
    true
  );
  assert.equal(
    signatureMatchesName('De Luca Anna', 'Anna', 'De Luca'),
    true
  );
});
