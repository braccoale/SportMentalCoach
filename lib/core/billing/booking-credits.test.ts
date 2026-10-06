import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addOneMonthUtc,
  creditPeriods,
  creditsSummary,
  decideBookingAccess,
  type BookingAccessInput,
  type CreditSubscription,
} from './booking-credits';

const start = new Date('2026-10-06T15:45:49Z');
const end = new Date('2026-11-06T15:45:49Z');
const nextEnd = new Date('2026-12-06T15:45:49Z');
const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

const live: CreditSubscription = {
  status: 'active',
  cancelAtPeriodEnd: false,
  currentPeriodStart: start,
  currentPeriodEnd: end,
  sessionsPerMonth: 3,
};

function access(patch: Partial<BookingAccessInput>) {
  return decideBookingAccess({
    requiresSubscription: true,
    isIntro: false,
    subscription: live,
    scheduledFor: day('2026-10-20'),
    bookings: [],
    ...patch,
  });
}
const reason = (patch: Partial<BookingAccessInput>) => {
  const result = access(patch);
  return result.ok ? 'OK' : result.reason;
};

describe('addOneMonthUtc', () => {
  it('aggiunge un mese e riduce il giorno se il mese dopo è più corto', () => {
    assert.equal(addOneMonthUtc(new Date('2026-10-06T15:00:00Z')).toISOString(), '2026-11-06T15:00:00.000Z');
    assert.equal(addOneMonthUtc(new Date('2026-01-31T10:00:00Z')).toISOString(), '2026-02-28T10:00:00.000Z');
    assert.equal(addOneMonthUtc(new Date('2028-01-31T10:00:00Z')).toISOString(), '2028-02-29T10:00:00.000Z');
    assert.equal(addOneMonthUtc(new Date('2026-12-15T10:00:00Z')).toISOString(), '2027-01-15T10:00:00.000Z');
  });
});

describe('creditPeriods', () => {
  it('periodo corrente e successivo, senza buchi', () => {
    const periods = creditPeriods(live);
    assert.equal(periods?.current.end.getTime(), periods?.next.start.getTime());
    assert.equal(periods?.next.end.toISOString(), nextEnd.toISOString());
  });
  it('senza date certe non c’è periodo', () => {
    assert.equal(creditPeriods({ currentPeriodStart: null, currentPeriodEnd: end }), null);
    assert.equal(creditPeriods({ currentPeriodStart: end, currentPeriodEnd: start }), null);
  });
});

describe('decideBookingAccess: quando non si applica', () => {
  it('un coach senza pagamenti attivi resta com’era', () => {
    assert.equal(reason({ requiresSubscription: false, subscription: null }), 'OK');
  });
  it('la sessione conoscitiva gratuita non richiede e non consuma niente', () => {
    assert.equal(reason({ isIntro: true, subscription: null }), 'OK');
    const usedUp = Array.from({ length: 3 }, (_, i) => ({
      status: 'accepted',
      scheduledFor: day(`2026-10-1${i}`),
    }));
    assert.equal(reason({ isIntro: true, bookings: usedUp }), 'OK');
  });
});

describe('decideBookingAccess: abbonamento', () => {
  it('con un coach a pagamento serve un abbonamento', () => {
    assert.equal(reason({ subscription: null }), 'NO_SUBSCRIPTION');
  });
  it('un pagamento in ritardo ferma le nuove prenotazioni', () => {
    assert.equal(reason({ subscription: { ...live, status: 'past_due' } }), 'SUBSCRIPTION_PAST_DUE');
  });
  it('senza date del periodo non si decide: si dice di riprovare', () => {
    assert.equal(
      reason({ subscription: { ...live, currentPeriodStart: null, currentPeriodEnd: null } }),
      'PERIOD_UNKNOWN'
    );
  });
  it('con sedute disponibili si prenota', () => {
    assert.equal(reason({}), 'OK');
  });
});

describe('decideBookingAccess: sedute', () => {
  const fullPeriod = ['2026-10-10', '2026-10-15', '2026-10-25'].map((d) => ({
    status: 'accepted',
    scheduledFor: day(d),
  }));

  it('finite le sedute del periodo, una data dentro il periodo è rifiutata', () => {
    const result = access({ bookings: fullPeriod });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'NO_CREDITS');
      assert.match(result.message, /3 sedute di questo periodo/);
      assert.match(result.message, /6 novembre 2026/);
    }
  });

  it('con zero sedute oggi, una data DOPO il rinnovo si può prenotare', () => {
    assert.equal(reason({ bookings: fullPeriod, scheduledFor: day('2026-11-10') }), 'OK');
  });

  it('l’istante del rinnovo appartiene al periodo nuovo', () => {
    assert.equal(reason({ bookings: fullPeriod, scheduledFor: end }), 'OK');
  });

  it('anche il periodo nuovo ha il suo tetto', () => {
    const nextFull = ['2026-11-10', '2026-11-12', '2026-11-20'].map((d) => ({
      status: 'requested',
      scheduledFor: day(d),
    }));
    const result = access({ bookings: nextFull, scheduledFor: day('2026-11-25') });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /periodo che inizia il 6 novembre 2026/);
  });

  it('le sedute annullate o rifiutate restituiscono il posto', () => {
    const released = fullPeriod.map((b) => ({ ...b, status: 'cancelled' }));
    assert.equal(reason({ bookings: released }), 'OK');
  });

  it('le sedute del periodo nuovo non consumano quelle del periodo corrente', () => {
    const nextOnly = ['2026-11-10', '2026-11-12', '2026-11-20'].map((d) => ({
      status: 'accepted',
      scheduledFor: day(d),
    }));
    assert.equal(reason({ bookings: nextOnly, scheduledFor: day('2026-10-20') }), 'OK');
  });
});

