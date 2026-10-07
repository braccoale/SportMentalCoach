import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASSWORD_RESET_FAILED_MESSAGE,
  PASSWORD_RESET_SENT_MESSAGE,
  passwordResetOutcome,
} from './password-reset';

describe('passwordResetOutcome', () => {
  it('senza errore dice sempre «se l’email è registrata», senza rivelare niente', () => {
    const outcome = passwordResetOutcome(null);
    assert.equal(outcome.ok, true);
    assert.equal(outcome.message, PASSWORD_RESET_SENT_MESSAGE);
    assert.match(outcome.message, /Se l’email è registrata/);
  });

  it('un errore del servizio di invio non si nasconde dietro un «riceverai un link»', () => {
    const outcome = passwordResetOutcome({ status: 500, code: 'unexpected_failure' });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.message, PASSWORD_RESET_FAILED_MESSAGE);
    assert.doesNotMatch(outcome.message, /riceverai/);
  });

  it('anche un limite di richieste è un errore visibile', () => {
    assert.equal(passwordResetOutcome({ status: 429, code: 'over_email_send_rate_limit' }).ok, false);
  });

  it('il messaggio di errore non cita l’indirizzo né i dettagli tecnici', () => {
    assert.doesNotMatch(PASSWORD_RESET_FAILED_MESSAGE, /535|smtp|@/i);
  });
});
