import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPasswordRejection,
  passwordRejectionMessage,
} from './password-rejection';

test('una password compromessa viene riconosciuta dal motivo pwned', () => {
  assert.equal(
    classifyPasswordRejection({ code: 'weak_password', reasons: ['pwned'] }),
    'compromessa'
  );
  assert.equal(
    classifyPasswordRejection({
      code: 'weak_password',
      reasons: ['length', 'pwned'],
    }),
    'compromessa'
  );
});

test('weak_password senza pwned, o senza motivi, è debole', () => {
  assert.equal(
    classifyPasswordRejection({ code: 'weak_password', reasons: ['length'] }),
    'debole'
  );
  assert.equal(
    classifyPasswordRejection({ code: 'weak_password', reasons: [] }),
    'debole'
  );
  // L'API admin può non riportare i motivi: non si deve perdere l'errore.
  assert.equal(classifyPasswordRejection({ code: 'weak_password' }), 'debole');
});

test('un errore che non riguarda la password non diventa password debole', () => {
  for (const errore of [
    { code: 'email_exists' },
    { code: 'over_request_rate_limit' },
    { code: 'unexpected_failure' },
    { message: 'fetch failed' },
    new Error('weak_password'),
    null,
    undefined,
    'weak_password',
    42,
  ]) {
    assert.equal(classifyPasswordRejection(errore), null);
    assert.equal(passwordRejectionMessage(errore), null);
  }
});

test('il messaggio dice cosa fare e non riporta la password', () => {
  const compromessa = passwordRejectionMessage({
    code: 'weak_password',
    reasons: ['pwned'],
  });
  const debole = passwordRejectionMessage({ code: 'weak_password' });
  assert.match(compromessa ?? '', /violazioni di dati/);
  assert.match(compromessa ?? '', /Scegline un’altra/);
  assert.match(debole ?? '', /Scegline un’altra/);
  assert.notEqual(compromessa, debole);
});
