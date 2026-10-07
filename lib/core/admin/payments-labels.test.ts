import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  creditStatusLabel,
  creditStatusTone,
  isStaleIncomplete,
  subscriptionStatusLabel,
  subscriptionStatusTone,
} from './payments-labels';

describe('payments-labels', () => {
  it('un abbonamento che non si rinnova lo dice, ed è un avviso e non un errore', () => {
    assert.equal(subscriptionStatusLabel('active', true), 'Attivo · non si rinnova');
    assert.equal(subscriptionStatusTone('active', true), 'warn');
    assert.equal(subscriptionStatusTone('active', false), 'ok');
  });
  it('il pagamento in ritardo è l’unico stato rosso', () => {
    assert.equal(subscriptionStatusTone('past_due', false), 'bad');
    assert.equal(subscriptionStatusTone('canceled', false), 'neutral');
  });
  it('uno stato sconosciuto si mostra com’è', () => {
    assert.equal(subscriptionStatusLabel('paused', false), 'paused');
    assert.equal(creditStatusLabel('boh', null), 'boh');
  });
  it('una seduta pagata e già prenotata lo dice', () => {
    assert.equal(creditStatusLabel('granted', 12), 'Pagata · prenotata');
    assert.equal(creditStatusLabel('granted', null), 'Pagata');
    assert.equal(creditStatusTone('pending'), 'warn');
  });
  it('un Checkout non completato da più di un giorno è sospetto', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    assert.equal(isStaleIncomplete('incomplete', new Date('2026-10-07T11:00:00Z'), now), true);
    assert.equal(isStaleIncomplete('incomplete', new Date('2026-10-08T10:00:00Z'), now), false);
    assert.equal(isStaleIncomplete('active', new Date('2026-09-01T00:00:00Z'), now), false);
  });
});
