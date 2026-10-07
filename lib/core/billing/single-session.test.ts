import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_SINGLE_SESSION_LIMITS,
  creditDisplayState,
  DEFAULT_SINGLE_SESSION_VALIDITY_DAYS,
  formatValidityDays,
  normalizeValidityDays,
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
    assert.equal(DEFAULT_SINGLE_SESSION_VALIDITY_DAYS, 60);
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

describe('creditDisplayState', () => {
  const now = new Date('2026-10-10T10:00:00Z');
  const valid = { status: 'granted', expiresAt: new Date('2026-12-01T00:00:00Z') };
  const past = { status: 'granted', expiresAt: new Date('2026-10-01T00:00:00Z') };

  it('senza prenotazione è da pianificare', () => {
    assert.equal(creditDisplayState(valid, null, now), 'available');
  });
  it('con una prenotazione richiesta o accettata è pianificata', () => {
    assert.equal(creditDisplayState(valid, 'requested', now), 'planned');
    assert.equal(creditDisplayState(valid, 'accepted', now), 'planned');
  });
  it('con la prenotazione completata è usata, anche a scadenza passata', () => {
    assert.equal(creditDisplayState(valid, 'completed', now), 'used');
    assert.equal(creditDisplayState(past, 'completed', now), 'used');
  });
  it('una prenotazione annullata, rifiutata o scaduta la rimette da pianificare', () => {
    for (const status of ['cancelled', 'declined', 'expired']) {
      assert.equal(creditDisplayState(valid, status, now), 'available', status);
    }
  });
  it('scaduta senza essere usata è scaduta', () => {
    assert.equal(creditDisplayState(past, null, now), 'expired');
    assert.equal(creditDisplayState(past, 'cancelled', now), 'expired');
  });
});

describe('durata di validità come parametro', () => {
  it('il ripiego è 60 giorni', () => {
    assert.equal(DEFAULT_SINGLE_SESSION_VALIDITY_DAYS, 60);
    const at = new Date('2026-10-07T10:00:00Z');
    assert.equal(
      singleSessionExpiresAt(at).getTime() - at.getTime(),
      60 * 86_400_000
    );
  });
  it('la scadenza segue il parametro', () => {
    const at = new Date('2026-10-07T10:00:00Z');
    assert.equal(singleSessionExpiresAt(at, 30).getTime() - at.getTime(), 30 * 86_400_000);
    assert.equal(singleSessionExpiresAt(at, 90).getTime() - at.getTime(), 90 * 86_400_000);
  });
  it('un valore non valido non fa scadere subito le sedute: vale il ripiego', () => {
    for (const bad of [0, -5, 60.5, 366, NaN, '60', null, undefined]) {
      assert.equal(normalizeValidityDays(bad), 60, String(bad));
    }
    assert.equal(normalizeValidityDays(1), 1);
    assert.equal(normalizeValidityDays(365), 365);
  });
});

describe('formatValidityDays', () => {
  it('singolare e plurale', () => {
    assert.equal(formatValidityDays(1), '1 giorno');
    assert.equal(formatValidityDays(60), '60 giorni');
  });
});
