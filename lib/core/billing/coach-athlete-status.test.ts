import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RENEWAL_SOON_DAYS,
  athleteBillingSignals,
  daysUntil,
  signalsAttentionScore,
  type CoachAthleteBilling,
} from './coach-athlete-status';

const now = new Date('2026-10-30T10:00:00Z');
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);

function billing(patch: {
  status?: 'active' | 'past_due';
  cancel?: boolean;
  daysToEnd?: number;
  remaining?: number;
  booked?: number;
  done?: number;
  singles?: Partial<CoachAthleteBilling['singles']>;
  noPlan?: boolean;
}): CoachAthleteBilling {
  const remaining = patch.remaining ?? 2;
  const booked = patch.booked ?? 1;
  const done = patch.done ?? 0;
  return {
    plan: patch.noPlan
      ? null
      : {
          name: 'Beginner',
          sessionsPerMonth: 3,
          status: patch.status ?? 'active',
          cancelAtPeriodEnd: patch.cancel ?? false,
          periodEnd: day(patch.daysToEnd ?? 20),
          usage: {
            known: true,
            total: 3,
            done,
            booked,
            remaining,
            overBooked: false,
          },
        },
    singles: { toPlan: 0, planned: 0, nextExpiry: null, ...patch.singles },
  };
}

const codes = (b: CoachAthleteBilling) =>
  athleteBillingSignals(b, now).map((s) => s.code);

describe('daysUntil', () => {
  it('conta i giorni per eccesso e non scende sotto zero', () => {
    assert.equal(daysUntil(day(5), now), 5);
    assert.equal(daysUntil(new Date(now.getTime() + 3_600_000), now), 1);
    assert.equal(daysUntil(day(-2), now), 0);
  });
});

describe('athleteBillingSignals', () => {
  it('un atleta in regola, con una seduta già pianificata e il rinnovo lontano, non ha segnali', () => {
    assert.deepEqual(codes(billing({})), []);
  });

  it('pagamento in ritardo', () => {
    assert.deepEqual(codes(billing({ status: 'past_due' })), ['PAST_DUE']);
  });

  it('rinnovo vicino con sedute da pianificare: dice quante e quando', () => {
    const signals = athleteBillingSignals(billing({ daysToEnd: 5, remaining: 2 }), now);
    assert.deepEqual(signals.map((s) => s.code), ['RENEWAL_SOON']);
    assert.equal(signals[0].label, '2 da pianificare · rinnovo tra 5 giorni');
    assert.equal(signals[0].tone, 'warn');
  });

  it('la soglia è inclusiva e oltre non scatta', () => {
    assert.deepEqual(codes(billing({ daysToEnd: RENEWAL_SOON_DAYS })), ['RENEWAL_SOON']);
    assert.deepEqual(codes(billing({ daysToEnd: RENEWAL_SOON_DAYS + 1 })), []);
  });

  it('domani e oggi si dicono a parole', () => {
    const label = (d: number) =>
      athleteBillingSignals(billing({ daysToEnd: d }), now)[0].label;
    assert.match(label(1), /rinnovo domani/);
    assert.match(label(0), /rinnovo oggi/);
  });

  it('senza sedute da pianificare il rinnovo vicino non è un problema', () => {
    assert.deepEqual(codes(billing({ daysToEnd: 3, remaining: 0, booked: 3 })), []);
  });

  it('con l’abbonamento annullato dice «scadono» e segnala la fine', () => {
    const signals = athleteBillingSignals(
      billing({ cancel: true, daysToEnd: 4, remaining: 1 }),
      now
    );
    assert.deepEqual(signals.map((s) => s.code), ['ENDING', 'RENEWAL_SOON']);
    assert.match(signals[1].label, /scadono tra 4 giorni/);
  });

  it('nessuna seduta pianificata, rinnovo lontano: segnale informativo', () => {
    const signals = athleteBillingSignals(billing({ booked: 0, remaining: 3 }), now);
    assert.deepEqual(signals.map((s) => s.code), ['NOTHING_PLANNED']);
    assert.equal(signals[0].tone, 'info');
  });

  it('sessione singola in scadenza solo se ancora da pianificare e vicina', () => {
    const near = billing({
      noPlan: true,
      singles: { toPlan: 1, nextExpiry: day(10) },
    });
    assert.deepEqual(codes(near), ['SINGLE_EXPIRING']);
    const far = billing({
      noPlan: true,
      singles: { toPlan: 1, nextExpiry: day(40) },
    });
    assert.deepEqual(codes(far), []);
    const planned = billing({
      noPlan: true,
      singles: { toPlan: 0, planned: 1, nextExpiry: null },
    });
    assert.deepEqual(codes(planned), []);
  });

  it('senza abbonamento né sedute non c’è niente da dire', () => {
    assert.deepEqual(codes(billing({ noPlan: true })), []);
  });

  it('un periodo non ancora noto non inventa segnali sulle sedute', () => {
    const b = billing({});
    b.plan!.usage = { known: false };
    assert.deepEqual(codes(b), []);
  });
});

describe('signalsAttentionScore', () => {
  it('conta di più chi ha segnali da gestire che chi ha solo informazioni', () => {
    const warn = athleteBillingSignals(billing({ status: 'past_due' }), now);
    const info = athleteBillingSignals(billing({ booked: 0, remaining: 3 }), now);
    assert.ok(signalsAttentionScore(warn) > signalsAttentionScore(info));
    assert.equal(signalsAttentionScore([]), 0);
  });
});
