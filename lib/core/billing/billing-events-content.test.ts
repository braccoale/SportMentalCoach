import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BILLING_EVENTS,
  billingEventIdempotencyKey,
  billingEventsForTransition,
  buildBillingEventContent,
  isRenewalReminderDue,
  type BillingEvent,
} from './billing-events-content';

const base = {
  recipientName: 'Alessandro Bracco',
  counterpartName: 'Daniela Chiappara',
  athleteUserId: 68,
  planName: 'Beginner',
  amountLabel: '300,00 €',
  dateLabel: '6 novembre 2026',
  validUntilLabel: '6 dicembre 2026',
  sessionsPerMonth: 3,
};

describe('buildBillingEventContent', () => {
  it('ogni evento ha un testo per atleta e coach, con oggetto e azione', () => {
    for (const event of BILLING_EVENTS) {
      for (const role of ['athlete', 'coach'] as const) {
        const c = buildBillingEventContent({ ...base, event, role });
        assert.ok(c.subject.length > 0, `${event}/${role} subject`);
        assert.ok(c.paragraphs.length >= 2, `${event}/${role} paragraphs`);
        assert.match(c.actionPath, /^\/dashboard\//);
      }
    }
  });

  it('l’atleta va ai suoi abbonamenti, il coach alla scheda di quell’atleta', () => {
    const a = buildBillingEventContent({ ...base, event: 'subscription_started', role: 'athlete' });
    const c = buildBillingEventContent({ ...base, event: 'subscription_started', role: 'coach' });
    assert.equal(a.actionPath, '/dashboard/athlete/abbonamenti');
    assert.equal(c.actionPath, '/dashboard/coach/athletes/68');
  });

  it('la cancellazione dice fino a quando resta attivo', () => {
    const c = buildBillingEventContent({ ...base, event: 'cancel_scheduled', role: 'athlete' });
    assert.match(c.paragraphs.join(' '), /fino al 6 novembre 2026/);
    const none = buildBillingEventContent({
      ...base,
      dateLabel: null,
      event: 'cancel_scheduled',
      role: 'athlete',
    });
    assert.match(none.paragraphs.join(' '), /fine del periodo già pagato/);
  });

  it('la seduta singola dice entro quando prenotarla', () => {
    const c = buildBillingEventContent({
      ...base,
      planName: null,
      event: 'single_purchased',
      role: 'athlete',
    });
    assert.match(c.paragraphs.join(' '), /fino al 6 dicembre 2026/);
    assert.ok(!c.rows.some((r) => r.label === 'Piano'));
  });

  it('non promette ricevute né fatture proprie', () => {
    const c = buildBillingEventContent({ ...base, event: 'subscription_started', role: 'athlete' });
    assert.match(c.paragraphs.join(' '), /ricevuta del pagamento te la manda/);
  });
});

describe('billingEventIdempotencyKey', () => {
  it('cambia per destinatario, ruolo, evento e ambito; mai per il tempo', () => {
    const k = (over: Partial<Parameters<typeof billingEventIdempotencyKey>[0]> = {}) =>
      billingEventIdempotencyKey({
        event: 'cancel_scheduled',
        role: 'athlete',
        recipientUserId: 68,
        scope: 'evt_1',
        ...over,
      });
    assert.equal(k(), k());
    assert.notEqual(k(), k({ scope: 'evt_2' }));
    assert.notEqual(k(), k({ recipientUserId: 69 }));
    assert.notEqual(k(), k({ role: 'coach' }));
    assert.notEqual(k(), k({ event: 'cancel_undone' }));
  });
});

describe('billingEventsForTransition', () => {
  const t = (over: Partial<Parameters<typeof billingEventsForTransition>[0]>): BillingEvent[] =>
    billingEventsForTransition({
      previousStatus: 'active',
      nextStatus: 'active',
      previousCancelAtPeriodEnd: false,
      nextCancelAtPeriodEnd: false,
      firstConfirmation: false,
      ...over,
    });

  it('il primo pagamento conferma l’abbonamento', () => {
    assert.deepEqual(
      t({ previousStatus: 'incomplete', firstConfirmation: true }),
      ['subscription_started']
    );
  });
  it('un evento ripetuto sullo stesso stato non avvisa', () => {
    assert.deepEqual(t({}), []);
  });
  it('annullare e riattivare il rinnovo sono due fatti distinti', () => {
    assert.deepEqual(t({ nextCancelAtPeriodEnd: true }), ['cancel_scheduled']);
    assert.deepEqual(
      t({ previousCancelAtPeriodEnd: true, nextCancelAtPeriodEnd: false }),
      ['cancel_undone']
    );
  });
  it('la chiusura avvisa una volta sola', () => {
    assert.deepEqual(t({ nextStatus: 'canceled' }), ['subscription_ended']);
    assert.deepEqual(t({ previousStatus: 'canceled', nextStatus: 'canceled' }), []);
  });
  it('un abbonamento mai cominciato che si chiude non è «terminato»', () => {
    assert.deepEqual(t({ previousStatus: 'incomplete', nextStatus: 'canceled' }), []);
  });
  it('in ritardo non genera avvisi di cancellazione', () => {
    assert.deepEqual(t({ nextStatus: 'past_due', previousStatus: 'active' }), []);
  });
});

describe('isRenewalReminderDue', () => {
  const now = new Date('2026-11-03T08:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const due = (over: Partial<Parameters<typeof isRenewalReminderDue>[0]> = {}) =>
    isRenewalReminderDue({
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(now.getTime() + 2 * day),
      now,
      ...over,
    });

  it('dentro la finestra sì', () => assert.equal(due(), true));
  it('troppo presto no', () =>
    assert.equal(due({ currentPeriodEnd: new Date(now.getTime() + 10 * day) }), false));
  it('periodo già finito no', () =>
    assert.equal(due({ currentPeriodEnd: new Date(now.getTime() - day) }), false));
  it('con rinnovo annullato non c’è niente da ricordare', () =>
    assert.equal(due({ cancelAtPeriodEnd: true }), false));
  it('in ritardo o chiuso no', () => {
    assert.equal(due({ status: 'past_due' }), false);
    assert.equal(due({ status: 'canceled' }), false);
  });
});