describe('decideBookingAccess: limiti nel tempo', () => {
  it('oltre UN rinnovo avanti non si prenota', () => {
    const result = access({ scheduledFor: nextEnd });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'TOO_FAR');
    assert.equal(reason({ scheduledFor: new Date(nextEnd.getTime() - 1000) }), 'OK');
  });

  it('un abbonamento annullato a fine periodo non dà sedute oltre la fine', () => {
    const cancelled = { ...live, cancelAtPeriodEnd: true };
    assert.equal(reason({ subscription: cancelled, scheduledFor: day('2026-10-20') }), 'OK');
    assert.equal(reason({ subscription: cancelled, scheduledFor: end }), 'AFTER_END');
    assert.equal(reason({ subscription: cancelled, scheduledFor: day('2026-11-20') }), 'AFTER_END');
  });

  it('una data prima dell’inizio del periodo non vale', () => {
    assert.equal(reason({ scheduledFor: day('2026-10-01') }), 'BEFORE_PERIOD');
  });
});

describe('creditsSummary', () => {
  it('sedute rimaste ora e nel periodo successivo', () => {
    const summary = creditsSummary(live, [
      { status: 'completed', scheduledFor: day('2026-10-10') },
      { status: 'accepted', scheduledFor: day('2026-11-10') },
    ]);
    assert.deepEqual(summary, {
      total: 3,
      remainingNow: 2,
      remainingNext: 2,
      renewalLabel: '6 novembre 2026',
    });
  });
  it('senza periodo non inventa numeri', () => {
    const summary = creditsSummary({ ...live, currentPeriodStart: null }, []);
    assert.equal(summary.remainingNow, null);
    assert.equal(summary.renewalLabel, null);
  });
});

describe('decideBookingAccess: il messaggio parla a chi prenota', () => {
  const full = ['2026-10-10', '2026-10-15', '2026-10-25'].map((d) => ({
    status: 'accepted',
    scheduledFor: day(d),
  }));

  it('lo stesso rifiuto ha la stessa ragione ma frasi diverse per atleta e coach', () => {
    const asAthlete = access({ subscription: null });
    const asCoach = access({ subscription: null, viewer: 'coach' });
    assert.equal(asAthlete.ok, false);
    assert.equal(asCoach.ok, false);
    if (!asAthlete.ok && !asCoach.ok) {
      assert.equal(asAthlete.reason, asCoach.reason);
      assert.match(asAthlete.message, /Abbonati dalla sua scheda/);
      assert.match(asCoach.message, /solo con atleti che hanno un abbonamento con te/);
      assert.doesNotMatch(asCoach.message, /Abbonati/);
    }
  });

  it('al coach non si dice «hai usato»: si parla dell’atleta', () => {
    const result = access({ bookings: full, viewer: 'coach' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /Questo atleta ha già usato tutte le 3 sedute/);
      assert.match(result.message, /6 novembre 2026/);
      assert.doesNotMatch(result.message, /\bHai\b/);
    }
  });

  it('anche per il coach la sessione conoscitiva e un coach non a pagamento passano', () => {
    assert.equal(reason({ viewer: 'coach', isIntro: true, subscription: null }), 'OK');
    assert.equal(reason({ viewer: 'coach', requiresSubscription: false, subscription: null }), 'OK');
  });

  it('le date dopo il rinnovo si possono fissare anche per il coach', () => {
    assert.equal(reason({ viewer: 'coach', bookings: full, scheduledFor: day('2026-11-10') }), 'OK');
  });
});

describe('decideBookingAccess — sedute acquistate a parte', () => {
  const credit = (iso: string) => ({ expiresAt: new Date(`${iso}T10:00:00Z`) });

  it('copre un atleta senza abbonamento', () => {
    const result = access({ subscription: null, credits: [credit('2026-12-01')] });
    assert.deepEqual(result, { ok: true, usesCredit: true });
  });

  it('senza abbonamento e senza sedute resta il rifiuto di sempre', () => {
    assert.equal(reason({ subscription: null, credits: [] }), 'NO_SUBSCRIPTION');
  });

  it('prima si usa il piano: la seduta extra non viene toccata', () => {
    const result = access({ credits: [credit('2026-12-01')] });
    assert.deepEqual(result, { ok: true });
  });

  it('a sedute del piano finite entra la seduta acquistata', () => {
    const full = [1, 2, 3].map((n) => ({
      status: 'accepted',
      scheduledFor: day(`2026-10-1${n}`),
    }));
    const result = access({ bookings: full, credits: [credit('2026-12-01')] });
    assert.deepEqual(result, { ok: true, usesCredit: true });
  });

  it('una seduta scaduta prima della data scelta non copre', () => {
    assert.equal(
      reason({ subscription: null, credits: [credit('2026-10-10')] }),
      'NO_SUBSCRIPTION'
    );
  });

  it('copre anche un pagamento in ritardo del piano', () => {
    const result = access({
      subscription: { ...live, status: 'past_due' },
      credits: [credit('2026-12-01')],
    });
    assert.deepEqual(result, { ok: true, usesCredit: true });
  });

  it('non rimedia a un abbonamento ancora da confermare', () => {
    assert.equal(
      reason({
        subscription: { ...live, currentPeriodStart: null, currentPeriodEnd: null },
        credits: [credit('2026-12-01')],
      }),
      'PERIOD_UNKNOWN'
    );
  });

  it('un coach senza pagamenti resta libero e non consuma niente', () => {
    const result = access({
      requiresSubscription: false,
      subscription: null,
      credits: [credit('2026-12-01')],
    });
    assert.deepEqual(result, { ok: true });
  });
});
