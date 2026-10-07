import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPaymentFailedContent,
  paymentFailedIdempotencyKey,
  shouldNotifyPaymentFailed,
} from './payment-failed-content';

const base = {
  recipientName: 'Alessandro Bracco',
  counterpartName: 'Daniela Chiappara',
  athleteUserId: 68,
  planName: 'Beginner',
  amountLabel: '300,00 €',
  periodEndLabel: '6 novembre 2026',
};

describe('buildPaymentFailedContent', () => {
  it('l’atleta sa che cosa è successo, che cosa non può fare e dove andare', () => {
    const c = buildPaymentFailedContent({ ...base, role: 'athlete' });
    assert.match(c.subject, /pagamento del tuo abbonamento non è andato a buon fine/);
    assert.equal(c.actionPath, '/dashboard/athlete/abbonamenti');
    const text = c.paragraphs.join(' ');
    assert.match(text, /Ciao Alessandro,/);
    assert.match(text, /Daniela Chiappara/);
    assert.match(text, /non puoi prenotare nuove sedute del piano/);
    assert.match(text, /già fissate restano valide/);
  });

  it('il coach sa chi è e trova il link alla scheda di quell’atleta', () => {
    const c = buildPaymentFailedContent({
      ...base,
      role: 'coach',
      recipientName: 'Daniela Chiappara',
      counterpartName: 'Alessandro Bracco',
    });
    assert.equal(c.subject, 'Pagamento in ritardo: Alessandro Bracco');
    assert.equal(c.actionPath, '/dashboard/coach/athletes/68');
    assert.match(c.paragraphs.join(' '), /non puoi fissare nuove sedute del piano/);
  });

  it('la tabella dei dettagli ha piano, importo e data del rinnovo', () => {
    const c = buildPaymentFailedContent({ ...base, role: 'athlete' });
    assert.deepEqual(c.rows, [
      { label: 'Piano', value: 'Beginner' },
      { label: 'Importo', value: '300,00 €' },
      { label: 'Rinnovo del', value: '6 novembre 2026' },
    ]);
  });

  it('senza data di rinnovo la riga manca, senza «undefined»', () => {
    const c = buildPaymentFailedContent({ ...base, role: 'athlete', periodEndLabel: null });
    assert.equal(c.rows.length, 2);
    assert.doesNotMatch(JSON.stringify(c), /undefined|null/);
  });

  it('senza nome il saluto resta corretto', () => {
    const c = buildPaymentFailedContent({ ...base, role: 'athlete', recipientName: null });
    assert.equal(c.paragraphs[0], 'Ciao,');
  });

  it('non promette tentativi che non controlliamo né mostra dati della carta', () => {
    for (const role of ['athlete', 'coach'] as const) {
      const text = JSON.stringify(buildPaymentFailedContent({ ...base, role }));
      assert.match(text, /può ritentare/);
      assert.doesNotMatch(text, /riproverà|entro \d+ giorni|\*{4}|\d{4} \d{4}/i);
    }
  });
});

describe('shouldNotifyPaymentFailed', () => {
  it('scatta solo nel passaggio verso «in ritardo»', () => {
    assert.equal(shouldNotifyPaymentFailed('active', 'past_due'), true);
    assert.equal(shouldNotifyPaymentFailed('incomplete', 'past_due'), true);
  });
  it('non si ripete se l’abbonamento era già in ritardo', () => {
    assert.equal(shouldNotifyPaymentFailed('past_due', 'past_due'), false);
  });
  it('non scatta per gli altri passaggi', () => {
    assert.equal(shouldNotifyPaymentFailed('past_due', 'active'), false);
    assert.equal(shouldNotifyPaymentFailed('active', 'canceled'), false);
    assert.equal(shouldNotifyPaymentFailed('active', 'active'), false);
  });
});

describe('paymentFailedIdempotencyKey', () => {
  const period = new Date('2026-11-06T15:45:49Z');
  const key = (over: Partial<Parameters<typeof paymentFailedIdempotencyKey>[0]> = {}) =>
    paymentFailedIdempotencyKey({
      role: 'athlete',
      recipientUserId: 68,
      subscriptionId: 5,
      periodEnd: period,
      ...over,
    });

  it('è la stessa per lo stesso evento (un nuovo tentativo non duplica)', () => {
    assert.equal(key(), key());
  });
  it('cambia per destinatario, ruolo, abbonamento e rinnovo', () => {
    const k = key();
    assert.notEqual(k, key({ recipientUserId: 2 }));
    assert.notEqual(k, key({ role: 'coach' }));
    assert.notEqual(k, key({ subscriptionId: 6 }));
    assert.notEqual(k, key({ periodEnd: new Date('2026-12-06T15:45:49Z') }));
  });
  it('non contiene date del giorno: un secondo fallimento di un altro mese è un altro invio', () => {
    assert.match(key(), /^v1:payment_failed:email:68:sub5-athlete-p\d+$/);
  });
});
