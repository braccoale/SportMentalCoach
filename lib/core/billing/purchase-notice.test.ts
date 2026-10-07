import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHECKOUT_REFUSAL_MESSAGES } from './checkout-eligibility';
import { GENERIC_PURCHASE_ERROR, purchaseNoticeFor } from './purchase-notice';

const none = { subscriptionActive: false };
const active = { subscriptionActive: true };

describe('purchaseNoticeFor', () => {
  it('nessun codice, nessun messaggio', () => {
    assert.equal(purchaseNoticeFor(undefined, none), null);
    assert.equal(purchaseNoticeFor(null, none), null);
    assert.equal(purchaseNoticeFor('', none), null);
  });

  it('«ok» dipende da cosa vede il webhook: attivo o ancora da confermare', () => {
    assert.equal(purchaseNoticeFor('ok', active)?.tone, 'ok');
    assert.equal(purchaseNoticeFor('ok', none)?.tone, 'info');
    assert.match(purchaseNoticeFor('ok', none)!.text, /confermando/);
  });

  it('annullato, annullamento a fine periodo e riattivazione', () => {
    assert.match(purchaseNoticeFor('annullato', none)!.text, /nulla/);
    assert.match(purchaseNoticeFor('fine-periodo', active)!.text, /fine del periodo/);
    assert.match(purchaseNoticeFor('riattivato', active)!.text, /rinnovarsi/);
  });

  it('ogni motivo di rifiuto porta il suo messaggio', () => {
    for (const [code, message] of Object.entries(CHECKOUT_REFUSAL_MESSAGES)) {
      const notice = purchaseNoticeFor(code, none);
      assert.equal(notice?.tone, 'error', code);
      assert.equal(notice?.text, message, code);
    }
  });

  it('un codice sconosciuto non viene mai ripetuto: errore generico', () => {
    for (const code of ['boh', 'constructor', 'toString', '__proto__', '<script>', 'hasOwnProperty']) {
      const notice = purchaseNoticeFor(code, none);
      assert.equal(notice?.tone, 'error', code);
      assert.equal(notice?.text, GENERIC_PURCHASE_ERROR, code);
    }
  });
});
