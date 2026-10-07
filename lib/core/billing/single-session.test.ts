import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SINGLE_SESSION_LIMITS,
  SINGLE_SESSION_VALIDITY_DAYS,
  isCreditFree,
  isCreditUsable,
  singleSessionExpiresAt,
  validateSingleSessionPrice,
} from './single-session';

describe('validateSingleSessionPrice', () => {
  it('un prezzo valido diventa centesimi', () => {
    assert.deepEqual(validateSingleSessionPrice('100'), { ok: true, priceCents: 10000 });
    assert.deepEqual(validateSingleSessionPrice('99,90'), { ok: true, priceCents: 9990 });
    assert.deepEqual(validateSingleSessionPrice(' 120.50 € '), { ok: true, priceCents: 12050 });
  });

  it('vuoto vuol dire «non la vendo»: null, non un errore', () => {
    assert.deepEqual(validateSingleSessionPrice(''), { ok: true, priceCents: null });
    assert.deepEqual(validateSingleSessionPrice('   '), { ok: true, priceCents: null });
  });

  it('rifiuta ciò che non è un importo', () => {
    for (const bad of ['gratis', '-5', '12,345', '1e3']) {
      assert.equal(validateSingleSessionPrice(bad).ok, false, bad);
    }
  });

  it('rispetta minimo e massimo, anche personalizzati', () => {
    const { minPriceCents, maxPriceCents } = DEFAULT_SINGLE_SESSION_LIMITS;
    assert.equal(validateSingleSessionPrice('9,99').ok, false);
    assert.equal(validateSingleSessionPrice('10').ok, true);
    assert.equal(validateSingleSessionPrice('500').ok, true);
    assert.equal(validateSingleSessionPrice('500,01').ok, false);
    assert.equal(minPriceCents, 1000);
    assert.equal(maxPriceCents, 50000);
    assert.equal(
      validateSingleSessionPrice('60', { minPriceCents: 7000, maxPriceCents: 9000 }).ok,
      false
    );
  });
});

describe('singleSessionExpiresAt', () => {
  it('scade dopo 60 giorni esatti', () => {
    assert.equal(SINGLE_SESSION_VALIDITY_DAYS, 60);
    const granted = new Date('2026-10-06T15:00:00Z');
    assert.equal(singleSessionExpiresAt(granted).toISOString(), '2026-12-05T15:00:00.000Z');
  });
  it('rifiuta una data non valida', () => {
    assert.throws(() => singleSessionExpiresAt(new Date('x')), /INVALID_GRANTED_AT/);
  });
});

describe('isCreditUsable', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const future = new Date('2026-12-01T00:00:00Z');
  it('pagata e non scaduta si può usare', () => {
    assert.equal(isCreditUsable({ status: 'granted', expiresAt: future }, now), true);
  });
  it('non pagata, rimborsata o scaduta no', () => {
    assert.equal(isCreditUsable({ status: 'pending', expiresAt: null }, now), false);
    assert.equal(isCreditUsable({ status: 'revoked', expiresAt: future }, now), false);
    assert.equal(isCreditUsable({ status: 'granted', expiresAt: now }, now), false);
    assert.equal(isCreditUsable({ status: 'granted', expiresAt: new Date('2026-10-01T00:00:00Z') }, now), false);
  });
});

describe('isCreditFree', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  const valid = { status: 'granted', expiresAt: new Date('2026-12-01T00:00:00Z') };

  it('è libera senza prenotazione collegata', () => {
    assert.equal(isCreditFree(valid, null, now), true);
  });
  it('è tenuta da una prenotazione richiesta, accettata o completata', () => {
    for (const status of ['requested', 'accepted', 'completed']) {
      assert.equal(isCreditFree(valid, status, now), false, status);
    }
  });
  it('si libera se la prenotazione è annullata, rifiutata o scaduta', () => {
    for (const status of ['cancelled', 'declined', 'expired']) {
      assert.equal(isCreditFree(valid, status, now), true, status);
    }
  });
  it('scaduta o non pagata non è mai libera', () => {
    assert.equal(isCreditFree({ ...valid, expiresAt: new Date('2026-10-01T00:00:00Z') }, null, now), false);
    assert.equal(isCreditFree({ status: 'pending', expiresAt: null }, null, now), false);
    assert.equal(isCreditFree({ ...valid, status: 'revoked' }, null, now), false);
  });
});
