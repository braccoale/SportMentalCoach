import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatLongDateRome,
  nextPlanSubscriptionStatus,
  ownRowId,
  subscribedOn,
  planSubscriptionStatusFromStripe,
  readSubscriptionPeriod,
  subscriptionUpdateFromStripe,
} from './subscription-status';

describe('planSubscriptionStatusFromStripe', () => {
  it('traduce gli stati noti', () => {
    assert.equal(planSubscriptionStatusFromStripe('active'), 'active');
    assert.equal(planSubscriptionStatusFromStripe('trialing'), 'active');
    assert.equal(planSubscriptionStatusFromStripe('past_due'), 'past_due');
    assert.equal(planSubscriptionStatusFromStripe('unpaid'), 'past_due');
    assert.equal(planSubscriptionStatusFromStripe('canceled'), 'canceled');
    assert.equal(planSubscriptionStatusFromStripe('incomplete_expired'), 'canceled');
  });

  it('uno stato sconosciuto non diventa mai attivo', () => {
    for (const status of ['incomplete', 'paused', 'qualcosa_di_nuovo', '', null, undefined]) {
      assert.equal(planSubscriptionStatusFromStripe(status), 'incomplete', String(status));
    }
  });
});

describe('readSubscriptionPeriod', () => {
  it('legge il periodo dall’abbonamento (API meno recenti)', () => {
    const { start, end } = readSubscriptionPeriod({
      current_period_start: 1_790_000_000,
      current_period_end: 1_792_592_000,
    });
    assert.equal(start?.toISOString(), new Date(1_790_000_000_000).toISOString());
    assert.equal(end?.toISOString(), new Date(1_792_592_000_000).toISOString());
  });

  it('legge il periodo dagli elementi (API recenti)', () => {
    const { start, end } = readSubscriptionPeriod({
      items: {
        data: [{ current_period_start: 1_790_000_000, current_period_end: 1_792_592_000 }],
      },
    });
    assert.ok(start && end);
    assert.ok(end.getTime() > start.getTime());
  });

  it('un periodo incoerente o assente non si inventa', () => {
    assert.deepEqual(readSubscriptionPeriod({}), { start: null, end: null });
    assert.deepEqual(
      readSubscriptionPeriod({ current_period_start: 200, current_period_end: 100 }),
      { start: null, end: null }
    );
  });
});

describe('subscriptionUpdateFromStripe', () => {
  it('riporta stato, periodo e cancellazione programmata', () => {
    const update = subscriptionUpdateFromStripe({
      status: 'active',
      cancel_at_period_end: true,
      current_period_start: 1_790_000_000,
      current_period_end: 1_792_592_000,
    });
    assert.equal(update.status, 'active');
    assert.equal(update.cancelAtPeriodEnd, true);
    assert.equal(update.canceledAt, null);
    assert.ok(update.currentPeriodEnd);
  });
});

describe('nextPlanSubscriptionStatus', () => {
  it('un abbonamento annullato non risorge, qualunque cosa arrivi', () => {
    for (const incoming of ['incomplete', 'active', 'past_due', 'canceled'] as const) {
      assert.equal(nextPlanSubscriptionStatus('canceled', incoming), 'canceled', incoming);
    }
  });

  it('«incomplete» non fa tornare indietro un abbonamento vivo', () => {
    assert.equal(nextPlanSubscriptionStatus('active', 'incomplete'), 'active');
    assert.equal(nextPlanSubscriptionStatus('past_due', 'incomplete'), 'past_due');
  });

  it('le transizioni normali passano', () => {
    assert.equal(nextPlanSubscriptionStatus('incomplete', 'active'), 'active');
    assert.equal(nextPlanSubscriptionStatus('active', 'past_due'), 'past_due');
    assert.equal(nextPlanSubscriptionStatus('past_due', 'active'), 'active');
    assert.equal(nextPlanSubscriptionStatus('active', 'canceled'), 'canceled');
    assert.equal(nextPlanSubscriptionStatus('incomplete', 'canceled'), 'canceled');
  });
});

describe('ownRowId', () => {
  it('riconosce i nostri oggetti dal segno', () => {
    assert.equal(ownRowId({ kaipai_plan_subscription_id: '42' }), 42);
    assert.equal(ownRowId(null, '17'), 17);
    // Il segno nei metadati vince sul riferimento del cliente.
    assert.equal(ownRowId({ kaipai_plan_subscription_id: '5' }, '9'), 5);
  });

  it('un oggetto senza segno non è nostro', () => {
    assert.equal(ownRowId(undefined), null);
    assert.equal(ownRowId({}), null);
    assert.equal(ownRowId({ altro: '1' }, null), null);
  });

  it('un valore che non è un id valido non è nostro', () => {
    for (const bad of ['', 'abc', '-3', '0', '12.5', '1e3', '9999999999', ' 7']) {
      assert.equal(ownRowId({ kaipai_plan_subscription_id: bad }), null, JSON.stringify(bad));
    }
  });
});

describe('formatLongDateRome', () => {
  it('scrive la data lunga in italiano', () => {
    assert.equal(formatLongDateRome(new Date('2026-10-06T10:00:00Z')), '6 ottobre 2026');
    assert.equal(formatLongDateRome(new Date('2025-03-12T09:00:00Z')), '12 marzo 2025');
    assert.equal(formatLongDateRome(new Date('2026-01-01T12:00:00Z')), '1 gennaio 2026');
    assert.equal(formatLongDateRome(new Date('2026-12-31T12:00:00Z')), '31 dicembre 2026');
  });

  it('il giorno è quello di Roma, non quello di UTC', () => {
    // 22:30 UTC del 6 ottobre = 00:30 del 7 a Roma (ora legale, UTC+2).
    assert.equal(formatLongDateRome(new Date('2026-10-06T22:30:00Z')), '7 ottobre 2026');
    // 23:30 UTC del 31 dicembre = 00:30 del 1° gennaio a Roma (UTC+1).
    assert.equal(formatLongDateRome(new Date('2026-12-31T23:30:00Z')), '1 gennaio 2027');
    // 21:30 UTC del 6 ottobre = 23:30 del 6 a Roma.
    assert.equal(formatLongDateRome(new Date('2026-10-06T21:30:00Z')), '6 ottobre 2026');
  });
});

describe('subscribedOn', () => {
  it('prende la conferma se c\'è, altrimenti la creazione della riga', () => {
    const confirmed = new Date('2026-10-06T15:45:49Z');
    const created = new Date('2026-10-06T15:45:19Z');
    assert.equal(subscribedOn({ subscribedAt: confirmed, createdAt: created }), confirmed);
    assert.equal(subscribedOn({ subscribedAt: null, createdAt: created }), created);
  });
});
