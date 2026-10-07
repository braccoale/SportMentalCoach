import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paymentMethodLabel } from './payment-method';

describe('paymentMethodLabel', () => {
  it('una carta mostra le ultime quattro cifre', () => {
    assert.equal(
      paymentMethodLabel({ type: 'card', card: { brand: 'visa', last4: '4242' } }),
      'Carta •••• 4242'
    );
  });

  it('una carta senza cifre valide non ne inventa', () => {
    assert.equal(paymentMethodLabel({ type: 'card', card: { last4: '42' } }), 'Carta');
    assert.equal(paymentMethodLabel({ type: 'card', card: null }), 'Carta');
    assert.equal(paymentMethodLabel({ type: 'card', card: { last4: '42a2' } }), 'Carta');
  });

  it('Link e addebito SEPA hanno il loro nome', () => {
    assert.equal(paymentMethodLabel({ type: 'link' }), 'Link');
    assert.equal(
      paymentMethodLabel({ type: 'sepa_debit', sepa_debit: { last4: '1234' } }),
      'Addebito SEPA •••• 1234'
    );
  });

  it('un tipo sconosciuto non porta dettagli', () => {
    assert.equal(paymentMethodLabel({ type: 'paypal' }), 'Metodo di pagamento salvato');
  });

  it('senza metodo non c\'è etichetta', () => {
    assert.equal(paymentMethodLabel(null), null);
    assert.equal(paymentMethodLabel(undefined), null);
    assert.equal(paymentMethodLabel({}), null);
    assert.equal(paymentMethodLabel({ type: '' }), null);
  });
});
